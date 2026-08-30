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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        )})?\n\nThe buyer gets 100% back, their ticket codes stop working, and the tickets return to the sellable pool. This can't be undone.`
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