// eventnxt-frontend: src/components/PromoTrackingTab.jsx
//
// "Promo tracking" page (Promote group) — CODE-FIRST, per Joshua's
// redirect after the first cut: one row per promo with Code · Amount ·
// Qty · Last updated, and each row expands to the individual sales
// that used that code (the detail the old flat table showed for
// everything at once). The rollup comes from /promo-stats (the shared
// aggregator), the expanded detail from the same /sales rows the
// rollup was computed over — so a row's numbers always equal the sum
// of what its dropdown shows.
//
// Sales with NO code sit in one muted "No promo code" row at the
// bottom, expandable like the rest — organic sales stay visible
// without pretending to be promo performance.
//
// Referral codes are deliberately absent: their numbers are about what
// their PERSON is owed (Referral payouts). The Sales platform picker
// stays at the bottom — this page is where sale data is read, so it's
// where its source is declared (the CSV upload itself lives on Seating
// summary).
import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'

const money = (v) => `$${Number(v).toFixed(2)}`
const when = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function PromoTrackingTab({ onToast, eventId }) {
  const [stats, setStats] = useState(null) // self promos only
  const [sales, setSales] = useState(null)
  const [salesConfig, setSalesConfig] = useState(null)
  const [expandedId, setExpandedId] = useState(null) // code id | 'none' | null

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

  const salesFor = (codeId) =>
    (sales || []).filter((s) => (codeId === 'none' ? s.promo_code_id === null : s.promo_code_id === codeId))

  const codelessSales = salesFor('none')
  const codelessQty = codelessSales.reduce((sum, s) => sum + (s.quantity || 0), 0)
  const codelessAmount = codelessSales.reduce((sum, s) => sum + (s.amount != null ? Number(s.amount) : 0), 0)

  const anyMissingAmount = (stats || []).some((r) => r.rows_missing_amount > 0)

  const salesDetail = (rows) => (
    <table className="data-table" style={{ margin: '4px 0 12px' }}>
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
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="empty-state">
              No sales yet.
            </td>
          </tr>
        ) : (
          rows.map((s) => (
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
  )

  return (
    <div>
      <h2 className="page-title">Promo tracking</h2>
      <p className="page-subtitle">
        Each promo's results at a glance — expand a code to see the individual sales behind its numbers.
        Native checkout and box-office imports count identically. Referrer earnings are tracked on the
        Referral pages.
      </p>

      {stats !== null && (
        <>
          <table className="data-table" style={{ marginBottom: anyMissingAmount ? 8 : 28 }}>
            <thead>
              <tr>
                <th></th>
                <th>Promo code</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No promos yet — create them on the Promos page.
                  </td>
                </tr>
              ) : (
                stats.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    >
                      <td style={{ width: 24, color: 'var(--text-muted)' }}>
                        {expandedId === r.id ? '▾' : '▸'}
                      </td>
                      <td>
                        <span className="mono">{r.code}</span>
                        {r.discount_type && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {' '}
                            · {r.discount_type === 'percentage'
                              ? `${Number(r.discount_value)}% off`
                              : `$${Number(r.discount_value)} off`}
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {money(r.amount_sold)}
                        {r.rows_missing_amount > 0 && ' *'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {r.tickets_sold}
                      </td>
                      <td style={{ fontSize: 13 }}>{when(r.last_sale_at)}</td>
                    </tr>
                    {expandedId === r.id && (
                      <tr>
                        <td></td>
                        <td colSpan={4}>{salesDetail(salesFor(r.id))}</td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
              {codelessSales.length > 0 && (
                <Fragment>
                  <tr
                    style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
                    onClick={() => setExpandedId(expandedId === 'none' ? null : 'none')}
                  >
                    <td style={{ width: 24 }}>{expandedId === 'none' ? '▾' : '▸'}</td>
                    <td>No promo code</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {money(codelessAmount)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {codelessQty}
                    </td>
                    <td></td>
                  </tr>
                  {expandedId === 'none' && (
                    <tr>
                      <td></td>
                      <td colSpan={4}>{salesDetail(codelessSales)}</td>
                    </tr>
                  )}
                </Fragment>
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
        </>
      )}
    </div>
  )
}