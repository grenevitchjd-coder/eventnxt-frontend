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

  const handleRespond = async (attending) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`${API_URL}/public/rsvp/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attending }),
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

          {info.allocation_status === 'confirmed' && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <p style={{ margin: 0 }}>✓ You're confirmed. See you there!</p>
            </div>
          )}
          {info.allocation_status === 'declined' && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <p style={{ margin: 0 }}>You've let us know you can't make it.</p>
            </div>
          )}
          {info.allocation_status === 'pending' && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-primary" disabled={submitting} onClick={() => handleRespond(true)}>
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
          {submitError && <p style={{ color: 'var(--danger, #c55)', marginTop: 16 }}>{submitError}</p>}
        </div>
      </div>
    )
  }

  // ---------- Allotment holder — distribute tickets to others, per day ----------
  const availableDays = (info.day_allotments || []).filter((d) => d.remaining > 0)

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
          You have tickets to give out — each day below is its own separate amount.
        </p>

        <div className="panel">
          <div className="panel-title">Your tickets</div>
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
                  <td className="mono">{d.remaining}</td>
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
                </tr>
              </thead>
              <tbody>
                {info.distributed_recipients.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.visit_date ? formatDate(r.visit_date) : '—'}</td>
                    <td className="mono">{r.party_size}</td>
                    <td>
                      <span className={`pill pill-${r.allocation_status}`}>{r.allocation_status}</span>
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
      </div>
    </div>
  )
}