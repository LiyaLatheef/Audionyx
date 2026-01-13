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

logger = logging.getLogger(__name__)

class DeepfakeDetector:
    """Deepfake audio detection using pre-trained model"""
    
    def __init__(self, model_path, sample_rate=22050, duration=2):
        self.model = None
        self.model_path = model_path
        self.sample_rate = sample_rate  # 22050 Hz matches training
        self.duration = duration
        self.is_loaded = False
        
    def load_model(self):
        """Load the .h5 model"""
        try:
            print(f"[ML_INFERENCE] Attempting to load model from: {self.model_path}")
            
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
            logger.info(f"✓ Model loaded successfully! Ready for real deepfake detection.")
            print(f"[ML_INFERENCE] ✓ MODEL LOADED SUCCESSFULLY! Real detection enabled.")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            print(f"[ML_INFERENCE] Error loading model: {str(e)} - demo mode")
            logger.info("Model will operate in demo mode")
            self.is_loaded = False
            return False
    
    def preprocess_audio(self, audio_bytes):
        """
        Convert audio blob to mel spectrogram (matches training pipeline)
        Expected output shape: (1, 128, 87) for model input
        """
        try:
            if not LIBROSA_AVAILABLE:
                raise ImportError("Librosa not available")
            
            if np is None:
                raise ImportError("Numpy not available")
                
            # Load audio from bytes (22050 Hz sample rate, 2 seconds)
            audio_data, sample_rate = librosa.load(
                BytesIO(audio_bytes),
                sr=self.sample_rate,
                duration=self.duration
            )
            
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
            
            # Add batch dimension: (1, 128, 87)
            mel_spectrogram_input = np.expand_dims(mel_decibel_spectrogram, axis=0)
            
            return mel_spectrogram_input
            
        except Exception as e:
            logger.error(f"Error preprocessing audio: {str(e)}")
            raise
    
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
            
            # Preprocess audio
            features = self.preprocess_audio(audio_bytes)
            
            # Run prediction
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
                'status': 'success',
                'mode': 'model'
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
    _detector = DeepfakeDetector(model_path)
    _detector.load_model()
    return _detector

def get_detector():
    """Get the global detector instance"""
    global _detector
    if _detector is None:
        raise RuntimeError("Detector not initialized. Call init_model() first.")
    return _detector
