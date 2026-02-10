import { useState, useEffect, useRef } from 'react'
import { ICE_SERVERS } from '../config'

export const useWebRTC = (socket, currentUserId, onRemoteStream, userInfo = null) => {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [isCallActive, setIsCallActive] = useState(false)
  const [callId, setCallId] = useState(null)
  const [callStartTime, setCallStartTime] = useState(null)
  const [isCalling, setIsCalling] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)
  const [isCaller, setIsCaller] = useState(false)

  const peerConnection = useRef(null)
  const iceCandidatesQueue = useRef([])
  const localStreamRef = useRef(null) // Ref to avoid stale closures
  const fraudsterAudioRef = useRef(null)
  const fraudsterMediaStreamRef = useRef(null)

  // Helper to set stream in both state and ref
  const updateLocalStream = (stream) => {
    localStreamRef.current = stream
    setLocalStream(stream)
  }

  // Create fraudster audio stream from pre-recorded file
  // Uses HTMLAudioElement + createMediaElementSource for cross-device compatibility
  // Audio is routed ONLY to the WebRTC stream, NOT to speakers
  const createFraudsterAudioStream = async () => {
    console.log('🎭 Creating fraudster audio stream...')

    const audioContext = new (window.AudioContext || window.webkitAudioContext)()

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Create audio element
      const audio = new Audio('/fraudster_audio.wav')
      audio.crossOrigin = 'anonymous'
      audio.loop = true
      audio.volume = 1.0 // Must be 1 so audio flows through Web Audio graph

      // Create a MediaStream destination for WebRTC
      const destination = audioContext.createMediaStreamDestination()

      // Wait for audio to be loadable
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true })
        audio.addEventListener('error', reject, { once: true })
        audio.load()
      })

      // createMediaElementSource captures the element's output into the Web Audio graph
      // After this call, the audio element no longer outputs to speakers directly
      const source = audioContext.createMediaElementSource(audio)

      // Route audio ONLY to the stream destination (for WebRTC)
      source.connect(destination)

      // *** DO NOT connect to audioContext.destination ***
      // That line was causing local speaker playback!

      // Start playback (drives audio through the Web Audio graph)
      await audio.play()

      // Store references for cleanup
      fraudsterAudioRef.current = {
        audio: audio,
        context: audioContext,
        close: () => {
          try { audio.pause(); audio.src = '' } catch { }
          try { audioContext.close() } catch { }
        }
      }
      fraudsterMediaStreamRef.current = destination.stream

      console.log('✅ Fraudster audio stream created successfully')
      console.log('Stream tracks:', destination.stream.getTracks().map(t => t.kind + ':' + t.label))
      return destination.stream

    } catch (error) {
      console.error('❌ Error creating fraudster audio stream:', error)
      try { audioContext.close() } catch { }
      throw error
    }
  }

  // Initialize local media stream
  const initializeLocalStream = async (userInfo = null) => {
    try {
      console.log('🔍 Checking fraudster status. Email:', userInfo?.email)

      const isFraudster = userInfo && userInfo.email === 'fraudster@test.com'

      if (isFraudster) {
        console.log('🎭 FRAUDSTER MODE ACTIVATED: Using pre-recorded audio')
        try {
          const fakeStream = await createFraudsterAudioStream()
          updateLocalStream(fakeStream)
          return fakeStream
        } catch (fakeError) {
          console.warn('⚠️ Fraudster audio failed, falling back to microphone:', fakeError)
        }
      }

      // Normal user: get real microphone
      console.log('🎤 Using real microphone')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      updateLocalStream(stream)
      return stream
    } catch (error) {
      console.error('Error accessing microphone:', error)
      throw error
    }
  }

  // Create peer connection
  const createPeerConnection = (callId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('ice_candidate', {
          call_id: callId,
          candidate: event.candidate,
          sender_id: currentUserId
        })
      }
    }

    pc.ontrack = (event) => {
      console.log('Received remote track')
      setRemoteStream(event.streams[0])
      if (onRemoteStream) {
        onRemoteStream(event.streams[0])
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        endCall()
      }
    }

    return pc
  }

  // Start call
  const startCall = async (targetUserId) => {
    try {
      setIsCalling(true)
      setIsCaller(true)

      let stream = localStreamRef.current
      if (!stream) {
        stream = await initializeLocalStream(userInfo)
      }

      socket?.emit('call_user', {
        caller_id: currentUserId,
        callee_id: targetUserId
      })

    } catch (error) {
      console.error('Error starting call:', error)
      setIsCalling(false)
      throw error
    }
  }

  // Accept call
  const acceptCall = async (call) => {
    try {
      setIncomingCall(null)
      setCallId(call.call_id)
      setIsCallActive(true)
      setIsCaller(false)
      setCallStartTime(Date.now())

      let stream = localStreamRef.current
      if (!stream) {
        stream = await initializeLocalStream(userInfo)
      }

      const pc = createPeerConnection(call.call_id)
      peerConnection.current = pc

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      socket?.emit('call_accepted', {
        call_id: call.call_id
      })

    } catch (error) {
      console.error('Error accepting call:', error)
      endCall()
    }
  }

  // Reject call
  const rejectCall = (call) => {
    socket?.emit('call_rejected', {
      call_id: call.call_id
    })
    setIncomingCall(null)
  }

  // End call
  const endCall = () => {
    if (callId) {
      socket?.emit('end_call', {
        call_id: callId
      })
    }

    if (peerConnection.current) {
      peerConnection.current.close()
      peerConnection.current = null
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop())
      setRemoteStream(null)
    }

    // Stop fraudster audio if playing
    if (fraudsterAudioRef.current) {
      if (typeof fraudsterAudioRef.current.close === 'function') {
        fraudsterAudioRef.current.close()
      }
      fraudsterAudioRef.current = null
    }
    if (fraudsterMediaStreamRef.current) {
      fraudsterMediaStreamRef.current.getTracks().forEach(track => track.stop())
      fraudsterMediaStreamRef.current = null
    }

    setIsCallActive(false)
    setIsCaller(false)
    setCallId(null)
    setCallStartTime(null)
    setIsCalling(false)
    localStreamRef.current = null
    iceCandidatesQueue.current = []
  }

  // Setup socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('incoming_call', (data) => {
      console.log('Incoming call from:', data.caller_id, data)
      setIncomingCall(data)
    })

    socket.on('call_failed', (data) => {
      console.error('Call failed:', data.message)
      alert(data.message || 'Call failed. User may be offline.')
      setIsCalling(false)
    })

    socket.on('call_accepted', async (data) => {
      console.log('Call accepted:', data.call_id)
      setCallId(data.call_id)
      setIsCallActive(true)
      setIsCalling(false)
      setCallStartTime(prev => prev ?? Date.now())

      const pc = createPeerConnection(data.call_id)
      peerConnection.current = pc

      // Use ref to avoid stale closure
      const stream = localStreamRef.current
      if (stream) {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream)
        })
      } else {
        console.warn('⚠️ No local stream available when call accepted!')
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socket.emit('offer', {
        call_id: data.call_id,
        offer: offer
      })
    })

    socket.on('call_started', (data) => {
      if (!data?.call_id || !data?.started_at) return
      setCallId(prev => prev || data.call_id)
      setCallStartTime(data.started_at)
    })

    socket.on('call_rejected', () => {
      console.log('Call rejected')
      setIsCalling(false)
      endCall()
    })

    socket.on('call_ended', () => {
      console.log('Call ended')
      endCall()
    })

    socket.on('offer', async (data) => {
      console.log('Received offer')
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(data.offer)

        while (iceCandidatesQueue.current.length > 0) {
          const candidate = iceCandidatesQueue.current.shift()
          await peerConnection.current.addIceCandidate(candidate)
        }

        const answer = await peerConnection.current.createAnswer()
        await peerConnection.current.setLocalDescription(answer)

        socket.emit('answer', {
          call_id: data.call_id,
          answer: answer
        })
      }
    })

    socket.on('answer', async (data) => {
      console.log('Received answer')
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(data.answer)

        while (iceCandidatesQueue.current.length > 0) {
          const candidate = iceCandidatesQueue.current.shift()
          await peerConnection.current.addIceCandidate(candidate)
        }
      }
    })

    socket.on('ice_candidate', async (data) => {
      if (peerConnection.current && data.candidate) {
        try {
          if (peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(data.candidate)
          } else {
            iceCandidatesQueue.current.push(data.candidate)
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error)
        }
      }
    })

    return () => {
      socket.off('incoming_call')
      socket.off('call_failed')
      socket.off('call_accepted')
      socket.off('call_started')
      socket.off('call_rejected')
      socket.off('call_ended')
      socket.off('offer')
      socket.off('answer')
      socket.off('ice_candidate')
    }
  }, [socket, currentUserId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (peerConnection.current) {
        peerConnection.current.close()
      }
    }
  }, [])

  return {
    localStream,
    remoteStream,
    isCallActive,
    callId,
    callStartTime,
    isCalling,
    incomingCall,
    isCaller,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    initializeLocalStream
  }
}
