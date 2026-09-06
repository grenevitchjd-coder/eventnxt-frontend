// eventnxt-frontend: src/components/PromoTrackingTab.jsx
//
// "Promo tracking" page (Promote group) — did the marketing codes work?
// Per self-promo: tickets sold, dollars sold, transactions, link clicks,
// straight from /promo-stats, which aggregates the same shared Sale
// table both native checkout and CSV import write to — so the rollup
// can never disagree with the raw Sales list underneath it.
//
// Referral codes are deliberately absent here: a referral code's
// numbers are about what its PERSON is owed, which is the Referral
// payouts page's job. Same endpoint, different lens.
//
// The Sales platform picker and the raw sales list live at the bottom —
// this page is where sale data is read, so it's where its source is
// declared. (The box-office CSV upload itself stays on Seating summary,
// next to the Sold column it moves.)
import { useEffect, useState } from 'react'
import { api } from '../api'

const money = (v) => `$${Number(v).toFixed(2)}`

export default function PromoTrackingTab({ onToast, eventId }) {
  const [stats, setStats] = useState(null) // self promos only
  const [sales, setSales] = useState(null)
  const [salesConfig, setSalesConfig] = useState(null)

  useEffect(() => {
    api
      .getPromoStats(eventId)
      .then((rows) => setStats(rows.filter((r) => r.guest_id === null)))
      .catch((e) => onToast(e.message, true))
    api.listSales(eventId).then(setSales).catch((e) => onToast(e.message, true))
    api.getSalesConfig(eventId).then(setSalesConfig).catch((e) => onToast(e.message, true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetPlatform = async (platform) => {
    try {
      const cfg = await api.setSalesConfig(eventId, platform)
      setSalesConfig(cfg)
      onToast('Sales platform updated')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const anyMissingAmount = (stats || []).some((r) => r.rows_missing_amount > 0)

  return (
    <div>
      <h2 className="page-title">Promo tracking</h2>
      <p className="page-subtitle">
        How each of your promos performed — tickets and dollars, counted the same whether the sale
        happened at native checkout or arrived in a box-office import. Referrer earnings are tracked on
        the Referral pages.
      </p>

      {stats !== null && (
        <>
          <table className="data-table" style={{ marginBottom: anyMissingAmount ? 8 : 28 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th style={{ textAlign: 'right' }}>Tickets sold</th>
                <th style={{ textAlign: 'right' }}>$ sold</th>
                <th style={{ textAlign: 'right' }}>Transactions</th>
                <th style={{ textAlign: 'right' }}>Link clicks</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No promos yet — create them on the Promos page.
                  </td>
                </tr>
              ) : (
                stats.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.code}</td>
                    <td>
                      {r.discount_type
                        ? r.discount_type === 'percentage'
                          ? `${Number(r.discount_value)}% off`
                          : `$${Number(r.discount_value)} off`
                        : '—'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {r.tickets_sold}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {money(r.amount_sold)}
                      {r.rows_missing_amount > 0 && ' *'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {r.sale_count}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {r.link_clicks}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {anyMissingAmount && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 28 }}>
              * Some imported sales had no dollar amount on their row — their tickets are counted, but the
              $ total only sums rows that carried one.
            </p>
          )}

          {/* ---------- Sales platform (where sale data comes from) ---------- */}
          <div className="panel">
            <div className="panel-title">Sales platform</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Which box office platform you sell through. Every platform currently falls back to CSV
              upload (on the Seating summary page) — none have a live connection built yet — but this is
              where that would switch on automatically once one exists.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ width: 240 }}>
                <label>Platform</label>
                <select
                  value={salesConfig?.platform || 'custom_csv'}
                  onChange={(e) => handleSetPlatform(e.target.value)}
                >
                  {(salesConfig?.available_platforms || []).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} {p.has_live_api ? '' : '(CSV only)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ---------- Raw sales list ---------- */}
          <div className="panel" style={{ paddingBottom: 0, border: 'none', background: 'transparent', paddingLeft: 0, paddingRight: 0 }}>
            <div className="panel-title">Sales</div>
          </div>
          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {sales === null ? null : sales.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No sales recorded yet.
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.buyer_name || '—'}
                      <span className="mono" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {s.buyer_email}
                      </span>
                    </td>
                    <td className="mono">{s.amount != null ? s.amount : '—'}</td>
                    <td>{s.ticket_type || '—'}</td>
                    <td className="mono">{s.quantity}</td>
                    <td>{s.sale_date || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}