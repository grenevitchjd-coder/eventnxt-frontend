// eventnxt-frontend: src/components/GuestListTab.jsx
//
// Guest list — the DOOR ROSTER. One flat, searchable reference of every
// guest (direct invitees AND allotment recipients) with their admission
// codes, days, statuses, and seats, for the person at the door when
// someone shows up saying "I never got my email." Look them up by name,
// confirm what they're owed, and punch a code into manual check-in.
// Deliberately read-only: fixing a guest happens on Invites or
// Allotments.
import { useEffect, useState } from 'react'
import { api } from '../api'

export default function GuestListTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [roster, setRoster] = useState(null)
  const [guestTypes, setGuestTypes] = useState([])
  const [search, setSearch] = useState('')
  const [dayFilter, setDayFilter] = useState('')

  const removeGuest = async (g) => {
    const note = window.prompt(
      `Remove ${g.name}? Their codes stop admitting${g.allocation_status === 'confirmed' ? ' and they get a cancellation email' : ''}.\n\nOptional note to include (leave blank for none):`
    )
    if (note === null) return // cancelled the prompt
    try {
      await api.removeGuestWithNotice(loadedEventId, g.id, note.trim() || null)
      onToast(`${g.name} removed${g.allocation_status === 'confirmed' ? ' — cancellation email sent' : ''}`)
      load(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const load = async (evId) => {
    try {
      const [r, gt] = await Promise.all([api.getDoorRoster(evId), api.listGuestTypes(evId)])
      setRoster(r)
      setGuestTypes(gt)
      setLoadedEventId(evId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  useEffect(() => {
    if (eventId) load(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const typeName = (id) => (guestTypes.find((t) => t.id === id) || {}).name || '—'
  const fmtDay = (iso) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : null

  const dayOptions = roster
    ? [...new Set(roster.flatMap((g) => [g.visit_date, ...(g.tickets || []).map((t) => t.valid_date)]).filter(Boolean))].sort()
    : []

  // Allotment HOLDERS (sponsor entities) aren't guests at the door —
  // only ticket-receiving people appear here. A holder is anyone some
  // other row points at via allocated_by, plus known distributor rows
  // are excluded server-side by having no admission of their own; the
  // reliable client-side signal is: someone lists them as source.
  const holderIds = new Set((roster || []).map((g) => g.allocated_by_guest_id).filter(Boolean))

  const visible = (roster || []).filter((g) => {
    if (holderIds.has(g.id)) return false
    if (dayFilter && g.visit_date !== dayFilter && !(g.tickets || []).some((t) => t.valid_date === dayFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!g.name.toLowerCase().includes(q) && !g.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  const nameById = (id) => (roster || []).find((x) => x.id === id)?.name

  if (!loadedEventId || roster === null) return null

  return (
    <>
      <div className="page-title">Guest list</div>
      <p className="page-subtitle">
        Everyone actually receiving tickets — invitees and allotment recipients (the allotment entities
        themselves live on Allotments). Look someone up, confirm their codes, or remove a guest —
        removing a confirmed guest cancels their codes and emails them a notice with your optional
        note. For grants, seats, and RSVP details, use the Invites or Allotments page.
      </p>

      <div className="inline-form" style={{ marginBottom: 14 }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="roster-search">Search name or email</label>
          <input
            id="roster-search"
            placeholder="Start typing…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        {dayOptions.length > 0 && (
          <div className="field">
            <label htmlFor="roster-day">Day</label>
            <select id="roster-day" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
              <option value="">All days</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-end', marginBottom: 10 }} onClick={() => load(loadedEventId)}>
          Refresh
        </button>
      </div>

      <table className="data-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type / source</th>
            <th>Status</th>
            <th>Party</th>
            <th>Tickets</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">
                {roster.length === 0 ? 'No guests yet.' : 'No one matches — check the spelling or clear the day filter.'}
              </td>
            </tr>
          ) : (
            visible.map((g) => (
              <tr key={g.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {g.email}
                  </div>
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {typeName(g.guest_type_id)}
                  {g.allocated_by_guest_id && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      via {nameById(g.allocated_by_guest_id) || 'an allotment'}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`pill pill-${g.allocation_status}`}>{g.allocation_status}</span>
                  {g.rsvp_confirmed && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      RSVP: {g.rsvp_confirmed}
                    </div>
                  )}
                  {g.tickets_sent_at && (
                    <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>tickets sent ✓</div>
                  )}
                </td>
                <td className="mono">{g.party_size}</td>
                <td>
                  {(g.tickets || []).length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {g.visit_date ? `${fmtDay(g.visit_date)} — ` : ''}no codes minted
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {g.tickets.map((t) => (
                        <div key={t.code} style={{ fontSize: 12 }}>
                          <span className="mono" style={{ fontWeight: 600 }}>{t.code}</span>
                          {t.valid_date && <span style={{ color: 'var(--text-muted)' }}> · {fmtDay(t.valid_date)}</span>}
                          {t.seat_label && <span style={{ color: 'var(--text-muted)' }}> · {t.seat_label}</span>}
                          {t.status !== 'valid' && (
                            <span className="pill pill-declined" style={{ marginLeft: 6, fontSize: 10 }}>
                              {t.status === 'refunded' ? 'do not admit' : t.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="actions-cell">
                  <button className="btn btn-danger btn-sm" onClick={() => removeGuest(g)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  )
}