"""
ML Inference Service for Deepfake Detection
"""
# Lazy import TensorFlow to avoid startup delays
TF_AVAILABLE = False
tf = None

def _import_tensorflow():
    """Lazy import TensorFlow when needed"""
    global tf, TF_AVAILABLE
    if tf is None:
        try:
            import tensorflow as tensorflow_module
            tf = tensorflow_module
            TF_AVAILABLE = True
        except Exception as e:
            print(f"Warning: TensorFlow error ({e}). Running in demo mode.")
            TF_AVAILABLE = False
    return TF_AVAILABLE

try:
    import librosa
    LIBROSA_AVAILABLE = True
except Exception as e:
    print(f"Warning: Librosa error ({e}). Audio processing disabled.")
    LIBROSA_AVAILABLE = False

try:
    import numpy as np
except Exception:
    np = None
import os
from io import BytesIO
import logging
from collections import OrderedDict

logger = logging.getLogger(__name__)

class DeepfakeDetector:
    """Deepfake audio detection using pre-trained model"""
    
    def __init__(self, model_path, sample_rate=22050, duration=2):
        self.model = None
        self.model_path = model_path
        self.sample_rate = sample_rate
        self.duration = duration
        self.is_loaded = False
        self.model_backend = 'demo'  # 'tf' | 'torch' | 'demo'

        # Cache for LFCC computation (torch backend)
        self._lfcc_cache = {}
        
    def load_model(self):
        """Load the .h5 model"""
        try:
            print(f"[ML_INFERENCE] Attempting to load model from: {self.model_path}")

            _, ext = os.path.splitext(self.model_path)
            ext = ext.lower()

            if ext in {'.pt', '.pth'}:
                return self._load_torch_model()
            
            # Lazy import TensorFlow
            if not _import_tensorflow():
                logger.warning("TensorFlow not available, running in demo mode")
                print("[ML_INFERENCE] TensorFlow not available - demo mode")
                self.is_loaded = False
                return False
                
            if not os.path.exists(self.model_path):
                logger.warning(f"Model file not found at {self.model_path}")
                logger.info("Model will operate in demo mode (random predictions)")
                print(f"[ML_INFERENCE] Model file not found at {self.model_path} - demo mode")
                self.is_loaded = False
                return False
            
            logger.info(f"Loading model from {self.model_path}")
            print(f"[ML_INFERENCE] Loading model...")
            # Load without compilation (we only need inference)
            self.model = tf.keras.models.load_model(self.model_path, compile=False)
            self.is_loaded = True
            self.model_backend = 'tf'
            logger.info("Model loaded successfully. Ready for real deepfake detection.")
            print("[ML_INFERENCE] MODEL LOADED SUCCESSFULLY. Real detection enabled.")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            print(f"[ML_INFERENCE] Error loading model: {str(e)} - demo mode")
            logger.info("Model will operate in demo mode")
            self.is_loaded = False
            self.model_backend = 'demo'
            return False

    def _load_torch_model(self):
        """Load a PyTorch model (.pt TorchScript or .pth checkpoint/state_dict)."""
        try:
            import torch
            import torch.nn as nn
        except Exception as e:
            logger.warning(f"PyTorch not available ({e}), running in demo mode")
            print(f"[ML_INFERENCE] PyTorch not available ({e}) - demo mode")
            self.is_loaded = False
            self.model_backend = 'demo'
            return False

        if not os.path.exists(self.model_path):
            logger.warning(f"Model file not found at {self.model_path}")
            print(f"[ML_INFERENCE] Model file not found at {self.model_path} - demo mode")
            self.is_loaded = False
            self.model_backend = 'demo'
            return False

        # Prefer TorchScript when possible.
        try:
            scripted = torch.jit.load(self.model_path, map_location='cpu')
            scripted.eval()
            self.model = scripted
            self.is_loaded = True
            self.model_backend = 'torch'
            # Match training pipeline defaults for the Audionyx torch model
            self.sample_rate = 16000
            # The Audionyx torch model was trained on 4s windows; allow override via env.
            try:
                self.duration = float(os.getenv('TORCH_MODEL_DURATION', '4'))
            except Exception:
                self.duration = 4.0
            logger.info("TorchScript model loaded successfully")
            print("[ML_INFERENCE] TORCHSCRIPT MODEL LOADED SUCCESSFULLY. Real detection enabled.")
            return True
        except Exception:
            pass

        # Otherwise try torch.load (common for .pth checkpoints).
        obj = torch.load(self.model_path, map_location='cpu')

        # If a full nn.Module was saved, we can use it directly.
        if isinstance(obj, nn.Module):
            obj.eval()
            self.model = obj
            self.is_loaded = True
            self.model_backend = 'torch'
            self.sample_rate = 16000
            try:
                self.duration = float(os.getenv('TORCH_MODEL_DURATION', '4'))
            except Exception:
                self.duration = 4.0
            logger.info("PyTorch nn.Module loaded successfully")
            print("[ML_INFERENCE] PYTORCH MODEL LOADED SUCCESSFULLY. Real detection enabled.")
            return True

        # If a state_dict was saved, we need the model architecture to reconstruct the module.
        if isinstance(obj, (dict, OrderedDict)):
            state_dict = obj
            if isinstance(obj, dict) and 'state_dict' in obj and isinstance(obj['state_dict'], (dict, OrderedDict)):
                state_dict = obj['state_dict']

            try:
                from app.services.torch_model import build_model  # type: ignore
                model = build_model(state_dict)
                model.load_state_dict(state_dict, strict=True)
                model.eval()
                self.model = model
                self.is_loaded = True
                self.model_backend = 'torch'
                self.sample_rate = 16000
                try:
                    self.duration = float(os.getenv('TORCH_MODEL_DURATION', '4'))
                except Exception:
                    self.duration = 4.0
                logger.info("PyTorch model rebuilt from state_dict successfully")
                print("[ML_INFERENCE] PYTORCH MODEL (STATE_DICT) LOADED SUCCESSFULLY. Real detection enabled.")
                return True
            except Exception as e:
                logger.error(
                    "PyTorch checkpoint appears to be a state_dict, but no compatible model definition was provided. "
                    "Add app.services.torch_model.build_model(state_dict) or export a TorchScript .pt file. "
                    f"Error: {e}"
                )
                print(
                    "[ML_INFERENCE] PyTorch .pth is a state_dict; need model architecture to load. "
                    "Provide app/services/torch_model.py (build_model) or export TorchScript (.pt). Demo mode."
                )
                self.is_loaded = False
                self.model_backend = 'demo'
                return False

        logger.error(f"Unsupported PyTorch checkpoint type: {type(obj)}")
        self.is_loaded = False
        self.model_backend = 'demo'
        return False

    def _torch_predict_proba(self, features_np):
        """Run PyTorch/TorchScript inference and return probability in [0,1]."""
        import torch

        if np is None:
            raise ImportError("Numpy not available")

        # Common input shapes seen in audio CNNs: (B, 128, 87) or (B, 1, 128, 87)
        x = torch.from_numpy(features_np).to(dtype=torch.float32)

        candidates = [x]
        if x.dim() == 3:
            candidates.append(x.unsqueeze(1))  # (B, 1, 128, 87)
            # Some models use time-major: (B, 87, 128)
            candidates.append(x.transpose(1, 2))
            candidates.append(x.transpose(1, 2).unsqueeze(1))

        last_err = None
        with torch.no_grad():
            for x_try in candidates:
                try:
                    out = self.model(x_try)
                    return self._torch_output_to_probability(out)
                except Exception as e:
                    last_err = e
                    continue

        raise RuntimeError(f"Torch model inference failed for common input shapes: {last_err}")

    def _torch_output_to_probability(self, out):
        """Convert torch output (logit/proba/2-class logits) into probability."""
        import torch

        try:
            temp = float(os.getenv('TORCH_LOGIT_TEMPERATURE', '1.0'))
            if not (temp > 0):
                temp = 1.0
        except Exception:
            temp = 1.0

        # TorchScript sometimes returns tuples/lists
        if isinstance(out, (tuple, list)) and len(out) > 0:
            out = out[0]

        if not torch.is_tensor(out):
            out = torch.tensor(out)

        out = out.detach().cpu()

        # Scalar
        if out.dim() == 0:
            val = float(out.item())
            return float(torch.sigmoid(torch.tensor(val / temp)).item())

        # Flatten batch
        if out.dim() == 1:
            # Could be logits or probs
            val = float(out[0].item())
            if 0.0 <= val <= 1.0:
                return val
            return float(torch.sigmoid(out[0] / temp).item())

        if out.dim() >= 2:
            # (B, 1)
            if out.shape[-1] == 1:
                val = float(out.reshape(-1)[0].item())
                if 0.0 <= val <= 1.0:
                    return val
                return float(torch.sigmoid(out.reshape(-1)[0] / temp).item())

            # (B, 2) softmax
            if out.shape[-1] == 2:
                probs = torch.softmax(out.reshape(-1, 2), dim=-1)
                return float(probs[0, 1].item())

            # Otherwise, best-effort: take first element and sigmoid
            val = float(out.reshape(-1)[0].item())
            return float(torch.sigmoid(torch.tensor(val / temp)).item())

        # Should not reach
        return 0.5
    
    def preprocess_audio(self, audio_bytes):
        """
        Convert audio blob to mel spectrogram (matches training pipeline)
        Expected output shape:
        - TensorFlow backend: (1, 128, 87)
        - PyTorch backend (audionyx_model.pt): (1, 2, 64, T) where channels are (mel_db_norm, lfcc_norm)
        """
        try:
            if not LIBROSA_AVAILABLE:
                raise ImportError("Librosa not available")
            
            if np is None:
                raise ImportError("Numpy not available")
                
            if self.model_backend == 'torch':
                return self._preprocess_audio_torch(audio_bytes)

            # TF/Keras legacy path: 22050 Hz, 2 seconds, mel (128, 87)
            audio_data, sample_rate = librosa.load(BytesIO(audio_bytes), sr=self.sample_rate, duration=self.duration)
            
            # Extract Mel Spectrogram (same as training)
            mel_spectrogram = librosa.feature.melspectrogram(
                y=audio_data, 
                sr=sample_rate
            )
            
            # Convert to decibels (same as training)
            mel_decibel_spectrogram = librosa.power_to_db(mel_spectrogram, ref=np.max)
            
            # Expected shape from training: (128, 87)
            # mel_decibel_spectrogram shape is (n_mels, time_steps)
            # Default n_mels=128, so we should get close to (128, 87) for 2-second audio
            
            logger.debug(f"Mel spectrogram shape before padding: {mel_decibel_spectrogram.shape}")
            
            # Ensure shape matches training data (128, 87)
            target_shape = (128, 87)
            
            # Pad or truncate frequency bins (first dimension)
            if mel_decibel_spectrogram.shape[0] < target_shape[0]:
                pad_freq = target_shape[0] - mel_decibel_spectrogram.shape[0]
                mel_decibel_spectrogram = np.pad(
                    mel_decibel_spectrogram, 
                    ((0, pad_freq), (0, 0)), 
                    mode='constant'
                )
            elif mel_decibel_spectrogram.shape[0] > target_shape[0]:
                mel_decibel_spectrogram = mel_decibel_spectrogram[:target_shape[0], :]
            
            # Pad or truncate time steps (second dimension)
            if mel_decibel_spectrogram.shape[1] < target_shape[1]:
                pad_time = target_shape[1] - mel_decibel_spectrogram.shape[1]
                mel_decibel_spectrogram = np.pad(
                    mel_decibel_spectrogram, 
                    ((0, 0), (0, pad_time)), 
                    mode='constant'
                )
            elif mel_decibel_spectrogram.shape[1] > target_shape[1]:
                mel_decibel_spectrogram = mel_decibel_spectrogram[:, :target_shape[1]]
            
            logger.debug(f"Mel spectrogram shape after padding: {mel_decibel_spectrogram.shape}")
            
            # Default TF path: (1, 128, 87)
            return np.expand_dims(mel_decibel_spectrogram, axis=0)
            
        except Exception as e:
            logger.error(f"Error preprocessing audio: {str(e)}")
            raise

    def _preprocess_audio_torch(self, audio_bytes):
        """Torch model preprocessing: 16kHz audio -> (mel_db, lfcc) stacked as 2 channels.

        Prefer torchaudio's transforms (to match training) when available.
        """
        if np is None:
            raise ImportError("Numpy not available")

        # Decode wav bytes (frontend sends WAV). Prefer soundfile for robustness.
        waveform = None
        try:
            import soundfile as sf
            audio_np, sr = sf.read(BytesIO(audio_bytes), dtype='float32', always_2d=True)
            # audio_np: (frames, channels)
            audio_np = audio_np.mean(axis=1)
            waveform = audio_np
        except Exception:
            waveform = None

        # Training pipeline used 16kHz, mel+LFCC with 64 bins, and specific STFT params.
        target_sr = 16000
        n_mels = 64
        n_lfcc = 64
        n_fft = 400
        win_length = 400
        hop_length = 160

        # Load audio (fallback to librosa if needed)
        if waveform is None:
            audio_data, _ = librosa.load(BytesIO(audio_bytes), sr=target_sr)
        else:
            # Resample to target_sr if needed
            try:
                if 'sr' in locals() and sr != target_sr:
                    audio_data = librosa.resample(waveform, orig_sr=int(sr), target_sr=target_sr)
                else:
                    audio_data = waveform
            except Exception:
                audio_data, _ = librosa.load(BytesIO(audio_bytes), sr=target_sr)

        # Pad/truncate to model window length (streaming default is 2s)
        win_sec = float(self.duration) if self.duration else 2.0
        if win_sec < 0.5:
            win_sec = 2.0

        # Ensure fixed length (repeat-pad/truncate). Repeat-pad avoids adding long trailing silence
        # which can distort features for short chunks.
        target_len = int(target_sr * win_sec)
        if audio_data.shape[0] < target_len:
            if audio_data.shape[0] > 0:
                reps = int(np.ceil(target_len / float(audio_data.shape[0])))
                audio_data = np.tile(audio_data, reps)[:target_len]
            else:
                audio_data = np.pad(audio_data, (0, target_len - audio_data.shape[0]), mode='constant')
        elif audio_data.shape[0] > target_len:
            audio_data = audio_data[:target_len]

        # Optional telephony bandpass (helps match VoIP/phone domain)
        try:
            apply_bp = os.getenv('APPLY_TELEPHONY_BANDPASS', '1').strip().lower() not in {'0', 'false', 'no'}
        except Exception:
            apply_bp = True

        if apply_bp:
            try:
                from scipy.signal import butter, lfilter

                low = float(os.getenv('TELEPHONY_BANDPASS_LOW_HZ', '300'))
                high = float(os.getenv('TELEPHONY_BANDPASS_HIGH_HZ', '3400'))
                nyq = 0.5 * target_sr
                low_n = max(1e-6, low / nyq)
                high_n = min(0.999, high / nyq)
                if low_n < high_n:
                    b, a = butter(4, [low_n, high_n], btype='band')
                    audio_data = lfilter(b, a, audio_data).astype(np.float32)
            except Exception:
                # If filtering fails, proceed with raw audio.
                pass

        # Optional codec simulation (GSM/VoIP-ish): 16k -> 8k -> 16k
        try:
            apply_codec = os.getenv('APPLY_TELEPHONY_CODEC_SIM', '1').strip().lower() not in {'0', 'false', 'no'}
        except Exception:
            apply_codec = True
        if apply_codec:
            try:
                down = librosa.resample(audio_data, orig_sr=target_sr, target_sr=8000)
                audio_data = librosa.resample(down, orig_sr=8000, target_sr=target_sr).astype(np.float32)
            except Exception:
                pass

        # Try torchaudio transforms first (closer to training notebook)
        try:
            import torch
            import torchaudio.transforms as T

            wav_t = torch.from_numpy(audio_data).to(dtype=torch.float32).unsqueeze(0)  # (1, T)
            mel_transform = T.MelSpectrogram(
                sample_rate=target_sr,
                n_mels=n_mels,
                n_fft=n_fft,
                win_length=win_length,
                hop_length=hop_length,
            )
            lfcc_transform = T.LFCC(
                sample_rate=target_sr,
                n_lfcc=n_lfcc,
                speckwargs={
                    'n_fft': n_fft,
                    'win_length': win_length,
                    'hop_length': hop_length,
                },
            )

            mels = mel_transform(wav_t)
            mels = T.AmplitudeToDB()(mels)
            lfccs = lfcc_transform(wav_t)

            # Instance norm (match training)
            mels = (mels - mels.mean()) / (mels.std() + 1e-6)
            lfccs = (lfccs - lfccs.mean()) / (lfccs.std() + 1e-6)

            # mels/lfccs: (1, 64, time)
            stacked = torch.stack([mels.squeeze(0), lfccs.squeeze(0)], dim=0).cpu().numpy().astype(np.float32)
            return np.expand_dims(stacked, axis=0)
        except Exception:
            pass

        # Mel spectrogram -> dB
        mel = librosa.feature.melspectrogram(
            y=audio_data,
            sr=target_sr,
            n_mels=n_mels,
            n_fft=n_fft,
            win_length=win_length,
            hop_length=hop_length,
            power=2.0,
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)

        # LFCC
        lfcc = self._compute_lfcc(
            y=audio_data,
            sr=target_sr,
            n_lfcc=n_lfcc,
            n_filters=n_lfcc,
            n_fft=n_fft,
            win_length=win_length,
            hop_length=hop_length,
        )

        # Normalize (instance norm)
        mel_db = (mel_db - mel_db.mean()) / (mel_db.std() + 1e-6)
        lfcc = (lfcc - lfcc.mean()) / (lfcc.std() + 1e-6)

        # Align time axis
        t = max(mel_db.shape[1], lfcc.shape[1])
        mel_db = self._pad_or_truncate_2d(mel_db, (n_mels, t))
        lfcc = self._pad_or_truncate_2d(lfcc, (n_lfcc, t))

        # Ensure minimum time length so pooling doesn't collapse too far
        if t < 16:
            mel_db = self._pad_or_truncate_2d(mel_db, (n_mels, 16))
            lfcc = self._pad_or_truncate_2d(lfcc, (n_lfcc, 16))

        # Stack into channels: (2, 64, T) then batch
        stacked = np.stack([mel_db, lfcc], axis=0).astype(np.float32)
        return np.expand_dims(stacked, axis=0)

    def _pad_or_truncate_2d(self, arr, target_shape):
        """Pad/truncate a 2D array to (freq, time)."""
        if np is None:
            raise ImportError("Numpy not available")

        target_f, target_t = target_shape
        out = arr
        if out.shape[0] < target_f:
            out = np.pad(out, ((0, target_f - out.shape[0]), (0, 0)), mode='constant')
        elif out.shape[0] > target_f:
            out = out[:target_f, :]

        if out.shape[1] < target_t:
            out = np.pad(out, ((0, 0), (0, target_t - out.shape[1])), mode='constant')
        elif out.shape[1] > target_t:
            out = out[:, :target_t]
        return out

    def _compute_lfcc(self, y, sr, n_lfcc, n_filters, n_fft, win_length, hop_length):
        """Compute LFCC features using a simple linear filterbank + DCT-II (numpy)."""
        if np is None:
            raise ImportError("Numpy not available")

        cache_key = (n_lfcc, n_filters, n_fft, sr)
        cached = self._lfcc_cache.get(cache_key)

        # Power spectrogram
        stft = librosa.stft(y=y, n_fft=n_fft, hop_length=hop_length, win_length=win_length, window='hann', center=True)
        power_spec = (np.abs(stft) ** 2).astype(np.float32)  # (freq_bins, time)

        if cached is None:
            fb = self._linear_filterbank(sr=sr, n_fft=n_fft, n_filters=n_filters)
            dct_mat = self._dct_mat(n_lfcc=n_lfcc, n_filters=n_filters)
            self._lfcc_cache[cache_key] = (fb, dct_mat)
        else:
            fb, dct_mat = cached

        # Apply filterbank: (n_filters, time)
        energies = np.dot(fb, power_spec)
        energies = np.maximum(energies, 1e-10)
        log_energies = np.log(energies)

        # DCT-II to get cepstra: (n_lfcc, time)
        lfcc = np.dot(dct_mat, log_energies)
        return lfcc.astype(np.float32)

    def _linear_filterbank(self, sr, n_fft, n_filters):
        if np is None:
            raise ImportError("Numpy not available")

        # Triangular filters spaced linearly in Hz.
        n_freqs = n_fft // 2 + 1
        freqs = np.linspace(0, sr / 2, n_freqs)

        # Filter edges in Hz
        edges = np.linspace(0, sr / 2, n_filters + 2)
        fb = np.zeros((n_filters, n_freqs), dtype=np.float32)

        for i in range(n_filters):
            left, center, right = edges[i], edges[i + 1], edges[i + 2]
            # Rising slope
            left_idx = np.where((freqs >= left) & (freqs <= center))[0]
            if left_idx.size:
                fb[i, left_idx] = (freqs[left_idx] - left) / max(center - left, 1e-9)
            # Falling slope
            right_idx = np.where((freqs >= center) & (freqs <= right))[0]
            if right_idx.size:
                fb[i, right_idx] = (right - freqs[right_idx]) / max(right - center, 1e-9)

        # Normalize filters to unit area (helps stability)
        fb_sum = fb.sum(axis=1, keepdims=True)
        fb_sum = np.where(fb_sum == 0, 1.0, fb_sum)
        fb = fb / fb_sum
        return fb

    def _dct_mat(self, n_lfcc, n_filters):
        if np is None:
            raise ImportError("Numpy not available")

        # DCT-II matrix (orthonormal-ish scaling).
        n = np.arange(n_filters)
        k = np.arange(n_lfcc)[:, None]
        mat = np.cos(np.pi / n_filters * (n + 0.5) * k).astype(np.float32)
        mat[0, :] *= 1.0 / np.sqrt(n_filters)
        if n_lfcc > 1:
            mat[1:, :] *= np.sqrt(2.0 / n_filters)
        return mat
    
    def predict(self, audio_bytes):
        """
        Run inference on audio chunk
        Returns deepfake probability and classification
        """
        try:
            # If model is not loaded, return demo results
            if not self.is_loaded or self.model is None:
                logger.warning("Model not loaded, returning demo prediction")
                # Return random prediction for demo purposes
                import random
                demo_prob = random.uniform(0.1, 0.9)
                return {
                    'is_deepfake': demo_prob > 0.5,
                    'confidence': float(demo_prob),
                    'status': 'success',
                    'mode': 'demo'
                }
            
            # Simple VAD guard (matches training demo behavior)
            # If chunk is effectively silence, return 0 risk instead of scoring.
            vad_db = None
            vad_speech = None
            try:
                import soundfile as sf
                audio_np, sr = sf.read(BytesIO(audio_bytes), dtype='float32', always_2d=True)
                audio_np = audio_np.mean(axis=1)
                rms = float((audio_np ** 2).mean() ** 0.5)
                import math
                db = 20.0 * math.log10(rms + 1e-9)
                vad_db = db
                vad_thresh = float(os.getenv('VAD_THRESHOLD_DB', '-40'))
                if db <= vad_thresh:
                    vad_speech = False
                    return {
                        'is_deepfake': False,
                        'confidence': 0.0,
                        'authentic_probability': 1.0,
                        'status': 'success',
                        'mode': 'model',
                        'vad_speech': False,
                        'vad_db': db,
                    }
                vad_speech = True
            except Exception:
                pass

            # Preprocess audio
            features = self.preprocess_audio(audio_bytes)

            # Run prediction
            if self.model_backend == 'torch':
                deepfake_probability = float(self._torch_predict_proba(features))
            else:
                prediction = self.model.predict(features, verbose=0)
                # Extract probability (adjust based on your model output)
                # Assuming binary classification with sigmoid activation
                if prediction.shape[-1] == 1:
                    deepfake_probability = float(prediction[0][0])
                else:
                    # If softmax with 2 classes, take the second class probability
                    deepfake_probability = float(prediction[0][1])
            
            # Determine classification
            is_deepfake = deepfake_probability > 0.5
            
            return {
                'is_deepfake': is_deepfake,
                'confidence': deepfake_probability,
                'authentic_probability': float(1.0 - deepfake_probability),
                'status': 'success',
                'mode': 'model',
                'vad_speech': vad_speech,
                'vad_db': vad_db,
            }
            
        except Exception as e:
            logger.error(f"Error during prediction: {str(e)}")
            return {
                'status': 'error',
                'message': str(e),
                'is_deepfake': False,
                'confidence': 0.0
            }

# Global detector instance
_detector = None

def init_model(model_path):
    """Initialize the global detector instance"""
    global _detector
    # Ensure absolute path
    import os
    if not os.path.isabs(model_path):
        # Relative path - convert to absolute from backend directory
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        model_path = os.path.join(backend_dir, model_path)

    # If configured path is missing, fall back to a known filename or the first .h5 in backend/models.
    if not os.path.exists(model_path):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        models_dir = os.path.join(backend_dir, 'models')
        candidate_paths = [
            os.path.join(models_dir, 'audionyx_model.pt'),
            os.path.join(models_dir, 'audionyx_model1.pth'),
            os.path.join(models_dir, 'deepfake_audio_detector.h5'),
            os.path.join(models_dir, 'deepfake_audio_detector_v2.h5'),
        ]
        for candidate in candidate_paths:
            if os.path.exists(candidate):
                model_path = candidate
                break
        else:
            try:
                h5_files = [
                    os.path.join(models_dir, name)
                    for name in os.listdir(models_dir)
                    if name.lower().endswith('.h5')
                ]
                if h5_files:
                    model_path = h5_files[0]
            except Exception:
                pass
    _detector = DeepfakeDetector(model_path)
    _detector.load_model()
    return _detector

def get_detector():
    """Get the global detector instance"""
    global _detector
    if _detector is None:
        raise RuntimeError("Detector not initialized. Call init_model() first.")
    return _detector
