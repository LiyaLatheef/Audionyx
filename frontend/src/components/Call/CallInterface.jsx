import { useEffect, useMemo, useRef, useState } from 'react'
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
    isCaller, // Get caller status
    callStartTime
  } = useCall()

  const remoteAudioRef = useRef(null)

  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    if (!callStartTime) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [callStartTime])

  const callTimerText = useMemo(() => {
    if (!callStartTime) return 'Connecting...'

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - callStartTime) / 1000))
    const hours = Math.floor(elapsedSeconds / 3600)
    const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    const seconds = elapsedSeconds % 60

    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')

    if (hours > 0) {
      const hh = String(hours).padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }

    return `${mm}:${ss}`
  }, [callStartTime, nowMs])

  // Start audio processing for deepfake detection
  useAudioProcessing(
    socket,
    isCaller ? null : remoteStream,
    isCaller ? null : callId,
    isCaller ? null : remoteUser?.id
  )

  // Set up audio elements
  // We do NOT need to play the local stream. Playing it causes echo/feedback.
  // We only need to play the remote stream.

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
      {/* Audio elements (hidden) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="call-content">
        <div className="call-info">
          <div className="avatar-placeholder">
            {remoteUser?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <h2>{remoteUser?.username || 'Unknown User'}</h2>
          <span className="call-timer">{callTimerText}</span>
        </div>

        {/* Main Visualizer - Shows incoming audio */}
        <div className="visualizer-container">
          {/* Always mount visualizer but it only animates if stream is active */}
          <AudioVisualizer stream={remoteStream} color="#64b5f6" />
        </div>

        {/* Deepfake Detection Results - Only show to callee */}
        {!isCaller && (
          <div className="detection-status">
            <DeepfakeIndicator />
          </div>
        )}

        <div className="call-actions">
          <button onClick={handleEndCall} className="btn-end-call" aria-label="End Call">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.7-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default CallInterface
