# TensorFlow Setup for Real Model

## Issue
The system is currently running in **demo mode** because TensorFlow is not compatible with Python 3.14.

## Solution

To use the actual trained deepfake detection model (`deepfake_audio_detector.h5`), you need Python 3.10 or 3.11.

### Option 1: Install Python 3.11 (Recommended)

1. **Download Python 3.11:**
   - Go to https://www.python.org/downloads/
   - Download Python 3.11.x (latest stable)
   - During installation, check "Add Python to PATH"

2. **Create a virtual environment:**
   ```powershell
   cd C:\Audionyx\backend
   py -3.11 -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

3. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Run the server:**
   ```powershell
   python run.py
   ```

### Option 2: Use Conda (Alternative)

1. **Install Miniconda/Anaconda**
   - Download from https://docs.conda.io/en/latest/miniconda.html

2. **Create environment:**
   ```powershell
   conda create -n audionyx python=3.11
   conda activate audionyx
   ```

3. **Install dependencies:**
   ```powershell
   cd C:\Audionyx\backend
   pip install -r requirements.txt
   ```

4. **Run the server:**
   ```powershell
   python run.py
   ```

## What's Working Now

✅ **Call connectivity** - Fixed! Calls properly connect between users
✅ **Call ending** - Fixed! When one user ends the call, both sides disconnect
✅ **One-way detection** - Only the call receiver sees deepfake detection
✅ **Audio processing** - Audio chunks are being captured and sent
✅ **Demo mode** - Shows random predictions (works without TensorFlow)

## What Requires TensorFlow

❌ **Real deepfake detection** - Currently showing random demo predictions
   - To enable: Install Python 3.11 and TensorFlow as shown above
   - Model file already exists at: `backend/models/deepfake_audio_detector.h5`

## Verification

Once TensorFlow is installed, you should see in the backend logs:
```
ML model loaded successfully
```

Instead of:
```
TensorFlow not available, running in demo mode
```
