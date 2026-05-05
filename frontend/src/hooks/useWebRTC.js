import { useState, useEffect, useRef } from 'react'
import { ICE_SERVERS, API_URL } from '../config'
import { useAuth } from '../context/AuthContext'

export const useWebRTC = (socket, currentUserId, onRemoteStream) => {
  const { user } = useAuth() // Get user directly from AuthContext
  
  // Debug user object
  useEffect(() => {
    console.log('🔍 [HOOK INIT] useWebRTC user object:', user)
    console.log('🔍 [HOOK INIT] useWebRTC user username:', user?.username)
    console.log('🔍 [HOOK INIT] useWebRTC user email:', user?.email)
  }, [user])
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
  // ONLY used for the fraudster account (Gautham)
  // Uses Web Audio API to decode and play audio through MediaStreamDestination
  const createFraudsterAudioStream = async () => {
    console.log('🎭 Creating fraudster audio stream for Gautham...')

    const audioContext = new (window.AudioContext || window.webkitAudioContext)()

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Fetch the audio file
      const audioUrl = `http://localhost:5000/api/static/fraudster_audio.wav` // Direct backend URL
      console.log('Fetching fraudster audio from:', audioUrl)
      
      const response = await fetch(audioUrl)
      console.log('Fetch response status:', response.status)
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      console.log('Audio file size:', arrayBuffer.byteLength, 'bytes')
      
      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      // Create a MediaStream destination
      const destination = audioContext.createMediaStreamDestination()
      
      // Create a buffer source
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.loop = true
      
      // Connect to destination
      source.connect(destination)
      
      // Start playback
      source.start(0)
      
      // Store references for cleanup
      fraudsterAudioRef.current = {
        source: source,
        context: audioContext,
        close: () => {
          try { source.stop() } catch { }
          try { audioContext.close() } catch { }
        }
      }
      fraudsterMediaStreamRef.current = destination.stream

      console.log('✅ Fraudster audio stream created successfully for Gautham')
      console.log('Stream tracks:', destination.stream.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`))
      return destination.stream

    } catch (error) {
      console.error('❌ Error creating fraudster audio stream for Gautham:', error)
      try { audioContext.close() } catch { }
      throw error
    }
  }

  // Initialize local media stream
  const initializeLocalStream = async () => {
    try {
      console.log('🔍 [START] initializeLocalStream called')
      console.log('🔍 Current user from AuthContext:', user)
      console.log('🔍 User object keys:', user ? Object.keys(user) : 'NO USER')
      console.log('🔍 User object values:', user ? Object.values(user) : 'NO USER')

      // Check if the LOCAL user is the fraudster - if so, ALWAYS send deepfake audio
      const isFraudster = user && (
        (user.email && user.email.toLowerCase() === 'gautham@gmail.com') ||
        (user.username && (user.username.toLowerCase() === 'gautham' || user.username === 'Gautham'))
      )
      console.log('🔍 [DETECTION] isFraudster (local user):', isFraudster)

      if (isFraudster) {
        console.log('🎭 [FRAUDSTER] DETECTED! LOCAL user is fraudster - ALWAYS sending deepfake audio')
        console.log('🎭 FRAUDSTER MODE ACTIVATED: User', user?.username, 'will send pre-recorded deepfake audio to everyone')
        console.log('🎭 All other users will send live microphone audio')
        console.log('🎭 [FRAUDSTER] About to call createFraudsterAudioStream()...')
        try {
          console.log('🎭 [FRAUDSTER] Attempting to create fraudster audio stream...')
          const fakeStream = await createFraudsterAudioStream()
          console.log('🎭 [FRAUDSTER] Fraudster stream created successfully:', fakeStream.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`))
          updateLocalStream(fakeStream)
          console.log('🎭 [FRAUDSTER] Local stream updated to fraudster audio - returning fraudster stream')
          return fakeStream
        } catch (fakeError) {
          console.error('⚠️ [FRAUDSTER] Fraudster audio creation FAILED:', fakeError)
          console.warn('⚠️ [FRAUDSTER] Falling back to microphone audio due to fraudster audio failure')
        }
      }

      // Normal user: get real microphone
      console.log('🎤 [NORMAL] REMOTE user is not fraudster - sending live microphone audio')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      console.log('🎤 [NORMAL] Microphone stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`))
      updateLocalStream(stream)
      console.log('🎤 [NORMAL] Local stream updated to microphone audio - returning microphone stream')
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
      console.log('Received remote track:', event.track.kind, event.track.enabled, event.track.readyState)
      console.log('Remote streams:', event.streams.length)
      if (event.streams[0]) {
        console.log('Remote stream tracks:', event.streams[0].getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`))
        // Ensure remote tracks are enabled
        event.streams[0].getTracks().forEach(track => {
          track.enabled = true
        })
        setRemoteStream(event.streams[0])
        if (onRemoteStream) {
          onRemoteStream(event.streams[0])
        }
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      console.log('Peer connection state:', pc.connectionState)
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
        stream = await initializeLocalStream()
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
        stream = await initializeLocalStream()
      }

      const pc = createPeerConnection(call.call_id)
      peerConnection.current = pc

      console.log('Local stream for callee:', stream?.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`))
      stream.getTracks().forEach(track => {
        track.enabled = true // Ensure track is enabled
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
        console.log('Adding local tracks to peer connection:', stream.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`))
        stream.getTracks().forEach(track => {
          track.enabled = true // Ensure track is enabled
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
