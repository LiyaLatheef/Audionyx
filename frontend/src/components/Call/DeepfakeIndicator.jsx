import { useEffect, useState } from 'react'
import { useCall } from '../../context/CallContext'
import { DEEPFAKE_THRESHOLDS } from '../../config'
import './DeepfakeIndicator.css'

const DeepfakeIndicator = () => {
  const { deepfakeResults, socket, callId, remoteStream } = useCall()
  const [latestResult, setLatestResult] = useState(null)

  useEffect(() => {
    if (deepfakeResults.length > 0) {
      setLatestResult(deepfakeResults[deepfakeResults.length - 1])
      console.log('Deepfake results updated:', deepfakeResults.length, 'total results')
    }
  }, [deepfakeResults])

  const getStatusColor = (confidence) => {
    if (!confidence) return 'gray'
    if (confidence < DEEPFAKE_THRESHOLDS.LOW) return '#4caf50' // Green - Safe
    if (confidence < DEEPFAKE_THRESHOLDS.HIGH) return '#ff9800' // Orange - Warning
    return '#f44336' // Red - Danger
  }

  const getStatusText = (result) => {
    if (!result) return 'Analyzing...'
    
    if (result.result.mode === 'demo') {
      return 'Demo Mode (No Model Loaded)'
    }

    const confidence = result.result.confidence
    if (confidence < DEEPFAKE_THRESHOLDS.LOW) {
      return 'Authentic Audio'
    } else if (confidence < DEEPFAKE_THRESHOLDS.HIGH) {
      return 'Suspicious - Possible Deepfake'
    } else {
      return 'Warning - Likely Deepfake!'
    }
  }

  return (
    <div className="deepfake-indicator">
      <h3>Deepfake Detection</h3>
      <p className="detection-info">Analyzing remote audio for authenticity</p>
      
      {latestResult ? (
        <div className="detection-result">
          <div 
            className="confidence-meter"
            style={{
              background: `linear-gradient(90deg, ${getStatusColor(latestResult.result.confidence)} ${latestResult.result.confidence * 100}%, #e0e0e0 ${latestResult.result.confidence * 100}%)`
            }}
          >
            <span className="confidence-value">
              {(latestResult.result.confidence * 100).toFixed(1)}%
            </span>
          </div>

          <div 
            className="status-badge"
            style={{ backgroundColor: getStatusColor(latestResult.result.confidence) }}
          >
            {getStatusText(latestResult)}
          </div>

          {latestResult.result.mode === 'demo' && (
            <p className="demo-notice">
              Place your .h5 model file in backend/models/ folder to enable real detection
            </p>
          )}

          <div className="detection-history">
            <h4>Recent Detections</h4>
            <div className="history-bars">
              {deepfakeResults.slice(-10).map((result, index) => (
                <div 
                  key={index}
                  className="history-bar"
                  style={{
                    height: '30px',
                    backgroundColor: getStatusColor(result.result.confidence),
                    width: `${result.result.confidence * 100}%`,
                    minWidth: '20px'
                  }}
                  title={`${(result.result.confidence * 100).toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="no-results">
          <p>Waiting for audio data...</p>
          <div className="status-info">
            <small>Socket: {socket?.connected ? '✓ Connected' : '✗ Disconnected'}</small><br/>
            <small>Call ID: {callId || 'Not set'}</small><br/>
            <small>Remote Stream: {remoteStream ? '✓ Active' : '✗ Inactive'}</small>
          </div>
          <div className="loader"></div>
        </div>
      )}
    </div>
  )
}

export default DeepfakeIndicator
