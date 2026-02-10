import axios from 'axios'
import { API_URL } from '../config'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect for the verify endpoint — let AuthContext handle it gracefully
      const url = error.config?.url || ''
      if (!url.includes('/auth/verify')) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

const authService = {
  register: async (username, email, password) => {
    const response = await api.post('/api/auth/register', {
      username,
      email,
      password
    })
    return response.data
  },

  login: async (email, password) => {
    const response = await api.post('/api/auth/login', {
      email,
      password
    })
    return response.data
  },

  verify: async () => {
    const response = await api.get('/api/auth/verify')
    return response.data
  },

  logout: async () => {
    const response = await api.post('/api/auth/logout')
    return response.data
  }
}

export default authService
