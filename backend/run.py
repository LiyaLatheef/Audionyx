"""
Audionyx - Real-time Deepfake Audio Detection System
Flask Application Entry Point
"""
from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    # Run with socketio for WebSocket support
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False,
        log_output=True,
        ssl_context='adhoc'
    )
