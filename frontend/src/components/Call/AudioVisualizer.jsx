import { useEffect, useRef } from 'react'

const AudioVisualizer = ({ stream, color = '#739EBD' }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const analyserRef = useRef(null)

  useEffect(() => {
    if (!stream) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(stream)

    analyser.fftSize = 256
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    source.connect(analyser)
    analyserRef.current = analyser

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)

      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 2.5
      let barHeight
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.8

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
      if (audioContext.state !== 'closed') {
        audioContext.close()
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
