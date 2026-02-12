
"""Create test users"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models.user import User

app = create_app()

with app.app_context():
    # Check if Gautham exists
    gautham = User.query.filter_by(email='gautham@gmail.com').first()
    
    if not gautham:
        gautham = User(username='Gautham', email='gautham@gmail.com', password='password')
        db.session.add(gautham)
        print("Created user: gautham@gmail.com (Fraudster Account - Plays Fake Audio)")
    else:
        print("User gautham@gmail.com already exists")
    
    db.session.commit()
    print("User creation check complete!")
