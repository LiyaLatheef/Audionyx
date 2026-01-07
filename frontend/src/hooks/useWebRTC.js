import { useState, useEffect, useRef } from 'react'
import { ICE_SERVERS } from '../config'

export const useWebRTC = (socket, currentUserId, onRemoteStream) => {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [isCallActive, setIsCallActive] = useState(false)
  const [callId, setCallId] = useState(null)
  const [isCalling, setIsCalling] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)

  const peerConnection = useRef(null)
  const iceCandidatesQueue = useRef([])

  // Initialize local media stream
  const initializeLocalStream = async () => {
    try {
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

      // Get local stream if not already available
      let stream = localStream
      if (!stream) {
        stream = await initializeLocalStream()
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

      // Get local stream
      let stream = localStream
      if (!stream) {
        stream = await initializeLocalStream()
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

    setIsCallActive(false)
    setCallId(null)
    setIsCalling(false)
    iceCandidatesQueue.current = []
  }

  // Setup socket event listeners
  useEffect(() => {
    if (!socket) return

    // Incoming call
    socket.on('incoming_call', (data) => {
      console.log('Incoming call from:', data.caller_id)
      setIncomingCall(data)
    })

    // Call accepted
    socket.on('call_accepted', async (data) => {
      console.log('Call accepted:', data.call_id)
      setCallId(data.call_id)
      setIsCallActive(true)
      setIsCalling(false)

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
      socket.off('call_accepted')
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
    isCalling,
    incomingCall,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    initializeLocalStream
  }
}
