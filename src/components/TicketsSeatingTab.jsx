// eventnxt-frontend: src/components/TicketsSeatingTab.jsx
//
// "Tickets & seating" — ONE place to answer "what am I selling and how
// much room is there?", replacing the separate Tickets tab and the seating
// half of the old Event workspace.
//
// Under the hood ticket types (what you sell) and seating sections (what
// physically exists, and the pool comp guests draw from) stay separate
// models — but the default gesture creates both together: adding
// "VIP — $150 — 40" makes the ticket type AND a matching 40-seat section
// in one go. The section dropdown's "Create matching section" default is
// that gesture; picking an existing section instead covers the shared-pool
// case (early-bird + regular GA selling into one section).
//
// The tab shapes itself to the event's ticketing mode (Event settings):
//   native      -> everything below
//   external    -> seating sections + summary only, with a pointer to
//                  where external sales come in (CSV import)
//   invite_only -> seating sections + summary only, comp-flavored copy
//
// Event context (eventId) comes from the Dashboard shell; remounted via
// key={eventId} on switch.

import { useEffect, useState } from 'react'
import { api } from '../api'

function dollarsToCents(v) {
  const f = parseFloat(v)
  return Number.isFinite(f) ? Math.round(f * 100) : NaN
}

function centsToDollars(c) {
  return (c / 100).toFixed(2)
}

const CREATE_MATCHING = '__create_matching__'

const EMPTY_FORM = {
  name: '',
  price: '',
  quantity: '',
  max_per_order: '10',
  seating_category_id: CREATE_MATCHING,
  description: '',
}

export default function TicketsSeatingTab({ onToast, eventId }) {
  const [settings, setSettings] = useState(null)

  const [ticketTypes, setTicketTypes] = useState(null)
  const [categories, setCategories] = useState(null)
  const [seatingSummary, setSeatingSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  // Ticket type create/edit
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  // Seating section create/edit
  const [catForm, setCatForm] = useState({ name: '', capacity: '' })
  const [creatingCat, setCreatingCat] = useState(false)
  const [editingCatId, setEditingCatId] = useState(null)
  const [catEditForm, setCatEditForm] = useState({ name: '', capacity: '' })
  const [savingCat, setSavingCat] = useState(false)

  const loadSeatingSummary = () => {
    setLoadingSummary(true)
    api
      .getSeatingSummary(eventId)
      .then(setSeatingSummary)
      .catch((e) => onToast(e.message, true))
      .finally(() => setLoadingSummary(false))
  }

  const loadEventData = () => {
    Promise.all([api.listTicketTypes(eventId), api.listSeatingCategories(eventId)])
      .then(([tts, cats]) => {
        setTicketTypes(tts)
        setCategories(cats)
      })
      .catch((e) => onToast(e.message, true))
    loadSeatingSummary()
  }

  // Event context (eventId) comes from the Dashboard shell, which also
  // guarantees it's non-empty before rendering this tab and remounts it
  // (key={eventId}) when the event changes, so loading once on mount is all
  // that's needed here.
  useEffect(() => {
    api
      .getEventSettings(eventId)
      .then(setSettings)
      .catch((e) => onToast(e.message, true))
    loadEventData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Ticket types ----------

  // Always send the FULL payload — the backend PUT is a full replace,
  // same contract as the profile editor.
  const toPayload = (f, existing = {}) => ({
    name: f.name,
    description: f.description || null,
    price_cents: dollarsToCents(f.price || '0'),
    quantity: parseInt(f.quantity, 10),
    max_per_order: parseInt(f.max_per_order, 10) || 10,
    seating_category_id:
      f.seating_category_id && f.seating_category_id !== CREATE_MATCHING ? f.seating_category_id : null,
    sales_start: existing.sales_start || null,
    sales_end: existing.sales_end || null,
    is_active: existing.is_active !== undefined ? existing.is_active : true,
    sort_order: existing.sort_order || 0,
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      let categoryId = form.seating_category_id
      if (categoryId === CREATE_MATCHING) {
        // The one-gesture path: a matching section, same name, capacity =
        // the ticket quantity, so comps and reconciliation work without
        // the organizer ever thinking about "categories".
        const cat = await api.createSeatingCategory(eventId, {
          name: form.name,
          capacity: parseInt(form.quantity, 10),
        })
        categoryId = cat.id
      }
      const created = await api.createTicketType(
        eventId,
        toPayload({ ...form, seating_category_id: categoryId === CREATE_MATCHING ? '' : categoryId })
      )
      setTicketTypes([...(ticketTypes || []), created])
      setForm(EMPTY_FORM)
      onToast(`"${created.name}" created`)
      loadEventData() // sections + summary changed too
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
      const updated = await api.updateTicketType(eventId, t.id, toPayload(editForm, t))
      setTicketTypes(ticketTypes.map((x) => (x.id === t.id ? updated : x)))
      setEditingId(null)
      onToast('Saved')
      loadSeatingSummary()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleActive = async (t) => {
    try {
      const updated = await api.updateTicketType(eventId, t.id, {
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
      await api.deleteTicketType(eventId, t.id)
      setTicketTypes(ticketTypes.filter((x) => x.id !== t.id))
      loadSeatingSummary()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const categoryName = (id) => (categories || []).find((c) => c.id === id)?.name || '—'

  // ---------- Seating sections ----------

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    setCreatingCat(true)
    try {
      await api.createSeatingCategory(eventId, { name: catForm.name, capacity: Number(catForm.capacity) })
      onToast(`"${catForm.name}" added`)
      setCatForm({ name: '', capacity: '' })
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingCat(false)
    }
  }

  const startEditCat = (cat) => {
    setEditingCatId(cat.id)
    setCatEditForm({ name: cat.name, capacity: cat.capacity })
  }

  const saveEditCat = async (catId) => {
    setSavingCat(true)
    try {
      await api.updateSeatingCategory(eventId, catId, {
        name: catEditForm.name,
        capacity: Number(catEditForm.capacity),
      })
      onToast('Saved')
      setEditingCatId(null)
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingCat(false)
    }
  }

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? Any guests assigned to it will become unassigned.`)) return
    try {
      await api.deleteSeatingCategory(eventId, cat.id)
      onToast(`"${cat.name}" deleted`)
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
    color: 'var(--text)',
    fontSize: 13.5,
    fontFamily: 'inherit',
  }

  if (!settings || ticketTypes === null || categories === null) return null

  const mode = settings.ticketing_mode
  const selling = mode === 'native'

  return (
    <>
      <div className="page-title">Tickets &amp; seating</div>
      <p className="page-subtitle">
        {selling
          ? 'What you sell and how much room there is. Adding a ticket type creates a matching seating section by default — pick an existing section instead when two ticket types share one pool.'
          : mode === 'external'
            ? "Tickets for this event sell on your external platform — here you define the room itself: seating sections and capacity, which power the guest list, comps, and the reconciliation below. External sales come in via CSV import (Promos & referrals)."
            : 'This event is invite-only — no public sales. Seating sections and capacity here power the guest list, comps, and the reconciliation below.'}
      </p>

      {selling && (
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
                <label htmlFor="tt-cat">Seating section</label>
                <select
                  id="tt-cat"
                  style={inputStyle}
                  value={form.seating_category_id}
                  onChange={(e) => setForm({ ...form, seating_category_id: e.target.value })}
                >
                  <option value={CREATE_MATCHING}>Create matching section</option>
                  <option value="">None (no shared pool)</option>
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
              is the intended way to run &ldquo;Free — RSVP required&rdquo; tickets.
            </p>
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
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
                          <option value="">No seating section</option>
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
        </>
      )}

      {/* ---------- Seating sections — the room itself ---------- */}
      <div className="panel">
        <div className="panel-title">Add a seating section</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
          {selling
            ? 'For sections that aren\u2019t sold as their own ticket type — e.g. a reserved comp/press area. (Sections for sold tickets are created automatically by the form above.)'
            : 'Sections and their capacity — the pools your guest types\u2019 seating priorities draw from.'}
        </p>
        <form className="inline-form" onSubmit={handleCreateCategory}>
          <div className="field">
            <label htmlFor="cat-name">Name</label>
            <input
              id="cat-name"
              required
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cat-capacity">Capacity</label>
            <input
              id="cat-capacity"
              type="number"
              min={1}
              required
              style={{ minWidth: 90 }}
              value={catForm.capacity}
              onChange={(e) => setCatForm({ ...catForm, capacity: e.target.value })}
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={creatingCat}>
            Add section
          </button>
        </form>
      </div>

      <table className="data-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Section</th>
            <th>Capacity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty-state">
                No seating sections yet.
              </td>
            </tr>
          ) : (
            categories.map((c) =>
              editingCatId === c.id ? (
                <tr key={c.id}>
                  <td>
                    <input
                      value={catEditForm.name}
                      onChange={(e) => setCatEditForm({ ...catEditForm, name: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={catEditForm.capacity}
                      onChange={(e) => setCatEditForm({ ...catEditForm, capacity: e.target.value })}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={savingCat}
                      onClick={() => saveEditCat(c.id)}
                    >
                      Save
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingCatId(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{c.capacity}</td>
                  <td className="actions-cell">
                    <button className="btn btn-secondary btn-sm" onClick={() => startEditCat(c)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c)}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>

      {/* ---------- Seating Summary — capacity/box office/guest list reconciliation ---------- */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-title" style={{ margin: 0 }}>
            Seating summary
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadSeatingSummary} disabled={loadingSummary}>
            {loadingSummary ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8, marginBottom: 14 }}>
          A live reconciliation across every source — box office sales are matched by ticket type
          against each section&apos;s name. &ldquo;Confirmed avail.&rdquo; mirrors the real capacity check;
          &ldquo;estimated avail.&rdquo; is the more conservative number, also subtracting pending
          guest-list holds and box office sales.
        </p>
        {seatingSummary === null ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : seatingSummary.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No seating sections yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Capacity</th>
                <th>Box office</th>
                <th>Allotted</th>
                <th>Committed</th>
                <th>Confirmed avail.</th>
                <th>Estimated avail.</th>
              </tr>
            </thead>
            <tbody>
              {seatingSummary.map((row) => (
                <tr key={row.category_id}>
                  <td>{row.category_name}</td>
                  <td className="mono">{row.capacity}</td>
                  <td className="mono">{row.box_office}</td>
                  <td className="mono">{row.allotted}</td>
                  <td className="mono">{row.committed}</td>
                  <td className="mono">{row.confirmed_avail}</td>
                  <td className="mono">{row.estimated_avail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}