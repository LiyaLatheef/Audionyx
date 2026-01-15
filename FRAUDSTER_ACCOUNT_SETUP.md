# Fraudster Test Account Setup

## Overview
A special test account has been created that automatically plays pre-recorded fake audio instead of using the real microphone. This allows you to test deepfake detection without needing to generate fake audio in real-time.

## Account Credentials
- **Username:** `fraudster`
- **Email:** `fraudster@test.com`
- **Password:** `password`

## How It Works

### 1. Audio File Placement
The fake audio file should be placed at:
```
frontend/public/fraudster_audio.mp3
```

**IMPORTANT:** Replace the placeholder file with your actual deepfake audio recording. The audio should be:
- Format: MP3, WAV, or OGG (MP3 recommended for browser compatibility)
- Duration: Any length (it will loop automatically)
- Sample rate: 16kHz or higher recommended
- Content: Your deepfake/synthesized voice sample

### 2. Using the Fraudster Account

#### Step 1: Login
1. Open the application: http://localhost:3002/
2. Login with the fraudster credentials:
   - Email: `fraudster@test.com`
   - Password: `password`

#### Step 2: Make a Call
1. You'll see other online users in the dashboard
2. Click "Call" on any user (e.g., bob or anna)
3. When the call connects, **instead of your real microphone**, the pre-recorded audio will play on loop to the other person

#### Step 3: Observe Detection
- The **receiver** (bob/anna) will see the deepfake detection running on their end
- The detection analyzes the fake audio being sent by the fraudster
- After ~10 seconds (in batch mode), you should see:
  - Detection confidence score
  - Color indicator (Red = Deepfake detected, Green = Authentic)
  - Stable state (THREAT or SAFE)

### 3. Testing Scenario

**Recommended Test Flow:**
1. Open two browser windows/tabs
2. Window 1: Login as `fraudster@test.com`
3. Window 2: Login as `bob@test.com` or `anna@test.com`
4. From fraudster's window: Call bob/anna
5. Bob/anna accepts the call
6. Bob/anna will hear the fake audio playing (your MP3 file)
7. Watch bob/anna's detection panel - it should analyze the audio and mark it as deepfake (red)

## Technical Details

### Frontend Changes
- **File:** `frontend/src/hooks/useWebRTC.js`
- **Detection:** Checks if logged-in user has username `fraudster` or email `fraudster@test.com`
- **Behavior:** Creates an `Audio` element from the MP3 file, loops it, captures it via Web Audio API, and sends it as the local media stream instead of the microphone

### Backend Changes
- **File:** `backend/create_users.py`
- **User Entry:** Added fraudster user to database with standard User model (no special backend logic needed)

### Audio Routing
```
Normal User:  Microphone → WebRTC → Remote User → Detection
Fraudster:    MP3 File → Audio Element → MediaStream → WebRTC → Remote User → Detection
```

## Troubleshooting

### Audio File Not Playing
1. Check browser console for errors (F12)
2. Ensure the file is at `frontend/public/fraudster_audio.mp3`
3. Check the file format is supported (MP3 is safest)
4. Look for console log: `🎭 FRAUDSTER MODE: Using fake audio instead of microphone`

### Detection Not Working
1. Ensure you're testing from the **receiver's perspective** (the person who gets the call)
2. The fraudster won't see detection on their own audio
3. Detection runs on the remote audio stream (what you receive, not what you send)
4. Check browser console for `deepfake_result` events

### CORS / File Access Issues
- If the audio file won't load, check browser console
- Ensure Vite dev server is running (it serves the public folder)
- Try using a different audio format (WAV instead of MP3)

## Switching Audio Files

To test with different deepfake samples:
1. Replace `frontend/public/fraudster_audio.mp3` with your new file
2. Keep the same filename OR update the path in `useWebRTC.js` line ~36:
   ```javascript
   const audio = new Audio('/fraudster_audio.mp3')  // Change filename here
   ```
3. No need to restart the servers - just refresh the fraudster's browser tab

## Detection Mode Configuration

Current mode: **10-second batch analysis**
- Configured in: `frontend/src/config.js`
- Setting: `DETECTION_MODE: 'batch10s'`
- Behavior: Buffers 10 seconds, then analyzes with sliding windows

To switch back to streaming mode (2s chunks):
```javascript
// In frontend/src/config.js
DETECTION_MODE: 'stream'
```

## Notes
- The fraudster account is purely a frontend trick - no special backend handling
- Works with both stream and batch detection modes
- The fake audio loops seamlessly during the call
- Call audio quality depends on the source MP3 quality
- Detection accuracy depends on how "fake" your audio sample sounds compared to training data
