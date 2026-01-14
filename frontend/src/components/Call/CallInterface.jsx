import { useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCall } from '../../context/CallContext'
import { useAudioProcessing } from '../../hooks/useAudioProcessing'
import DeepfakeIndicator from './DeepfakeIndicator'
import AudioVisualizer from './AudioVisualizer'
import './CallInterface.css'

const CallInterface = ({ remoteUser }) => {
  const { user } = useAuth()
  const { 
    localStream, 
    remoteStream, 
    endCall, 
    callId,
    socket,
    isCaller // Get caller status
  } = useCall()

  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)

  // Start audio processing for deepfake detection
  // Pass the remote user's ID as sender_id so backend knows who sent the audio
  useAudioProcessing(socket, remoteStream, callId, remoteUser?.id)

  // Set up audio elements
  useEffect(() => {
    if (localStream && localAudioRef.current) {
      localAudioRef.current.srcObject = localStream
      localAudioRef.current.muted = true // Mute local audio to prevent echo
    }
  }, [localStream])

  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  const handleEndCall = () => {
    endCall()
  }

  return (
    <div className="call-interface">
      <div className="call-header">
        <h2>Call with {remoteUser?.username || 'User'}</h2>
        <span className="call-status">Connected</span>
      </div>

      <div className="call-body">
        {/* Audio elements */}
        <audio ref={localAudioRef} autoPlay playsInline />
        <audio ref={remoteAudioRef} autoPlay playsInline />

        {/* Audio Visualizers */}
        <div className="audio-section">
          <div className="audio-card">
            <h3>Your Audio</h3>
            <AudioVisualizer stream={localStream} color="#739EBD" />
            <p className="audio-label">{user?.username}</p>
          </div>

          <div className="audio-card">
            <h3>Remote Audio</h3>
            <AudioVisualizer stream={remoteStream} color="#4E6B8A" />
            <p className="audio-label">{remoteUser?.username || 'User'}</p>
          </div>
        </div>

        {/* Deepfake Detection Results - Only show to callee (person who received the call) */}
        {!isCaller && <DeepfakeIndicator />}
        
        {/* Show message to caller */}
        {isCaller && (
          <div className="caller-message" style={{
            padding: '20px',
            textAlign: 'center',
            backgroundColor: '#f0f0f0',
            borderRadius: '8px',
            margin: '20px 0'
          }}>
            <p>You initiated this call. The other person can verify your audio authenticity.</p>
          </div>
        )}
      </div>

      <div className="call-controls">
        <button onClick={handleEndCall} className="btn-end-call">
          End Call
        </button>
      </div>
    </div>
  )
}

export default CallInterface
