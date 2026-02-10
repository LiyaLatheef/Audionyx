import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config'

class SocketService {
  constructor() {
    this.socket = null
    this.connected = false
  }

  connect(userId) {
    if (this.socket?.connected) {
      console.log('Socket already connected')
      return this.socket
    }

    const token = localStorage.getItem('token')

    this.socket = io(SOCKET_URL, {
      auth: {
        token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      path: '/socket.io'
    })

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id)
      this.connected = true
      
      // Register user as online
      if (userId) {
        this.socket.emit('user_online', { user_id: userId })
      }
    })

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected')
      this.connected = false
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.connected = false
    }
  }

  emit(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data)
    } else {
      console.error('Socket not connected')
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }

  getSocket() {
    return this.socket
  }

  isConnected() {
    return this.connected && this.socket?.connected
  }
}

// Singleton instance
const socketService = new SocketService()

export default socketService
