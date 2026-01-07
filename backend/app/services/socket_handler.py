"""
Socket.io Event Handlers
"""
from flask import request
from flask_socketio import emit, join_room, leave_room, disconnect
from app import socketio, db
from app.models.user import User
from app.services.ml_inference import get_detector
from app.services.audio_processor import base64_to_bytes, validate_audio_chunk
import time
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Active connections and calls
user_sessions = {}  # {user_id: socket_id}
active_calls = {}   # {call_id: {'caller_id': X, 'callee_id': Y, 'start_time': T}}

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")
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
        
        if not caller_id or not callee_id:
            emit('error', {'message': 'Caller and callee IDs required'})
            return
        
        # Check if callee is online
        callee_sid = user_sessions.get(callee_id)
        
        if not callee_sid:
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
        
        # Create room for call
        join_room(call_id)
        
        # Notify caller
        emit('call_accepted', {
            'call_id': call_id
        }, room=call_data['caller_sid'])
        
        # Notify both users that call started
        emit('call_started', {
            'call_id': call_id,
            'participants': [call_data['caller_id'], call_data['callee_id']]
        }, room=call_id)
        
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
        
        # Notify both users
        emit('call_ended', {
            'call_id': call_id,
            'reason': 'user_ended'
        }, room=call_id)
        
        # Leave room
        leave_room(call_id)
        
        # Remove call
        del active_calls[call_id]
        
        logger.info(f"Call ended: {call_id}")
        
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
        
        if not call_id or call_id not in active_calls:
            logger.warning(f"Received audio for invalid call: {call_id}")
            return
        
        if not audio_data:
            logger.warning("Received empty audio chunk")
            return
        
        # Convert base64 to bytes if necessary
        if isinstance(audio_data, str):
            audio_bytes = base64_to_bytes(audio_data)
        else:
            audio_bytes = audio_data
        
        # Validate audio chunk
        is_valid, message = validate_audio_chunk(audio_bytes)
        if not is_valid:
            logger.warning(f"Invalid audio chunk: {message}")
            return
        
        # Run ML inference
        detector = get_detector()
        result = detector.predict(audio_bytes)
        
        # Emit result to both users in the call
        emit('deepfake_result', {
            'call_id': call_id,
            'sender_id': sender_id,
            'result': result,
            'timestamp': time.time()
        }, room=call_id)
        
        logger.info(f"Deepfake detection result: {result}")
        
    except Exception as e:
        logger.error(f"Error processing audio chunk: {str(e)}")
        emit('error', {
            'message': 'Error processing audio',
            'details': str(e)
        }, room=request.sid)
