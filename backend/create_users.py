"""Create test users"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models.user import User

app = create_app()

with app.app_context():
    # Check if users exist
    bob = User.query.filter_by(email='bob@test.com').first()
    anna = User.query.filter_by(email='anna@test.com').first()
    fraudster = User.query.filter_by(email='fraudster@test.com').first()
    
    if not bob:
        bob = User(username='bob', email='bob@test.com', password='password')
        db.session.add(bob)
        print("Created user: bob@test.com")
    else:
        print("User bob@test.com already exists")
    
    if not anna:
        anna = User(username='anna', email='anna@test.com', password='password')
        db.session.add(anna)
        print("Created user: anna@test.com")
    else:
        print("User anna@test.com already exists")
    
    if not fraudster:
        fraudster = User(username='fraudster', email='fraudster@test.com', password='password')
        db.session.add(fraudster)
        print("Created user: fraudster@test.com (Test Account - Plays Fake Audio)")
    else:
        print("User fraudster@test.com already exists")
    
    db.session.commit()
    print("Users created successfully!")
