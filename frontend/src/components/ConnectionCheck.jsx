import { useState, useEffect } from 'react'

const ConnectionCheck = ({ apiUrl }) => {
    const [status, setStatus] = useState('checking') // checking, ok, error

    useEffect(() => {
        const checkConnection = async () => {
            try {
                // Try to fetch a simple endpoint or root
                await fetch(`${apiUrl}/`, { method: 'HEAD', mode: 'no-cors' })
                // If we get here, meaningful connection was made (even if 404/etc, at least SSL handshake worked)
                // With 'no-cors', we can't see status, but we can detect network errors vs success
                setStatus('ok')
            } catch (err) {
                console.error("Backend connection failed:", err)
                setStatus('error')
            }
        }

        checkConnection()
    }, [apiUrl])

    if (status === 'ok') return null

    if (status === 'checking') {
        return <div style={{ marginBottom: '1rem', color: '#aaa', fontSize: '0.9rem' }}>Checking server connection...</div>
    }

    return (
        <div style={{
            marginBottom: '1.5rem',
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            textAlign: 'left',
            fontSize: '0.9rem'
        }}>
            <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Connection Blocked</p>
            <p style={{ marginBottom: '8px' }}>
                The browser is blocking the connection to the backend server. This is common with self-signed SSL certificates.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a
                    href={apiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        background: '#ef4444',
                        color: 'white',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        textAlign: 'center',
                        fontWeight: '600'
                    }}
                >
                    1. Click here to open Backend
                </a>
                <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    Then click <strong>Advanced → Proceed to...</strong> to accept the certificate. Finally, return here and refresh.
                </p>
            </div>
        </div>
    )
}

export default ConnectionCheck
