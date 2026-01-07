"""
Audionyx Flask Application Factory
"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO
import os
import logging

logger = logging.getLogger(__name__)

# Initialize extensions
db = SQLAlchemy()
bcrypt = Bcrypt()
jwt = JWTManager()
socketio = SocketIO()

def create_app(config_name='default'):
    """Create and configure Flask application"""
    app = Flask(__name__)
    
    # Load configuration
    from app.config import config
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    CORS(app, origins=app.config['CORS_ORIGINS'], supports_credentials=True)
    socketio.init_app(
        app,
        cors_allowed_origins=app.config['SOCKETIO_CORS_ALLOWED_ORIGINS'],
        async_mode=app.config['SOCKETIO_ASYNC_MODE']
    )
    
    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.api import api_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # Register Socket.io events
    from app.services import socket_handler
    
    # Create database tables
    with app.app_context():
        db.create_all()
        
        # Initialize ML model (temporarily disabled - demo mode)
        # from app.services.ml_inference import init_model
        # init_model(app.config['MODEL_PATH'])
        logger.info("Running in demo mode - TensorFlow model loading temporarily disabled")
    
    @app.route('/')
    def index():
        return {
            'message': 'Audionyx API',
            'version': '1.0.0',
            'status': 'running'
        }
    
    @app.route('/health')
    def health():
        return {'status': 'healthy'}
    
    return app
