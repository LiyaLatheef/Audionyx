import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../../config'
import './AdminDashboard.css'

const AdminDashboard = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [adminToken, setAdminToken] = useState(null)
    const [users, setUsers] = useState([])
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const navigate = useNavigate()

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await fetch(`${API_URL}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Login failed')

            setAdminToken(data.token)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchUsers = async (token) => {
        try {
            const res = await fetch(`${API_URL}/api/admin/users`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            if (res.ok) setUsers(data.users)
        } catch (err) {
            console.error('Failed to fetch users:', err)
        }
    }

    const handleDelete = async (userId) => {
        try {
            const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${adminToken}` }
            })
            if (res.ok) {
                setUsers(users.filter((u) => u.id !== userId))
                setDeleteConfirm(null)
            }
        } catch (err) {
            console.error('Delete failed:', err)
        }
    }

    useEffect(() => {
        if (adminToken) fetchUsers(adminToken)
    }, [adminToken])

    /* ── Admin Login Screen ────────────────────────────────── */
    if (!adminToken) {
        return (
            <div className="admin-shell">
                <div className="admin-loginCard">
                    <button className="admin-backBtn" onClick={() => navigate('/login')}>
                        ← Back to Login
                    </button>

                    <div className="admin-loginHeader">
                        <div className="admin-shieldIcon">
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                            </svg>
                        </div>
                        <h2>Admin Access</h2>
                        <p>Enter admin credentials to manage users.</p>
                    </div>

                    {error && <div className="admin-error">{error}</div>}

                    <form onSubmit={handleLogin} className="admin-loginForm">
                        <div className="admin-field">
                            <label htmlFor="admin-email">Email</label>
                            <input
                                type="email"
                                id="admin-email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@gmail.com"
                                required
                            />
                        </div>

                        <div className="admin-field">
                            <label htmlFor="admin-password">Password</label>
                            <input
                                type="password"
                                id="admin-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter admin password"
                                required
                            />
                        </div>

                        <button type="submit" className="admin-submitBtn" disabled={loading}>
                            {loading ? 'Verifying...' : 'Sign In as Admin'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    /* ── Admin Dashboard ───────────────────────────────────── */
    return (
        <div className="admin-shell">
            <div className="admin-dashboard">
                <header className="admin-header">
                    <div className="admin-headerLeft">
                        <div className="admin-shieldIcon admin-shieldSmall">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                            </svg>
                        </div>
                        <h1>Admin Panel</h1>
                    </div>
                    <div className="admin-headerRight">
                        <span className="admin-userCount">{users.length} users</span>
                        <button
                            className="admin-logoutBtn"
                            onClick={() => {
                                setAdminToken(null)
                                navigate('/login')
                            }}
                        >
                            Logout
                        </button>
                    </div>
                </header>

                <div className="admin-tableWrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Created</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td className="admin-tdId">{u.id}</td>
                                    <td>
                                        <div className="admin-userCell">
                                            <span className="admin-avatar">
                                                {u.username.charAt(0).toUpperCase()}
                                            </span>
                                            {u.username}
                                        </div>
                                    </td>
                                    <td className="admin-tdEmail">{u.email}</td>
                                    <td className="admin-tdDate">
                                        {u.created_at
                                            ? new Date(u.created_at).toLocaleDateString()
                                            : '—'}
                                    </td>
                                    <td>
                                        <span
                                            className={`admin-badge ${u.is_online ? 'admin-badgeOnline' : 'admin-badgeOffline'
                                                }`}
                                        >
                                            {u.is_online ? 'Online' : 'Offline'}
                                        </span>
                                    </td>
                                    <td>
                                        {deleteConfirm === u.id ? (
                                            <div className="admin-confirmRow">
                                                <button
                                                    className="admin-confirmYes"
                                                    onClick={() => handleDelete(u.id)}
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    className="admin-confirmNo"
                                                    onClick={() => setDeleteConfirm(null)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="admin-deleteBtn"
                                                onClick={() => setDeleteConfirm(u.id)}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="admin-empty">
                                        No registered users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default AdminDashboard
