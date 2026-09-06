// eventnxt-frontend: src/pages/Dashboard.jsx
//
// Admin dashboard shell. Owns the GLOBAL event context: the events list is
// loaded once here, the current event is picked once in the sidebar, and
// every tab receives eventId/event as props. Tabs no longer have their own
// event pickers. The active tab is keyed by eventId so switching events
// remounts it and it reloads its data — tabs keep their simple
// load-once-on-mount logic.
//
// Sidebar is grouped by lifecycle (Set up / Promote / Manage) rendered as
// COLLAPSIBLE dropdowns, so a first visit reads as just:
//   Overview / Set up / Promote / Manage / Check-in.
// The group containing the active tab is always held open (so Overview's
// checklist can deep-link into a collapsed group and the highlight is
// visible); any other group the user opens is remembered in localStorage.
//
// Check-in is a TOP-LEVEL item, not a Manage child: it's a live door tool
// that opens in its own tab, and the landing point for restricted roles.
//
// ROLE GATING (live): me.permissions carries the Events360 grants — the
// SAME payload the backend enforces 403s with, so what's greyed here and
// what's refused there can never disagree. Rules: a group whose pages are
// all disallowed renders its toggle disabled and LOCKED (it won't open —
// a check-in-only person can't even see what's inside); a partially
// allowed group opens but greys its disallowed pages; Overview needs the
// SETUP area (its checklist reads setup endpoints — anyone else would
// just collect 403s there); Check-in needs the checkin grant. If the active tab
// becomes disallowed (login, or switching to an event where an
// event-scoped role doesn't apply), we land on the first allowed page,
// falling back to a check-in-only notice in the main pane. A me payload
// without permissions (pre-bridge Events360) gates nothing.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, clearToken, getNewEventUrl } from '../api'
import HomeTab from '../components/HomeTab'
import OverviewTab from '../components/OverviewTab'
import EventSettingsTab from '../components/EventSettingsTab'
import TicketsSeatingTab from '../components/TicketsSeatingTab'
import EventWorkspaceTab from '../components/EventWorkspaceTab'
import GuestListTab from '../components/GuestListTab'
import InvitesTab from '../components/InvitesTab'
import AllotmentsTab from '../components/AllotmentsTab'
import PromosTab from '../components/PromosTab'
import PromoTrackingTab from '../components/PromoTrackingTab'
import ReferralSetupTab from '../components/ReferralSetupTab'
import ReferralPayoutsTab from '../components/ReferralPayoutsTab'
import SeatingSummaryTab from '../components/SeatingSummaryTab'
import OrdersTab from '../components/OrdersTab'

// Same key the old per-tab pickers used, so nobody loses their place when
// this ships.
const LAST_EVENT_KEY = 'eventnxt_last_event_id'
// Which sidebar groups the user has manually opened. localStorage (not
// session) — how you arrange your sidebar should survive a new tab.
const NAV_OPEN_KEY = 'eventnxt_nav_open'
// Whether the whole sidebar is collapsed to a slim rail — more room for
// the wide grids. Same persistence reasoning as NAV_OPEN_KEY.
const SIDEBAR_COLLAPSED_KEY = 'eventnxt_sidebar_collapsed'

const NAV_GROUPS = [
  {
    key: 'setup',
    label: 'Set up',
    tabs: [
      { key: 'settings', label: 'Event settings' },
      { key: 'tickets', label: 'Seats Setup' },
      { key: 'workspace', label: 'Guest types' },
      { key: 'home', label: 'Event page' },
    ],
  },
  {
    key: 'promote',
    label: 'Promote',
    tabs: [
      { key: 'promos', label: 'Promos' },
      { key: 'promo-tracking', label: 'Promo tracking' },
      { key: 'referral-setup', label: 'Referral setup' },
      { key: 'referral-payouts', label: 'Referral payouts' },
    ],
  },
  {
    key: 'manage',
    label: 'Manage',
    tabs: [
      { key: 'orders', label: 'Orders' },
      { key: 'invites', label: 'Invites' },
      { key: 'allotments', label: 'Allotments' },
      { key: 'guests', label: 'Guest list' },
      { key: 'seating-summary', label: 'Seating summary' },
    ],
  },
]

// Which permission AREA each tab belongs to (mirrors the backend's
// route->area map in eventnxt-backend/app/services/permissions.py).
const TAB_AREAS = {
  settings: 'setup',
  tickets: 'setup',
  workspace: 'setup',
  home: 'setup',
  'seating-summary': 'setup',
  promos: 'promotion',
  'referral-setup': 'promotion',
  'promo-tracking': 'money',
  'referral-payouts': 'money',
  orders: 'money',
  invites: 'guests',
  allotments: 'guests',
  guests: 'guest_list',
}

// A view OR manage grant on the area makes its pages visible; writes are
// enforced server-side. null grants (owner/org_admin, or a pre-bridge
// Events360 payload with no permissions field) mean everything.
const grantsForEvent = (me, eventId) => {
  const perms = me?.permissions
  if (!perms || perms.all) return null
  const set = new Set(perms.org_wide || [])
  for (const key of (perms.by_event || {})[eventId] || []) set.add(key)
  return set
}

const hasArea = (granted, area) => {
  if (granted === null) return true
  if (area === 'checkin') return granted.has('eventnxt.checkin')
  return granted.has(`eventnxt.${area}.view`) || granted.has(`eventnxt.${area}.manage`)
}

const loadOpenGroups = () => {
  try {
    const raw = localStorage.getItem(NAV_OPEN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export default function Dashboard() {
  // Stripe Connect onboarding round-trips through connect.stripe.com and
  // lands back on "/?payments=return" (or =refresh when a link expired
  // mid-session) — open straight onto Event settings so the organizer
  // returns to the Payouts card they left from. The remembered event in
  // sessionStorage survives the same-tab round trip and restores below.
  const [tab, setTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('payments') ? 'settings' : 'overview'
    } catch {
      return 'overview'
    }
  })
  const [toast, setToast] = useState(null)
  const [me, setMe] = useState(null)
  const [events, setEvents] = useState(null) // null = loading, [] = none yet
  const [eventId, setEventId] = useState('')
  const [openGroups, setOpenGroups] = useState(loadOpenGroups)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
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

  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next))
      } catch {
        // storage full/blocked — the toggle still works for this session
      }
      return next
    })
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // storage blocked — still works for this session
      }
      return next
    })
  }

  const currentEvent = events?.find((ev) => ev.id === eventId) || null

  // ---- Role gating (derived fresh on every render: me + current event) ----
  const granted = grantsForEvent(me, eventId)
  const tabAllowed = (key) => hasArea(granted, TAB_AREAS[key])
  const checkinAllowed = hasArea(granted, 'checkin')
  // Overview renders the setup checklist (settings/ticket-type reads) —
  // gate it on the setup area so restricted roles never land on a page
  // whose every fetch 403s.
  const overviewAllowed = hasArea(granted, 'setup')
  const firstAllowedTab = () => {
    if (overviewAllowed) return 'overview'
    for (const group of NAV_GROUPS) {
      const t = group.tabs.find((t) => tabAllowed(t.key))
      if (t) return t.key
    }
    return null // check-in only (or nothing)
  }

  // If the active tab is disallowed for this role + event, move somewhere
  // legal. Runs after me/events load and again on every event switch —
  // event-scoped roles can allow a page on one event and not another.
  useEffect(() => {
    if (!me || !eventId) return
    const ok = tab === 'overview' ? overviewAllowed : tabAllowed(tab)
    if (!ok) setTab(firstAllowedTab() || 'overview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, eventId, tab])

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
    if (me && !overviewAllowed && firstAllowedTab() === null) {
      // Check-in-only role (or no grants at all for this event)
      return (
        <div className="data-table">
          <div className="empty-state">
            {checkinAllowed ? (
              <>
                Your role covers check-in for this event. Use the Check-in button in the
                sidebar to open the door tool.
              </>
            ) : (
              <>Your role doesn&apos;t include access to this event. Ask your org admin.</>
            )}
          </div>
        </div>
      )
    }
    const props = { onToast: showToast, eventId, event: currentEvent, onNavigate: setTab }
    switch (tab) {
      case 'overview':
        return <OverviewTab key={eventId} {...props} />
      case 'home':
        return <HomeTab key={eventId} {...props} />
      case 'workspace':
        return <EventWorkspaceTab key={eventId} {...props} />
      case 'invites':
        return <InvitesTab key={eventId} {...props} />
      case 'allotments':
        return <AllotmentsTab key={eventId} {...props} />
      case 'guests':
        return <GuestListTab key={eventId} {...props} />
      case 'promos':
        return <PromosTab key={eventId} {...props} />
      case 'promo-tracking':
        return <PromoTrackingTab key={eventId} {...props} />
      case 'referral-setup':
        return <ReferralSetupTab key={eventId} {...props} />
      case 'referral-payouts':
        return <ReferralPayoutsTab key={eventId} {...props} />
      case 'seating-summary':
        return <SeatingSummaryTab key={eventId} {...props} />
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
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        {sidebarCollapsed ? (
          <button
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title="Expand sidebar"
            aria-expanded="false"
            aria-label="Expand sidebar"
          >
            »
          </button>
        ) : (
          <>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" />
          EventNXT
          <button
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title="Collapse sidebar — more room for the grids"
            aria-expanded="true"
            aria-label="Collapse sidebar"
            style={{ marginLeft: 'auto' }}
          >
            «
          </button>
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
          disabled={!overviewAllowed}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>

        {NAV_GROUPS.map((group) => {
          const groupAllowed = group.tabs.some((t) => tabAllowed(t.key))
          const containsActive = group.tabs.some((t) => t.key === tab)
          // A fully-disallowed group is LOCKED: the toggle is disabled and
          // the group can never open — its contents aren't for this role.
          const isOpen = groupAllowed && (containsActive || openGroups[group.key] === true)
          return (
            <div key={group.key} className="nav-group">
              <button
                className={`nav-group-toggle ${isOpen ? 'open' : ''}`}
                disabled={!groupAllowed}
                title={groupAllowed ? undefined : 'Your role doesn\u2019t include this area'}
                onClick={() => toggleGroup(group.key)}
                aria-expanded={isOpen}
              >
                <span>{group.label}</span>
                <span className="nav-caret" aria-hidden="true">
                  ▸
                </span>
              </button>
              {isOpen && (
                <div className="nav-group-items">
                  {group.tabs.map((t) => (
                    <button
                      key={t.key}
                      className={`nav-item ${tab === t.key ? 'active' : ''}`}
                      disabled={!tabAllowed(t.key)}
                      title={tabAllowed(t.key) ? undefined : 'Your role doesn\u2019t include this page'}
                      onClick={() => setTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <button
          className="nav-item nav-checkin"
          disabled={!eventId || !checkinAllowed}
          title={checkinAllowed ? undefined : 'Your role doesn\u2019t include check-in'}
          onClick={() => window.open(`/checkin/${eventId}`, '_blank')}
        >
          Check-in ↗
        </button>

        <div className="sidebar-footer">
          <div className="sidebar-user">{me ? `${me.name} · ${me.role}` : '...'}</div>
          <button className="nav-item" onClick={handleLogout}>
            Log out
          </button>
        </div>
          </>
        )}
      </aside>

      <main className="main">{renderTab()}</main>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : ''}`}>{toast.message}</div>}
    </div>
  )
}