// eventnxt-frontend: src/components/OverviewTab.jsx
//
// "Overview" — the landing tab. One glance answers: what kind of event is
// this, how is it doing, and what's left to set up. The checklist adapts
// to the event's operating profile (Event settings), so an external-
// ticketing event is never nagged to create native ticket types, and an
// invite-only event is steered toward guest types instead of selling.
// Each unfinished item links straight to the tab that finishes it.
//
// Event context (eventId) comes from the Dashboard shell; remounted via
// key={eventId} on switch. onNavigate(tabKey) is the shell's setTab.

import { useEffect, useState } from 'react'
import { api } from '../api'

function centsToDollars(c) {
  return (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MODE_LABELS = {
  native: 'Selling on EventNXT',
  external: 'Selling on an external platform',
  invite_only: 'Invite only',
}

const DELIVERY_LABELS = {
  rsvp_required: 'comps require RSVP',
  auto_send: 'comps auto-send',
}

export default function OverviewTab({ onToast, eventId, event, onNavigate }) {
  const [settings, setSettings] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [ticketTypes, setTicketTypes] = useState(null)
  const [guests, setGuests] = useState(null)
  const [guestTypes, setGuestTypes] = useState(null)
  const [orders, setOrders] = useState(null)

  useEffect(() => {
    api.getEventSettings(eventId).then(setSettings).catch((e) => onToast(e.message, true))
    api
      .getEventProfile(eventId)
      .then((p) => {
        setProfile(p)
        setProfileLoaded(true)
      })
      .catch((e) => onToast(e.message, true))
    api.listTicketTypes(eventId).then(setTicketTypes).catch((e) => onToast(e.message, true))
    api.listGuests(eventId).then(setGuests).catch((e) => onToast(e.message, true))
    api.listGuestTypes(eventId).then(setGuestTypes).catch((e) => onToast(e.message, true))
    api.listOrders(eventId).then(setOrders).catch((e) => onToast(e.message, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!settings || !profileLoaded || ticketTypes === null || guests === null || guestTypes === null || orders === null)
    return null

  const mode = settings.ticketing_mode

  // ---------- Stats ----------
  const paidOrders = orders.filter((o) => o.status === 'paid')
  const ticketsSold = ticketTypes.reduce((sum, t) => sum + (t.sold || 0), 0)
  const grossCents = paidOrders.reduce((sum, o) => sum + ((o.subtotal_cents ?? o.total_cents ?? 0) - (o.discount_cents || 0)), 0)
  const invitees = guests.filter((g) => !g.distributed_by_guest_id) // direct invites, not delegated recipients
  const rsvpYes = invitees.filter((g) => g.rsvp_confirmed === 'yes').length

  const stats = []
  if (mode === 'native') {
    stats.push({ label: 'Tickets sold', value: String(ticketsSold) })
    stats.push({ label: 'Gross sales', value: `$${centsToDollars(grossCents)}` })
  }
  stats.push({ label: 'RSVPs confirmed', value: `${rsvpYes} / ${invitees.length}` })
  if (mode !== 'native') {
    stats.push({ label: 'Guest types', value: String(guestTypes.length) })
  }

  // ---------- Adaptive checklist ----------
  const items = []
  const add = (done, label, tab, optional = false) => items.push({ done, label, tab, optional })

  add(true, `Ticketing mode chosen — ${MODE_LABELS[mode].toLowerCase()}`, 'settings')

  if (mode === 'native') {
    add(
      ticketTypes.length > 0,
      ticketTypes.length > 0
        ? `${ticketTypes.length} ticket type${ticketTypes.length === 1 ? '' : 's'} created`
        : 'Create your ticket types',
      'tickets'
    )
    add(Boolean(profile?.refund_policy), profile?.refund_policy ? 'Refund policy set' : 'Set your refund policy', 'settings')
  }

  if (mode === 'external') {
    add(
      Boolean(profile?.external_ticket_url),
      profile?.external_ticket_url ? 'External ticket link set' : 'Add your external ticket link',
      'home'
    )
  }

  if (mode === 'invite_only' || mode === 'external') {
    add(
      guestTypes.length > 0,
      guestTypes.length > 0 ? `${guestTypes.length} guest type${guestTypes.length === 1 ? '' : 's'} defined` : 'Define your guest types',
      'workspace'
    )
    add(invitees.length > 0, invitees.length > 0 ? `${invitees.length} guests on the list` : 'Add guests to the list', 'guests')
  }

  const pageDesigned = Boolean(profile && (profile.description || profile.banner_photo_url || profile.about_us))
  add(pageDesigned, pageDesigned ? 'Event page designed' : 'Design your event page', 'home')
  add(Boolean(profile?.venue_map_url), profile?.venue_map_url ? 'Venue map uploaded' : 'Upload a venue map', 'settings', true)
  add(Boolean(profile?.is_published), profile?.is_published ? 'Event page published' : 'Publish your event page', 'home')

  const remaining = items.filter((i) => !i.done && !i.optional).length

  const profileLine = [
    MODE_LABELS[mode],
    DELIVERY_LABELS[settings.comp_delivery],
    settings.sales_source === 'csv' ? 'sales via CSV import' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="page-title">{event.name}</div>
          <p className="page-subtitle" style={{ marginBottom: 6 }}>{profileLine}</p>
        </div>
        <span className={`pill pill-${profile?.is_published ? 'confirmed' : 'pending'}`} style={{ whiteSpace: 'nowrap' }}>
          {profile?.is_published ? 'Published' : 'Draft — not published'}
        </span>
      </div>

      {profile?.is_published && profile?.slug && (
        <p style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          <a href={`/e/${profile.slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-dark)' }}>
            View public page ↗
          </a>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} className="panel" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title">
          Setup checklist
          {remaining > 0 && (
            <span style={{ fontWeight: 400, fontSize: 12.5, color: 'var(--text-muted)', marginLeft: 8 }}>
              {remaining} to go
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate && onNavigate(item.tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 4px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: 13.5,
                color: item.done ? 'var(--text-muted)' : 'var(--text)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  background: item.done ? 'var(--accent-dark)' : 'transparent',
                  color: item.done ? 'var(--bg)' : 'var(--text-muted)',
                  border: item.done ? 'none' : '1.5px solid var(--border)',
                }}
              >
                {item.done ? '✓' : ''}
              </span>
              <span style={{ flex: 1 }}>
                {item.label}
                {item.optional && !item.done && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> — optional</span>
                )}
              </span>
              {!item.done && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Go →</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}