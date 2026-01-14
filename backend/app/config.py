"""
Application Configuration
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-jwt-secret-key')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URI', 'sqlite:///audionyx.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # CORS
    CORS_ORIGINS = os.getenv(
        'CORS_ORIGINS',
        'http://localhost:3000,http://localhost:3001,http://localhost:5173'
    ).split(',')
    
    # ML Model configuration
    BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    # Default to the latest local model if present.
    MODEL_PATH = os.getenv('MODEL_PATH', 'models/audionyx_model.pt')
    
    # Audio Processing
    SAMPLE_RATE = 16000
    AUDIO_DURATION = 2  # seconds
    CHUNK_SIZE = 2000  # milliseconds
    
    # Socket.io
    SOCKETIO_CORS_ALLOWED_ORIGINS = CORS_ORIGINS
    SOCKETIO_ASYNC_MODE = None  # Auto-detect best async mode

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'
    # eventlet is unreliable on Windows; threading is the most stable option for local dev.
    SOCKETIO_ASYNC_MODE = 'threading'

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
