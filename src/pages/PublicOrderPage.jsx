// eventnxt-frontend: src/pages/PublicOrderPage.jsx
//
// The buyer's permanent order page — where the Stripe success redirect
// lands, where the ticket email links, and where "Find my tickets" will
// point. Possession of the token in the URL IS ownership; no login.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

function money(cents, currency) {
  const amount = (cents / 100).toFixed(2)
  return currency?.toLowerCase() === 'usd' ? `$${amount}` : `${amount} ${currency?.toUpperCase()}`
}

const STATUS_COPY = {
  paid: { title: "You're in!", note: 'Your tickets are below — this page is yours to keep and revisit.' },
  pending: {
    title: 'Payment processing…',
    note: "If you just paid, give it a few seconds and refresh — confirmation usually arrives almost instantly.",
  },
  expired: {
    title: 'This checkout expired',
    note: 'The payment was never completed, so nothing was charged. Head back to the event page to start again.',
  },
  refunded: { title: 'This order was refunded', note: 'These tickets are no longer valid for entry.' },
}

export default function PublicOrderPage() {
  const { slug, token } = useParams()
  const [order, setOrder] = useState(undefined) // undefined = loading
  const [error, setError] = useState(false)

  const load = () => {
    fetch(`${API_URL}/public/orders/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then(setOrder)
      .catch(() => setError(true))
  }

  useEffect(load, [token])

  if (error) {
    return (
      <div className="public-event-page">
        <div className="public-event-notfound">
          <p className="login-eyebrow">EventNXT</p>
          <h1 className="login-title">Order not found</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            The link may be incomplete — try opening it again from your confirmation email.
          </p>
        </div>
      </div>
    )
  }

  if (order === undefined) return null

  const copy = STATUS_COPY[order.status] || STATUS_COPY.pending
  const showTickets = order.status === 'paid' && order.tickets.length > 0

  return (
    <div className="public-event-page">
      <div className="public-event-content">
        <p className="login-eyebrow">{order.event_title}</p>
        <h1 className="public-event-title" style={{ fontSize: 32 }}>
          {copy.title}
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>{copy.note}</p>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Order for {order.buyer_name} · {order.buyer_email}
        </p>

        {order.status === 'pending' && (
          <button className="btn btn-secondary" style={{ width: 'auto', marginBottom: 24 }} onClick={load}>
            Refresh status
          </button>
        )}

        {order.items.length > 0 && (
          <div className="public-event-section">
            <h2 className="public-event-section-title">Order summary</h2>
            <ul className="public-event-schedule">
              {order.items.map((item, i) => (
                <li key={i}>
                  <span className="public-event-schedule-label" style={{ textAlign: 'left', fontWeight: 600 }}>
                    {item.quantity} × {item.ticket_type_name}
                  </span>
                  <span className="public-event-schedule-time">
                    {money(item.unit_price_cents * item.quantity, order.currency)}
                  </span>
                </li>
              ))}
              {order.discount_cents > 0 && (
                <li>
                  <span className="public-event-schedule-label" style={{ textAlign: 'left' }}>
                    Discount
                  </span>
                  <span className="public-event-schedule-time">
                    −{money(order.discount_cents, order.currency)}
                  </span>
                </li>
              )}
              <li>
                <span className="public-event-schedule-label" style={{ textAlign: 'left' }}>
                  Total
                </span>
                <span className="public-event-schedule-time" style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {money(order.subtotal_cents - (order.discount_cents || 0), order.currency)}
                </span>
              </li>
            </ul>
          </div>
        )}

        {showTickets && (
          <div className="public-event-section">
            <h2 className="public-event-section-title">Your tickets</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: -8 }}>
              Each code admits one person — show it at the door.
            </p>
            <div className="order-ticket-codes">
              {order.tickets.map((t) => (
                <div key={t.code} className={`order-ticket-code ${t.status !== 'valid' ? 'order-ticket-void' : ''}`}>
                  <span className="mono" style={{ fontSize: 16, color: 'var(--text)' }}>
                    {t.code}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t.ticket_type_name}
                    {t.status !== 'valid' ? ' — refunded' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {order.refund_policy && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 36 }}>{order.refund_policy}</p>
        )}

        {order.event_slug && (
          <p style={{ marginTop: 24 }}>
            <Link to={`/e/${order.event_slug}`} style={{ fontSize: 13.5, color: 'var(--accent-dark)' }}>
              ← Back to the event page
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}