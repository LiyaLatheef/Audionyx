import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_URL } from '../../config'
import ConnectionCheck from '../ConnectionCheck'
import './Auth.css'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-frame">
        <header className="auth-nav">
          <div className="auth-brand">
            <span className="auth-brandMark" aria-hidden="true">
              <span className="auth-brandHex" />
            </span>
            <span className="auth-brandText">Audionyx</span>
          </div>

          <Link to="/register" className="auth-navCta">
            Sign Up
          </Link>
        </header>

        <main className="auth-grid">
          <section className="auth-left" aria-hidden="true">
            <div className="auth-tile auth-tilePortrait">
              <div className="auth-portraitGlow" />
              <div className="auth-portraitCard">
                <div className="auth-portraitImg" />
                <div className="auth-portraitMeta">
                  <div className="auth-portraitMetaTitle">Voice Integrity</div>
                  <div className="auth-portraitMetaSub">Live deepfake detection</div>
                </div>
              </div>
            </div>
          </section>

          <section className="auth-right">
            <div className="auth-heroCard">
              <div className="auth-heroKicker">Audionyx</div>
              <h1 className="auth-heroTitle">VERIFY AUDIO WITH AI</h1>
              <p className="auth-heroCopy">
                Sign in to start real-time call analysis.
              </p>
              <ConnectionCheck apiUrl={API_URL} />
            </div>

            <form onSubmit={handleSubmit} className="auth-formCard" aria-label="Login form">
              <div className="auth-formHeader">
                <h2>Sign in</h2>
                <p>Use your account email and password.</p>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <p className="auth-link">
                New here? <Link to="/register">Create an account</Link>
              </p>
            </form>
          </section>
        </main>
      </div>
    </div>
  )
}

export default Login
