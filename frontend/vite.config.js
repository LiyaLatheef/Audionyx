import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 3000,
    host: true,
    https: true,
    proxy: {
      // Proxy API requests to the Flask backend (HTTP)
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      },
      // Proxy Socket.io requests to the Flask backend (HTTP)
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        ws: true
      },
      // Proxy static files to backend
      '/static': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
