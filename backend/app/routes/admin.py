"""
Admin Routes — hardcoded credentials, list / delete users
"""
from flask import Blueprint, request, jsonify
from functools import wraps
from app import db
from app.models.user import User

admin_bp = Blueprint('admin', __name__)

# ── Hardcoded admin credentials ──────────────────────────────────────
ADMIN_EMAIL = 'admin@gmail.com'
ADMIN_PASSWORD = 'password'
ADMIN_TOKEN = 'audionyx-admin-secret-token'


def admin_required(f):
    """Decorator that checks for a valid admin token in the Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if auth_header != f'Bearer {ADMIN_TOKEN}':
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


@admin_bp.route('/login', methods=['POST'])
def admin_login():
    """Validate hardcoded admin credentials and return an admin token."""
    data = request.get_json()
    email = (data or {}).get('email', '').strip().lower()
    password = (data or {}).get('password', '')

    if email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
        return jsonify({'token': ADMIN_TOKEN, 'message': 'Admin login successful'}), 200

    return jsonify({'error': 'Invalid admin credentials'}), 401


@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """Return every registered user."""
    users = User.query.order_by(User.id).all()
    return jsonify({'users': [u.to_dict() for u in users]}), 200


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete a user by ID."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    username = user.username
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': f'User "{username}" deleted successfully'}), 200
