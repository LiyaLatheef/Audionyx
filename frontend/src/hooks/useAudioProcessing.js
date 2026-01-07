import { useEffect, useRef, useCallback } from 'react'
import { AUDIO_CONFIG } from '../config'

export const useAudioProcessing = (socket, remoteStream, callId, senderId) => {
  const mediaRecorderRef = useRef(null)
  const isProcessingRef = useRef(false)

  const startProcessing = useCallback(() => {
    if (!socket || !remoteStream || !callId || isProcessingRef.current) {
      return
    }

    try {
      // Create MediaRecorder with remote stream
      const mediaRecorder = new MediaRecorder(remoteStream, {
        mimeType: AUDIO_CONFIG.MIME_TYPE,
        audioBitsPerSecond: 128000
      })

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socket) {
          // Convert blob to base64
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64data = reader.result
            
            // Send audio chunk to backend
            socket.emit('audio_chunk', {
              call_id: callId,
              audio: base64data,
              sender_id: senderId
            })
          }
          reader.readAsDataURL(event.data)
        }
      }

      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error)
      }

      // Start recording in chunks
      mediaRecorder.start(AUDIO_CONFIG.CHUNK_DURATION)
      mediaRecorderRef.current = mediaRecorder
      isProcessingRef.current = true

      console.log('Audio processing started')

    } catch (error) {
      console.error('Error starting audio processing:', error)
    }
  }, [socket, remoteStream, callId, senderId])

  const stopProcessing = useCallback(() => {
    if (mediaRecorderRef.current && isProcessingRef.current) {
      try {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
        isProcessingRef.current = false
        console.log('Audio processing stopped')
      } catch (error) {
        console.error('Error stopping audio processing:', error)
      }
    }
  }, [])

  // Start processing when remote stream is available
  useEffect(() => {
    if (remoteStream && callId && socket) {
      startProcessing()
    }

    return () => {
      stopProcessing()
    }
  }, [remoteStream, callId, socket, startProcessing, stopProcessing])

  return {
    startProcessing,
    stopProcessing,
    isProcessing: isProcessingRef.current
  }
}
