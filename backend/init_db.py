
from app import create_app, db
from app.models.user import User

app = create_app()

with app.app_context():
    db.create_all()
    print("Database tables created.")
    
    if not User.query.filter_by(email='test@example.com').first():
        user = User(username='testuser', email='test@example.com', password='password123')
        db.session.add(user)
        db.session.commit()
        print("Test user created: test@example.com / password123")
    else:
        print("Test user already exists.")
