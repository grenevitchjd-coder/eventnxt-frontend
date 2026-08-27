import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api'
import HomeTab from '../components/HomeTab'
import EventWorkspaceTab from '../components/EventWorkspaceTab'
import GuestListTab from '../components/GuestListTab'

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'workspace', label: 'Event workspace' },
  { key: 'guests', label: 'Guest list' },
]

export default function Dashboard() {
  const [tab, setTab] = useState('home')
  const [toast, setToast] = useState(null)
  const [me, setMe] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getMe().then(setMe).catch(() => {})
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (message, isError = false) => setToast({ message, isError })

  const handleLogout = () => {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" />
          EventNXT
        </div>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`nav-item ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <div className="sidebar-user">{me ? `${me.name} · ${me.role}` : '...'}</div>
          <button className="nav-item" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        {tab === 'home' && <HomeTab onToast={showToast} />}
        {tab === 'workspace' && <EventWorkspaceTab onToast={showToast} />}
        {tab === 'home' && <HomeTab onToast={showToast} />}
        {tab === 'workspace' && <EventWorkspaceTab onToast={showToast} />}
        {tab === 'guests' && <GuestListTab onToast={showToast} />}
      </main>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : ''}`}>{toast.message}</div>}
    </div>
  )
}