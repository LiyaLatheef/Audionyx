"""
API Routes
"""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.user import User

api_bp = Blueprint('api', __name__)

@api_bp.route('/users/online', methods=['GET'])
@jwt_required()
def get_online_users():
    """Get list of online users"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get all online users except current user
        online_users = User.query.filter(
            User.is_online == True,
            User.id != current_user_id
        ).all()
        
        return jsonify({
            'users': [user.to_dict() for user in online_users]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/users/all', methods=['GET'])
@jwt_required()
def get_all_users():
    """Get list of all users"""
    try:
        current_user_id = get_jwt_identity()
        
        # Get all users except current user
        users = User.query.filter(User.id != current_user_id).all()
        
        return jsonify({
            'users': [user.to_dict() for user in users]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/users/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    """Get user by ID"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'user': user.to_dict()}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
