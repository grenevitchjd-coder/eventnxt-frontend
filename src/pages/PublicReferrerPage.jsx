// eventnxt-frontend: src/pages/PublicReferrerPage.jsx
//
// The referrer's own page, v1 — reached by the portal link Referral
// Setup auto-emails (/referrer/<token>). Shows ONLY the referral side
// of whoever holds the token: their codes, points, affordable
// redemption tiers, and redemption history. Deliberately NOT the RSVP
// page: a pure influencer must never be asked "will you attend?" for an
// event they weren't invited to (copy is part of the data model).
//
// Reads the same /public/rsvp/<token> payload the RSVP page uses.
// Slice D: each code now carries its progress — tickets sold, $ sold,
// link clicks, accrued reward — aggregated by the SAME backend function
// that feeds the organizer's Promo tracking / Referral payouts pages,
// so referrer and organizer always look at one truth. "Estimated
// payout" = accrued reward in the deal's own unit; points deals show
// balance + affordable tiers instead (per the redesign's answer 3).
// Slice E adds the second tab (refer people by email).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

// The payout agreement in one honest sentence, in the deal's own unit.
const dealSummary = (c) => {
  if (c.reward_type === 'flat_amount') return `You earn $${Number(c.reward_value)} per ticket sold`
  if (c.reward_type === 'percentage') return `You earn ${Number(c.reward_value)}% of each sale`
  if (c.reward_type === 'free_tickets')
    return `You earn ${Number(c.reward_value)} free ticket${Number(c.reward_value) === 1 ? '' : 's'} per ticket sold`
  if (c.reward_type === 'points') {
    if (!c.points_rates?.length) return 'You earn points per ticket (rates being set up)'
    return 'You earn points per ticket: ' + c.points_rates.map((r) => `${r.ticket_type} ${r.points} pts`).join(' · ')
  }
  return null
}

export default function PublicReferrerPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [tab, setTab] = useState('progress') // 'progress' | 'refer'
  const [policyChecked, setPolicyChecked] = useState(false) // 0051: Outreach Policy checkbox (first send only)
  const [referCodeId, setReferCodeId] = useState(null)
  const emptyRow = () => ({ name: '', email: '' })
  const [rows, setRows] = useState([emptyRow()])
  const [referNotice, setReferNotice] = useState(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [messageTouched, setMessageTouched] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/public/rsvp/${token}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'This link is not valid.')
        setInfo(data)
      })
      .catch((err) => setError(err.message))
  }, [token])

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

  const selectedCode = (info?.referral_codes || []).find(
    (c) => c.promo_code_id === (referCodeId || info?.referral_codes?.[0]?.promo_code_id)
  )
  useEffect(() => {
    if (!messageTouched) setMessage(selectedCode?.referral_message_draft || '')
  }, [selectedCode?.promo_code_id, selectedCode?.referral_message_draft, messageTouched])

  const handleRefer = async () => {
    const contacts = rows.filter((r) => r.name.trim() && r.email.trim())
    if (contacts.length === 0) {
      setSubmitError('Add at least one name and email.')
      return
    }
    if (!info.outreach_terms_accepted_at && !policyChecked) {
      setSubmitError('Please read and accept the Referral Outreach Policy first.')
      return
    }
    const codeId = referCodeId || (info.referral_codes?.[0]?.promo_code_id ?? null)
    if (!codeId) return
    setSubmitting(true)
    setSubmitError(null)
    setReferNotice(null)
    try {
      const res = await fetch(`${API_URL}/public/rsvp/${token}/refer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promo_code_id: codeId,
          contacts,
          subject: subject.trim() || null,
          message: message.trim() || null,
          outreach_terms_accepted: policyChecked || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong')
      setInfo(data)
      setRows([emptyRow()])
      setReferNotice(`Sent ${contacts.length} invite${contacts.length === 1 ? '' : 's'} — you'll see clicks and purchases below as they happen.`)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (error) {
    return (
      <div className="public-page" style={{ maxWidth: 560, margin: '60px auto', padding: '0 16px' }}>
        <p className="empty-state">{error}</p>
      </div>
    )
  }
  if (!info) return null

  const codes = info.referral_codes || []

  return (
    <div className="public-page" style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 4 }}>Hi {info.guest_name}</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Your referral page — share your code, watch your rewards, claim them here.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0 6px' }}>
        <button className={`btn btn-small ${tab === 'progress' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setTab('progress')}>
          Your progress
        </button>
        <button className={`btn btn-small ${tab === 'refer' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setTab('refer')}>
          Refer people
        </button>
      </div>

      {submitError && (
        <p style={{ color: 'var(--danger, #b3261e)', fontSize: 13.5 }}>{submitError}</p>
      )}

      {tab === 'refer' ? (
        <div className="panel" style={{ textAlign: 'left', marginTop: 14 }}>
          <div className="panel-title">Invite people by email</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -6 }}>
            Each person gets their own tracked invite from EventNXT — you'll see who clicked and who
            bought, person by person, on Your progress.
          </p>
          {codes.length > 1 && (
            <div className="field" style={{ maxWidth: 260, marginBottom: 10 }}>
              <label>Send with code</label>
              <select value={referCodeId || codes[0].promo_code_id}
                      onChange={(e) => setReferCodeId(e.target.value)}>
                {codes.map((c) => (
                  <option key={c.promo_code_id} value={c.promo_code_id}>{c.code}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Subject</label>
            <input maxLength={150} value={subject}
                   placeholder={`${info.guest_name} invited you to the event`}
                   onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Your message</label>
            <textarea rows={4} maxLength={2000} value={message}
                      style={{ width: '100%', minWidth: 0 }}
                      placeholder="Write it in your own words — why should they come?"
                      onChange={(e) => { setMessage(e.target.value); setMessageTouched(true) }} />
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Each person's tracked link{selectedCode?.discount_type ? ' and their discount' : ''} is added
              automatically below your message, with a short "sent through EventNXT on your behalf" line.
            </p>
          </div>
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input placeholder="Name" value={row.name} style={{ flex: 1, minWidth: 140 }}
                     onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input placeholder="Email" type="email" value={row.email} style={{ flex: 2, minWidth: 200 }}
                     onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
            </div>
          ))}
          {!info.outreach_terms_accepted_at ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', margin: '12px 0 4px', fontSize: 12.5 }}>
              <strong>Before your first send:</strong> invitations go out through EventNXT&apos;s email
              system in your name. Only invite people you personally know — no purchased or bulk lists —
              keep your message truthful, and don&apos;t remove the tracked link or the
              &ldquo;sent through EventNXT&rdquo; line (they&apos;re added automatically). Abuse can void
              rewards and sending access.
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={policyChecked} onChange={(e) => setPolicyChecked(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  I have read and agree to the{' '}
                  <a href="/terms/referral" target="_blank" rel="noreferrer">Referral Outreach Policy</a>.
                </span>
              </label>
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 2px' }}>
              Outreach Policy accepted {new Date(info.outreach_terms_accepted_at).toLocaleDateString()} ·{' '}
              <a href="/terms/referral" target="_blank" rel="noreferrer">view</a>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-ghost btn-small" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
              + Another person
            </button>
            <button className="btn btn-secondary btn-small"
                    disabled={submitting || (!info.outreach_terms_accepted_at && !policyChecked)}
                    onClick={handleRefer}>
              Send invites
            </button>
          </div>
          {referNotice && <p style={{ fontSize: 13, marginTop: 10 }}>{referNotice}</p>}
        </div>
      ) : codes.length === 0 ? (
        <p className="empty-state">No referral codes on this link yet — check with the organizer.</p>
      ) : (
        <>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0', textAlign: 'left' }}>
          Each card below shows your <strong>current effective payout terms</strong> — rewards accrue at
          the terms in effect when each sale happens. The organizer may adjust terms for future sales, so
          later payouts won&apos;t necessarily match your initial terms; this page always shows the current
          ones, and bonuses you&apos;ve already crossed are final. Payouts settle after the event, net of
          refunds. <a href="/terms/referral" target="_blank" rel="noreferrer">Full referral terms</a>.
        </p>
        {codes.map((c) => (
          <div key={c.promo_code_id} className="panel" style={{ textAlign: 'left', marginTop: 20 }}>
            <div className="panel-title">
              Code <span className="mono">{c.code}</span>
              {c.discount_type && (
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-muted)' }}>
                  {' '}— your people get {c.discount_type === 'percentage'
                    ? `${Number(c.discount_value)}% off`
                    : `$${Number(c.discount_value)} off`}
                </span>
              )}
            </div>

            {/* ---- The payout agreement, always visible (2026-09-05) ---- */}
            <div style={{ margin: '2px 0 10px' }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{dealSummary(c)}</p>
              {c.bonus_tiers?.length > 0 && (
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Volume bonuses: {c.bonus_tiers.map((t) => `${t.tickets_required} tickets → $${Number(t.bonus_value)}`).join(' · ')}
                </p>
              )}
            </div>

            {/* ---- Progress (slice D): same numbers the organizer sees ---- */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '4px 0 14px' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">{c.tickets_sold ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>tickets sold</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">
                  ${Number(c.amount_sold ?? 0).toFixed(2)}{(c.rows_missing_amount ?? 0) > 0 ? '*' : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>in sales</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">{c.link_clicks ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>link clicks</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">
                  {c.reward_type === 'points'
                    ? `${c.points_available ?? 0} pts`
                    : c.total_reward == null
                      ? '—'
                      : c.reward_type === 'free_tickets'
                        ? `${Number(c.total_reward)} tickets`
                        : `$${Number(c.total_reward).toFixed(2)}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {c.reward_type === 'points' ? 'points available' : 'estimated payout'}
                </div>
              </div>
            </div>
            {(c.rows_missing_amount ?? 0) > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '-8px 0 12px' }}>
                * some box-office sales arrived without a dollar amount — their tickets count, the $ total
                only sums rows that carried one.
              </p>
            )}

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

            {c.contacts?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}>People you've invited</strong>
                <table className="data-table" style={{ marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Bought</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.contacts.map((ct, i) => (
                      <tr key={i}>
                        <td>
                          {ct.name}
                          <span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                            {ct.email}
                          </span>
                        </td>
                        <td>
                          {ct.tickets_bought > 0 ? (
                            <span className="pill pill-confirmed">bought</span>
                          ) : ct.clicked ? (
                            <span className="pill pill-pending">clicked</span>
                          ) : ct.sent_at ? (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>invited</span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>not sent</span>
                          )}
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {ct.tickets_bought > 0 ? `${ct.tickets_bought} · $${Number(ct.amount_bought).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <td>{h.choice === 'cash' ? `$${h.cash_value} cash` : `${h.ticket_value} ticket(s)`}</td>
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
        </>
      )}
    </div>
  )
}