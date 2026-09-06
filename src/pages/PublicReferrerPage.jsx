// eventnxt-frontend: src/pages/PublicReferrerPage.jsx
//
// The referrer's own page, v1 — reached by the portal link Referral
// Setup auto-emails (/referrer/<token>). Shows ONLY the referral side
// of whoever holds the token: their codes, points, affordable
// redemption tiers, and redemption history. Deliberately NOT the RSVP
// page: a pure influencer must never be asked "will you attend?" for an
// event they weren't invited to (copy is part of the data model).
//
// Reads the same /public/rsvp/<token> payload the RSVP page uses —
// referral_codes already rides in it — so no new backend surface was
// needed. The Promote-redesign's slice D grows this page into the
// two-tab portal (progress dashboard + refer-people outreach); this v1
// is the reward-claiming half so the emailed link is real from day one.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

export default function PublicReferrerPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

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

      {submitError && (
        <p style={{ color: 'var(--danger, #b3261e)', fontSize: 13.5 }}>{submitError}</p>
      )}

      {codes.length === 0 ? (
        <p className="empty-state">No referral codes on this link yet — check with the organizer.</p>
      ) : (
        codes.map((c) => (
          <div key={c.promo_code_id} className="panel" style={{ textAlign: 'left', marginTop: 20 }}>
            <div className="panel-title">
              Code <span className="mono">{c.code}</span>
            </div>
            {c.reward_type === 'points' && (
              <p style={{ margin: '0 0 10px' }}>
                {c.points_available ?? 0} point{c.points_available === 1 ? '' : 's'} available
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
        ))
      )}
    </div>
  )
}