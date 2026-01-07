# Audionyx - Real-time Deepfake Audio Detection System

A full-stack web application for detecting deepfake audio in real-time phone calls using WebRTC, Socket.io, and machine learning.

## 🎯 Features

- **Real-time Audio Calls**: WebRTC-based peer-to-peer audio calls
- **Deepfake Detection**: ML model integration for real-time fraud detection
- **User Authentication**: Secure JWT-based authentication
- **Live Analysis**: 2-second audio chunk processing during calls
- **Visual Feedback**: Audio visualizers and color-coded deepfake indicators
- **Multi-user Support**: Online user management and call routing

## 🏗️ Architecture

### Backend (Flask)
- **Framework**: Flask with Flask-SocketIO
- **Authentication**: JWT tokens with Flask-JWT-Extended
- **Database**: SQLAlchemy (SQLite for development)
- **ML Framework**: TensorFlow/Keras for model inference
- **Audio Processing**: Librosa, Pydub for audio feature extraction
- **WebSocket**: Socket.io for real-time signaling and results

### Frontend (React)
- **Framework**: React 18 with Vite
- **Routing**: React Router v6
- **WebRTC**: Native WebRTC API with adapter.js
- **Socket Client**: Socket.io-client
- **HTTP Client**: Axios with interceptors
- **Styling**: Pure CSS with modern gradients

## 📁 Project Structure

```
Audionyx/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask app factory
│   │   ├── config.py            # Configuration
│   │   ├── models/
│   │   │   └── user.py          # User model
│   │   ├── routes/
│   │   │   ├── auth.py          # Authentication routes
│   │   │   └── api.py           # API routes
│   │   ├── services/
│   │   │   ├── ml_inference.py      # ML model service
│   │   │   ├── audio_processor.py   # Audio utilities
│   │   │   └── socket_handler.py    # Socket.io events
│   │   └── utils/
│   ├── models/
│   │   └── deepfake_detector.h5     # Your trained model (place here)
│   ├── requirements.txt
│   ├── run.py
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/
│   │   │   │   ├── Login.jsx
│   │   │   │   └── Register.jsx
│   │   │   ├── Call/
│   │   │   │   ├── CallInterface.jsx
│   │   │   │   ├── AudioVisualizer.jsx
│   │   │   │   └── DeepfakeIndicator.jsx
│   │   │   └── Dashboard/
│   │   │       └── UserDashboard.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── CallContext.jsx
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js
│   │   │   └── useAudioProcessing.js
│   │   ├── services/
│   │   │   ├── auth.js
│   │   │   └── socket.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── .env
│
└── README.md
```

## 🚀 Setup Instructions

### Prerequisites

- **Python 3.9-3.11** (TensorFlow compatibility)
- **Node.js 18+** and npm
- **FFmpeg** (required by pydub for audio conversion)

#### Installing FFmpeg:

**Windows:**
```powershell
# Using Chocolatey
choco install ffmpeg

# Or download from: https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt update
sudo apt install ffmpeg
```

### Backend Setup

1. **Navigate to backend directory:**
```powershell
cd backend
```

2. **Create virtual environment:**
```powershell
python -m venv venv
```

3. **Activate virtual environment:**
```powershell
# Windows
.\venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

4. **Install dependencies:**
```powershell
pip install -r requirements.txt
```

5. **Place your trained model:**
```
Place your deepfake_detector.h5 file in: backend/models/deepfake_detector.h5
```

**Important**: If you don't have a model yet, the system will run in **demo mode** with random predictions for testing purposes.

6. **Run the backend:**
```powershell
python run.py
```

Backend will start on `http://localhost:5000`

### Frontend Setup

1. **Open a new terminal and navigate to frontend:**
```powershell
cd frontend
```

2. **Install dependencies:**
```powershell
npm install
```

3. **Run the frontend:**
```powershell
npm run dev
```

Frontend will start on `http://localhost:3000`

## 🧪 Testing with Two Users (Same Device)

To test the real-time call functionality locally:

### Method 1: Normal + Incognito Browser

1. **Normal Tab** (User A):
   - Open: `http://localhost:3000`
   - Register a new account (e.g., alice@test.com)
   - Login and go to dashboard

2. **Incognito Tab** (User B):
   - Press `Ctrl+Shift+N` (Chrome) or `Ctrl+Shift+P` (Firefox)
   - Open: `http://localhost:3000`
   - Register another account (e.g., bob@test.com)
   - Login and go to dashboard

3. **Make a Call**:
   - Both users should see each other in "Online Users"
   - Click "Call" button from one user
   - Accept the incoming call on the other user
   - Real-time deepfake detection will start automatically

### Method 2: Two Different Browsers

- Open one browser (e.g., Chrome): User A
- Open another browser (e.g., Firefox): User B
- Follow the same registration and call process

### Expected Behavior

1. **Before Call**:
   - Dashboard shows list of online users
   - Users can initiate calls

2. **During Call**:
   - Audio visualizers show waveforms for both users
   - Deepfake indicator updates every 2 seconds
   - Color-coded confidence meter (Green = Safe, Orange = Warning, Red = Danger)
   - History bars show recent detection results

3. **After Call**:
   - Users return to dashboard
   - Can initiate new calls

## 🎯 Model Integration

### Your Model Requirements

Your `.h5` model should:
- Accept audio features as input (MFCC recommended)
- Be trained on 2-second audio clips
- Output a single probability value (0-1) or softmax with 2 classes
- Sample rate: 16kHz (configurable in `backend/app/config.py`)

### Current Preprocessing

The system extracts **MFCC features** with these parameters:
```python
- n_mfcc: 40
- n_fft: 2048
- hop_length: 512
- target_length: 128 time steps
- Normalization: Z-score
```

### Customizing Preprocessing

Edit `backend/app/services/ml_inference.py` → `preprocess_audio()` method to match your model's training pipeline.

## 🔧 Configuration

### Backend Configuration (`backend/.env`)

```env
FLASK_ENV=development
SECRET_KEY=your-secret-key-change-in-production
JWT_SECRET_KEY=your-jwt-secret-change-in-production
DATABASE_URI=sqlite:///audionyx.db
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
MODEL_PATH=models/deepfake_detector.h5
```

### Frontend Configuration (`frontend/.env`)

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

## 📊 Key Files

### Backend
- [backend/run.py](backend/run.py) - Application entry point
- [backend/app/__init__.py](backend/app/__init__.py) - Flask app factory
- [backend/app/services/ml_inference.py](backend/app/services/ml_inference.py) - ML model integration
- [backend/app/services/socket_handler.py](backend/app/services/socket_handler.py) - WebRTC signaling and events
- [backend/app/routes/auth.py](backend/app/routes/auth.py) - Authentication endpoints

### Frontend
- [frontend/src/App.jsx](frontend/src/App.jsx) - Main app component
- [frontend/src/hooks/useWebRTC.js](frontend/src/hooks/useWebRTC.js) - WebRTC call management
- [frontend/src/hooks/useAudioProcessing.js](frontend/src/hooks/useAudioProcessing.js) - Audio chunk processing
- [frontend/src/components/Call/CallInterface.jsx](frontend/src/components/Call/CallInterface.jsx) - Call UI
- [frontend/src/components/Call/DeepfakeIndicator.jsx](frontend/src/components/Call/DeepfakeIndicator.jsx) - Detection display

## 🛠️ Troubleshooting

### Backend Issues

**Issue**: `ModuleNotFoundError: No module named 'tensorflow'`
- **Solution**: Activate virtual environment and reinstall dependencies
```powershell
.\venv\Scripts\activate
pip install -r requirements.txt
```

**Issue**: `Error loading model`
- **Solution**: Model is optional. System runs in demo mode. To use real model, place `deepfake_detector.h5` in `backend/models/`

**Issue**: `FFmpeg not found`
- **Solution**: Install FFmpeg (see Prerequisites section)

### Frontend Issues

**Issue**: `Cannot connect to Socket.io`
- **Solution**: Ensure backend is running on port 5000
- Check CORS settings in `backend/.env`

**Issue**: `Microphone permission denied`
- **Solution**: Grant microphone access in browser settings

**Issue**: `WebRTC connection failed`
- **Solution**: Check browser console for errors
- Ensure both tabs are on same network

## 🚀 Next Steps

1. **Install dependencies** for both backend and frontend
2. **Place your .h5 model** in `backend/models/` (optional - works in demo mode without it)
3. **Start backend**: `cd backend && python run.py`
4. **Start frontend**: `cd frontend && npm run dev` (in new terminal)
5. **Open two browser tabs** and test the system
6. **Customize preprocessing** in `ml_inference.py` to match your model's training

---

**Built for real-time deepfake detection in audio calls**