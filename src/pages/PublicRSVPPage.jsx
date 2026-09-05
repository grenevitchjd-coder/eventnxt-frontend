// eventnxt-frontend: src/pages/PublicRSVPPage.jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

function formatDate(iso) {
  if (!iso) return iso
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

const emptyRecipient = () => ({ name: '', email: '', visit_date: '', party_size: 1 })

export default function PublicRSVPPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [recipients, setRecipients] = useState([emptyRecipient()])
  const [selectedDay, setSelectedDay] = useState('')
  const [requestForm, setRequestForm] = useState({ quantity: 1, note: '', date: '' })
  const [requestOpen, setRequestOpen] = useState(false)
  const [dayQty, setDayQty] = useState({}) // {date: n} — the acceptance grid

  const load = () => {
    fetch(`${API_URL}/public/rsvp/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then(setInfo)
      .catch(() => setError(true))
  }

  useEffect(load, [token])

  useEffect(() => {
    if (info && info.day_grants && Object.keys(dayQty).length === 0) {
      const seed = {}
      for (const g of info.day_grants) seed[g.date] = chooser(info) ? 0 : g.quantity
      setDayQty(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  const gridActive = Boolean(info?.day_grants?.length)
  const gridTotal = Object.values(dayQty).reduce((a, b) => a + (Number(b) || 0), 0)
  // Choose-within-caps is data now (0039): the server says when the
  // guest's total is under the sum of their day grants. Legacy 'select'
  // payloads without the flag keep working via the fallback.
  const chooser = (i) => (i ? (i.choose_within_caps ?? i.effective_mode === 'select') : false)
  const selectBudget = chooser(info) ? info?.spend_total ?? info?.party_size ?? 1 : null

  const handleRespond = async (attending) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/public/rsvp/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          attending && gridActive
            ? { attending, day_quantities: Object.fromEntries(Object.entries(dayQty).map(([d, q]) => [d, Number(q) || 0])) }
            : attending && chooser(info) && selectedDay
              ? { attending, visit_date: selectedDay }
              : { attending }
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong')
      setInfo(data)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestTickets = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/public/rsvp/${token}/request-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: Number(requestForm.quantity) || 1,
          note: requestForm.note || null,
          date: requestForm.date || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong')
      setInfo(data)
      setRequestOpen(false)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const updateRecipient = (i, changes) => {
    setRecipients((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...changes } : r)))
  }

  const addRecipientRow = () => setRecipients((prev) => [...prev, emptyRecipient()])
  const removeRecipientRow = (i) => setRecipients((prev) => prev.filter((_, idx) => idx !== i))

  // Per-day totals — each day is checked against its OWN remaining count,
  // never a combined number, since the pools genuinely don't share capacity.
  const requestedByDay = {}
  for (const r of recipients) {
    if (!r.visit_date) continue
    requestedByDay[r.visit_date] = (requestedByDay[r.visit_date] || 0) + (Number(r.party_size) || 0)
  }
  const dayOverLimit = (date) => {
    const day = info?.day_allotments?.find((d) => d.date === date)
    return day ? requestedByDay[date] > day.remaining : false
  }
  const anyDayOverLimit = Object.keys(requestedByDay).some(dayOverLimit)
  const hasCompleteRow = recipients.some((r) => r.name && r.email && r.visit_date)

  const handleDistribute = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        recipients: recipients
          .filter((r) => r.name && r.email && r.visit_date)
          .map((r) => ({ ...r, party_size: Number(r.party_size) || 1 })),
      }
      const res = await fetch(`${API_URL}/public/rsvp/${token}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong')
      setInfo(data)
      setRecipients([emptyRecipient()])
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRedeem = async (promoCodeId, tierId, choice) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/public/rsvp/${token}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promo_code_id: promoCodeId, redemption_tier_id: tierId, choice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong')
      setInfo(data)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const renderReferralCodes = (codes) => {
    if (!codes || codes.length === 0) return null
    return (
      <div className="panel" style={{ textAlign: 'left', marginTop: 20 }}>
        <div className="panel-title">Your referral rewards</div>
        {codes.map((c) => (
          <div key={c.promo_code_id} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 8px' }}>
              Code <strong className="mono">{c.code}</strong>
              {c.reward_type === 'points' && (
                <span> — {c.points_available ?? 0} point{c.points_available === 1 ? '' : 's'} available</span>
              )}
            </p>

            {c.eligible_tiers?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {c.eligible_tiers.map((t) => (
                  <div
                    key={t.redemption_tier_id}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
                  >
                    <span style={{ fontSize: 13.5, width: 110 }}>
                      {t.points_required} pts{t.label ? ` (${t.label})` : ''}
                    </span>
                    {t.cash_value != null && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={submitting || !t.affordable}
                        onClick={() => handleRedeem(c.promo_code_id, t.redemption_tier_id, 'cash')}
                      >
                        Redeem for ${t.cash_value}
                      </button>
                    )}
                    {t.ticket_value != null && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={submitting || !t.affordable}
                        onClick={() => handleRedeem(c.promo_code_id, t.redemption_tier_id, 'ticket')}
                      >
                        Redeem for {t.ticket_value} ticket{t.ticket_value === 1 ? '' : 's'}
                      </button>
                    )}
                    {!t.affordable && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>not enough points yet</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {c.redemption_history?.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Redeemed</th>
                    <th>Points spent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.redemption_history.map((h, i) => (
                    <tr key={i}>
                      <td>
                        {h.choice === 'cash' ? `$${h.cash_value} cash` : `${h.ticket_value} ticket(s)`}
                      </td>
                      <td className="mono">{h.points_spent}</td>
                      <td>
                        {h.choice === 'cash' ? (
                          <span className={`pill pill-${h.payout_status === 'paid' ? 'confirmed' : 'pending'}`}>
                            {h.payout_status}
                          </span>
                        ) : (
                          <span className="pill pill-confirmed">fulfilled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="public-event-page">
        <div className="public-event-notfound">
          <p className="login-eyebrow">EventNXT</p>
          <h1 className="login-title">This link isn't valid</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Double check the link, or reach out to whoever sent it to you.
          </p>
        </div>
      </div>
    )
  }

  if (info === undefined) return null

  // ---------- Simple confirm/decline (ordinary guest or a delegated recipient) ----------
  if (!info.is_allotment_holder) {
    return (
      <div className="public-event-page">
        <div className="public-event-content">
          <p className="login-eyebrow">You're invited</p>
          <h1 className="login-title">Hi {info.guest_name}</h1>
          {info.visit_date && (
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
              Your ticket is for {formatDate(info.visit_date)}.
            </p>
          )}

          {info.needs_seating && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <p style={{ margin: 0 }}>
                ✓ You&apos;re confirmed — your ticket will arrive once seating is finalized. Nothing more
                to do on your end.
              </p>
            </div>
          )}
          {!info.needs_seating && info.allocation_status === 'confirmed' && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <p style={{ margin: 0 }}>✓ You&apos;re confirmed. See you there!</p>
            </div>
          )}
          {info.allocation_status === 'declined' && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <p style={{ margin: 0 }}>You've let us know you can't make it.</p>
            </div>
          )}
          {info.allocation_status === 'pending' && !info.needs_seating && gridActive && (
            <div className="panel" style={{ textAlign: 'left', marginBottom: 16 }}>
              <p style={{ marginTop: 0, marginBottom: 4, fontWeight: 600 }}>
                {chooser(info)
                  ? `You have ${selectBudget} ticket${selectBudget === 1 ? '' : 's'} — place them on the days you want`
                  : 'Your tickets, day by day'}
              </p>
              <p style={{ marginTop: 0, marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                {chooser(info)
                  ? 'Any combination works, up to your total.'
                  : 'Take them all, or turn any day down — need extras? Ask below.'}
              </p>
              {(info.day_grants || []).map((g) => (
                <div key={g.date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                  <span style={{ flex: 1 }}>{formatDate(g.date)}</span>
                  <input
                    type="number"
                    min={0}
                    max={g.quantity}
                    style={{ width: 64, textAlign: 'center' }}
                    aria-label={`Tickets for ${g.date}`}
                    value={dayQty[g.date] ?? 0}
                    onChange={(e) => setDayQty({ ...dayQty, [g.date]: e.target.value })}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 46 }}>of {g.quantity}</span>
                </div>
              ))}
              {chooser(info) && (
                <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: gridTotal > selectBudget ? 700 : 400, color: gridTotal > selectBudget ? '#A33' : 'var(--text-muted)' }}>
                  {gridTotal} of {selectBudget} placed
                </p>
              )}
              {!chooser(info) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    const all = {}
                    for (const g of info.day_grants) all[g.date] = g.quantity
                    setDayQty(all)
                  }}
                >
                  Take all my tickets
                </button>
              )}
            </div>
          )}
          {info.allocation_status === 'pending' && !info.needs_seating && !gridActive && chooser(info) && (info.available_days || []).length > 0 && (
            <div className="panel" style={{ textAlign: 'left', marginBottom: 16 }}>
              <p style={{ marginTop: 0, marginBottom: 10, fontWeight: 600 }}>Which day works for you?</p>
              {(info.available_days || []).map((d) => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                  <input type="radio" name="pick-day" checked={selectedDay === d} onChange={() => setSelectedDay(d)} />
                  {formatDate(d)}
                </label>
              ))}
            </div>
          )}
          {info.allocation_status === 'pending' && !info.needs_seating && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                disabled={
                  submitting ||
                  (gridActive
                    ? gridTotal < 1 || (selectBudget != null && gridTotal > selectBudget)
                    : chooser(info) && (info.available_days || []).length > 0 && !selectedDay)
                }
                onClick={() => handleRespond(true)}
              >
                Yes, I'll be there
              </button>
              <button className="btn btn-secondary" disabled={submitting} onClick={() => handleRespond(false)}>
                I can't make it
              </button>
            </div>
          )}
          {info.allocation_status !== 'pending' && (
            <p style={{ marginTop: 20 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={submitting}
                onClick={() => handleRespond(info.allocation_status !== 'confirmed')}
              >
                {info.allocation_status === 'confirmed' ? "Actually, I can't make it" : 'Actually, I can make it'}
              </button>
            </p>
          )}
          {(info.ticket_codes || []).length > 0 && (
            <div className="panel" style={{ textAlign: 'left', marginTop: 16 }}>
              <p style={{ marginTop: 0, marginBottom: 10, fontWeight: 600 }}>
                Your admission {info.ticket_codes.length > 1 ? 'codes' : 'code'} — show at the door
              </p>
              <div className="order-ticket-codes">
                {info.ticket_codes.map((code) => (
                  <div key={code} className="order-ticket-code">
                    {code}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 0 }}>
                Also sent to your email.
              </p>
            </div>
          )}

          {info.effective_mode !== 'distribute' && info.allocation_status !== 'declined' && (
            <div style={{ marginTop: 20, textAlign: 'left' }}>
              {info.ticket_request_status === 'pending' ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                  Your request for extra tickets is with the organizer — you&apos;ll see it reflected here
                  once they&apos;ve reviewed it.
                </p>
              ) : requestOpen ? (
                <form onSubmit={handleRequestTickets} className="panel" style={{ textAlign: 'left' }}>
                  <p style={{ marginTop: 0, fontWeight: 600 }}>Request more tickets</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label htmlFor="req-qty" style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
                        How many more?
                      </label>
                      <input
                        id="req-qty"
                        type="number"
                        min={1}
                        max={10}
                        style={{ width: 80 }}
                        value={requestForm.quantity}
                        onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })}
                      />
                    </div>
                    {gridActive && (
                      <div>
                        <label htmlFor="req-day" style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
                          For which day?
                        </label>
                        <select
                          id="req-day"
                          value={requestForm.date}
                          onChange={(e) => setRequestForm({ ...requestForm, date: e.target.value })}
                        >
                          <option value="">Any / whole visit</option>
                          {(info.day_grants || []).map((g) => (
                            <option key={g.date} value={g.date}>
                              {formatDate(g.date)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <label htmlFor="req-note" style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
                        Note (optional)
                      </label>
                      <input
                        id="req-note"
                        placeholder="e.g. bringing my agent"
                        style={{ width: '100%' }}
                        value={requestForm.note}
                        onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })}
                      />
                    </div>
                    <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>
                      Send request
                    </button>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setRequestOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => setRequestOpen(true)}>
                  Need more tickets?
                </button>
              )}
            </div>
          )}

          {submitError && <p style={{ color: 'var(--danger, #c55)', marginTop: 16 }}>{submitError}</p>}
          {renderReferralCodes(info.referral_codes)}
        </div>
      </div>
    )
  }

  // ---------- Allotment holder — distribute tickets to others, per day ----------
  const draftByDay = {}
  for (const r of recipients) {
    if (r.visit_date) draftByDay[r.visit_date] = (draftByDay[r.visit_date] || 0) + (Number(r.party_size) || 0)
  }
  const liveRemaining = (d) => Math.max((d.remaining || 0) - (draftByDay[d.date] || 0), 0)
  const availableDays = (info.day_allotments || []).filter((d) => d.remaining > 0)

  const removeRecipient = async (childId) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/public/rsvp/${token}/recipients/${childId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not remove them')
      setInfo(data)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="public-event-page">
      <div className="public-event-content" style={{ textAlign: 'left', maxWidth: 720 }}>
        <p className="login-eyebrow" style={{ textAlign: 'center' }}>
          You're invited
        </p>
        <h1 className="login-title" style={{ textAlign: 'center' }}>
          Hi {info.guest_name}
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20 }}>
          You have tickets to give out.
        </p>

        {(() => {
          const dayTotalSum = (info.day_allotments || []).reduce((n, d) => n + (d.total || 0), 0)
          const capTotal = info.spend_total != null ? Math.min(info.spend_total, dayTotalSum) : dayTotalSum
          const givenTotal =
            (info.day_allotments || []).reduce((n, d) => n + (d.distributed || 0), 0) +
            Object.values(draftByDay).reduce((n, q) => n + q, 0)
          const remainingByDays = (info.day_allotments || []).reduce((n, d) => n + liveRemaining(d), 0)
          const overallRemaining = Math.max(Math.min(capTotal - givenTotal, remainingByDays), 0)
          const spendCapped = info.spend_total != null && info.spend_total < dayTotalSum
          return (
            <div className="panel" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>
                {overallRemaining}
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-muted)' }}> of {capTotal}</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 4 }}>
                tickets left to give out
              </div>
              {spendCapped && (
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                  Your {capTotal}-ticket total spans the days below — each day also has its own cap.
                </p>
              )}
            </div>
          )
        })()}

        <div className="panel">
          <div className="panel-title">Availability by day</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Remaining</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(info.day_allotments || []).map((d) => (
                <tr key={d.date}>
                  <td>{formatDate(d.date)}</td>
                  <td className="mono">
                    {liveRemaining(d)}
                    {draftByDay[d.date] > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> ({draftByDay[d.date]} below)</span>
                    )}
                  </td>
                  <td className="mono">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {info.distributed_recipients?.length > 0 && (
          <div className="panel">
            <div className="panel-title">Already sent</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Tickets</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {info.distributed_recipients.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>{r.name}</td>
                    <td>{r.visit_date ? formatDate(r.visit_date) : '—'}</td>
                    <td className="mono">{r.party_size}</td>
                    <td>
                      <span className={`pill pill-${r.allocation_status}`}>
                        {r.rsvp_confirmed === 'yes'
                          ? 'confirmed'
                          : r.rsvp_confirmed === 'no'
                            ? 'declined'
                            : 'no answer yet'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.rsvp_link && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title="Copy their confirmation link to forward yourself"
                          onClick={() => navigator.clipboard?.writeText(r.rsvp_link)}
                        >
                          Copy link
                        </button>
                      )}
                      {r.id && r.allocation_status !== 'confirmed' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                          disabled={submitting}
                          title="Take these tickets back — frees them for someone else"
                          onClick={() => removeRecipient(r.id)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {availableDays.length > 0 && (
          <div className="panel">
            <div className="panel-title">Who gets your remaining tickets?</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              One line per person by default — but you can put more than one of your tickets under a single
              name if you'd like to bring a group together. Each date is its own separate amount, so a
              Thursday ticket can never come out of your Saturday total.
            </p>

            {recipients.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: i < recipients.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div className="field" style={{ flex: '1 1 160px' }}>
                  <label>Name</label>
                  <input value={r.name} onChange={(e) => updateRecipient(i, { name: e.target.value })} />
                </div>
                <div className="field" style={{ flex: '1 1 200px' }}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={r.email}
                    onChange={(e) => updateRecipient(i, { email: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 160px' }}>
                  <label>Date</label>
                  <select value={r.visit_date} onChange={(e) => updateRecipient(i, { visit_date: e.target.value })}>
                    <option value="">Choose…</option>
                    {(info.day_allotments || []).map((d) => (
                      <option key={d.date} value={d.date}>
                        {formatDate(d.date)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ width: 90 }}>
                  <label>Tickets</label>
                  <input
                    type="number"
                    min={1}
                    value={r.party_size}
                    onChange={(e) => updateRecipient(i, { party_size: e.target.value })}
                  />
                </div>
                {recipients.length > 1 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => removeRecipientRow(i)}>
                    Remove
                  </button>
                )}
                {r.visit_date && dayOverLimit(r.visit_date) && (
                  <p style={{ width: '100%', fontSize: 12, color: 'var(--danger, #c55)', margin: 0 }}>
                    That's more than the {formatDate(r.visit_date)} amount remaining.
                  </p>
                )}
              </div>
            ))}

            <button className="btn btn-secondary btn-sm" onClick={addRecipientRow}>
              Add another
            </button>

            {submitError && <p style={{ color: 'var(--danger, #c55)', marginTop: 12 }}>{submitError}</p>}

            <button
              className="btn btn-primary"
              style={{ marginTop: 16, width: '100%' }}
              disabled={submitting || anyDayOverLimit || !hasCompleteRow}
              onClick={handleDistribute}
            >
              Send tickets
            </button>
          </div>
        )}

        {renderReferralCodes(info.referral_codes)}
      </div>
    </div>
  )
}