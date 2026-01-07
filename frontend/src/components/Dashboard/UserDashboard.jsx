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

        {/* Incoming Call Modal */}
        {incomingCall && !isCallActive && (
          <div className="modal-overlay">
            <div className="incoming-call-modal">
              <h2>Incoming Call</h2>
              <div className="caller-info">
                <div className="caller-avatar">
                  {incomingCall.caller?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <p className="caller-name">
                  {incomingCall.caller?.username || 'Unknown User'}
                </p>
              </div>
              <div className="call-actions">
                <button onClick={handleAcceptCall} className="btn-accept">
                  Accept
                </button>
                <button onClick={handleRejectCall} className="btn-reject">
                  Reject
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
