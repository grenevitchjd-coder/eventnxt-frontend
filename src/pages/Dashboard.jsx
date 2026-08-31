// eventnxt-frontend: src/pages/Dashboard.jsx
//
// Admin dashboard shell. Owns the GLOBAL event context: the events list is
// loaded once here, the current event is picked once in the sidebar, and
// every tab receives eventId/event as props. Tabs no longer have their own
// event pickers. The active tab is keyed by eventId so switching events
// remounts it and it reloads its data — tabs keep their simple
// load-once-on-mount logic.
//
// Sidebar is grouped by lifecycle (Set up / Promote / Manage) so a
// first-time organizer reads it as a sequence, not a feature list.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, clearToken, getNewEventUrl } from '../api'
import HomeTab from '../components/HomeTab'
import OverviewTab from '../components/OverviewTab'
import EventSettingsTab from '../components/EventSettingsTab'
import TicketsSeatingTab from '../components/TicketsSeatingTab'
import EventWorkspaceTab from '../components/EventWorkspaceTab'
import GuestListTab from '../components/GuestListTab'
import RSVPManagementTab from '../components/RSVPManagementTab'
import SalesReferralsTab from '../components/SalesReferralsTab'
import OrdersTab from '../components/OrdersTab'

// Same key the old per-tab pickers used, so nobody loses their place when
// this ships.
const LAST_EVENT_KEY = 'eventnxt_last_event_id'

const NAV_GROUPS = [
  {
    label: 'Set up',
    tabs: [
      { key: 'settings', label: 'Event settings' },
      { key: 'tickets', label: 'Tickets & seating' },
      { key: 'workspace', label: 'Guest types' },
      { key: 'home', label: 'Event page' },
    ],
  },
  {
    label: 'Promote',
    tabs: [{ key: 'sales', label: 'Promos & referrals' }],
  },
  {
    label: 'Manage',
    tabs: [
      { key: 'orders', label: 'Orders' },
      { key: 'guests', label: 'Guest list' },
      { key: 'rsvp', label: 'RSVPs' },
    ],
  },
]

export default function Dashboard() {
  const [tab, setTab] = useState('overview')
  const [toast, setToast] = useState(null)
  const [me, setMe] = useState(null)
  const [events, setEvents] = useState(null) // null = loading, [] = none yet
  const [eventId, setEventId] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.getMe().then(setMe).catch(() => {})
  }, [])

  useEffect(() => {
    api
      .listEvents()
      .then((evs) => {
        setEvents(evs)
        const remembered = sessionStorage.getItem(LAST_EVENT_KEY)
        const restored = evs.find((ev) => ev.id === remembered)
        setEventId(restored ? restored.id : evs[0]?.id || '')
      })
      .catch((e) => showToast(e.message, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (message, isError = false) => setToast({ message, isError })

  const handleSelectEvent = (e) => {
    setEventId(e.target.value)
    sessionStorage.setItem(LAST_EVENT_KEY, e.target.value)
  }

  const handleLogout = () => {
    clearToken()
    navigate('/login')
  }

  const currentEvent = events?.find((ev) => ev.id === eventId) || null

  const renderTab = () => {
    if (events === null) return null // still loading the events list
    if (events.length === 0) {
      return (
        <div className="data-table">
          <div className="empty-state">
            No events yet — create one in Events360&apos;s org dashboard, then it&apos;ll show up
            here. Use the &ldquo;+ New Event&rdquo; button in the sidebar.
          </div>
        </div>
      )
    }
    if (!currentEvent) return null
    const props = { onToast: showToast, eventId, event: currentEvent, onNavigate: setTab }
    switch (tab) {
      case 'overview':
        return <OverviewTab key={eventId} {...props} />
      case 'home':
        return <HomeTab key={eventId} {...props} />
      case 'workspace':
        return <EventWorkspaceTab key={eventId} {...props} />
      case 'guests':
        return <GuestListTab key={eventId} {...props} />
      case 'rsvp':
        return <RSVPManagementTab key={eventId} {...props} />
      case 'sales':
        return <SalesReferralsTab key={eventId} {...props} />
      case 'settings':
        return <EventSettingsTab key={eventId} {...props} />
      case 'tickets':
        return <TicketsSeatingTab key={eventId} {...props} />
      case 'orders':
        return <OrdersTab key={eventId} {...props} />
      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" />
          EventNXT
        </div>

        <div className="sidebar-event">
          <label className="sidebar-event-label" htmlFor="global-event-picker">
            Current event
          </label>
          <select
            id="global-event-picker"
            className="sidebar-event-select"
            value={eventId}
            onChange={handleSelectEvent}
            disabled={!events || events.length === 0}
          >
            {(!events || events.length === 0) && <option value="">No events</option>}
            {(events || []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <a className="sidebar-new-event" href={getNewEventUrl()}>
            + New Event
          </a>
        </div>

        <button
          className={`nav-item ${tab === 'overview' ? 'active' : ''}`}
          style={{ marginBottom: 8 }}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="nav-group">
            <div className="nav-group-label">{group.label}</div>
            {group.tabs.map((t) => (
              <button
                key={t.key}
                className={`nav-item ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
            {group.label === 'Manage' && eventId && (
              <button className="nav-item" onClick={() => window.open(`/checkin/${eventId}`, '_blank')}>
                Check-in ↗
              </button>
            )}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="sidebar-user">{me ? `${me.name} · ${me.role}` : '...'}</div>
          <button className="nav-item" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">{renderTab()}</main>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : ''}`}>{toast.message}</div>}
    </div>
  )
}