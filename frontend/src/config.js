/**
 * API Configuration
 */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

// WebRTC Configuration
export const ICE_SERVERS = [
  {
    urls: 'stun:stun.l.google.com:19302'
  },
  {
    urls: 'stun:stun1.l.google.com:19302'
  }
]

// Audio Configuration
export const AUDIO_CONFIG = {
  CHUNK_DURATION: 2000, // milliseconds
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  MIME_TYPE: 'audio/webm;codecs=opus'
}

// Deepfake Thresholds
export const DEEPFAKE_THRESHOLDS = {
  LOW: 0.60,
  MEDIUM: 0.75,
  HIGH: 0.85
}
