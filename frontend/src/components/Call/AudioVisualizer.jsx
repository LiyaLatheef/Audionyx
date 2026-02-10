import { useEffect, useRef } from 'react'

const AudioVisualizer = ({ stream, color = '#64b5f6' }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const audioContextRef = useRef(null)

  useEffect(() => {
    if (!stream) return

    const canvas = canvasRef.current
    if (!canvas) return

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const audioContext = audioContextRef.current

    const resumeContext = async () => {
      if (audioContext.state === 'suspended') {
        try { await audioContext.resume() } catch { }
      }
    }
    resumeContext()

    const ctx = canvas.getContext('2d')

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.8
    analyserRef.current = analyser

    try {
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source
    } catch (err) {
      console.error("Error connecting stream to analyser:", err)
    }

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    // Parse the base color into HSL for gradient shifts
    const parseColor = (hex) => {
      // Simple hex/named color to RGB
      const temp = document.createElement('div')
      temp.style.color = hex
      document.body.appendChild(temp)
      const rgb = window.getComputedStyle(temp).color
      document.body.removeChild(temp)
      const match = rgb.match(/\d+/g)
      return match ? match.map(Number) : [100, 181, 246]
    }
    const [r, g, b] = parseColor(color)

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
        ctx.scale(dpr, dpr)
      }

      ctx.clearRect(0, 0, width, height)

      // ---- Modern waveform bars ----
      const usableBins = Math.min(bufferLength, 64) // Use fewer bars for a clean look
      const totalGap = (usableBins - 1) * 3
      const barWidth = Math.max(2, (width - totalGap) / usableBins)
      const centerY = height / 2

      for (let i = 0; i < usableBins; i++) {
        const value = dataArray[i] / 255
        const barHeight = Math.max(2, value * (height * 0.8))

        const x = i * (barWidth + 3)
        const y = centerY - barHeight / 2

        // Gradient fill per bar
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight)
        const alpha = 0.4 + value * 0.6
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`)
        gradient.addColorStop(0.5, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${alpha + 0.1})`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha * 0.6})`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)
        ctx.fill()
      }

      // ---- Ambient glow line at center ----
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      for (let i = 0; i < usableBins; i++) {
        const value = dataArray[i] / 255
        const x = i * (barWidth + 3) + barWidth / 2
        const y = centerY - (value * height * 0.3)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`
      ctx.lineWidth = 2
      ctx.stroke()
    }

    draw()

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (sourceRef.current) sourceRef.current.disconnect()
      if (analyserRef.current) analyserRef.current.disconnect()
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().then(() => { audioContextRef.current = null })
      }
    }
  }, [stream, color])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '160px',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    />
  )
}

export default AudioVisualizer
