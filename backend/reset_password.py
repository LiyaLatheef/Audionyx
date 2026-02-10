import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models.user import User

app = create_app()
with app.app_context():
    users = User.query.all()
    for user in users:
        user.set_password('password')
        print(f"  Reset: {user.username} ({user.email})")
    db.session.commit()
    print(f"\nAll {len(users)} accounts reset to password: password")
