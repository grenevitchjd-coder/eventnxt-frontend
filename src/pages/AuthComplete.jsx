import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '../api'

/**
 * Landed on after EventNXT's backend finishes the OAuth exchange with
 * Events360 — the token arrives as a query param here, gets stored, and
 * the browser moves on to the real dashboard. This page is never visited
 * directly by a person; it's the final hop of the login redirect chain.
 */
export default function AuthComplete() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      setToken(token)
      navigate('/')
    } else {
      navigate('/login')
    }
  }, [navigate])

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark" />
        <h1 className="login-title" style={{ fontSize: 20 }}>
          Signing you in…
        </h1>
      </div>
    </div>
  )
}