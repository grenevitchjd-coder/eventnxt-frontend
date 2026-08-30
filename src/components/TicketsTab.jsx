// eventnxt-frontend: src/components/TicketsTab.jsx
//
// Organizer-side native ticket sales: create and manage ticket types and
// watch sold/held/available live. Same event-picker pattern as the Event
// workspace tab. This replaces the console seed script as the way ticket
// types get made.

import { useEffect, useState } from 'react'
import { api } from '../api'

function dollarsToCents(v) {
  const f = parseFloat(v)
  return Number.isFinite(f) ? Math.round(f * 100) : NaN
}

function centsToDollars(c) {
  return (c / 100).toFixed(2)
}

const EMPTY_FORM = {
  name: '',
  price: '',
  quantity: '',
  max_per_order: '10',
  seating_category_id: '',
  description: '',
}

export default function TicketsTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [ticketTypes, setTicketTypes] = useState(null)
  const [categories, setCategories] = useState([])

  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  // Event context (eventId) comes from the Dashboard shell, which also
  // guarantees it's non-empty before rendering this tab and remounts it
  // (key={eventId}) when the event changes, so loading once on mount is all
  // that's needed here.
  useEffect(() => {
    loadEventData(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadEventData = (id) => {
    setTicketTypes(null)
    Promise.all([api.listTicketTypes(id), api.listSeatingCategories(id)])
      .then(([tts, cats]) => {
        setTicketTypes(tts)
        setCategories(cats)
        setLoadedEventId(id)
      })
      .catch((e) => onToast(e.message, true))
  }


  const refresh = () => loadEventData(loadedEventId)

  // Always send the FULL payload — the backend PUT is a full replace,
  // same contract as the profile editor.
  const toPayload = (f, existing = {}) => ({
    name: f.name,
    description: f.description || null,
    price_cents: dollarsToCents(f.price || '0'),
    quantity: parseInt(f.quantity, 10),
    max_per_order: parseInt(f.max_per_order, 10) || 10,
    seating_category_id: f.seating_category_id || null,
    sales_start: existing.sales_start || null,
    sales_end: existing.sales_end || null,
    is_active: existing.is_active !== undefined ? existing.is_active : true,
    sort_order: existing.sort_order || 0,
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    const priceCents = dollarsToCents(form.price || '0')
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      onToast('Enter a valid price (0 is fine for a free ticket).', true)
      return
    }
    setCreating(true)
    try {
      const created = await api.createTicketType(loadedEventId, toPayload(form))
      setTicketTypes([...ticketTypes, created])
      setForm(EMPTY_FORM)
      onToast(`"${created.name}" created`)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (t) => {
    setEditingId(t.id)
    setEditForm({
      name: t.name,
      price: centsToDollars(t.price_cents),
      quantity: String(t.quantity),
      max_per_order: String(t.max_per_order),
      seating_category_id: t.seating_category_id || '',
      description: t.description || '',
    })
  }

  const saveEdit = async (t) => {
    setSavingEdit(true)
    try {
      const updated = await api.updateTicketType(loadedEventId, t.id, toPayload(editForm, t))
      setTicketTypes(ticketTypes.map((x) => (x.id === t.id ? updated : x)))
      setEditingId(null)
      onToast('Saved')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleActive = async (t) => {
    try {
      const updated = await api.updateTicketType(loadedEventId, t.id, {
        ...toPayload(
          {
            name: t.name,
            price: centsToDollars(t.price_cents),
            quantity: String(t.quantity),
            max_per_order: String(t.max_per_order),
            seating_category_id: t.seating_category_id || '',
            description: t.description || '',
          },
          t
        ),
        is_active: !t.is_active,
      })
      setTicketTypes(ticketTypes.map((x) => (x.id === t.id ? updated : x)))
      onToast(updated.is_active ? 'On sale' : 'Deactivated — hidden from the public page')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}"? Only possible if it has no orders.`)) return
    try {
      await api.deleteTicketType(loadedEventId, t.id)
      setTicketTypes(ticketTypes.filter((x) => x.id !== t.id))
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || '—'


  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
    color: 'var(--text)',
    fontSize: 13.5,
    fontFamily: 'inherit',
  }

  return (
    <>
      <div className="page-title">Tickets</div>
      <p className="page-subtitle">
        Sell tickets directly on the public event page. Prices are what buyers pay — the platform fee
        comes out of the organizer side. Linking a seating category makes paid sales share that
        category's pool with the guest list.
      </p>


      {loadedEventId && ticketTypes !== null && (
        <>
          <div className="panel">
            <div className="panel-title">Add a ticket type</div>
            <form className="inline-form" onSubmit={handleCreate}>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="tt-name">Name</label>
                <input
                  id="tt-name"
                  required
                  placeholder="General Admission"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field" style={{ width: 110 }}>
                <label htmlFor="tt-price">Price ($)</label>
                <input
                  id="tt-price"
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="20.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="field" style={{ width: 100 }}>
                <label htmlFor="tt-qty">Quantity</label>
                <input
                  id="tt-qty"
                  required
                  type="number"
                  min={0}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="field" style={{ width: 110 }}>
                <label htmlFor="tt-max">Max / order</label>
                <input
                  id="tt-max"
                  type="number"
                  min={1}
                  value={form.max_per_order}
                  onChange={(e) => setForm({ ...form, max_per_order: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="tt-cat">Seating category (optional)</label>
                <select
                  id="tt-cat"
                  style={inputStyle}
                  value={form.seating_category_id}
                  onChange={(e) => setForm({ ...form, seating_category_id: e.target.value })}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creating}>
                Add ticket type
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
              Price $0 makes a free/comp ticket — buyers get it instantly, no payment step. A $0.00 price
              is the intended way to run "Free — RSVP required" tickets.
            </p>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket type</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Sold</th>
                <th>Held</th>
                <th>Avail.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ticketTypes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No ticket types yet — the public page shows the external ticket link (if set) until
                    one exists here.
                  </td>
                </tr>
              ) : (
                ticketTypes.map((t) =>
                  editingId === t.id ? (
                    <tr key={t.id}>
                      <td>
                        <input
                          style={{ width: '100%' }}
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                        <input
                          style={{ width: '100%', marginTop: 6 }}
                          placeholder="Description (optional)"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          style={{ width: 80 }}
                          value={editForm.price}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          style={{ width: 70 }}
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                        />
                      </td>
                      <td colSpan={3}>
                        <select
                          style={inputStyle}
                          value={editForm.seating_category_id}
                          onChange={(e) => setEditForm({ ...editForm, seating_category_id: e.target.value })}
                        >
                          <option value="">No seating category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td></td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={savingEdit}
                          onClick={() => saveEdit(t)}
                        >
                          Save
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id}>
                      <td>
                        <div>{t.name}</div>
                        {t.seating_category_id && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            Pool: {categoryName(t.seating_category_id)}
                          </div>
                        )}
                      </td>
                      <td className="mono">{t.price_cents === 0 ? 'Free' : `$${centsToDollars(t.price_cents)}`}</td>
                      <td className="mono">{t.quantity}</td>
                      <td className="mono">{t.sold}</td>
                      <td className="mono">{t.held}</td>
                      <td className="mono">{t.available}</td>
                      <td>
                        <span className={`pill pill-${t.is_active ? 'confirmed' : 'pending'}`}>
                          {t.is_active ? 'on sale' : 'inactive'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>
                          Edit
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(t)}>
                          {t.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Sold = paid orders. Held = checkouts in progress (they release themselves after 30 minutes if
            never paid). Numbers refresh when you switch events or{' '}
            <button
              onClick={refresh}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-dark)', cursor: 'pointer', fontSize: 12 }}
            >
              refresh now
            </button>
            .
          </p>
        </>
      )}
    </>
  )
}