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
  const [isCaller, setIsCaller] = useState(false) // Track if current user is the caller

  const peerConnection = useRef(null)
  const iceCandidatesQueue = useRef([])
  const fraudsterAudioRef = useRef(null)
  const fraudsterMediaStreamRef = useRef(null)

  // Check if current user is the fraudster test account
  const isFraudsterUser = (userId) => {
    // Fraudster user IDs: check by username being 'fraudster' or email containing 'fraudster'
    // We'll need to pass user info, but for now check against known patterns
    return false // Will be set properly when we have user context
  }

  // Create fake audio stream from pre-recorded file
  const createFraudsterAudioStream = async () => {
    console.log('🎭 Creating fraudster audio stream from pre-recorded file...')
    
    // Create AudioContext first
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    
    try {
      // Resume AudioContext (required by some browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      const audio = new Audio('/fraudster_audio.wav')
      audio.loop = true
      audio.volume = 1.0
      
      // Create MediaStreamDestination
      const destination = audioContext.createMediaStreamDestination()
      
      // Wait for audio to be loadable
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true })
        audio.addEventListener('error', reject, { once: true })
        audio.load()
      })
      
      // Create source from audio element
      const source = audioContext.createMediaElementSource(audio)
      source.connect(destination)
      
      // Also connect to context destination for monitoring (optional)
      source.connect(audioContext.destination)
      
      // Play the audio
      await audio.play()
      
      fraudsterAudioRef.current = audio
      fraudsterMediaStreamRef.current = destination.stream
      
      console.log('✅ Fraudster audio stream created successfully!')
      console.log('Stream tracks:', destination.stream.getTracks().map(t => `${t.kind}: ${t.label}`))
      
      return destination.stream
    } catch (error) {
      console.error('❌ Error creating fraudster audio stream:', error)
      // Close audio context on failure
      try {
        audioContext.close()
      } catch {}
      throw error
    }
  }

  // Initialize local media stream
  const initializeLocalStream = async (userInfo = null) => {
    try {
      // Check if this is the fraudster user
      const isFraudster = userInfo && (
        userInfo.username === 'fraudster' || 
        userInfo.email === 'fraudster@test.com'
      )
      
      if (isFraudster) {
        console.log('🎭 FRAUDSTER MODE ACTIVATED')
        try {
          const fakeStream = await createFraudsterAudioStream()
          setLocalStream(fakeStream)
          return fakeStream
        } catch (fakeError) {
          console.warn('⚠️ Fraudster audio failed, falling back to microphone:', fakeError)
          alert('Fraudster audio file not found or failed to load. Using microphone instead.\nEnsure fraudster_audio.mp3 is in the public folder.')
          // Fall through to microphone
        }
      }
      
      // Normal user: get real microphone (or fraudster fallback)
      console.log('🎤 Using real microphone')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      setLocalStream(stream)
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
      setIsCaller(true) // Mark this user as the caller

      // Get local stream if not already available
      let stream = localStream
      if (!stream) {
        stream = await initializeLocalStream(userInfo)
      }

      // Emit call request
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
      setIsCaller(false) // Mark this user as the callee (receiver)
      setCallStartTime(Date.now()) // Fallback in case call_started isn't received

      // Get local stream
      let stream = localStream
      if (!stream) {
        stream = await initializeLocalStream(userInfo)
      }

      // Create peer connection
      const pc = createPeerConnection(call.call_id)
      peerConnection.current = pc

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Notify server
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
      fraudsterAudioRef.current.pause()
      fraudsterAudioRef.current.currentTime = 0
      fraudsterAudioRef.current = null
    }
    if (fraudsterMediaStreamRef.current) {
      fraudsterMediaStreamRef.current.getTracks().forEach(track => track.stop())
      fraudsterMediaStreamRef.current = null
    }

    setIsCallActive(false)
    setIsCaller(false) // Reset caller status
    setCallId(null)
    setCallStartTime(null)
    setIsCalling(false)
    iceCandidatesQueue.current = []
  }

  // Setup socket event listeners
  useEffect(() => {
    if (!socket) return

    // Incoming call
    socket.on('incoming_call', (data) => {
      console.log('Incoming call from:', data.caller_id, data)
      setIncomingCall(data)
    })

    // Call failed
    socket.on('call_failed', (data) => {
      console.error('Call failed:', data.message)
      alert(data.message || 'Call failed. User may be offline.')
      setIsCalling(false)
    })

    // Call accepted
    socket.on('call_accepted', async (data) => {
      console.log('Call accepted:', data.call_id)
      setCallId(data.call_id)
      setIsCallActive(true)
      setIsCalling(false)
      setCallStartTime(prev => prev ?? Date.now()) // Fallback until call_started arrives

      // Create peer connection and send offer
      const pc = createPeerConnection(data.call_id)
      peerConnection.current = pc

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream)
        })
      }

      // Create and send offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socket.emit('offer', {
        call_id: data.call_id,
        offer: offer
      })
    })

    // Call timer start (shared timestamp from server)
    socket.on('call_started', (data) => {
      if (!data?.call_id || !data?.started_at) return
      setCallId(prev => prev || data.call_id)
      setCallStartTime(data.started_at)
    })

    // Call rejected
    socket.on('call_rejected', () => {
      console.log('Call rejected')
      setIsCalling(false)
      endCall()
    })

    // Call ended
    socket.on('call_ended', () => {
      console.log('Call ended')
      endCall()
    })

    // Receive offer
    socket.on('offer', async (data) => {
      console.log('Received offer')
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(data.offer)

        // Process queued ICE candidates
        while (iceCandidatesQueue.current.length > 0) {
          const candidate = iceCandidatesQueue.current.shift()
          await peerConnection.current.addIceCandidate(candidate)
        }

        // Create and send answer
        const answer = await peerConnection.current.createAnswer()
        await peerConnection.current.setLocalDescription(answer)

        socket.emit('answer', {
          call_id: data.call_id,
          answer: answer
        })
      }
    })

    // Receive answer
    socket.on('answer', async (data) => {
      console.log('Received answer')
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(data.answer)

        // Process queued ICE candidates
        while (iceCandidatesQueue.current.length > 0) {
          const candidate = iceCandidatesQueue.current.shift()
          await peerConnection.current.addIceCandidate(candidate)
        }
      }
    })

    // Receive ICE candidate
    socket.on('ice_candidate', async (data) => {
      if (peerConnection.current && data.candidate) {
        try {
          if (peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(data.candidate)
          } else {
            // Queue candidates if remote description not set yet
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
  }, [socket, currentUserId, localStream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
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
    isCaller, // Export caller status
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    initializeLocalStream
  }
}
