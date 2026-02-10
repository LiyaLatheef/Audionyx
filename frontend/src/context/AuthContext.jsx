import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import authService from '../services/auth'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Verify token on mount
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('token')
      if (storedToken) {
        try {
          const response = await authService.verify()
          setUser(response.user)
          setToken(storedToken)
        } catch (error) {
          console.error('Token verification failed:', error)
          // Only log out if explicitly unauthorized (401) or forbidden (403)
          if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            setToken(null)
            setUser(null)
          } else {
            // For network errors or 500s, keep the user logged in optimistically
            console.warn('Backend verification failed but token might still be valid. Keeping session.')
          }
        }
      }
      setLoading(false)
    }

    verifyToken()
  }, [])

  const login = async (email, password) => {
    try {
      const response = await authService.login(email, password)
      setUser(response.user)
      setToken(response.token)
      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.user))
      navigate('/dashboard')
      return response
    } catch (error) {
      throw error
    }
  }

  const register = async (username, email, password) => {
    try {
      const response = await authService.register(username, email, password)
      setUser(response.user)
      setToken(response.token)
      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.user))
      navigate('/dashboard')
      return response
    } catch (error) {
      throw error
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      setToken(null)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      navigate('/login')
    }
  }

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!token && !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
