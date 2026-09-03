// eventnxt-frontend: src/components/AllotmentsTab.jsx
//
// Allotments — the second of the two ticket-offering surfaces. An
// allotment belongs to an ENTITY (sponsor, model agency, volunteer
// coordinator): a per-day budget of tickets that are theirs to hand
// out. The entity gets the distribution portal (their RSVP link),
// types in names/emails/days against a live remaining counter, and
// each recipient becomes a guest row nested under them here, with
// their own confirm link and answer. Placement is automatic (cohort
// rules — same-allocation same-day recipients sit together unless
// spread); hand-assigning individual seats is deliberately not a
// thing on this page.
//
// Direct invites (celebrities, press — people who answer for
// themselves) live on the Invites page; the flat door roster is the
// Guest list page.
import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'

const rsvpUrl = (token) => `${window.location.origin}/rsvp/${token}`

const EMPTY_FORM = {
  name: '',
  email: '',
  guest_type_id: '',
  cohort_together: true,
}

export default function AllotmentsTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [guests, setGuests] = useState(null)
  const [guestTypes, setGuestTypes] = useState([])
  const [settings, setSettings] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [budgetRows, setBudgetRows] = useState([]) // [{date, quantity}] — date '' = whole event
  const [budgetDraft, setBudgetDraft] = useState({ date: '', quantity: '' })
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadEventData = async (evId) => {
    try {
      const [g, gt, st] = await Promise.all([
        api.listGuests(evId),
        api.listGuestTypes(evId),
        api.getEventSettings(evId),
      ])
      setGuests(g)
      setGuestTypes(gt)
      setSettings(st)
      setLoadedEventId(evId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  useEffect(() => {
    if (eventId) loadEventData(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const externalTicketing = !!settings && settings.ticketing_mode !== 'native'

  const eventDays = (() => {
    if (!settings || !settings.first_day || !settings.last_day) return []
    if (!['per_day', 'mixed', 'multi_day'].includes(settings.ticket_span)) return []
    const out = []
    const d = new Date(settings.first_day + 'T12:00:00')
    const last = new Date(settings.last_day + 'T12:00:00')
    while (d <= last && out.length < 60) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      d.setDate(d.getDate() + 1)
    }
    return out
  })()
  const fmtDay = (iso) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'Any day'

  const distributors = (guests || []).filter(
    (g) => !g.allocated_by_guest_id && (g.effective_mode || 'invite') === 'distribute'
  )
  const recipientsOf = (id) => (guests || []).filter((g) => g.allocated_by_guest_id === id)
  const typeName = (id) => (guestTypes.find((t) => t.id === id) || {}).name || '—'

  // ---------- Create an allotment ----------

  const addBudgetRow = () => {
    const qty = parseInt(budgetDraft.quantity, 10)
    if (!qty || qty < 1) return
    setBudgetRows((prev) => [
      ...prev.filter((r) => r.date !== budgetDraft.date),
      { date: budgetDraft.date, quantity: qty },
    ])
    setBudgetDraft({ date: '', quantity: '' })
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (budgetRows.length === 0) {
      onToast('Give the allotment a ticket budget first (add at least one row).', true)
      return
    }
    setCreating(true)
    try {
      const created = await api.createGuest(loadedEventId, {
        name: form.name.trim(),
        email: form.email.trim(),
        guest_type_id: form.guest_type_id || (guestTypes[0] || {}).id,
        allocation_status: 'confirmed',
        party_size: 1,
        perks: null,
        comments: null,
        guest_mode: 'distribute',
        cohort_together: form.cohort_together,
        ticket_allotment: budgetRows.map((r) => ({ date: r.date || null, quantity: r.quantity })),
      })
      onToast(`Allotment created for ${created.name} — send them their portal link so they can hand tickets out`)
      setForm(EMPTY_FORM)
      setBudgetRows([])
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreating(false)
    }
  }

  // ---------- Row actions ----------

  const copyPortalLink = async (g) => {
    try {
      await navigator.clipboard.writeText(rsvpUrl(g.rsvp_token))
      onToast('Portal link copied')
    } catch {
      onToast(rsvpUrl(g.rsvp_token))
    }
  }

  const toggleLinkSent = async (g) => {
    setBusyId(g.id)
    try {
      await api.setGuestSentStatus(loadedEventId, g.id, !g.link_sent_at)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const toggleRecipientTicketsSent = async (g) => {
    setBusyId(g.id)
    try {
      await api.setGuestSentStatus(loadedEventId, g.id, !g.tickets_sent_at, 'tickets')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const toggleCohort = async (g) => {
    setBusyId(g.id)
    try {
      await api.updateGuest(loadedEventId, g.id, {
        name: g.name,
        email: g.email,
        guest_type_id: g.guest_type_id,
        seating_category_id: g.seating_category_id || null,
        section_label: g.section_label || null,
        visit_date: g.visit_date || null,
        allocation_status: g.allocation_status,
        party_size: g.party_size || 1,
        perks: g.perks || null,
        comments: g.comments || null,
        guest_mode: g.guest_mode ?? null,
        hold_timing: g.hold_timing || 'now',
        cohort_together: !(g.cohort_together !== false),
      })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const removeRecipient = async (g) => {
    if (!window.confirm(`Remove ${g.name}? Their budget goes back to the allotment.`)) return
    setBusyId(g.id)
    try {
      await api.deleteGuest(loadedEventId, g.id)
      onToast(`${g.name} removed — budget freed`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const deleteAllotment = async (g) => {
    const kids = recipientsOf(g.id)
    if (kids.length > 0) {
      onToast(`"${g.name}" has ${kids.length} recipient${kids.length === 1 ? '' : 's'} — remove them first.`, true)
      return
    }
    if (!window.confirm(`Delete the "${g.name}" allotment?`)) return
    setBusyId(g.id)
    try {
      await api.deleteGuest(loadedEventId, g.id)
      onToast('Allotment deleted')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  if (!loadedEventId || guests === null) return null

  return (
    <>
      <div className="page-title">Allotments</div>
      <p className="page-subtitle">
        Ticket budgets that belong to an entity — sponsors, model agencies, volunteer coordinators —
        who hand them out to their own people through their portal link. Recipients appear nested
        under each allotment as they&apos;re entered
        {externalTicketing
          ? '. This event sells externally: check availability on Tickets & seating, order the real tickets on your platform, and mark each recipient below once sent.'
          : ', with tickets minted and placed automatically (same-day recipients from one allotment seat together unless set to spread).'}
        {' '}Direct invites live on the Invites page.
      </p>

      <div className="panel">
        <div className="panel-title">Create an allotment</div>
        <form onSubmit={handleCreate}>
          <div className="inline-form">
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="al-name">Entity / contact name</label>
              <input id="al-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="al-email">Email (gets the portal link)</label>
              <input id="al-email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="al-type">Guest type</label>
              <select id="al-type" value={form.guest_type_id} onChange={(e) => setForm({ ...form, guest_type_id: e.target.value })}>
                {guestTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="al-cohort" title="Recipients from this allotment on the same day: one section side by side, or spread individually">
                Seat recipients
              </label>
              <select
                id="al-cohort"
                value={form.cohort_together ? 'together' : 'spread'}
                onChange={(e) => setForm({ ...form, cohort_together: e.target.value === 'together' })}
              >
                <option value="together">Together (same section)</option>
                <option value="spread">Spread individually</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Ticket budget — how many they can hand out{eventDays.length > 0 ? ', per day' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {eventDays.length > 0 ? (
                <div className="field" style={{ width: 180 }}>
                  <label>Day</label>
                  <select value={budgetDraft.date} onChange={(e) => setBudgetDraft({ ...budgetDraft, date: e.target.value })}>
                    <option value="">Any day</option>
                    {eventDays.map((d) => (
                      <option key={d} value={d}>
                        {fmtDay(d)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field" style={{ width: 110 }}>
                <label>Tickets</label>
                <input
                  type="number"
                  min={1}
                  value={budgetDraft.quantity}
                  onChange={(e) => setBudgetDraft({ ...budgetDraft, quantity: e.target.value })}
                />
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addBudgetRow} style={{ marginBottom: 10 }}>
                Add to budget
              </button>
              {budgetRows.map((r) => (
                <span key={r.date || 'any'} className="pill pill-pending" style={{ marginBottom: 12 }}>
                  {fmtDay(r.date)} × {r.quantity}
                  <button
                    type="button"
                    aria-label="remove"
                    onClick={() => setBudgetRows((prev) => prev.filter((x) => x.date !== r.date))}
                    style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <button className="btn btn-secondary" type="submit" disabled={creating || guestTypes.length === 0} style={{ marginTop: 10 }}>
            Create allotment
          </button>
          {guestTypes.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>
              Create a guest type first (Guest types page).
            </span>
          )}
        </form>
      </div>

      <table className="data-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Allotment</th>
            <th>Budget</th>
            <th>Given out</th>
            <th>Portal link</th>
            <th>Placement</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {distributors.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">
                No allotments yet — create one above. Sponsors and agencies hand their own tickets out;
                you just set the budget.
              </td>
            </tr>
          ) : (
            distributors.map((g) => {
              const kids = recipientsOf(g.id)
              return (
                <Fragment key={g.id}>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {typeName(g.guest_type_id)} · <span className="mono">{g.email}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {(g.ticket_allotment || []).length === 0
                        ? '—'
                        : g.ticket_allotment.map((r) => (
                            <div key={r.date || 'any'}>
                              {fmtDay(r.date)} × {r.quantity}
                            </div>
                          ))}
                    </td>
                    <td className="mono">
                      {g.allotment_distributed} / {g.allotment_total}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => copyPortalLink(g)}>
                          Copy link
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === g.id}
                          onClick={() => toggleLinkSent(g)}
                          style={g.link_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                        >
                          {g.link_sent_at ? '✓ Link sent' : 'Link not sent'}
                        </button>
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === g.id}
                        title="Recipients from this allotment on the same day: one section side by side, or spread individually"
                        onClick={() => toggleCohort(g)}
                      >
                        {g.cohort_together !== false ? 'Together' : 'Spread'}
                      </button>
                    </td>
                    <td className="actions-cell">
                      <button className="btn btn-secondary btn-sm" onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}>
                        {expandedId === g.id ? 'Hide' : `Recipients (${kids.length})`}
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={busyId === g.id} onClick={() => deleteAllotment(g)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expandedId === g.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--surface-alt)' }}>
                        {kids.length === 0 ? (
                          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0' }}>
                            No recipients yet — they appear here the moment {g.name} enters them in the
                            portal. Each gets their own confirm link by email automatically.
                          </p>
                        ) : (
                          <table className="data-table" style={{ margin: '6px 0' }}>
                            <thead>
                              <tr>
                                <th>Recipient</th>
                                <th>Day</th>
                                <th>Tickets</th>
                                <th>Answer</th>
                                {externalTicketing && <th>Tickets sent</th>}
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {kids.map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    {r.name}
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }} className="mono">
                                      {r.email}
                                    </div>
                                  </td>
                                  <td>{r.visit_date ? fmtDay(r.visit_date) : 'Any day'}</td>
                                  <td className="mono">
                                    {r.party_size}
                                    {r.ticket_count > 0 && (
                                      <span style={{ color: 'var(--text-muted)' }}> · {r.ticket_count} minted</span>
                                    )}
                                  </td>
                                  <td>
                                    <span
                                      className={`pill pill-${
                                        r.rsvp_confirmed === 'yes' ? 'confirmed' : r.rsvp_confirmed === 'no' ? 'declined' : 'pending'
                                      }`}
                                    >
                                      {r.rsvp_confirmed || 'no answer yet'}
                                    </span>
                                  </td>
                                  {externalTicketing && (
                                    <td>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        disabled={busyId === r.id}
                                        onClick={() => toggleRecipientTicketsSent(r)}
                                        style={r.tickets_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                                      >
                                        {r.tickets_sent_at ? '✓ Sent' : 'Not sent'}
                                      </button>
                                    </td>
                                  )}
                                  <td className="actions-cell">
                                    {r.rsvp_confirmed !== 'yes' ? (
                                      <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => removeRecipient(r)}>
                                        Remove
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>confirmed</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
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