import { useEffect, useState } from 'react'
import { useCall } from '../../context/CallContext'
import { DEEPFAKE_THRESHOLDS } from '../../config'
import './DeepfakeIndicator.css'

const DeepfakeIndicator = () => {
  const { deepfakeResults, socket } = useCall()
  const [latestResult, setLatestResult] = useState(null)

  useEffect(() => {
    if (deepfakeResults.length > 0) {
      setLatestResult(deepfakeResults[deepfakeResults.length - 1])
    }
  }, [deepfakeResults])

  const getDisplayConfidence = (result) => {
    const raw = result?.result?.confidence
    const smoothed = result?.result?.confidence_smoothed
    if (smoothed === null || smoothed === undefined || Number.isNaN(smoothed)) return raw
    return smoothed
  }

  const confidence = getDisplayConfidence(latestResult) || 0
  const percentage = (confidence * 100).toFixed(0)

  // Color based on fraud probability
  // Low fraud = Green, Medium = Orange, High = Red
  const getColor = () => {
    if (confidence < 0.4) return '#4cd964' // Safe
    if (confidence < 0.7) return '#ffcc00' // Warning
    return '#ff3b30' // Danger
  }

  const getStatusText = () => {
    if (!latestResult) return 'Analyzing...'
    if (confidence < 0.4) return 'Authentic'
    if (confidence < 0.7) return 'Suspicious'
    return 'Deepfake Detected'
  }

  if (!latestResult) {
    return (
      <div className="deepfake-indicator waiting">
        <div className="mini-loader"></div>
        <span>Analyzing Audio...</span>
      </div>
    )
  }

  return (
    <div className="deepfake-indicator">
      <div className="fraud-score" style={{ color: getColor() }}>
        {percentage}%
      </div>
      <div className="fraud-label" style={{ color: getColor() }}>
        {getStatusText()}
      </div>
      <div className="fraud-sublabel">Fraud Probability</div>
    </div>
  )
}

export default DeepfakeIndicator
