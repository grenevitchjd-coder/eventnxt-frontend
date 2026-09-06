// eventnxt-frontend: src/components/OrdersTab.jsx
//
// Organizer-side order management: search by buyer name/email (the
// door-day tool), see every order's status and money breakdown, open the
// buyer's own order page, and issue full refunds.

import { useEffect, useState } from 'react'
import { api } from '../api'

function money(cents, currency = 'usd') {
  const amount = (cents / 100).toFixed(2)
  return currency.toLowerCase() === 'usd' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`
}

const STATUS_PILL = {
  paid: 'pill-confirmed',
  pending: 'pill-pending',
  expired: 'pill-pending',
  refunded: 'pill-declined',
}

export default function OrdersTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [orders, setOrders] = useState(null)
  const [search, setSearch] = useState('')
  const [refundingId, setRefundingId] = useState(null)
  const [eventSlug, setEventSlug] = useState(null) // for View — the buyer's order page URL
  // Earnings panel (Connect slice 3): this event's money from EventNXT's
  // own order snapshots, plus the org's live Stripe balance/payouts when
  // a payout account is connected. Either fetch failing hides its half
  // without blocking the orders list.
  const [earnings, setEarnings] = useState(null)
  const [payouts, setPayouts] = useState(null)
  const [openingManage, setOpeningManage] = useState(false)
  const [releasing, setReleasing] = useState(false)

  useEffect(() => {
    if (!loadedEventId) return
    setEventSlug(null)
    api.getEventProfile(loadedEventId).then((prof) => setEventSlug(prof?.slug || null)).catch(() => {})
  }, [loadedEventId])

  // Event context (eventId) comes from the Dashboard shell, which also
  // guarantees it's non-empty before rendering this tab and remounts it
  // (key={eventId}) when the event changes, so loading once on mount is all
  // that's needed here.
  useEffect(() => {
    loadOrders(eventId, '')
    api.getEarnings(eventId).then(setEarnings).catch(() => {})
    api.getPayouts(eventId).then(setPayouts).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReleaseReserve = async () => {
    if (!window.confirm(`Release the held reserve of ${money(earnings.reserve_held_cents, earnings.currency)} to your Stripe balance?\n\nAfter release, card-processing costs for any further refunds on this event are no longer covered by the reserve.`)) return
    setReleasing(true)
    try {
      const res = await api.releaseReserve(eventId)
      onToast(`Released ${money(res.released_cents, earnings.currency)} across ${res.orders_count} orders`)
      api.getEarnings(eventId).then(setEarnings).catch(() => {})
      api.getPayouts(eventId).then(setPayouts).catch(() => {})
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setReleasing(false)
    }
  }

  const handleManagePayments = async () => {
    setOpeningManage(true)
    try {
      const { url } = await api.managePaymentsLink(eventId)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setOpeningManage(false)
    }
  }

  const loadOrders = (id, term) => {
    setOrders(null)
    api
      .listOrders(id, term)
      .then((os) => {
        setOrders(os)
        setLoadedEventId(id)
      })
      .catch((e) => onToast(e.message, true))
  }


  const handleSearch = (e) => {
    e.preventDefault()
    loadOrders(loadedEventId, search)
  }

  const handleRefund = async (order) => {
    const summary = order.items.map((i) => `${i.quantity}× ${i.ticket_type_name}`).join(', ')
    if (
      !window.confirm(
        `Refund ${order.buyer_name}'s order in full (${summary}, ${money(
          order.subtotal_cents - order.discount_cents,
          order.currency
        )})?\n\nThe buyer gets 100% back, their ticket codes stop working, and the tickets return to the sellable pool. The card-processing cost of the refund comes out of this order's held reserve. This can't be undone.`
      )
    )
      return
    setRefundingId(order.id)
    try {
      const updated = await api.refundOrder(loadedEventId, order.id)
      setOrders(orders.map((o) => (o.id === order.id ? updated : o)))
      onToast(`Refunded — ${order.buyer_email} has been notified`)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setRefundingId(null)
    }
  }


  return (
    <>
      <div className="page-title">Orders</div>
      <p className="page-subtitle">
        Every native ticket order for the event — search by buyer name or email. Refunds are full-order:
        the buyer gets everything back, codes void, and the tickets go back on sale.
      </p>


      {earnings && (
        <div className="panel">
          <div className="panel-title">Earnings</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
            Native ticket sales only &mdash; money sold on outside platforms never passes through EventNXT.
            Refunded orders return the platform fee along with the buyer&apos;s money.
          </p>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[
              ['Gross sold', earnings.gross_sold_cents, `${earnings.paid_orders} paid order${earnings.paid_orders === 1 ? '' : 's'}`],
              ['Platform fees', earnings.platform_fees_cents, null],
              ['Organizer net', earnings.organizer_net_cents, null],
              ['Refunded', earnings.refunded_cents, earnings.refunded_orders ? `${earnings.refunded_orders} order${earnings.refunded_orders === 1 ? '' : 's'}` : null],
            ].map(([label, cents, sub]) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: 19, fontWeight: 600 }}>{money(cents, earnings.currency)}</div>
                {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</div>}
              </div>
            ))}
          </div>
          {(earnings.reserve_held_cents > 0 || earnings.reserve_released_cents > 0 || earnings.reserve_used_cents > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Held in reserve</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{money(earnings.reserve_held_cents, earnings.currency)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>releases after the event&apos;s last day</div>
              </div>
              {earnings.reserve_released_cents > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reserve released</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{money(earnings.reserve_released_cents, earnings.currency)}</div>
                </div>
              )}
              {earnings.reserve_used_cents > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Used on refunds</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{money(earnings.reserve_used_cents, earnings.currency)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>card-processing costs of refunded orders</div>
                </div>
              )}
              {earnings.reserve_releasable && (
                <button className="btn btn-primary btn-sm" onClick={handleReleaseReserve} disabled={releasing} style={{ marginLeft: 'auto' }}>
                  {releasing ? 'Releasing\u2026' : `Release reserve (${money(earnings.reserve_held_cents, earnings.currency)})`}
                </button>
              )}
            </div>
          )}
          {payouts?.connected && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stripe balance &mdash; pending</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{money(payouts.balance_pending_cents, payouts.currency)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>clearing the 7-day payout delay</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Available for payout</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{money(payouts.balance_available_cents, payouts.currency)}</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={handleManagePayments} disabled={openingManage} style={{ marginLeft: 'auto' }}>
                  {openingManage ? 'Opening\u2026' : 'Manage payouts'}
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                Balance and payouts are for your whole organization, across all its events.
                {payouts.payouts.length > 0 && (
                  <> Recent payouts: {payouts.payouts.slice(0, 3).map((p) => `${money(p.amount_cents, p.currency)} (${p.status}, ${p.arrival_date})`).join(' · ')}</>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {loadedEventId && orders !== null && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Buyer</th>
              <th>Tickets</th>
              <th>Paid</th>
              <th>Status</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  {search ? 'No orders match that search.' : 'No orders yet for this event.'}
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div>{o.buyer_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{o.buyer_email}</div>
                  </td>
                  <td>
                    {o.items.map((i, idx) => (
                      <div key={idx} style={{ fontSize: 12.5 }}>
                        {i.quantity}× {i.ticket_type_name}
                      </div>
                    ))}
                  </td>
                  <td className="mono">
                    {money(o.subtotal_cents - o.discount_cents, o.currency)}
                    {o.discount_cents > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        after {money(o.discount_cents, o.currency)} discount
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[o.status] || 'pill-pending'}`}>{o.status}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {o.paid_at
                      ? new Date(o.paid_at).toLocaleString()
                      : o.created_at
                        ? new Date(o.created_at).toLocaleString()
                        : '—'}
                  </td>
                  <td className="actions-cell">
                    {eventSlug && (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={`/e/${eventSlug}/order/${o.order_token}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    )}
                    {o.status === 'paid' && (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={refundingId === o.id}
                        onClick={() => handleRefund(o)}
                      >
                        {refundingId === o.id ? 'Refunding…' : 'Refund'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </>
  )
}