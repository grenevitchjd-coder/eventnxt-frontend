import { useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { api } from '../api'

const selectStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '6px 8px',
  color: 'var(--text)',
  fontSize: 13,
}

// Recognized CSV/Excel column headers, normalized (lowercase, letters only)
// mapped to our internal field names. Keeps the importer forgiving about
// "Guest Type" vs "guest_type" vs "Type".
const HEADER_ALIASES = {
  name: 'name',
  fullname: 'name',
  guestname: 'name',
  email: 'email',
  emailaddress: 'email',
  guesttype: 'guestType',
  type: 'guestType',
  seatingcategory: 'seatingCategory',
  seating: 'seatingCategory',
  category: 'seatingCategory',
  status: 'status',
  allocationstatus: 'status',
}

const normalizeHeader = (h) => (h || '').toString().toLowerCase().replace(/[^a-z]/g, '')

function rowsFromParsedRecords(records) {
  // records: array of objects keyed by raw header text (from Papa/XLSX)
  return records.map((record) => {
    const mapped = {}
    for (const [rawKey, value] of Object.entries(record)) {
      const field = HEADER_ALIASES[normalizeHeader(rawKey)]
      if (field) mapped[field] = (value ?? '').toString().trim()
    }
    return {
      name: mapped.name || '',
      email: mapped.email || '',
      guestTypeText: mapped.guestType || '',
      seatingCategoryText: mapped.seatingCategory || '',
      statusText: (mapped.status || 'confirmed').toLowerCase(),
    }
  })
}

export default function GuestListTab({ onToast }) {
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState(() => sessionStorage.getItem('eventnxt_last_event_id') || '')
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [guestTypes, setGuestTypes] = useState([])
  const [categories, setCategories] = useState(null)
  const [guests, setGuests] = useState(null)

  // ---- Add a guest ----
  const [guestForm, setGuestForm] = useState({
    name: '',
    email: '',
    guest_type_id: '',
    seating_category_id: '',
    allocation_status: 'confirmed',
    party_size: 1,
    allotment_ticket_count: '',
  })
  const [creatingGuest, setCreatingGuest] = useState(false)
  const [editingGuestId, setEditingGuestId] = useState(null)
  const [guestEditForm, setGuestEditForm] = useState(null)
  const [savingGuest, setSavingGuest] = useState(false)

  // ---- CSV/Excel import ----
  const fileInputRef = useRef(null)
  const [stagedRows, setStagedRows] = useState(null) // null = no batch staged
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })

  const loadEventData = (id) => {
    setCategories(null)
    setGuests(null)
    Promise.all([api.listSeatingCategories(id), api.listGuests(id), api.listGuestTypes(id)])
      .then(([cats, gsts, types]) => {
        setCategories(cats)
        setGuests(gsts)
        setGuestTypes(types)
        setLoadedEventId(id)
        sessionStorage.setItem('eventnxt_last_event_id', id)
      })
      .catch((e) => onToast(e.message, true))
  }

  useEffect(() => {
    api
      .listEvents()
      .then((evs) => {
        setEvents(evs)
        const restored = evs.find((e) => e.id === eventId)
        const initial = restored ? restored.id : evs[0]?.id || ''
        setEventId(initial)
        if (initial) loadEventData(initial)
      })
      .catch((e) => onToast(e.message, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectEvent = (e) => {
    const id = e.target.value
    setEventId(id)
    setEditingGuestId(null)
    setStagedRows(null)
    if (id) loadEventData(id)
  }

  // ---------- Add / edit / delete a single guest ----------

  const handleCreateGuest = async (e) => {
    e.preventDefault()
    setCreatingGuest(true)
    try {
      await api.createGuest(loadedEventId, {
        name: guestForm.name,
        email: guestForm.email,
        guest_type_id: guestForm.guest_type_id,
        seating_category_id: guestForm.seating_category_id || null,
        allocation_status: guestForm.allocation_status,
        party_size: Number(guestForm.party_size) || 1,
        allotment_ticket_count: guestForm.allotment_ticket_count === '' ? null : Number(guestForm.allotment_ticket_count),
      })
      onToast(`${guestForm.name} added`)
      setGuestForm({
        name: '',
        email: '',
        guest_type_id: '',
        seating_category_id: '',
        allocation_status: 'confirmed',
        party_size: 1,
        allotment_ticket_count: '',
      })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingGuest(false)
    }
  }

  const startEditGuest = (guest) => {
    setEditingGuestId(guest.id)
    setGuestEditForm({
      name: guest.name,
      email: guest.email,
      guest_type_id: guest.guest_type_id,
      seating_category_id: guest.seating_category_id || '',
      allocation_status: guest.allocation_status,
      party_size: guest.party_size || 1,
      allotment_ticket_count: guest.allotment_ticket_count ?? '',
    })
  }

  const saveEditGuest = async (guestId) => {
    setSavingGuest(true)
    try {
      await api.updateGuest(loadedEventId, guestId, {
        name: guestEditForm.name,
        email: guestEditForm.email,
        guest_type_id: guestEditForm.guest_type_id,
        seating_category_id: guestEditForm.seating_category_id || null,
        allocation_status: guestEditForm.allocation_status,
        party_size: Number(guestEditForm.party_size) || 1,
        allotment_ticket_count:
          guestEditForm.allotment_ticket_count === '' ? null : Number(guestEditForm.allotment_ticket_count),
      })
      onToast('Saved')
      setEditingGuestId(null)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingGuest(false)
    }
  }

  const deleteGuest = async (guest) => {
    if (!window.confirm(`Remove ${guest.name}?`)) return
    try {
      await api.deleteGuest(loadedEventId, guest.id)
      onToast(`${guest.name} removed`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- CSV / Excel import ----------

  const downloadTemplate = () => {
    const csv = Papa.unparse({
      fields: ['Name', 'Email', 'Guest Type', 'Seating Category', 'Status'],
      data: [
        ['Jane Doe', 'jane@example.com', guestTypes[0]?.name || 'Volunteer', '', 'confirmed'],
        ['John Smith', 'john@example.com', guestTypes[0]?.name || 'Volunteer', '', 'pending'],
      ],
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'guest-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const resolveRow = (raw) => {
    const guestType = guestTypes.find((t) => t.name.toLowerCase() === raw.guestTypeText.toLowerCase())
    const seatingCategory = raw.seatingCategoryText
      ? categories.find((c) => c.name.toLowerCase() === raw.seatingCategoryText.toLowerCase())
      : null
    const status = raw.statusText === 'pending' ? 'pending' : 'confirmed'

    const errors = []
    if (!raw.name) errors.push('Missing name')
    if (!raw.email) errors.push('Missing email')
    if (!guestType) errors.push(`Guest type "${raw.guestTypeText || '(blank)'}" not found`)
    if (raw.seatingCategoryText && !seatingCategory) {
      errors.push(`Seating category "${raw.seatingCategoryText}" not found`)
    }

    return {
      name: raw.name,
      email: raw.email,
      guest_type_id: guestType?.id || '',
      seating_category_id: seatingCategory?.id || '',
      allocation_status: status,
      errors,
      importStatus: 'pending', // pending | success | error
      importError: null,
    }
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    try {
      let records
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        records = parsed.data
      } else {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        records = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
      }

      if (!records.length) {
        onToast('No rows found in that file', true)
        return
      }

      const staged = rowsFromParsedRecords(records).map(resolveRow)
      setStagedRows(staged)
      const errorCount = staged.filter((r) => r.errors.length > 0).length
      onToast(
        errorCount > 0
          ? `Loaded ${staged.length} rows — ${errorCount} need fixing before import`
          : `Loaded ${staged.length} rows — ready to import`
      )
    } catch (err) {
      onToast(`Couldn't read that file: ${err.message}`, true)
    }
  }

  const updateStagedRow = (index, changes) => {
    setStagedRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const merged = { ...row, ...changes }
        const errors = []
        if (!merged.name) errors.push('Missing name')
        if (!merged.email) errors.push('Missing email')
        if (!merged.guest_type_id) errors.push('Guest type required')
        return { ...merged, errors }
      })
    )
  }

  const removeStagedRow = (index) => {
    setStagedRows((prev) => prev.filter((_, i) => i !== index))
  }

  const clearStagedBatch = () => {
    setStagedRows(null)
    setImportProgress({ done: 0, total: 0 })
  }

  const runImport = async () => {
    const rowsToImport = stagedRows.filter((r) => r.errors.length === 0)
    if (rowsToImport.length === 0) {
      onToast('No valid rows to import — fix the errors first', true)
      return
    }

    setImporting(true)
    setImportProgress({ done: 0, total: rowsToImport.length })

    // Sequential on purpose: guest events here are capped well under 200
    // people, and going one at a time gives real per-row feedback from the
    // backend's capacity/priority-seating logic (which of two guests
    // competing for the last seat actually got it, etc.) rather than
    // firing a burst of concurrent requests just to save a few seconds.
    let succeeded = 0
    let failed = 0
    const updated = [...stagedRows]

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].errors.length > 0) continue
      try {
        await api.createGuest(loadedEventId, {
          name: updated[i].name,
          email: updated[i].email,
          guest_type_id: updated[i].guest_type_id,
          seating_category_id: updated[i].seating_category_id || null,
          allocation_status: updated[i].allocation_status,
        })
        updated[i] = { ...updated[i], importStatus: 'success', importError: null }
        succeeded++
      } catch (err) {
        updated[i] = { ...updated[i], importStatus: 'error', importError: err.message }
        failed++
      }
      setImportProgress({ done: succeeded + failed, total: rowsToImport.length })
      setStagedRows([...updated])
    }

    setImporting(false)
    onToast(failed === 0 ? `Imported ${succeeded} guests` : `Imported ${succeeded}, ${failed} failed`, failed > 0)
    loadEventData(loadedEventId)
  }

  const categoryName = (id) => categories?.find((c) => c.id === id)?.name || '—'
  const guestTypeName = (id) => guestTypes?.find((t) => t.id === id)?.name || 'unknown'

  return (
    <>
      <div className="page-title">Guest list</div>
      <p className="page-subtitle">Add guests one at a time, or import a whole list from a CSV or Excel file.</p>

      {events === null ? null : events.length === 0 ? (
        <div className="data-table">
          <div className="empty-state">
            No events yet — create one in Events360's org dashboard first, then come back here.
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="field">
            <label htmlFor="event-picker">Event</label>
            <select
              id="event-picker"
              style={{ width: '100%', minWidth: 280 }}
              value={eventId}
              onChange={handleSelectEvent}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loadedEventId && categories !== null && guests !== null && (
        <>
          {guestTypes.length === 0 && (
            <div className="panel" style={{ borderColor: 'var(--warn, #a66)' }}>
              <p style={{ fontSize: 13, margin: 0 }}>
                This event has no guest types yet — add at least one in Event workspace before adding or
                importing guests.
              </p>
            </div>
          )}

          {/* ---------- Add a single guest ---------- */}
          <div className="panel">
            <div className="panel-title">Add a guest</div>
            <form className="inline-form" onSubmit={handleCreateGuest}>
              <div className="field">
                <label htmlFor="g-name">Name</label>
                <input
                  id="g-name"
                  required
                  value={guestForm.name}
                  onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="g-email">Email</label>
                <input
                  id="g-email"
                  type="email"
                  required
                  value={guestForm.email}
                  onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="g-type">Guest type</label>
                <select
                  id="g-type"
                  required
                  value={guestForm.guest_type_id}
                  onChange={(e) => setGuestForm({ ...guestForm, guest_type_id: e.target.value })}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {guestTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-category">Seating category</label>
                <select
                  id="g-category"
                  value={guestForm.seating_category_id}
                  onChange={(e) => setGuestForm({ ...guestForm, seating_category_id: e.target.value })}
                >
                  <option value="">Auto (from guest type's priority list)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-status">Status</label>
                <select
                  id="g-status"
                  value={guestForm.allocation_status}
                  onChange={(e) => setGuestForm({ ...guestForm, allocation_status: e.target.value })}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-party-size">Party size</label>
                <input
                  id="g-party-size"
                  type="number"
                  min={1}
                  style={{ width: 80 }}
                  value={guestForm.party_size}
                  onChange={(e) => setGuestForm({ ...guestForm, party_size: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="g-ticket-count">Tickets to give out</label>
                <input
                  id="g-ticket-count"
                  type="number"
                  min={0}
                  placeholder="Type default"
                  style={{ width: 120 }}
                  value={guestForm.allotment_ticket_count}
                  onChange={(e) => setGuestForm({ ...guestForm, allotment_ticket_count: e.target.value })}
                />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingGuest}>
                Add guest
              </button>
            </form>
          </div>

          {/* ---------- Import ---------- */}
          <div className="panel">
            <div className="panel-title">Import from CSV or Excel</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Columns: Name, Email, Guest Type, Seating Category (optional — leave blank to auto-assign
              from the guest type's priority list), Status (optional — defaults to confirmed). Guest Type
              must match an existing guest type name exactly.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelected}
                style={{ display: 'none' }}
              />
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Choose file…
              </button>
              <button className="btn btn-secondary" onClick={downloadTemplate}>
                Download template
              </button>
            </div>
          </div>

          {stagedRows && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="panel-title" style={{ margin: 0 }}>
                  {stagedRows.length} row{stagedRows.length === 1 ? '' : 's'} staged
                  {stagedRows.some((r) => r.errors.length > 0) &&
                    ` — ${stagedRows.filter((r) => r.errors.length > 0).length} need fixing`}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={clearStagedBatch} disabled={importing}>
                    Clear
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={runImport}
                    disabled={importing || stagedRows.every((r) => r.errors.length > 0)}
                  >
                    {importing
                      ? `Importing ${importProgress.done}/${importProgress.total}…`
                      : `Import ${stagedRows.filter((r) => r.errors.length === 0).length} guest(s)`}
                  </button>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Guest type</th>
                    <th>Seating category</th>
                    <th>Status</th>
                    <th>Result</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stagedRows.map((row, i) => (
                    <tr key={i} style={row.errors.length > 0 ? { background: 'rgba(200,80,80,0.08)' } : undefined}>
                      <td>
                        <input
                          value={row.name}
                          onChange={(e) => updateStagedRow(i, { name: e.target.value })}
                          style={{ width: '100%' }}
                          disabled={importing}
                        />
                      </td>
                      <td>
                        <input
                          value={row.email}
                          onChange={(e) => updateStagedRow(i, { email: e.target.value })}
                          style={{ width: '100%' }}
                          disabled={importing}
                        />
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={row.guest_type_id}
                          onChange={(e) => updateStagedRow(i, { guest_type_id: e.target.value })}
                          disabled={importing}
                        >
                          <option value="">Choose…</option>
                          {guestTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={row.seating_category_id}
                          onChange={(e) => updateStagedRow(i, { seating_category_id: e.target.value })}
                          disabled={importing}
                        >
                          <option value="">Auto</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={row.allocation_status}
                          onChange={(e) => updateStagedRow(i, { allocation_status: e.target.value })}
                          disabled={importing}
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="pending">Pending</option>
                        </select>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {row.importStatus === 'success' && <span style={{ color: 'var(--success, #4a4)' }}>✓ Added</span>}
                        {row.importStatus === 'error' && (
                          <span style={{ color: 'var(--danger, #c55)' }}>✕ {row.importError}</span>
                        )}
                        {row.importStatus === 'pending' && row.errors.length > 0 && (
                          <span style={{ color: 'var(--danger, #c55)' }}>{row.errors.join('; ')}</span>
                        )}
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => removeStagedRow(i)}
                          disabled={importing}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------- Existing guest list ---------- */}
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Category</th>
                <th>Status</th>
                <th>Tickets</th>
                <th>RSVP link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No guests yet.
                  </td>
                </tr>
              ) : (
                guests.map((g) =>
                  editingGuestId === g.id ? (
                    <tr key={g.id}>
                      <td>
                        <input
                          value={guestEditForm.name}
                          onChange={(e) => setGuestEditForm({ ...guestEditForm, name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="email"
                          value={guestEditForm.email}
                          onChange={(e) => setGuestEditForm({ ...guestEditForm, email: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={guestEditForm.guest_type_id}
                          onChange={(e) => setGuestEditForm({ ...guestEditForm, guest_type_id: e.target.value })}
                        >
                          {guestTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={guestEditForm.seating_category_id}
                          onChange={(e) =>
                            setGuestEditForm({ ...guestEditForm, seating_category_id: e.target.value })
                          }
                        >
                          <option value="">None</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={guestEditForm.allocation_status}
                          onChange={(e) =>
                            setGuestEditForm({ ...guestEditForm, allocation_status: e.target.value })
                          }
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="pending">Pending</option>
                          <option value="declined">Declined</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            title="Party size"
                            style={{ ...selectStyle, width: 55 }}
                            value={guestEditForm.party_size}
                            onChange={(e) => setGuestEditForm({ ...guestEditForm, party_size: e.target.value })}
                          />
                          <input
                            type="number"
                            min={0}
                            placeholder="Give out"
                            title="Tickets to give out (blank = type default)"
                            style={{ ...selectStyle, width: 70 }}
                            value={guestEditForm.allotment_ticket_count}
                            onChange={(e) =>
                              setGuestEditForm({ ...guestEditForm, allotment_ticket_count: e.target.value })
                            }
                          />
                        </div>
                      </td>
                      <td className="mono">{g.rsvp_token}</td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={savingGuest}
                          onClick={() => saveEditGuest(g.id)}
                        >
                          Save
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingGuestId(null)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td className="mono">{g.email}</td>
                      <td>{guestTypeName(g.guest_type_id)}</td>
                      <td>{g.seating_category_id ? categoryName(g.seating_category_id) : '—'}</td>
                      <td>
                        <span className={`pill pill-${g.allocation_status}`}>{g.allocation_status}</span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {g.party_size > 1 && <span>party of {g.party_size}</span>}
                        {g.allotment_ticket_count > 0 && (
                          <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                            gives out {g.allotment_ticket_count}
                          </span>
                        )}
                        {!(g.party_size > 1) && !(g.allotment_ticket_count > 0) && '—'}
                      </td>
                      <td className="mono">{g.rsvp_token}</td>
                      <td className="actions-cell">
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditGuest(g)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteGuest(g)}>
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
    </>
  )
}