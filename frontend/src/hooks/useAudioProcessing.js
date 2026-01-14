import { useEffect, useRef, useCallback } from 'react'
import { AUDIO_CONFIG } from '../config'

export const useAudioProcessing = (socket, remoteStream, callId, senderId) => {
  const mediaRecorderRef = useRef(null)
  const audioCtxRef = useRef(null)
  const sourceRef = useRef(null)
  const processorRef = useRef(null)
  const gainRef = useRef(null)
  const resumeHandlersRef = useRef(null)
  const retryTimerRef = useRef(null)
  const sampleBufferRef = useRef([])
  const bufferedFramesRef = useRef(0)
  const isProcessingRef = useRef(false)

  const encodeWav16 = (pcmFloat32, sampleRate) => {
    // 16-bit PCM WAV
    const numChannels = 1
    const bitsPerSample = 16
    const bytesPerSample = bitsPerSample / 8
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = pcmFloat32.length * bytesPerSample
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // PCM
    view.setUint16(20, 1, true) // audio format
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    let offset = 44
    for (let i = 0; i < pcmFloat32.length; i++) {
      let s = pcmFloat32[i]
      s = Math.max(-1, Math.min(1, s))
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }

    return buffer
  }

  const downsampleTo16k = (input, inSampleRate) => {
    const outSampleRate = 16000
    if (inSampleRate === outSampleRate) return input
    const ratio = inSampleRate / outSampleRate
    const outLength = Math.floor(input.length / ratio)
    const output = new Float32Array(outLength)
    let pos = 0
    for (let i = 0; i < outLength; i++) {
      const idx = i * ratio
      const idx0 = Math.floor(idx)
      const idx1 = Math.min(idx0 + 1, input.length - 1)
      const t = idx - idx0
      output[i] = input[idx0] * (1 - t) + input[idx1] * t
      pos++
    }
    return output
  }

  const arrayBufferToBase64 = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }

  const looksLikeWav = (arrayBuffer) => {
    try {
      const bytes = new Uint8Array(arrayBuffer)
      if (bytes.length < 12) return false
      // 'RIFF' .... 'WAVE'
      return (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
      )
    } catch {
      return false
    }
  }

  const startProcessing = useCallback(() => {
    if (!socket || !remoteStream || !callId || isProcessingRef.current) {
      console.log('Cannot start audio processing:', {
        hasSocket: !!socket,
        hasRemoteStream: !!remoteStream,
        hasCallId: !!callId,
        isProcessing: isProcessingRef.current
      })
      return
    }

    try {
      console.log('Starting audio processing for call:', callId)

      // If the remote stream doesn't have an audio track yet, wait and retry.
      // This avoids falling back to MediaRecorder (WebM/Opus) which requires FFmpeg server-side.
      const audioTracks = typeof remoteStream.getAudioTracks === 'function' ? remoteStream.getAudioTracks() : []
      if (!audioTracks || audioTracks.length === 0) {
        console.log('Remote stream has no audio tracks yet; waiting to start detection...')
        if (!retryTimerRef.current) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null
            startProcessing()
          }, 500)
        }
        return
      }

      // WebAudio -> WAV (no FFmpeg needed server-side)
      const AudioContextImpl = window.AudioContext || window.webkitAudioContext
      if (!AudioContextImpl) {
        console.error('WebAudio is not supported in this browser; cannot send WAV chunks for detection.')
        return
      }

      console.log('Audio pipeline: WebAudio->WAV (preferred)')
      const audioCtx = new AudioContextImpl()
      audioCtxRef.current = audioCtx

      // Attempt to resume immediately; also wire a user-gesture resume for browsers that block autoplay.
      const tryResume = () => audioCtx.resume().catch(() => {})
      tryResume()
      if (!resumeHandlersRef.current) {
        const handler = () => tryResume()
        resumeHandlersRef.current = handler
        window.addEventListener('click', handler, { passive: true })
        window.addEventListener('keydown', handler)
        window.addEventListener('touchstart', handler, { passive: true })
      }

      console.log('AudioContext state:', audioCtx.state)

      let source
      try {
        source = audioCtx.createMediaStreamSource(remoteStream)
      } catch (e) {
        console.error('Failed to create MediaStreamSource from remote stream; cannot start detection.', e)
        try {
          audioCtx.close()
        } catch (closeError) {}
        audioCtxRef.current = null
        sourceRef.current = null
        return
      }

      sourceRef.current = source

      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const gain = audioCtx.createGain()
      gain.gain.value = 0
      gainRef.current = gain

      const chunkFramesTarget = Math.floor(audioCtx.sampleRate * (AUDIO_CONFIG.CHUNK_DURATION / 1000))
      sampleBufferRef.current = []
      bufferedFramesRef.current = 0

      processor.onaudioprocess = (e) => {
        if (!socket || !callId) return
        const input = e.inputBuffer.getChannelData(0)
        // Copy the data; input buffer is reused by browser
        sampleBufferRef.current.push(new Float32Array(input))
        bufferedFramesRef.current += input.length

        if (bufferedFramesRef.current >= chunkFramesTarget) {
          // Concatenate
          const total = bufferedFramesRef.current
          const merged = new Float32Array(total)
          let offset = 0
          for (const part of sampleBufferRef.current) {
            merged.set(part, offset)
            offset += part.length
          }

          // Split exactly one chunk; keep remainder
          const chunk = merged.slice(0, chunkFramesTarget)
          const remainder = merged.slice(chunkFramesTarget)

          sampleBufferRef.current = remainder.length ? [remainder] : []
          bufferedFramesRef.current = remainder.length

          const down = downsampleTo16k(chunk, audioCtx.sampleRate)
          const wav = encodeWav16(down, 16000)
          if (!looksLikeWav(wav)) {
            try {
              const head = Array.from(new Uint8Array(wav).slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('')
              console.warn('Encoded audio does not look like WAV. head=', head)
            } catch {}
          }
          const b64 = arrayBufferToBase64(wav)

          socket.emit('audio_chunk', {
            call_id: callId,
            audio: `data:audio/wav;base64,${b64}`,
            sender_id: senderId
          })
        }
      }

      source.connect(processor)
      processor.connect(gain)
      gain.connect(audioCtx.destination)

      isProcessingRef.current = true
      console.log('Audio processing started (WebAudio->WAV)')

    } catch (error) {
      console.error('Error starting audio processing:', error)
    }
  }, [socket, remoteStream, callId, senderId])

  const stopProcessing = useCallback(() => {
    try {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }

      if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current.onaudioprocess = null
        processorRef.current = null
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
      }
      if (gainRef.current) {
        gainRef.current.disconnect()
        gainRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }

      if (resumeHandlersRef.current) {
        const handler = resumeHandlersRef.current
        window.removeEventListener('click', handler)
        window.removeEventListener('keydown', handler)
        window.removeEventListener('touchstart', handler)
        resumeHandlersRef.current = null
      }
      sampleBufferRef.current = []
      bufferedFramesRef.current = 0
    } catch (error) {
      console.error('Error stopping WebAudio processing:', error)
    }

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

    isProcessingRef.current = false
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
