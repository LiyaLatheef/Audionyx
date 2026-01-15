import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import socketService from '../services/socket'
import { useWebRTC } from '../hooks/useWebRTC'

const CallContext = createContext(null)

export const useCall = () => {
  const context = useContext(CallContext)
  if (!context) {
    throw new Error('useCall must be used within CallProvider')
  }
  return context
}

export const CallProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth()
  const [socket, setSocket] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [deepfakeResults, setDeepfakeResults] = useState([])
  const [remoteStreamState, setRemoteStreamState] = useState(null)

  const webrtc = useWebRTC(
    socket,
    user?.id,
    (stream) => setRemoteStreamState(stream),
    user  // Pass user info to WebRTC hook for fraudster detection
  )

  // Initialize socket connection
  useEffect(() => {
    if (isAuthenticated && user) {
      const sock = socketService.connect(user.id)
      setSocket(sock)

      // Listen for online users updates
      sock.on('online_users', (data) => {
        // Filter out current user from online users list
        const filteredUsers = data.users.filter(u => u.id !== user.id)
        setOnlineUsers(filteredUsers)
      })

      sock.on('user_online', (data) => {
        // Don't add current user to online users list
        if (data.user_id === user.id) return
        
        setOnlineUsers(prev => {
          const exists = prev.find(u => u.id === data.user_id)
          if (!exists && data.user) {
            return [...prev, data.user]
          }
          return prev
        })
      })

      sock.on('user_offline', (data) => {
        setOnlineUsers(prev => prev.filter(u => u.id !== data.user_id))
      })

      // Listen for deepfake detection results
      sock.on('deepfake_result', (data) => {
        console.log('Deepfake result:', data)
        setDeepfakeResults(prev => [...prev.slice(-9), data])
      })

      return () => {
        socketService.disconnect()
        setSocket(null)
      }
    }
  }, [isAuthenticated, user])

  const value = {
    socket,
    onlineUsers,
    deepfakeResults,
    remoteStream: remoteStreamState,
    ...webrtc
  }

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}
