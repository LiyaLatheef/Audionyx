"""
Audionyx - Real-time Deepfake Audio Detection System
Flask Application Entry Point
"""
from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    # Run on plain HTTP - the Vite dev server proxies requests here
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False,
        log_output=True
    )
