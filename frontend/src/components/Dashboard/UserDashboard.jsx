import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCall } from '../../context/CallContext'
import CallInterface from '../Call/CallInterface'
import './UserDashboard.css'

const UserDashboard = () => {
  const { user, logout } = useAuth()
  const {
    onlineUsers,
    startCall,
    isCallActive,
    incomingCall,
    acceptCall,
    rejectCall
  } = useCall()

  const [selectedUser, setSelectedUser] = useState(null)

  const handleCallUser = async (targetUser) => {
    try {
      await startCall(targetUser.id)
      setSelectedUser(targetUser)
    } catch (error) {
      console.error('Error starting call:', error)
      alert('Failed to start call. Please check microphone permissions.')
    }
  }

  const handleAcceptCall = () => {
    if (incomingCall) {
      acceptCall(incomingCall)
      // Find caller in online users
      const caller = onlineUsers.find(u => u.id === incomingCall.caller_id)
      setSelectedUser(caller || incomingCall.caller)
    }
  }

  const handleRejectCall = () => {
    if (incomingCall) {
      rejectCall(incomingCall)
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Audionyx</h1>
          <div className="user-info">
            <span className="username">{user?.username}</span>
            <button onClick={logout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {!isCallActive ? (
          <div className="users-section">
            <h2>Online Users ({onlineUsers.length})</h2>

            {onlineUsers.length === 0 ? (
              <div className="no-users">
                <p>No other users online</p>
                <p className="hint">Open another browser tab (incognito) and login with a different account</p>
              </div>
            ) : (
              <div className="users-list">
                {onlineUsers.map((u) => (
                  <div key={u.id} className="user-card">
                    <div className="user-avatar">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-details">
                      <h3>{u.username}</h3>
                      <span className="user-email">{u.email}</span>
                    </div>
                    <button
                      onClick={() => handleCallUser(u)}
                      className="btn-call"
                    >
                      Call
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <CallInterface
            remoteUser={selectedUser}
          />
        )}

        {/* Incoming Call Overlay */}
        {incomingCall && !isCallActive && (
          <div className="incoming-call-overlay">
            <div className="incoming-call-card">
              <div className="incoming-call-header">
                <div className="incoming-avatar-pulse">
                  {incomingCall.caller?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <h3>Incoming Call...</h3>
                <p className="caller-name">
                  {incomingCall.caller?.username || 'Unknown User'}
                </p>
              </div>

              <div className="incoming-actions">
                <button onClick={handleRejectCall} className="btn-action btn-reject" aria-label="Reject Call">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.7-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                </button>
                <button onClick={handleAcceptCall} className="btn-action btn-accept" aria-label="Accept Call">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserDashboard
