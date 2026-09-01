// eventnxt-frontend: src/components/TicketsSeatingTab.jsx
//
// "Tickets & seating" — the BASIS-FIRST composer. A ticket type is the
// pricing unit; its basis decides what the form asks next:
//   Named area (GA, VIP, Balcony)  -> one capacity, assigned N/A
//   By row                         -> row + sections, then a capacity
//                                     input per section, + assigned toggle
//   By tables                      -> sections, then tables × seats each
// Creating a ticket type creates its seating pool + member sections in
// one gesture (pool capacity derives as the section sum server-side).
// Pools never sold (press rows, holds) live in the Comp-only areas
// panel; guest-type priorities point at pools same as ever.
//
// Event context (eventId) comes from the Dashboard shell; remounted via
// key={eventId} on switch.

import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'

function dollarsToCents(v) {
  const f = parseFloat(v)
  return Number.isFinite(f) ? Math.round(f * 100) : NaN
}

function centsToDollars(c) {
  return (c / 100).toFixed(2)
}

const EMPTY_COMPOSER = {
  name: '',
  price: '',
  max_per_order: '10',
  basis: 'area', // 'area' | 'row' | 'table'
  area_capacity: '',
  admits: '1', // area basis: codes minted per purchased unit (packs)
  sell_by: 'seat', // table basis: 'seat' | 'table' (whole-table purchase)
  assigned: false,
  row_label: '',
  section_names: '', // comma-separated: "A, B"
  // generated per-section inputs, keyed by section name:
  section_caps: {}, // { A: '25', B: '25' }
  section_tables: {}, // { A: { tables: '4', seats: '8' } }
}

const EMPTY_EDIT = {
  name: '',
  price: '',
  quantity: '',
  max_per_order: '',
  admits: '1',
  description: '',
}

export default function TicketsSeatingTab({ onToast, eventId }) {
  const [settings, setSettings] = useState(null)
  const [ticketTypes, setTicketTypes] = useState(null)
  const [categories, setCategories] = useState(null)
  const [seatingSummary, setSeatingSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  const [composer, setComposer] = useState(EMPTY_COMPOSER)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [savingEdit, setSavingEdit] = useState(false)

  // Per-ticket-type sections editor (expander)
  const [sectionsOpenId, setSectionsOpenId] = useState(null)
  const [sectionsDraft, setSectionsDraft] = useState([]) // [{section_label,row_label,capacity,table_count,seats_per_table}]
  const [savingSections, setSavingSections] = useState(false)

  // Per-ticket-type reserved-seats view (expander, assigned pools only)
  const [seatsOpenId, setSeatsOpenId] = useState(null)
  const [seatsData, setSeatsData] = useState(null) // null = loading
  const [selectedSeats, setSelectedSeats] = useState([]) // seat ids
  const [reserveLabel, setReserveLabel] = useState('Press')
  const [savingSeats, setSavingSeats] = useState(false)
  const [eventSettings, setEventSettings] = useState(null)

  // Comp-only areas
  const [compForm, setCompForm] = useState({ name: '', capacity: '' })
  const [creatingComp, setCreatingComp] = useState(false)

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
  // (key={eventId}) when the event changes, so loading once on mount is
  // all that's needed here.
  useEffect(() => {
    api.getEventSettings(eventId).then(setEventSettings).catch(() => {})
    api
      .getEventSettings(eventId)
      .then(setSettings)
      .catch((e) => onToast(e.message, true))
    loadEventData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Composer helpers ----------

  const parsedSections = composer.section_names
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const composerTotal = () => {
    if (composer.basis === 'area') return Number(composer.area_capacity) || 0
    if (composer.basis === 'row')
      return parsedSections.reduce((sum, name) => sum + (Number(composer.section_caps[name]) || 0), 0)
    return parsedSections.reduce((sum, name) => {
      const t = composer.section_tables[name] || {}
      return sum + (Number(t.tables) || 0) * (Number(t.seats) || 0)
    }, 0)
  }

  // Purchasable UNITS + codes minted per unit, per basis:
  // area: units typed, admits typed (packs); pool holds units × admits heads.
  // row: 1 seat = 1 unit.
  // table sold by seat: heads = units. sold by table: unit = one whole
  // table (uniform seats/table required), admits = that seat count.
  const composerUnits = () => {
    const total = composerTotal()
    if (composer.basis === 'area') return Number(composer.area_capacity) || 0
    if (composer.basis === 'table' && composer.sell_by === 'table')
      return parsedSections.reduce((sum, name) => sum + (Number((composer.section_tables[name] || {}).tables) || 0), 0)
    return total
  }
  const composerAdmits = () => {
    if (composer.basis === 'area') return Math.max(1, parseInt(composer.admits, 10) || 1)
    if (composer.basis === 'table' && composer.sell_by === 'table') {
      const seatCounts = parsedSections.map((name) => Number((composer.section_tables[name] || {}).seats) || 0)
      return seatCounts[0] || 1
    }
    return 1
  }
  const tableSeatsUniform = () => {
    const seatCounts = parsedSections.map((name) => Number((composer.section_tables[name] || {}).seats) || 0)
    return seatCounts.every((x) => x === seatCounts[0])
  }

  const buildSectionsPayload = () => {
    if (composer.basis === 'row')
      return parsedSections.map((name) => ({
        section_label: name,
        row_label: composer.row_label || null,
        capacity: Number(composer.section_caps[name]) || 1,
      }))
    return parsedSections.map((name) => {
      const t = composer.section_tables[name] || {}
      return {
        section_label: name,
        table_count: Number(t.tables) || 1,
        seats_per_table: Number(t.seats) || 1,
        capacity: 1, // derived server-side from table math
      }
    })
  }

  // Name is buyer-facing only — for row/table bases it can be left blank
  // and we compose one from the structure ("Row 1 — Sections A, B").
  const autoName = () => {
    const secs = parsedSections.join(', ')
    if (composer.basis === 'row')
      return `${composer.row_label || 'Row'} — Section${parsedSections.length > 1 ? 's' : ''} ${secs}`
    if (composer.basis === 'table') return `Tables — Section${parsedSections.length > 1 ? 's' : ''} ${secs}`
    return ''
  }

  const handleCompose = async (e) => {
    e.preventDefault()
    const total = composerTotal()
    if (total < 1) {
      onToast('Fill in the capacities first — the total is still zero.', true)
      return
    }
    if (composer.basis !== 'area' && parsedSections.length === 0) {
      onToast('List at least one section (e.g. "A, B").', true)
      return
    }
    if (composer.basis === 'table' && composer.sell_by === 'table' && !tableSeatsUniform()) {
      onToast('Selling whole tables needs the same seats-per-table in every section — split into separate ticket types instead.', true)
      return
    }
    const ttName = composer.name.trim() || autoName()
    if (!ttName) {
      onToast('Give this ticket type a name.', true)
      return
    }
    setCreating(true)
    try {
      // 1. The seating pool behind this ticket type
      const grain = composer.basis === 'area' ? 'ga' : composer.basis === 'table' ? 'table' : composer.assigned ? 'seat' : 'row'
      const pool = await api.createSeatingCategory(eventId, {
        name: ttName,
        capacity: composer.basis === 'area' ? composerUnits() * composerAdmits() : 1, // heads; non-area derived from sections next
        sales_grain: grain,
        row_label: composer.basis === 'row' ? composer.row_label || null : null,
        // pool-level table math is a placeholder — the real per-section
        // math lands in step 2 and derives the true capacity
        table_count: composer.basis === 'table' ? 1 : null,
        seats_per_table: composer.basis === 'table' ? 1 : null,
      })
      // 2. Member sections (row/table bases)
      if (composer.basis !== 'area') {
        await api.replaceZoneSections(eventId, pool.id, buildSectionsPayload())
      }
      // 3. The ticket type, inventory = the derived total
      const created = await api.createTicketType(eventId, {
        name: ttName,
        description: null,
        price_cents: dollarsToCents(composer.price || '0'),
        quantity: composerUnits(),
        admits: composerAdmits(),
        max_per_order: parseInt(composer.max_per_order, 10) || 10,
        seating_category_id: pool.id,
        sales_start: null,
        sales_end: null,
        is_active: true,
        sort_order: 0,
      })
      onToast(
        composerAdmits() > 1
          ? `"${created.name}" created — ${composerUnits()} for sale, each admits ${composerAdmits()} (${total} seats)`
          : `"${created.name}" created — ${total} seats`
      )
      setComposer(EMPTY_COMPOSER)
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreating(false)
    }
  }

  // ---------- Ticket type edit / lifecycle (unchanged mechanics) ----------

  const toPayload = (f, existing = {}) => ({
    name: f.name,
    description: f.description || null,
    price_cents: dollarsToCents(f.price || '0'),
    quantity: parseInt(f.quantity, 10),
    max_per_order: parseInt(f.max_per_order, 10) || 10,
    admits: Math.max(1, parseInt(f.admits, 10) || (existing.admits ?? 1)),
    seating_category_id: existing.seating_category_id || null,
    sales_start: existing.sales_start || null,
    sales_end: existing.sales_end || null,
    is_active: existing.is_active !== undefined ? existing.is_active : true,
    sort_order: existing.sort_order || 0,
  })

  const startEdit = (t) => {
    setEditingId(t.id)
    setEditForm({
      name: t.name,
      admits: String(t.admits || 1),
      price: centsToDollars(t.price_cents),
      quantity: String(t.quantity),
      max_per_order: String(t.max_per_order),
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

  // ---------- Sections editor (per ticket type) ----------

  const poolFor = (t) => (categories || []).find((c) => c.id === t.seating_category_id) || null

  // ---------- Reserved seats (assigned pools) ----------

  const openSeatsView = (t) => {
    const pool = poolFor(t)
    if (!pool) return
    setSectionsOpenId(null) // one expander at a time
    setSeatsOpenId(t.id)
    setSeatsData(null)
    setSelectedSeats([])
    api
      .listPoolSeats(eventId, pool.id)
      .then(setSeatsData)
      .catch((e) => {
        onToast(e.message, true)
        setSeatsOpenId(null)
      })
  }

  const toggleSeat = (seat) => {
    if (seat.status === 'sold' || seat.status === 'held') return
    setSelectedSeats((prev) => (prev.includes(seat.id) ? prev.filter((x) => x !== seat.id) : [...prev, seat.id]))
  }

  const selectedStatuses = (seatsData || []).filter((s) => selectedSeats.includes(s.id)).map((s) => s.status)
  const canReserve = selectedSeats.length > 0 && selectedStatuses.every((s) => s === 'available')
  const canRelease = selectedSeats.length > 0 && selectedStatuses.every((s) => s === 'reserved')

  const applySeats = async (t, action) => {
    const pool = poolFor(t)
    if (!pool) return
    setSavingSeats(true)
    try {
      const view =
        action === 'reserve'
          ? await api.blockSeats(eventId, pool.id, selectedSeats, reserveLabel.trim())
          : await api.unblockSeats(eventId, pool.id, selectedSeats)
      setSeatsData(view)
      onToast(
        action === 'reserve'
          ? `${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'} reserved${reserveLabel.trim() ? ` for ${reserveLabel.trim()}` : ''} — off sale immediately`
          : `${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'} released — back on sale`
      )
      setSelectedSeats([])
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingSeats(false)
    }
  }

  const seatChipStyle = (seat, isSelected) => {
    const base = {
      minWidth: 34,
      padding: '6px 4px',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'inherit',
      textAlign: 'center',
      cursor: seat.status === 'sold' || seat.status === 'held' ? 'not-allowed' : 'pointer',
      border: '1px solid var(--border)',
      background: 'var(--bg)',
      color: 'var(--text)',
    }
    if (seat.status === 'sold' || seat.status === 'held') {
      return { ...base, background: 'var(--surface-alt)', color: 'var(--text-muted)', textDecoration: 'line-through' }
    }
    if (seat.status === 'reserved') {
      return {
        ...base,
        background: isSelected ? 'var(--warning)' : 'transparent',
        border: '1px dashed var(--warning)',
        color: isSelected ? '#fff' : 'var(--text)',
        fontWeight: 600,
      }
    }
    // available
    return isSelected ? { ...base, background: 'var(--accent-dark)', borderColor: 'var(--accent-dark)', color: '#fff' } : base
  }

  const seatGroups = (seats) => {
    const groups = []
    const byKey = {}
    for (const s of seats) {
      const key = `${s.section_label}||${s.row_label || ''}`
      if (!byKey[key]) {
        byKey[key] = { section_label: s.section_label, row_label: s.row_label, seats: [] }
        groups.push(byKey[key])
      }
      byKey[key].seats.push(s)
    }
    return groups
  }

  const openSectionsEditor = (t) => {
    const pool = poolFor(t)
    setSeatsOpenId(null) // one expander at a time
    setSectionsOpenId(t.id)
    setSectionsDraft(
      (pool?.sections || []).map((sx) => ({
        section_label: sx.section_label,
        row_label: sx.row_label || '',
        capacity: String(sx.capacity),
        table_count: sx.table_count ? String(sx.table_count) : '',
        seats_per_table: sx.seats_per_table ? String(sx.seats_per_table) : '',
      }))
    )
  }

  const saveSections = async (t) => {
    const pool = poolFor(t)
    if (!pool) return
    setSavingSections(true)
    try {
      const payload = sectionsDraft.map((d) => ({
        section_label: d.section_label,
        row_label: d.row_label || null,
        capacity: Number(d.capacity) || 1,
        table_count: d.table_count ? Number(d.table_count) : null,
        seats_per_table: d.seats_per_table ? Number(d.seats_per_table) : null,
      }))
      const updatedPool = await api.replaceZoneSections(eventId, pool.id, payload)
      // Keep ticket inventory in step with the derived seating total.
      await api.updateTicketType(eventId, t.id, {
        ...toPayload(
          {
            name: t.name,
            price: centsToDollars(t.price_cents),
            quantity: String(
              (t.admits || 1) > 1 ? Math.max(1, Math.floor(updatedPool.capacity / (t.admits || 1))) : updatedPool.capacity
            ),
            max_per_order: String(t.max_per_order),
            description: t.description || '',
          },
          t
        ),
      })
      onToast(`Sections saved — ${updatedPool.capacity} seats total`)
      setSectionsOpenId(null)
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingSections(false)
    }
  }

  // ---------- Comp-only areas ----------

  const soldPoolIds = new Set((ticketTypes || []).map((t) => t.seating_category_id).filter(Boolean))
  const compPools = (categories || []).filter((c) => !soldPoolIds.has(c.id))

  const handleCreateComp = async (e) => {
    e.preventDefault()
    setCreatingComp(true)
    try {
      await api.createSeatingCategory(eventId, { name: compForm.name, capacity: Number(compForm.capacity), sales_grain: 'ga' })
      onToast(`"${compForm.name}" added`)
      setCompForm({ name: '', capacity: '' })
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingComp(false)
    }
  }

  const deleteCompPool = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? Any guests assigned to it will become unassigned.`)) return
    try {
      await api.deleteSeatingCategory(eventId, c.id)
      onToast(`"${c.name}" deleted`)
      loadEventData()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const sectionSummaryLine = (pool) => {
    if (!pool) return null
    if (pool.sections && pool.sections.length > 0)
      return pool.sections
        .map((sx) =>
          sx.table_count
            ? `${sx.section_label}: ${sx.table_count}×${sx.seats_per_table}`
            : `${sx.section_label}: ${sx.capacity}`
        )
        .join(' · ')
    return null
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
          ? 'Ticket types are your prices. Pick the basis — a named area, rows, or tables — and the form asks for exactly the structure that basis needs.'
          : mode === 'external'
            ? 'Tickets for this event sell on your external platform — here you define the room itself, which powers the guest list, comps, and reconciliation. External sales come in via CSV import (Promos & referrals).'
            : 'This event is invite-only — no public sales. The areas here power the guest list, comps, and the reconciliation below.'}
      </p>
      {eventSettings && eventSettings.ticket_span !== 'single_day' && (
        <div
          style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', fontSize: 12.5, marginBottom: 14,
          }}
        >
          <strong>{eventSettings.ticket_span === 'multi_day' ? 'Whole-event tickets' : 'Mixed days & passes'}</strong>
          {' · '}
          {eventSettings.first_day} → {eventSettings.last_day} — whole-event types mint one dated code
          per day. Change this in Event settings.
        </div>
      )}

      {selling && (
        <div className="panel">
          <div className="panel-title">Add a ticket type</div>
          <form onSubmit={handleCompose}>
            <div className="inline-form">
              <div className="field" style={{ flex: 1, minWidth: 170 }}>
                <label htmlFor="tt-name">Name</label>
                <input
                  id="tt-name"
                  required={composer.basis === 'area'}
                  placeholder={composer.basis === 'area' ? 'VIP' : autoName() || 'Leave blank to auto-name'}
                  value={composer.name}
                  onChange={(e) => setComposer({ ...composer, name: e.target.value })}
                />
              </div>
              <div className="field" style={{ width: 100 }}>
                <label htmlFor="tt-price">Price ($)</label>
                <input
                  id="tt-price"
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={composer.price}
                  onChange={(e) => setComposer({ ...composer, price: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="tt-basis">Priced by</label>
                <select
                  id="tt-basis"
                  style={inputStyle}
                  value={composer.basis}
                  onChange={(e) => setComposer({ ...composer, basis: e.target.value })}
                >
                  <option value="area">Named area (GA, VIP, Balcony…)</option>
                  <option value="row">Row</option>
                  <option value="table">Tables</option>
                </select>
              </div>
              <div className="field" style={{ width: 100 }}>
                <label htmlFor="tt-max">Max / order</label>
                <input
                  id="tt-max"
                  type="number"
                  min={1}
                  value={composer.max_per_order}
                  onChange={(e) => setComposer({ ...composer, max_per_order: e.target.value })}
                />
              </div>
            </div>

            {composer.basis === 'area' && (
              <div className="inline-form" style={{ marginTop: 4 }}>
                <div className="field" style={{ width: 150 }}>
                  <label htmlFor="tt-area-cap">{Number(composer.admits) > 1 ? 'Quantity for sale' : 'Capacity'}</label>
                  <input
                    id="tt-area-cap"
                    type="number"
                    min={1}
                    required
                    value={composer.area_capacity}
                    onChange={(e) => setComposer({ ...composer, area_capacity: e.target.value })}
                  />
                </div>
                <div className="field" style={{ width: 110 }}>
                  <label htmlFor="tt-admits">Each admits</label>
                  <input
                    id="tt-admits"
                    type="number"
                    min={1}
                    value={composer.admits}
                    onChange={(e) => setComposer({ ...composer, admits: e.target.value })}
                  />
                </div>
                {Number(composer.admits) > 1 && Number(composer.area_capacity) > 0 && (
                  <span style={{ alignSelf: 'flex-end', paddingBottom: 10, fontSize: 12.5, color: 'var(--text-muted)' }}>
                    = {Number(composer.area_capacity) * Math.max(1, parseInt(composer.admits, 10) || 1)} people
                  </span>
                )}
              </div>
            )}

            {composer.basis !== 'area' && (
              <div className="inline-form" style={{ marginTop: 4 }}>
                {composer.basis === 'row' && (
                  <div className="field" style={{ width: 130 }}>
                    <label htmlFor="tt-row">Row</label>
                    <input
                      id="tt-row"
                      placeholder="Row 1"
                      value={composer.row_label}
                      onChange={(e) => setComposer({ ...composer, row_label: e.target.value })}
                    />
                  </div>
                )}
                <div className="field" style={{ flex: 1, minWidth: 170 }}>
                  <label htmlFor="tt-sections">Sections (comma-separated)</label>
                  <input
                    id="tt-sections"
                    placeholder="A, B"
                    value={composer.section_names}
                    onChange={(e) => setComposer({ ...composer, section_names: e.target.value })}
                  />
                </div>
              </div>
            )}

            {composer.basis === 'row' && parsedSections.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Seats per section
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {parsedSections.map((name) => (
                    <div className="field" key={name} style={{ width: 130 }}>
                      <label>
                        {composer.row_label ? `${composer.row_label} · ` : ''}Section {name}
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={composer.section_caps[name] || ''}
                        onChange={(e) =>
                          setComposer({
                            ...composer,
                            section_caps: { ...composer.section_caps, [name]: e.target.value },
                          })
                        }
                      />
                    </div>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={composer.assigned}
                      onChange={(e) => setComposer({ ...composer, assigned: e.target.checked })}
                    />
                    Assigned seating
                  </label>
                </div>
              </div>
            )}

            {composer.basis === 'table' && (
              <div className="inline-form" style={{ marginTop: 4 }}>
                <div className="field" style={{ width: 200 }}>
                  <label htmlFor="tt-sellby">Sold by</label>
                  <select
                    id="tt-sellby"
                    value={composer.sell_by}
                    onChange={(e) => setComposer({ ...composer, sell_by: e.target.value })}
                  >
                    <option value="seat">Individual seat</option>
                    <option value="table">Whole table</option>
                  </select>
                </div>
                {composer.sell_by === 'table' && (
                  <span style={{ alignSelf: 'flex-end', paddingBottom: 10, fontSize: 12.5, color: 'var(--text-muted)' }}>
                    price is per table — one purchase admits the whole table
                  </span>
                )}
              </div>
            )}
            {composer.basis === 'table' && parsedSections.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Tables per section
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {parsedSections.map((name) => {
                    const t = composer.section_tables[name] || { tables: '', seats: '' }
                    return (
                      <div key={name} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <div className="field" style={{ width: 85 }}>
                          <label>Sec {name} tables</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={t.tables}
                            onChange={(e) =>
                              setComposer({
                                ...composer,
                                section_tables: { ...composer.section_tables, [name]: { ...t, tables: e.target.value } },
                              })
                            }
                          />
                        </div>
                        <div className="field" style={{ width: 95 }}>
                          <label>Seats / table</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={t.seats}
                            onChange={(e) =>
                              setComposer({
                                ...composer,
                                section_tables: { ...composer.section_tables, [name]: { ...t, seats: e.target.value } },
                              })
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                {composerTotal() > 0
                  ? `Total: ${composerAdmits() > 1 ? `${composerUnits()} for sale × admits ${composerAdmits()} = ` : ''}${composerTotal()} seats${composer.basis !== 'area' && parsedSections.length ? ` across ${parsedSections.length} section${parsedSections.length === 1 ? '' : 's'}` : ''}`
                  : 'Total appears as you fill in capacities'}
              </span>
              <button className="btn btn-secondary" type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create ticket type'}
              </button>
            </div>
          </form>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
            Price $0 makes a free/comp ticket — buyers get it instantly, no payment step.
          </p>
        </div>
      )}

      {selling && (
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
                  No ticket types yet — the public page shows the external ticket link (if set) until one
                  exists here.
                </td>
              </tr>
            ) : (
              ticketTypes.map((t) => {
                const pool = poolFor(t)
                const breakdown = sectionSummaryLine(pool)
                return (
                  <Fragment key={t.id}>
                    {editingId === t.id ? (
                      <tr>
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
                        <td>
                          <input
                            type="number"
                            min={1}
                            title="Each purchased unit admits this many people"
                            style={{ width: 60 }}
                            value={editForm.admits}
                            onChange={(e) => setEditForm({ ...editForm, admits: e.target.value })}
                          />
                        </td>
                        <td colSpan={3}></td>
                        <td className="actions-cell">
                          <button className="btn btn-secondary btn-sm" disabled={savingEdit} onClick={() => saveEdit(t)}>
                            Save
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td>
                          <div>{t.name}</div>
                          {breakdown && (
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{breakdown}</div>
                          )}
                          {pool && pool.sales_grain === 'seat' && (
                            <span className="pill pill-confirmed" style={{ fontSize: 10.5 }}>
                              assigned seats
                            </span>
                          )}
                          {(t.admits || 1) > 1 && (
                            <span className="pill pill-pending" style={{ fontSize: 10.5, marginLeft: 4 }}>
                              admits {t.admits}
                            </span>
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
                          {pool && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => (sectionsOpenId === t.id ? setSectionsOpenId(null) : openSectionsEditor(t))}
                            >
                              Sections
                            </button>
                          )}
                          {pool && pool.sales_grain === 'seat' && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => (seatsOpenId === t.id ? setSeatsOpenId(null) : openSeatsView(t))}
                            >
                              Seats
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(t)}>
                            {t.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )}
                    {sectionsOpenId === t.id && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--surface-alt)' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                            {t.name} — sections
                          </div>
                          {sectionsDraft.length === 0 && (
                            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
                              No breakdown yet — add sections to split this pool.
                            </p>
                          )}
                          {sectionsDraft.map((d, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                              <input
                                placeholder="Section"
                                style={{ width: 90 }}
                                value={d.section_label}
                                onChange={(e) =>
                                  setSectionsDraft(sectionsDraft.map((x, j) => (j === i ? { ...x, section_label: e.target.value } : x)))
                                }
                              />
                              <input
                                placeholder="Row"
                                style={{ width: 80 }}
                                value={d.row_label}
                                onChange={(e) =>
                                  setSectionsDraft(sectionsDraft.map((x, j) => (j === i ? { ...x, row_label: e.target.value } : x)))
                                }
                              />
                              {d.table_count || d.seats_per_table ? (
                                <>
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="Tables"
                                    style={{ width: 70 }}
                                    value={d.table_count}
                                    onChange={(e) =>
                                      setSectionsDraft(sectionsDraft.map((x, j) => (j === i ? { ...x, table_count: e.target.value } : x)))
                                    }
                                  />
                                  ×
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="Seats"
                                    style={{ width: 70 }}
                                    value={d.seats_per_table}
                                    onChange={(e) =>
                                      setSectionsDraft(sectionsDraft.map((x, j) => (j === i ? { ...x, seats_per_table: e.target.value } : x)))
                                    }
                                  />
                                </>
                              ) : (
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="Seats"
                                  style={{ width: 80 }}
                                  value={d.capacity}
                                  onChange={(e) =>
                                    setSectionsDraft(sectionsDraft.map((x, j) => (j === i ? { ...x, capacity: e.target.value } : x)))
                                  }
                                />
                              )}
                              <button
                                className="btn btn-danger btn-sm"
                                type="button"
                                onClick={() => setSectionsDraft(sectionsDraft.filter((_, j) => j !== i))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              type="button"
                              onClick={() =>
                                setSectionsDraft([...sectionsDraft, { section_label: '', row_label: '', capacity: '', table_count: '', seats_per_table: '' }])
                              }
                            >
                              + Add section
                            </button>
                            <button className="btn btn-primary btn-sm" type="button" disabled={savingSections} onClick={() => saveSections(t)}>
                              {savingSections ? 'Saving…' : 'Save sections'}
                            </button>
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSectionsOpenId(null)}>
                              Close
                            </button>
                          </div>
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                            Saving re-derives the pool capacity and keeps the ticket quantity in step.
                          </p>
                        </td>
                      </tr>
                    )}
                    {seatsOpenId === t.id && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--surface-alt)' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                            {t.name} — reserved seats
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 10 }}>
                            Click seats, then reserve them with a label (&ldquo;Press&rdquo;) — reserved seats
                            can&apos;t be bought until released. Buyers just see them as unavailable.
                          </p>
                          {seatsData === null ? (
                            <p style={{ fontSize: 13 }}>Loading seats…</p>
                          ) : seatsData.length === 0 ? (
                            <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                              No seats yet — save this type&apos;s sections first.
                            </p>
                          ) : (
                            <>
                              {seatGroups(seatsData).map((g) => (
                                <div key={`${g.section_label}|${g.row_label}`} style={{ marginBottom: 10 }}>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    Section {g.section_label}
                                    {g.row_label ? ` · ${g.row_label}` : ''}
                                  </div>
                                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {g.seats.map((s) => (
                                      <button
                                        key={s.id}
                                        type="button"
                                        style={seatChipStyle(s, selectedSeats.includes(s.id))}
                                        title={
                                          s.status === 'reserved'
                                            ? `${s.label} — reserved${s.block_label ? `: ${s.block_label}` : ''}`
                                            : `${s.label} — ${s.status}`
                                        }
                                        onClick={() => toggleSeat(s)}
                                      >
                                        {s.seat_number}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                                <input
                                  placeholder="Label (Press, Sponsor…)"
                                  style={{ width: 170 }}
                                  value={reserveLabel}
                                  onChange={(e) => setReserveLabel(e.target.value)}
                                />
                                <button
                                  className="btn btn-primary btn-sm"
                                  type="button"
                                  disabled={!canReserve || savingSeats}
                                  onClick={() => applySeats(t, 'reserve')}
                                >
                                  {savingSeats ? 'Saving…' : `Reserve${selectedSeats.length ? ` ${selectedSeats.length}` : ''}`}
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  type="button"
                                  disabled={!canRelease || savingSeats}
                                  onClick={() => applySeats(t, 'release')}
                                >
                                  Release{canRelease ? ` ${selectedSeats.length}` : ''}
                                </button>
                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSeatsOpenId(null)}>
                                  Close
                                </button>
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                  Solid = pick to reserve · dashed = reserved (pick to release) · struck = sold or in a cart
                                </span>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      )}

      {/* ---------- Comp-only areas — never sold ---------- */}
      <div className="panel">
        <div className="panel-title">Comp-only areas</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
          {selling
            ? 'Areas that are never sold — a press row, a hold. Guest types\u2019 seating priorities can point here just like anywhere else.'
            : 'The areas of your room — guest types\u2019 seating priorities draw from these.'}
        </p>
        <form className="inline-form" onSubmit={handleCreateComp}>
          <div className="field">
            <label htmlFor="comp-name">Name</label>
            <input
              id="comp-name"
              required
              placeholder="Press row"
              value={compForm.name}
              onChange={(e) => setCompForm({ ...compForm, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="comp-capacity">Capacity</label>
            <input
              id="comp-capacity"
              type="number"
              min={1}
              required
              style={{ minWidth: 90 }}
              value={compForm.capacity}
              onChange={(e) => setCompForm({ ...compForm, capacity: e.target.value })}
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={creatingComp}>
            Add area
          </button>
        </form>
        {compPools.length > 0 && (
          <table className="data-table" style={{ marginTop: 12 }}>
            <tbody>
              {compPools.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    {sectionSummaryLine(c) && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sectionSummaryLine(c)}</div>
                    )}
                  </td>
                  <td className="mono">{c.capacity}</td>
                  <td className="actions-cell">
                    <button className="btn btn-danger btn-sm" onClick={() => deleteCompPool(c)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---------- Seating Summary — reconciliation ---------- */}
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
          A live reconciliation across every source — box office sales are matched by ticket type against
          each pool&apos;s name. &ldquo;Confirmed avail.&rdquo; mirrors the real capacity check;
          &ldquo;estimated avail.&rdquo; also subtracts pending guest-list holds and box office sales.
        </p>
        {seatingSummary === null ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : seatingSummary.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing to reconcile yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Capacity</th>
                <th>Box office</th>
                <th>Allotted</th>
                <th>Committed</th>
                <th>Confirmed avail.</th>
                <th>Estimated avail.</th>
              </tr>
            </thead>
            <tbody>
              {seatingSummary.map((row) => {
                const pool = (categories || []).find((c) => c.id === row.category_id)
                const breakdown = sectionSummaryLine(pool)
                return (
                  <tr key={row.category_id}>
                    <td>
                      {row.category_name}
                      {breakdown && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{breakdown}</div>
                      )}
                    </td>
                    <td className="mono">{row.capacity}</td>
                    <td className="mono">{row.box_office}</td>
                    <td className="mono">{row.allotted}</td>
                    <td className="mono">{row.committed}</td>
                    <td className="mono">{row.confirmed_avail}</td>
                    <td className="mono">{row.estimated_avail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}