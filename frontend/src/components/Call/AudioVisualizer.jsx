import { useEffect, useRef } from 'react'

const AudioVisualizer = ({ stream, color = '#739EBD' }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const audioContextRef = useRef(null)

  useEffect(() => {
    if (!stream) return

    const canvas = canvasRef.current
    if (!canvas) return

    // Initialize AudioContext if not already done
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const audioContext = audioContextRef.current

    // Ensure context is running
    const resumeContext = async () => {
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume()
          console.log('AudioContext resumed')
        } catch (e) {
          console.error('Failed to resume AudioContext:', e)
        }
      }
    }
    resumeContext()

    const ctx = canvas.getContext('2d')

    // Create analyser
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyserRef.current = analyser

    // Create and connect source
    try {
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source
    } catch (err) {
      console.error("Error connecting stream to analyser:", err)
    }

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)

      analyser.getByteFrequencyData(dataArray)

      // Clear canvas with transparent clear
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 2.5
      let barHeight
      let x = 0

      // If all zeros, draw a flat line or something to indicate "connected but silent"
      // But for now, just bars.
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height

        ctx.fillStyle = color
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)

        x += barWidth + 1
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      // Don't close AudioContext immediately as it might be reused or cause lag on frequent remounts
      // But for correctness in this specific component lifecycle, we should disconnect.
      if (sourceRef.current) {
        sourceRef.current.disconnect()
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect()
      }
      // If we own the context, we should close it
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().then(() => {
          audioContextRef.current = null
        })
      }
    }
  }, [stream, color])

  return (
    <canvas
      ref={canvasRef}
      width="400"
      height="100"
      style={{
        width: '100%',
        height: '100px',
        borderRadius: '10px',
        background: 'rgba(0, 0, 0, 0.1)'
      }}
    />
  )
}

export default AudioVisualizer
