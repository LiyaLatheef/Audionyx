"""
Socket.io Event Handlers
"""
from flask import request
from flask_socketio import emit, join_room, leave_room, disconnect
from app import socketio, db
from app.models.user import User
from app.services.ml_inference import get_detector
from app.services.audio_processor import base64_to_bytes, convert_webm_to_wav, validate_audio_chunk
import time
import logging
from datetime import datetime
from io import BytesIO

logger = logging.getLogger(__name__)

# Active connections and calls
user_sessions = {}  # {user_id: socket_id}
active_calls = {}   # {call_id: {'caller_id': X, 'callee_id': Y, 'start_time': T}}

# Per-call fraud scoring state: we aggregate the first ~10 seconds (5 chunks) of incoming audio
# and compute a combined probability.
_fraud_windows = {}  # {(call_id, sender_id, analyzer_sid): {'probs': [..], 'done': bool, 'combined': float, ...}}

# Stable state for 10-second batch mode (multiple 10s analyses per call)
_tensec_states = {}  # {(call_id, sender_id, analyzer_sid): {'score_history': [...], 'stable_state': str, 'smoothed_confidence': float}}


def _median(values):
    if not values:
        return 0.0
    vals = sorted(float(v) for v in values)
    n = len(vals)
    mid = n // 2
    if n % 2:
        return float(vals[mid])
    return float((vals[mid - 1] + vals[mid]) / 2.0)


def _stable_update(state, new_score, history_len=5, high_threshold=0.85, low_threshold=0.60):
    """Port of audx_model.StableDecisionMaker (median smoothing + hysteresis)."""
    history = state.get('score_history')
    if not isinstance(history, list):
        history = []
        state['score_history'] = history

    history.append(float(new_score))
    if len(history) > int(history_len):
        del history[:-int(history_len)]

    smoothed = _median(history)
    current_state = state.get('stable_state') or 'SAFE'
    if current_state == 'SAFE':
        if smoothed > float(high_threshold):
            current_state = 'THREAT'
    else:
        if smoothed < float(low_threshold):
            current_state = 'SAFE'

    state['stable_state'] = current_state
    state['smoothed_confidence'] = float(smoothed)
    return current_state, float(smoothed)


def _append_context_audio(state, audio_bytes, target_sr=16000, context_sec=4.0):
    """Maintain a rolling mono float32 buffer of the last `context_sec` seconds."""
    try:
        import numpy as np
        import soundfile as sf
        import librosa
    except Exception:
        return None

    try:
        audio_np, sr = sf.read(BytesIO(audio_bytes), dtype='float32', always_2d=True)
        audio_np = audio_np.mean(axis=1)
    except Exception:
        return None

    try:
        if int(sr) != int(target_sr):
            audio_np = librosa.resample(audio_np, orig_sr=int(sr), target_sr=int(target_sr)).astype('float32')
    except Exception:
        # If resample fails, keep original samples.
        pass

    buf = state.get('pcm_buf')
    if buf is None:
        buf = np.array([], dtype='float32')

    try:
        buf = np.concatenate([buf, audio_np.astype('float32')])
    except Exception:
        return None

    max_len = int(float(context_sec) * float(target_sr))
    if max_len > 0 and buf.shape[0] > max_len:
        buf = buf[-max_len:]

    state['pcm_buf'] = buf
    return buf


def _encode_wav_bytes(pcm_float32, sample_rate=16000):
    """Encode float32 mono PCM into a PCM16 WAV bytes payload."""
    # Try soundfile first (cleaner API)
    try:
        import soundfile as sf
        bio = BytesIO()
        sf.write(bio, pcm_float32, int(sample_rate), format='WAV', subtype='PCM_16')
        bio.seek(0)
        return bio.getvalue()
    except Exception as e_sf:
        # Fallback to stdlib wave module
        try:
            import wave
            import struct
            import numpy as np
            
            if not isinstance(pcm_float32, np.ndarray):
                pcm_float32 = np.array(pcm_float32, dtype='float32')
            
            # Clamp and convert to int16
            pcm_float32 = np.clip(pcm_float32, -1.0, 1.0)
            pcm_int16 = (pcm_float32 * 32767.0).astype(np.int16)
            
            bio = BytesIO()
            with wave.open(bio, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(int(sample_rate))
                wf.writeframes(pcm_int16.tobytes())
            bio.seek(0)
            return bio.getvalue()
        except Exception as e_wave:
            logger.error(f"WAV encoding failed (soundfile: {e_sf}, wave: {e_wave})")
            return None


def _decode_wav_to_pcm(audio_bytes, target_sr=16000):
    """Decode WAV bytes to mono float32 PCM at target sample rate."""
    try:
        import numpy as np
        import soundfile as sf
        import librosa
    except Exception:
        return None

    try:
        audio_np, sr = sf.read(BytesIO(audio_bytes), dtype='float32', always_2d=True)
        audio_np = audio_np.mean(axis=1)
    except Exception:
        return None

    try:
        if int(sr) != int(target_sr):
            audio_np = librosa.resample(audio_np, orig_sr=int(sr), target_sr=int(target_sr)).astype('float32')
    except Exception:
        pass

    return audio_np


def _sliding_windows(pcm, sample_rate, window_sec=4.0, stride_sec=2.0):
    """Return a list of PCM windows (float32 arrays) from a longer clip."""
    try:
        import numpy as np
    except Exception:
        return []

    win = int(float(window_sec) * float(sample_rate))
    stride = int(float(stride_sec) * float(sample_rate))
    if win <= 0 or stride <= 0:
        return []

    if pcm is None or getattr(pcm, 'shape', None) is None or pcm.shape[0] == 0:
        return []

    if pcm.shape[0] < win:
        reps = int(np.ceil(win / float(pcm.shape[0])))
        pcm = np.tile(pcm, reps)[:win]
        return [pcm]

    out = []
    for start in range(0, pcm.shape[0] - win + 1, stride):
        out.append(pcm[start:start + win])
    if not out:
        out.append(pcm[:win])
    return out

    bio = BytesIO()
    try:
        sf.write(bio, pcm_float32, int(sample_rate), format='WAV', subtype='PCM_16')
        return bio.getvalue()
    except Exception:
        return None

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")
    logger.info(f"Origin: {request.origin}, Headers: {request.headers.get('User-Agent')}")
    emit('connected', {'sid': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {request.sid}")
    
    # Find and remove user from online list
    user_id = None
    for uid, sid in list(user_sessions.items()):
        if sid == request.sid:
            user_id = uid
            del user_sessions[uid]
            break
    
    if user_id:
        # Update user status in database
        user = User.query.get(user_id)
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.session.commit()
        
        # Notify all users
        emit('user_offline', {'user_id': user_id}, broadcast=True)
        
        # End any active calls
        for call_id, call_data in list(active_calls.items()):
            if call_data['caller_id'] == user_id or call_data['callee_id'] == user_id:
                other_user_id = call_data['callee_id'] if call_data['caller_id'] == user_id else call_data['caller_id']
                other_sid = user_sessions.get(other_user_id)
                
                if other_sid:
                    emit('call_ended', {'call_id': call_id, 'reason': 'peer_disconnected'}, room=other_sid)
                
                del active_calls[call_id]

        # Clear any fraud windows associated with this disconnected sid
        for key in list(_fraud_windows.keys()):
            if key[2] == request.sid:
                del _fraud_windows[key]

        for key in list(_tensec_states.keys()):
            if key[2] == request.sid:
                del _tensec_states[key]

@socketio.on('user_online')
def handle_user_online(data):
    """Register user as online"""
    try:
        user_id = data.get('user_id')
        
        if not user_id:
            emit('error', {'message': 'User ID required'})
            return
        
        # Store session
        user_sessions[user_id] = request.sid
        
        # Update user status in database
        user = User.query.get(user_id)
        if user:
            user.is_online = True
            user.last_seen = datetime.utcnow()
            db.session.commit()
        
        # Get all online users
        online_users = User.query.filter_by(is_online=True).all()
        
        # Notify all users about new online user
        emit('user_online', {
            'user_id': user_id,
            'user': user.to_dict() if user else None
        }, broadcast=True)
        
        # Send online users list to new user
        emit('online_users', {
            'users': [u.to_dict() for u in online_users]
        })
        
        logger.info(f"User {user_id} is now online")
        
    except Exception as e:
        logger.error(f"Error in user_online: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('call_user')
def handle_call_user(data):
    """Initiate a call to another user"""
    try:
        caller_id = data.get('caller_id')
        callee_id = data.get('callee_id')
        
        logger.info(f"Call request from {caller_id} to {callee_id}")
        
        if not caller_id or not callee_id:
            emit('error', {'message': 'Caller and callee IDs required'})
            return
        
        # Check if callee is online
        callee_sid = user_sessions.get(callee_id)
        
        if not callee_sid:
            logger.warning(f"Callee {callee_id} not found in user_sessions")
            logger.info(f"Active sessions: {list(user_sessions.keys())}")
            emit('call_failed', {'message': 'User is not online'})
            return
        
        # Create call ID
        call_id = f"{caller_id}_{callee_id}_{int(time.time() * 1000)}"
        
        # Store call data
        active_calls[call_id] = {
            'caller_id': caller_id,
            'callee_id': callee_id,
            'start_time': time.time(),
            'caller_sid': request.sid,
            'callee_sid': callee_sid
        }
        
        # Get caller info
        caller = User.query.get(caller_id)
        
        logger.info(f"Sending incoming_call to callee sid: {callee_sid}")
        
        # Notify callee
        emit('incoming_call', {
            'call_id': call_id,
            'caller_id': caller_id,
            'caller': caller.to_dict() if caller else None
        }, room=callee_sid)
        
        logger.info(f"Call initiated: {call_id}")
        
    except Exception as e:
        logger.error(f"Error in call_user: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('call_accepted')
def handle_call_accepted(data):
    """Handle call acceptance"""
    try:
        call_id = data.get('call_id')
        
        if not call_id or call_id not in active_calls:
            emit('error', {'message': 'Invalid call ID'})
            return
        
        call_data = active_calls[call_id]
        
        # Both caller and callee join the room
        join_room(call_id, sid=call_data['caller_sid'])
        join_room(call_id, sid=call_data['callee_sid'])

        # Record accepted timestamp and notify both peers to start their call timers.
        accepted_at_ms = int(time.time() * 1000)
        call_data['accepted_at'] = accepted_at_ms
        emit('call_started', {
            'call_id': call_id,
            'started_at': accepted_at_ms
        }, room=call_id)
        
        # Notify caller that call was accepted
        emit('call_accepted', {
            'call_id': call_id
        }, room=call_data['caller_sid'])
        
        logger.info(f"Call accepted: {call_id}")
        
    except Exception as e:
        logger.error(f"Error in call_accepted: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('call_rejected')
def handle_call_rejected(data):
    """Handle call rejection"""
    try:
        call_id = data.get('call_id')
        
        if not call_id or call_id not in active_calls:
            return
        
        call_data = active_calls[call_id]
        
        # Notify caller
        emit('call_rejected', {
            'call_id': call_id
        }, room=call_data['caller_sid'])
        
        # Remove call
        del active_calls[call_id]
        
        logger.info(f"Call rejected: {call_id}")
        
    except Exception as e:
        logger.error(f"Error in call_rejected: {str(e)}")

@socketio.on('end_call')
def handle_end_call(data):
    """Handle call termination"""
    try:
        call_id = data.get('call_id')
        
        if not call_id or call_id not in active_calls:
            return
        
        call_data = active_calls[call_id]
        
        # Notify both users individually
        emit('call_ended', {
            'call_id': call_id,
            'reason': 'user_ended'
        }, room=call_data['caller_sid'])
        
        emit('call_ended', {
            'call_id': call_id,
            'reason': 'user_ended'
        }, room=call_data['callee_sid'])
        
        # Remove call
        del active_calls[call_id]

        # Clear fraud aggregation state for this call
        for key in list(_fraud_windows.keys()):
            if key[0] == call_id:
                del _fraud_windows[key]

        for key in list(_tensec_states.keys()):
            if key[0] == call_id:
                del _tensec_states[key]
        
        logger.info(f"Call ended: {call_id}, notified both users")
        
    except Exception as e:
        logger.error(f"Error in end_call: {str(e)}")

# WebRTC Signaling Events

@socketio.on('offer')
def handle_offer(data):
    """Handle WebRTC offer"""
    try:
        call_id = data.get('call_id')
        offer = data.get('offer')
        
        if not call_id or call_id not in active_calls:
            emit('error', {'message': 'Invalid call ID'})
            return
        
        call_data = active_calls[call_id]
        
        # Forward offer to callee
        emit('offer', {
            'call_id': call_id,
            'offer': offer
        }, room=call_data['callee_sid'])
        
        logger.debug(f"Forwarded offer for call: {call_id}")
        
    except Exception as e:
        logger.error(f"Error in offer: {str(e)}")

@socketio.on('answer')
def handle_answer(data):
    """Handle WebRTC answer"""
    try:
        call_id = data.get('call_id')
        answer = data.get('answer')
        
        if not call_id or call_id not in active_calls:
            emit('error', {'message': 'Invalid call ID'})
            return
        
        call_data = active_calls[call_id]
        
        # Forward answer to caller
        emit('answer', {
            'call_id': call_id,
            'answer': answer
        }, room=call_data['caller_sid'])
        
        logger.debug(f"Forwarded answer for call: {call_id}")
        
    except Exception as e:
        logger.error(f"Error in answer: {str(e)}")

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    """Handle ICE candidate exchange"""
    try:
        call_id = data.get('call_id')
        candidate = data.get('candidate')
        sender_id = data.get('sender_id')
        
        if not call_id or call_id not in active_calls:
            return
        
        call_data = active_calls[call_id]
        
        # Forward to the other peer
        target_sid = call_data['callee_sid'] if sender_id == call_data['caller_id'] else call_data['caller_sid']
        
        emit('ice_candidate', {
            'call_id': call_id,
            'candidate': candidate
        }, room=target_sid)
        
    except Exception as e:
        logger.error(f"Error in ice_candidate: {str(e)}")

# Audio Processing Event

@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    """Process audio chunk for deepfake detection"""
    try:
        call_id = data.get('call_id')
        audio_data = data.get('audio')
        sender_id = data.get('sender_id')
        analysis_mode = data.get('analysis_mode') or data.get('analysis') or 'stream'
        window_sec = data.get('window_sec')
        
        if not call_id or call_id not in active_calls:
            logger.warning(f"Received audio for invalid call: {call_id}")
            emit('deepfake_result', {
                'call_id': call_id,
                'sender_id': sender_id,
                'result': {
                    'status': 'error',
                    'message': 'Invalid or unknown call_id (server has no active call state).',
                    'is_deepfake': False,
                    'confidence': 0.0
                },
                'timestamp': time.time()
            }, room=request.sid)
            return
        
        if not audio_data:
            logger.warning("Received empty audio chunk")
            return
        
        declared_mime = None
        if isinstance(audio_data, str) and audio_data.startswith('data:'):
            # Example: data:audio/wav;base64,<...>
            try:
                declared_mime = audio_data.split(';', 1)[0][5:]
            except Exception:
                declared_mime = None

        # Convert base64 to bytes if necessary
        if isinstance(audio_data, str):
            audio_bytes = base64_to_bytes(audio_data)
        else:
            audio_bytes = audio_data

        # Convert browser-recorded WebM/Opus into WAV for librosa/model pipeline.
        # If the browser already sent WAV bytes, skip conversion (no FFmpeg required).
        detector = get_detector()

        head = b''
        if isinstance(audio_bytes, (bytes, bytearray)):
            head = bytes(audio_bytes[:16])

        is_wav_header = (
            isinstance(audio_bytes, (bytes, bytearray))
            and len(audio_bytes) >= 12
            and audio_bytes[0:4] == b'RIFF'
            and audio_bytes[8:12] == b'WAVE'
        )
        is_webm_header = (
            isinstance(audio_bytes, (bytes, bytearray))
            and len(audio_bytes) >= 4
            and audio_bytes[0:4] == b'\x1a\x45\xdf\xa3'  # EBML (WebM/Matroska)
        )

        declared_wav = declared_mime in {'audio/wav', 'audio/x-wav', 'audio/wave'}
        is_wav = bool(is_wav_header or declared_wav)

        if not is_wav:
            try:
                audio_bytes = convert_webm_to_wav(audio_bytes, target_sample_rate=detector.sample_rate)
            except Exception as e:
                detected = 'unknown'
                if is_webm_header:
                    detected = 'webm/ebml'
                elif is_wav_header:
                    detected = 'wav'
                msg = (
                    f"WebM->WAV conversion failed: {e} "
                    f"(declared_mime={declared_mime}, detected={detected}, head={head.hex()})"
                )
                logger.warning(msg)
                emit('deepfake_result', {
                    'call_id': call_id,
                    'sender_id': sender_id,
                    'result': {
                        'status': 'error',
                        'message': msg,
                        'is_deepfake': False,
                        'confidence': 0.0
                    },
                    'timestamp': time.time()
                }, room=request.sid)
                return

        # If the browser claims it sent WAV but the header doesn't match, surface that clearly.
        if declared_wav and not is_wav_header:
            msg = f"Audio declared as WAV but RIFF/WAVE header not found (head={head.hex()})"
            logger.warning(msg)
            emit('deepfake_result', {
                'call_id': call_id,
                'sender_id': sender_id,
                'result': {
                    'status': 'error',
                    'message': msg,
                    'is_deepfake': False,
                    'confidence': 0.0
                },
                'timestamp': time.time()
            }, room=request.sid)
            return
        
        # Validate audio chunk
        is_valid, message = validate_audio_chunk(audio_bytes)
        if not is_valid:
            logger.warning(f"Invalid audio chunk: {message}")
            emit('deepfake_result', {
                'call_id': call_id,
                'sender_id': sender_id,
                'result': {
                    'status': 'error',
                    'message': message,
                    'is_deepfake': False,
                    'confidence': 0.0
                },
                'timestamp': time.time()
            }, room=request.sid)
            return

        analyzer_sid = request.sid

        # 10-second batch mode: the browser buffers ~10s and sends one WAV.
        # We score multiple 4-second windows inside it and aggregate.
        if str(analysis_mode).lower() in {'ten_sec', '10s', 'batch10s', 'batch_10s'}:
            try:
                detector = get_detector()
                try:
                    batch_sec = float(window_sec) if window_sec is not None else 10.0
                except Exception:
                    batch_sec = 10.0

                # Model window size is detector.duration (trained default 4s)
                model_window_sec = float(getattr(detector, 'duration', 4.0) or 4.0)
                try:
                    stride_sec = float(__import__('os').getenv('TEN_SEC_STRIDE_SEC', '2.0'))
                except Exception:
                    stride_sec = 2.0

                pcm = _decode_wav_to_pcm(audio_bytes, target_sr=detector.sample_rate)
                if pcm is None:
                    raise RuntimeError('Failed to decode WAV for batch analysis')

                windows = _sliding_windows(pcm, detector.sample_rate, window_sec=model_window_sec, stride_sec=stride_sec)
                if not windows:
                    raise RuntimeError('No windows produced for batch analysis')

                probs = []
                metas = []
                for i, w in enumerate(windows, start=1):
                    wav_i = _encode_wav_bytes(w, sample_rate=detector.sample_rate)
                    if not wav_i:
                        raise RuntimeError('Failed to encode WAV window for batch analysis')

                    r = detector.predict(wav_i)
                    if r.get('status') != 'success':
                        raise RuntimeError(f"Model error on window {i}: {r.get('message') or r}")
                    p = float(r.get('confidence', 0.0))
                    probs.append(p)
                    metas.append({
                        'index': i,
                        'confidence': p,
                        'authentic_probability': r.get('authentic_probability'),
                        'vad_speech': r.get('vad_speech'),
                        'vad_db': r.get('vad_db'),
                    })

                combined = float(sum(probs) / max(1, len(probs)))

                state_key = (call_id, sender_id, analyzer_sid)
                state = _tensec_states.get(state_key)
                if state is None:
                    state = {'score_history': [], 'stable_state': 'SAFE', 'smoothed_confidence': 0.0}
                    _tensec_states[state_key] = state

                try:
                    hist_len = int(float((__import__('os').getenv('STABLE_HISTORY_LEN', '5'))))
                except Exception:
                    hist_len = 5
                try:
                    hi = float((__import__('os').getenv('STABLE_HIGH_THRESHOLD', '0.85')))
                    lo = float((__import__('os').getenv('STABLE_LOW_THRESHOLD', '0.60')))
                except Exception:
                    hi, lo = 0.85, 0.60

                stable_state, smoothed = _stable_update(state, combined, history_len=hist_len, high_threshold=hi, low_threshold=lo)

                emit('deepfake_result', {
                    'call_id': call_id,
                    'sender_id': sender_id,
                    'result': {
                        'status': 'success',
                        'mode': 'model',
                        'analysis_mode': 'ten_sec',
                        'batch_seconds': float(batch_sec),
                        'model_window_sec': float(model_window_sec),
                        'stride_sec': float(stride_sec),
                        'is_deepfake': bool(stable_state == 'THREAT'),
                        'confidence': float(combined),
                        'confidence_smoothed': float(smoothed),
                        'stable_state': stable_state,
                        'authentic_probability': float(1.0 - combined),
                        'segments_total': len(probs),
                        'segments_scored': len(probs),
                        'segment_confidences': list(probs),
                        'finalized': True,
                        'segment_meta': {
                            'windows': metas,
                        },
                    },
                    'timestamp': time.time(),
                }, room=analyzer_sid)
                return
            except Exception as e:
                msg = f"10s batch analysis failed: {e}"
                logger.warning(msg)
                emit('deepfake_result', {
                    'call_id': call_id,
                    'sender_id': sender_id,
                    'result': {
                        'status': 'error',
                        'message': msg,
                        'is_deepfake': False,
                        'confidence': 0.0,
                    },
                    'timestamp': time.time(),
                }, room=analyzer_sid)
                return

        # Default stream mode: keep existing first-10s aggregation behavior.
        window_key = (call_id, sender_id, analyzer_sid)
        window = _fraud_windows.get(window_key)
        if window is None:
            window = {
                'probs': [],
                'done': False,
                'combined': 0.0,
                # Stable decision state
                'score_history': [],
                'stable_state': 'SAFE',
                'smoothed_confidence': 0.0,
                # Rolling PCM context buffer (for 4s model windows)
                'pcm_buf': None,
            }
            _fraud_windows[window_key] = window

        # We only score the first 10 seconds (~5 chunks if the frontend uses 2s chunks).
        segments_total = 5

        if window.get('done'):
            # Already finalized: keep returning the stable combined result.
            emit('deepfake_result', {
                'call_id': call_id,
                'sender_id': sender_id,
                'result': {
                    'status': 'success',
                    'mode': 'model',
                    'is_deepfake': bool((window.get('stable_state') or 'SAFE') == 'THREAT'),
                    'confidence': float(window['combined']),
                    'confidence_smoothed': float(window.get('smoothed_confidence', window['combined'])),
                    'stable_state': window.get('stable_state', 'SAFE'),
                    'segments_total': segments_total,
                    'segments_scored': segments_total,
                    'segment_confidences': list(window['probs']),
                    'finalized': True,
                },
                'timestamp': time.time(),
            }, room=analyzer_sid)
            return

        # Run ML inference for this segment
        logger.info(
            f"Processing audio chunk for call {call_id}, analyzing incoming audio from user {sender_id} "
            f"(segment {len(window['probs']) + 1}/{segments_total})"
        )
        # Build a 4-second rolling context window (trained window size) from incoming 2-second chunks.
        # This avoids repeating a short chunk to reach the model window, which can cause artifacts.
        context_sec = 4.0
        pcm_buf = _append_context_audio(window, audio_bytes, target_sr=detector.sample_rate, context_sec=context_sec)
        audio_for_model = audio_bytes
        if pcm_buf is not None:
            # Ensure the model sees a full 4s window when possible.
            target_len = int(float(context_sec) * float(detector.sample_rate))
            if pcm_buf.shape[0] < target_len and pcm_buf.shape[0] > 0:
                reps = int((target_len + pcm_buf.shape[0] - 1) / pcm_buf.shape[0])
                pcm_full = (pcm_buf.repeat(reps))[:target_len]
            else:
                pcm_full = pcm_buf
            encoded = _encode_wav_bytes(pcm_full, sample_rate=detector.sample_rate)
            if encoded:
                audio_for_model = encoded

        segment_result = detector.predict(audio_for_model)
        logger.info(f"Deepfake detection completed (segment): {segment_result}")

        if segment_result.get('status') != 'success':
            emit('deepfake_result', {
                'call_id': call_id,
                'sender_id': sender_id,
                'result': segment_result,
                'timestamp': time.time(),
            }, room=analyzer_sid)
            return

        prob = float(segment_result.get('confidence', 0.0))
        seg_auth = segment_result.get('authentic_probability')
        seg_vad_speech = segment_result.get('vad_speech')
        seg_vad_db = segment_result.get('vad_db')
        window['probs'].append(prob)

        # Combine probabilities from the first 5 clips.
        # Simple mean is stable and matches the “combine 5 clips” requirement.
        combined = float(sum(window['probs']) / max(1, len(window['probs'])))
        window['combined'] = combined

        # Stable decision smoothing/hysteresis
        try:
            hist_len = int(float((__import__('os').getenv('STABLE_HISTORY_LEN', '5'))))
        except Exception:
            hist_len = 5
        try:
            hi = float((__import__('os').getenv('STABLE_HIGH_THRESHOLD', '0.85')))
            lo = float((__import__('os').getenv('STABLE_LOW_THRESHOLD', '0.60')))
        except Exception:
            hi, lo = 0.85, 0.60

        stable_state, smoothed = _stable_update(window, combined, history_len=hist_len, high_threshold=hi, low_threshold=lo)

        if len(window['probs']) >= segments_total:
            window['done'] = True

        emit('deepfake_result', {
            'call_id': call_id,
            'sender_id': sender_id,
            'result': {
                'status': 'success',
                'mode': 'model',
                'is_deepfake': bool(stable_state == 'THREAT'),
                'confidence': combined,
                'confidence_smoothed': smoothed,
                'stable_state': stable_state,
                'authentic_probability': float(1.0 - combined),
                'segments_total': segments_total,
                'segments_scored': len(window['probs']),
                'segment_confidence': prob,
                'segment_index': len(window['probs']),
                'segment_confidences': list(window['probs']),
                'finalized': bool(window['done']),
                'segment_meta': {
                    'authentic_probability': seg_auth,
                    'vad_speech': seg_vad_speech,
                    'vad_db': seg_vad_db,
                },
            },
            'timestamp': time.time()
        }, room=analyzer_sid)

        logger.info("Deepfake aggregated result sent to analyzer (not to audio sender)")
        
    except Exception as e:
        logger.error(f"Error processing audio chunk: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        emit('error', {
            'message': 'Error processing audio',
            'details': str(e)
        }, room=request.sid)
