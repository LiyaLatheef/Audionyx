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
    if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return 'gray'
    if (confidence < DEEPFAKE_THRESHOLDS.LOW) return '#4caf50' // Green - Safe
    if (confidence < DEEPFAKE_THRESHOLDS.HIGH) return '#ff9800' // Orange - Warning
    return '#f44336' // Red - Danger
  }

  const getDisplayConfidence = (result) => {
    const raw = result?.result?.confidence
    const smoothed = result?.result?.confidence_smoothed
    if (smoothed === null || smoothed === undefined || Number.isNaN(smoothed)) return raw
    return smoothed
  }

  const getStatusText = (result) => {
    if (!result) return 'Analyzing...'

    if (result.result?.status && result.result.status !== 'success') {
      const msg = result.result.message || result.result.details || result.result.status
      return `Detection error: ${msg}`
    }
    
    if (result.result.mode === 'demo') {
      return 'Demo Mode (No Model Loaded)'
    }

    const segmentsTotal = result.result?.segments_total
    const segmentsScored = result.result?.segments_scored
    const finalized = !!result.result?.finalized
    if (segmentsTotal && segmentsScored) {
      if (!finalized && segmentsScored < segmentsTotal) {
        return `Analyzing (${segmentsScored}/${segmentsTotal})`
      }
      if (finalized) {
        return `Finalized (${segmentsTotal}/${segmentsTotal})`
      }
    }

    const confidence = getDisplayConfidence(result)
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
          {(latestResult.result?.segments_total || latestResult.result?.segments_scored) && (
            <p className="detection-info" style={{ marginTop: 0 }}>
              Segments: {latestResult.result?.segments_scored || 0}/{latestResult.result?.segments_total || 0}
              {latestResult.result?.finalized ? ' • Finalized' : ''}
            </p>
          )}
          <div 
            className="confidence-meter"
            style={{
              background: `linear-gradient(90deg, ${getStatusColor(getDisplayConfidence(latestResult))} ${(getDisplayConfidence(latestResult) || 0) * 100}%, #e0e0e0 ${(getDisplayConfidence(latestResult) || 0) * 100}%)`
            }}
          >
            <span className="confidence-value">
              {(((getDisplayConfidence(latestResult) || 0) * 100)).toFixed(1)}%
            </span>
          </div>

          <div 
            className="status-badge"
            style={{ backgroundColor: getStatusColor(getDisplayConfidence(latestResult)) }}
          >
            {getStatusText(latestResult)}
          </div>

          {latestResult.result?.status && latestResult.result.status !== 'success' && (
            <p className="demo-notice">
              Backend reported an error while processing audio. Open the browser console to see the full payload.
            </p>
          )}

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
                    backgroundColor: getStatusColor(result.result?.confidence),
                    width: `${(result.result?.confidence || 0) * 100}%`,
                    minWidth: '20px'
                  }}
                  title={`${(((result.result?.confidence || 0) * 100)).toFixed(1)}%`}
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
