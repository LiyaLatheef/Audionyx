# Audionyx - Real-time Deepfake Audio Detection System

A full-stack web application for detecting deepfake audio in real-time phone calls using WebRTC, Socket.io, and machine learning.

![Audionyx UI](https://via.placeholder.com/800x400?text=Audionyx+Call+Interface)

## Features

- **Real-time Audio Calls**: WebRTC-based peer-to-peer audio calls with low latency.
- **Deepfake Detection**: Integrated Keras model (v2) analyzes audio every 2 seconds.
- **Fraudster Simulation**: Built-in mode to simulate a fraudster injecting pre-recorded deepfake audio.
- **Modern UI**: Specialized Glassmorphism design with reactive audio visualizers.
- **Secure Auth**: JWT-based authentication with session persistence.
- **Cross-Platform**: Responsive design that works on Desktop and Mobile.

## Architecture

### Backend (Flask)
- **Core**: Flask 3.0 + Flask-SocketIO (Eventlet/Threading)
- **ML Engine**: TensorFlow/Keras running `deepfake_audio_detector_v2.h5`
- **Audio Processing**: Librosa + SoundFile for feature extraction (MFCC)
- **Database**: SQLite (SQLAlchemy)

### Frontend (React)
- **Core**: React 18 + Vite
- **Real-time**: Socket.io-client + Native WebRTC
- **Styling**: Pure CSS variables, Glassmorphism, Responsive Grid

## Project Structure

```
Audionyx/
├── backend/
│   ├── app/
│   │   ├── config.py            # App configuration
│   │   ├── routes/              # API & Auth routes
│   │   ├── services/            # ML & Socket logic
│   │   └── models/              # Database models
│   ├── models/
│   │   └── deepfake_audio_detector_v2.h5  # Active ML Model
│   ├── requirements.txt
│   ├── run.py
│   └── Dockerfile               # For cloud deployment
│
├── frontend/
│   ├── src/
│   │   ├── components/          # React components (Call, Dashboard, Auth)
│   │   ├── context/             # Global state (Auth, Call)
│   │   ├── hooks/               # Custom hooks (useWebRTC)
│   │   └── services/            # API & Socket services
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

## Quick Setup

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **FFmpeg** (Required for audio processing)
    - *Windows*: `choco install ffmpeg`
    - *Mac*: `brew install ffmpeg`
    - *Linux*: `sudo apt install ffmpeg`

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# Activate: .\venv\Scripts\activate (Win) or source venv/bin/activate (Mac/Linux)
pip install -r requirements.txt
python run.py
```
*Server runs on `http://localhost:5000`*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Client runs on `http://localhost:3000` (or `https` if configured)*

---

## Testing & Fraudster Mode

### Standard Test
1. Open `http://localhost:3000` in Chrome (User A).
2. Open `http://localhost:3000` in an Incognito window or Firefox (User B).
3. Register/Login both users.
4. Call each other from the Dashboard.

### Simulating a Fraudster
To test the detection system without generating real deepfakes yourself:
1. Register a user with the email: **`fraudster@test.com`**
2. When this user calls anyone, the system **bypasses the microphone**.
3. It automatically injects the `audio_files/test_deepfake.wav` (or similar) into the call.
4. The recipient will hear the deepfake audio, and the detector should flag it as **High Risk**.

---

## Deployment (Public Access)

### Option 1: Temporary Public Access (ngrok)
To test on mobile devices or share with friends instantaneously:

1. **Install ngrok**: [ngrok.com](https://ngrok.com)
2. **Tunnel Backend**: `ngrok http 5000` -> Copy URL A
3. **Tunnel Frontend**: `ngrok http https://localhost:3000` -> Copy URL B
4. **Update Configs**:
    - `backend/app/config.py`: Add URL B to `CORS_ORIGINS`.
    - `frontend/.env.local`: Set `VITE_API_URL` and `VITE_SOCKET_URL` to URL A.

### Option 2: Production Hosting (Free Tier)
Due to the ML model size (268MB) and RAM requirements (~1GB+), standard free hosting (Render/Vercel) will crash.

**Recommended Stack:**
1.  **Backend**: **Hugging Face Spaces** (Docker SDK).
    - Features: Free 16GB RAM, ideal for TensorFlow/Keras.
    - Use the provided `Dockerfile` in `backend/`.
2.  **Frontend**: **Vercel** or **Netlify**.
    - Standard Vite React deployment.

---

## Troubleshooting

- **Microphone Error**: Ensure you are using `http://localhost` or a secure `https://` connection (ngrok/production). Browsers block mic on insecure IPs.
- **Model Not Found**: Ensure `deepfake_audio_detector_v2.h5` is in `backend/models/`. If missing, the app runs in "Demo Mode" (random predictions).
- **TensorFlow Errors**: Ensure you have installed the C++ redistributables (Windows) and are using a compatible Python version (3.10 recommended).

---

**Audionyx** — *Protecting conversations in the age of AI.*