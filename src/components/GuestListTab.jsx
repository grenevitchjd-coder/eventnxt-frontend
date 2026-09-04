// eventnxt-frontend: src/components/GuestListTab.jsx
//
// Guest list — the guest-OPERATIONS page: the one surface a
// limited-access staffer needs on show night. Every ticket-receiving
// person (invitees AND allotment recipients — never the allotment
// entities themselves), with: who sent them (source), an EDITABLE
// status, and their tickets behind a link that opens the organizer-side
// view — a QR per code, seat and day, checked-in state, and a Check in
// button per code (camera scanning lives on the Check-in tab). Removing
// a confirmed guest cancels their codes and emails them a notice with
// an optional note.
import { Fragment, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api'

// One code's QR, rendered client-side — same content the door camera
// reads off the guest's own PDF, so scanning THIS screen works too
// when someone never got their email.
function TicketQR({ code }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(code, { margin: 1, scale: 4 })
      .then((url) => alive && setSrc(url))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [code])
  return src ? <img src={src} alt={`QR for ${code}`} width={92} height={92} /> : <div style={{ width: 92, height: 92 }} />
}

export default function GuestListTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [roster, setRoster] = useState(null)
  const [fullGuests, setFullGuests] = useState([])
  const [guestTypes, setGuestTypes] = useState([])
  const [search, setSearch] = useState('')
  const [dayFilter, setDayFilter] = useState('')
  const [openTicketsId, setOpenTicketsId] = useState(null)
  const [busyCode, setBusyCode] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = async (evId) => {
    try {
      const [r, gt, full] = await Promise.all([api.getDoorRoster(evId), api.listGuestTypes(evId), api.listGuests(evId)])
      setRoster(r)
      setGuestTypes(gt)
      setFullGuests(full)
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

  // Allotment HOLDERS (sponsor entities) never appear here — only
  // ticket-receiving people. A holder is anyone some row points at via
  // allocated_by, plus any explicit distributor from the full list.
  const holderIds = new Set([
    ...(roster || []).map((g) => g.allocated_by_guest_id).filter(Boolean),
    ...fullGuests.filter((g) => (g.effective_mode || 'invite') === 'distribute' && !g.allocated_by_guest_id).map((g) => g.id),
  ])

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

  // ---------- Editable status ----------
  // The roster row is a summary; the FULL guest object (from /guests)
  // supplies every field updateGuest requires, so a status flip here
  // behaves exactly like one made on Invites (confirming mints, etc.).
  const setStatus = async (g, status) => {
    const full = fullGuests.find((x) => x.id === g.id)
    if (!full) {
      onToast('Refresh and try again — guest details not loaded.', true)
      return
    }
    setBusyId(g.id)
    try {
      await api.updateGuest(loadedEventId, g.id, {
        name: full.name,
        email: full.email,
        guest_type_id: full.guest_type_id,
        seating_category_id: full.seating_category_id || null,
        section_label: full.section_label || null,
        visit_date: full.visit_date || null,
        allocation_status: status,
        party_size: full.party_size || 1,
        perks: full.perks || null,
        comments: full.comments || null,
        guest_mode: full.guest_mode ?? null,
        hold_timing: full.hold_timing || 'now',
        spend_total: full.spend_total ?? null,
        cohort_together: full.cohort_together,
      })
      onToast(`${g.name}: ${status}${status === 'confirmed' ? ' — tickets mint and email now' : ''}`)
      load(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
      load(loadedEventId)
    } finally {
      setBusyId(null)
    }
  }

  // ---------- Check-in ----------
  // Same contract as the scanner: we send the DOOR'S local date, and
  // the server decides — a Friday code on Thursday comes back
  // wrong_day and is NOT consumed.
  const checkIn = async (g, t) => {
    setBusyCode(t.code)
    const localDay = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    try {
      const res = await api.checkInTicket(loadedEventId, t.code, localDay)
      if (res.result === 'admitted') onToast(`${g.name} checked in — ${t.code}`)
      else if (res.result === 'already_checked_in') onToast(`${t.code} was already checked in`, true)
      else if (res.result === 'wrong_day') onToast(`${t.code} is for ${fmtDay(t.valid_date)} — not admitted today`, true)
      else if (res.result === 'refunded') onToast(`${t.code} is cancelled — do not admit`, true)
      else onToast(`${t.code}: ${res.result}`, true)
      load(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyCode(null)
    }
  }

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

  const resendTickets = async (g) => {
    setBusyId(g.id)
    try {
      await api.syncGuestTickets(loadedEventId, g.id, { resend: true })
      onToast(`Tickets re-sent to ${g.name}`)
      load(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  if (!loadedEventId || roster === null) return null

  return (
    <>
      <div className="page-title">Guest list</div>
      <p className="page-subtitle">
        Everyone actually receiving tickets — invitees and allotment recipients (allotment entities live
        on Allotments). Change a status, open someone&apos;s tickets to check codes in or show a
        scannable QR when their email never arrived, re-send their tickets, or remove them — removing a
        confirmed guest cancels their codes and emails them a notice with your optional note. Camera
        scanning lives on the Check-in page; every code here can also be checked in with one click.
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
            <th>Guest type</th>
            <th title="Who this guest came from — your organization directly, or an allotment holder">Source</th>
            <th>Status</th>
            <th title="Their admission codes — click to open QRs and check-in">Tickets</th>
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
            visible.map((g) => {
              const tix = g.tickets || []
              const redeemed = tix.filter((t) => t.checked_in_at).length
              return (
                <Fragment key={g.id}>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {g.email}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{typeName(g.guest_type_id)}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {g.allocated_by_guest_id ? nameById(g.allocated_by_guest_id) || 'Allotment' : 'Org'}
                    </td>
                    <td>
                      <select
                        style={{ fontSize: 12.5, padding: '4px 6px' }}
                        disabled={busyId === g.id}
                        value={g.allocation_status}
                        onChange={(e) => setStatus(g, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="declined">Declined</option>
                      </select>
                      {g.rsvp_confirmed && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>RSVP: {g.rsvp_confirmed}</div>
                      )}
                      {g.tickets_sent_at && (
                        <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>tickets sent ✓</div>
                      )}
                    </td>
                    <td>
                      {tix.length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {g.visit_date ? `${fmtDay(g.visit_date)} — ` : ''}no codes minted
                        </span>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setOpenTicketsId(openTicketsId === g.id ? null : g.id)}
                          title="Open this guest's codes: QR, seat, day, and one-click check-in"
                        >
                          {tix.length} ticket{tix.length === 1 ? '' : 's'}
                          {redeemed > 0 ? ` · ${redeemed} in` : ''}
                        </button>
                      )}
                    </td>
                    <td className="actions-cell">
                      {tix.length > 0 && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === g.id}
                          title="Email this guest their codes and per-day PDFs again"
                          onClick={() => resendTickets(g)}
                        >
                          Re-send
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => removeGuest(g)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {openTicketsId === g.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--surface-alt)' }}>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 4px' }}>
                          {tix.map((t) => (
                            <div
                              key={t.code}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: 10,
                                minWidth: 210,
                                background: 'var(--surface)',
                                opacity: t.status === 'refunded' ? 0.55 : 1,
                              }}
                            >
                              <div style={{ display: 'flex', gap: 10 }}>
                                <TicketQR code={t.code} />
                                <div style={{ fontSize: 12 }}>
                                  <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{t.code}</div>
                                  {t.valid_date && <div style={{ color: 'var(--text-muted)' }}>{fmtDay(t.valid_date)}</div>}
                                  <div style={{ color: 'var(--text-muted)' }}>{t.seat_label || 'General admission'}</div>
                                  {t.checked_in_at ? (
                                    <div style={{ color: 'var(--success)', fontWeight: 600, marginTop: 4 }}>✓ checked in</div>
                                  ) : t.status === 'refunded' ? (
                                    <div className="pill pill-declined" style={{ marginTop: 4 }}>do not admit</div>
                                  ) : (
                                    <button
                                      className="btn btn-primary btn-sm"
                                      style={{ marginTop: 6 }}
                                      disabled={busyCode === t.code}
                                      onClick={() => checkIn(g, t)}
                                    >
                                      {busyCode === t.code ? 'Checking…' : 'Check in'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </>
  )
}