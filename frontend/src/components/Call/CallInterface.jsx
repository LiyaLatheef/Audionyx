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
    socket
  } = useCall()

  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)

  // Start audio processing for deepfake detection
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
            <AudioVisualizer stream={localStream} color="#667eea" />
            <p className="audio-label">{user?.username}</p>
          </div>

          <div className="audio-card">
            <h3>Remote Audio</h3>
            <AudioVisualizer stream={remoteStream} color="#764ba2" />
            <p className="audio-label">{remoteUser?.username || 'User'}</p>
          </div>
        </div>

        {/* Deepfake Detection Results */}
        <DeepfakeIndicator />
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
