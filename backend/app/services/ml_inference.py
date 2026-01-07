"""
ML Inference Service for Deepfake Detection
"""
try:
    import tensorflow as tf
    TF_AVAILABLE = True
except Exception as e:
    print(f"Warning: TensorFlow error ({e}). Running in demo mode.")
    TF_AVAILABLE = False

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
    
    def __init__(self, model_path, sample_rate=16000, duration=2):
        self.model = None
        self.model_path = model_path
        self.sample_rate = sample_rate
        self.duration = duration
        self.is_loaded = False
        
    def load_model(self):
        """Load the .h5 model"""
        try:
            if not TF_AVAILABLE:
                logger.warning("TensorFlow not available, running in demo mode")
                self.is_loaded = False
                return False
                
            if not os.path.exists(self.model_path):
                logger.warning(f"Model file not found at {self.model_path}")
                logger.info("Model will operate in demo mode (random predictions)")
                self.is_loaded = False
                return False
            
            logger.info(f"Loading model from {self.model_path}")
            self.model = tf.keras.models.load_model(self.model_path)
            self.is_loaded = True
            logger.info("Model loaded successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            logger.info("Model will operate in demo mode")
            self.is_loaded = False
            return False
    
    def preprocess_audio(self, audio_bytes):
        """
        Convert audio blob to model input
        Extracts MFCC features from audio
        """
        try:
            if not LIBROSA_AVAILABLE:
                raise ImportError("Librosa not available")
                
            # Load audio from bytes
            audio, sr = librosa.load(
                BytesIO(audio_bytes),
                sr=self.sample_rate,
                duration=self.duration
            )
            
            # Extract MFCC features (adjust n_mfcc based on your model)
            mfcc = librosa.feature.mfcc(
                y=audio,
                sr=sr,
                n_mfcc=40,
                n_fft=2048,
                hop_length=512
            )
            
            # Transpose to (time, features)
            mfcc = mfcc.T
            
            # Pad or truncate to fixed length (adjust based on your model)
            target_length = 128
            if mfcc.shape[0] < target_length:
                pad_width = target_length - mfcc.shape[0]
                mfcc = np.pad(mfcc, ((0, pad_width), (0, 0)), mode='constant')
            else:
                mfcc = mfcc[:target_length, :]
            
            # Normalize features
            mfcc = (mfcc - np.mean(mfcc)) / (np.std(mfcc) + 1e-8)
            
            # Add batch dimension
            mfcc = np.expand_dims(mfcc, axis=0)
            
            return mfcc
            
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
    _detector = DeepfakeDetector(model_path)
    _detector.load_model()
    return _detector

def get_detector():
    """Get the global detector instance"""
    global _detector
    if _detector is None:
        raise RuntimeError("Detector not initialized. Call init_model() first.")
    return _detector
