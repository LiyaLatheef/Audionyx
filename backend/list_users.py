
from app import create_app, db
from app.models.user import User

app = create_app()

with app.app_context():
    users = User.query.all()
    print("\n--- Registered Users ---")
    if not users:
        print("No users found.")
    else:
        for user in users:
            print(f"ID: {user.id} | Username: {user.username} | Email: {user.email}")
    print("------------------------\n")
