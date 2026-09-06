// eventnxt-frontend: src/components/ReferralPayoutsTab.jsx
//
// "Referral payouts" page (Promote group) — the money side of the
// referral program: per referrer and per code, tickets sold, dollars
// sold, reward accrued (in the code's own unit), volume bonuses
// crossed, and the cash payout queue (mark-paid) ported from the old
// Sales & Referrals page, which this slice retires.
//
// No new backend: the page composes /promo-stats (tickets/$ per code,
// aggregated from the shared Sale table) with /promo-codes (reward
// accrual, points balance, bonus awards — the same serializer the old
// page trusted) and /reward-redemptions. Deal EDITING stays on Referral
// setup; this page only ever answers "who is owed what."
import { useEffect, useState } from 'react'
import { api } from '../api'

const money = (v) => `$${Number(v).toFixed(2)}`

// total_reward is unit-consistent per code (every sale under one code
// shares reward_type): dollars for flat/percentage, tickets for
// free_tickets, points for points.
const rewardAccrued = (code) => {
  if (code.total_reward == null) return '—'
  if (code.reward_type === 'free_tickets') return `${Number(code.total_reward)} tickets`
  if (code.reward_type === 'points') return `${Number(code.total_reward)} pts earned`
  return money(code.total_reward)
}

export default function ReferralPayoutsTab({ onToast, eventId }) {
  const [stats, setStats] = useState(null)
  const [promoCodes, setPromoCodes] = useState(null)
  const [redemptions, setRedemptions] = useState(null)

  const loadAll = () => {
    api.getPromoStats(eventId).then(setStats).catch((e) => onToast(e.message, true))
    api.listPromoCodes(eventId).then(setPromoCodes).catch((e) => onToast(e.message, true))
    api.listRewardRedemptions(eventId).then(setRedemptions).catch((e) => onToast(e.message, true))
  }

  // Dashboard remounts on event change (key={eventId}); once is enough.
  useEffect(() => {
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const markPaid = async (redemption) => {
    try {
      await api.markRedemptionPaid(eventId, redemption.id)
      onToast('Marked as paid')
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  if (stats === null || promoCodes === null) {
    return (
      <div>
        <h2 className="page-title">Referral payouts</h2>
      </div>
    )
  }

  // Referral codes only — a self promo owes nobody anything, and its
  // performance lives on Promo tracking.
  const codeById = {}
  promoCodes.forEach((c) => {
    codeById[c.id] = c
  })
  const rows = stats.filter((r) => r.guest_id !== null)
  const byPerson = {}
  rows.forEach((r) => {
    ;(byPerson[r.guest_id] = byPerson[r.guest_id] || { name: r.referrer_name, codes: [] }).codes.push(r)
  })
  const people = Object.entries(byPerson).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''))

  const cashQueue = (redemptions || []).filter((r) => r.choice === 'cash')

  return (
    <div>
      <h2 className="page-title">Referral payouts</h2>
      <p className="page-subtitle">
        Who is owed what — sales and rewards per referrer, volume bonuses crossed, and the cash
        redemptions waiting to be paid. Deals themselves are edited on Referral setup.
      </p>

      <table className="data-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Referrer</th>
            <th>Code</th>
            <th style={{ textAlign: 'right' }}>Tickets sold</th>
            <th style={{ textAlign: 'right' }}>$ sold</th>
            <th>Reward accrued</th>
            <th>Bonuses</th>
          </tr>
        </thead>
        <tbody>
          {people.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">
                No referral codes yet — add people on Referral setup.
              </td>
            </tr>
          ) : (
            people.map(([guestId, person]) =>
              person.codes.map((r, i) => {
                const code = codeById[r.id] || {}
                const bonusTotal = (code.bonus_awards || []).reduce((sum, a) => sum + Number(a.bonus_value), 0)
                return (
                  <tr key={r.id}>
                    {i === 0 && <td rowSpan={person.codes.length}>{person.name}</td>}
                    <td className="mono">{r.code}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {r.tickets_sold}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {money(r.amount_sold)}
                      {r.rows_missing_amount > 0 && ' *'}
                    </td>
                    <td>
                      {rewardAccrued(code)}
                      {code.reward_type === 'points' && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {' '}
                          · {code.points_available ?? 0} unspent
                        </span>
                      )}
                    </td>
                    <td>
                      {(code.bonus_awards || []).length === 0 ? (
                        '—'
                      ) : (
                        <span>
                          {code.bonus_awards.length} crossed · {money(bonusTotal)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )
          )}
        </tbody>
      </table>
      {rows.some((r) => r.rows_missing_amount > 0) && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -20, marginBottom: 28 }}>
          * Some imported sales had no dollar amount — tickets counted, $ sums only rows that carried one.
        </p>
      )}

      {/* ---------- Cash payout queue (ported from Sales & Referrals) ---------- */}
      <div className="panel">
        <div className="panel-title">Payout queue</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
          Cash redemptions referrers have claimed — pay them outside the app, then mark paid here.
        </p>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Referrer</th>
            <th>Code</th>
            <th>Amount</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {redemptions === null ? null : cashQueue.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty-state">
                No cash redemptions yet.
              </td>
            </tr>
          ) : (
            cashQueue.map((r) => (
              <tr key={r.id}>
                <td>{r.referrer_name}</td>
                <td className="mono">{r.promo_code}</td>
                <td className="mono">{r.cash_value}</td>
                <td>
                  <span className={`pill pill-${r.payout_status === 'paid' ? 'confirmed' : 'pending'}`}>
                    {r.payout_status}
                  </span>
                </td>
                <td className="actions-cell">
                  {r.payout_status === 'pending' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => markPaid(r)}>
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}