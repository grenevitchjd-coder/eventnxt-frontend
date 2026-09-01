// eventnxt-frontend: src/components/GuestListTab.jsx
//
// "Guest list" tab. Event context comes from the Dashboard shell.
import { Fragment, useEffect, useRef, useState } from 'react'
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

// The token alone isn't a usable link on its own — this is the actual URL a
// guest needs to open, built from wherever this app is currently running.
const rsvpUrl = (token) => `${window.location.origin}/rsvp/${token}`

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

export default function GuestListTab({ onToast, eventId }) {
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
    perks: '',
    comments: '',
    guest_mode: '',
  })
  const [ticketRequests, setTicketRequests] = useState([])
  const [queueBusyId, setQueueBusyId] = useState(null)
  const [queueSectionPick, setQueueSectionPick] = useState({}) // guestId -> categoryId
  const [creatingGuest, setCreatingGuest] = useState(false)
  const [editingGuestId, setEditingGuestId] = useState(null)
  const [guestEditForm, setGuestEditForm] = useState(null)
  const [savingGuest, setSavingGuest] = useState(false)

  // ---- Per-guest ticket allotment override (expandable panel per row) ----
  const [expandedAllotmentGuestId, setExpandedAllotmentGuestId] = useState(null)
  const [allotmentDraftRows, setAllotmentDraftRows] = useState([]) // [{date, quantity}]
  const [newAllotmentDay, setNewAllotmentDay] = useState({ date: '', quantity: '' })
  const [savingGuestAllotment, setSavingGuestAllotment] = useState(false)

  // Reserved-seat assignment (guests in an assigned-seating area)
  const [seatsGuestId, setSeatsGuestId] = useState(null)
  const [guestSeatMap, setGuestSeatMap] = useState(null) // null = loading
  const [guestSeatSel, setGuestSeatSel] = useState([])
  const [savingGuestSeats, setSavingGuestSeats] = useState(false)

  // ---- CSV/Excel import ----
  const fileInputRef = useRef(null)
  const [stagedRows, setStagedRows] = useState(null) // null = no batch staged
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })

  // ---- Export ----
  // ---- Filters (govern both the visible table and CSV export) ----
  const [filterSearch, setFilterSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [filterSent, setFilterSent] = useState('')

  const loadEventData = (id) => {
    setCategories(null)
    setGuests(null)
    api.listTicketRequests(id).then(setTicketRequests).catch(() => {}) // absent pre-0021 backend: fine
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

  // Event context (eventId) comes from the Dashboard shell, which also
  // guarantees it's non-empty before rendering this tab and remounts it
  // (key={eventId}) when the event changes, so loading once on mount is all
  // that's needed here.
  useEffect(() => {
    loadEventData(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


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
        perks: guestForm.perks || null,
        comments: guestForm.comments || null,
        guest_mode: guestForm.guest_mode || null,
      })
      onToast(`${guestForm.name} added`)
      setGuestForm({
        name: '',
        email: '',
        guest_type_id: '',
        seating_category_id: '',
        allocation_status: 'confirmed',
        party_size: 1,
        perks: '',
        comments: '',
        guest_mode: '',
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
      perks: guest.perks || '',
      comments: guest.comments || '',
      guest_mode: guest.guest_mode || '',
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
        perks: guestEditForm.perks || null,
        comments: guestEditForm.comments || null,
        guest_mode: guestEditForm.guest_mode ?? null,
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

  // ---------- Needs-seating queue + ticket requests ----------

  const resolveAndSend = async (guest) => {
    setQueueBusyId(guest.id)
    try {
      const pickedSection = queueSectionPick[guest.id]
      if (pickedSection) {
        // Organizer chose a section explicitly — set it first, then send.
        await api.updateGuest(loadedEventId, guest.id, {
          name: guest.name,
          email: guest.email,
          guest_type_id: guest.guest_type_id,
          seating_category_id: pickedSection,
          allocation_status: guest.allocation_status,
          party_size: guest.party_size,
          perks: guest.perks || null,
          comments: guest.comments || null,
          guest_mode: guest.guest_mode ?? null,
        })
      }
      await api.sendGuestTicket(loadedEventId, guest.id)
      onToast(`${guest.name} seated — ticket sent`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setQueueBusyId(null)
    }
  }

  const declineFromQueue = async (guest) => {
    if (!window.confirm(`Regretfully decline ${guest.name}? They'll show as declined.`)) return
    try {
      await api.updateGuest(loadedEventId, guest.id, {
        name: guest.name,
        email: guest.email,
        guest_type_id: guest.guest_type_id,
        seating_category_id: null,
        allocation_status: 'declined',
        party_size: guest.party_size,
        perks: guest.perks || null,
        comments: guest.comments || null,
        guest_mode: guest.guest_mode ?? null,
      })
      onToast(`${guest.name} marked declined`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const handleRequest = async (req, approve) => {
    try {
      if (approve) await api.approveTicketRequest(loadedEventId, req.id)
      else await api.denyTicketRequest(loadedEventId, req.id)
      onToast(approve ? `Approved — ${req.guest_name}'s party grows by ${req.quantity}` : 'Request denied')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
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

  // ---------- Per-guest ticket allotment override panel ----------

  const toggleAllotmentPanel = (guest) => {
    if (expandedAllotmentGuestId === guest.id) {
      setExpandedAllotmentGuestId(null)
      return
    }
    setExpandedAllotmentGuestId(guest.id)
    setSeatsGuestId(null) // one expander at a time
    setAllotmentDraftRows(guest.ticket_allotment || [])
    setNewAllotmentDay({ date: '', quantity: '' })
  }

  const addAllotmentDraftRow = () => {
    if (!newAllotmentDay.date || newAllotmentDay.quantity === '') return
    const qty = Number(newAllotmentDay.quantity)
    setAllotmentDraftRows((prev) => {
      const withoutThisDate = prev.filter((r) => r.date !== newAllotmentDay.date)
      return [...withoutThisDate, { date: newAllotmentDay.date, quantity: qty }]
    })
    setNewAllotmentDay({ date: '', quantity: '' })
  }

  const removeAllotmentDraftRow = (date) => {
    setAllotmentDraftRows((prev) => prev.filter((r) => r.date !== date))
  }

  const saveGuestAllotment = async (guest) => {
    setSavingGuestAllotment(true)
    try {
      await api.updateGuest(loadedEventId, guest.id, {
        name: guest.name,
        email: guest.email,
        guest_type_id: guest.guest_type_id,
        seating_category_id: guest.seating_category_id || null,
        allocation_status: guest.allocation_status,
        party_size: guest.party_size || 1,
        ticket_allotment: allotmentDraftRows,
      })
      onToast('Ticket allotment saved')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingGuestAllotment(false)
    }
  }

  // ---------- Sent-link tracking ----------

  const toggleSentStatus = async (guest) => {
    try {
      await api.setGuestSentStatus(loadedEventId, guest.id, !guest.link_sent_at)
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

  const handleExportGuests = () => {
    if (visibleGuests.length === 0) {
      onToast('No guests match the current filters', true)
      return
    }
    const csv = Papa.unparse({
      fields: ['Name', 'Email', 'Guest Type', 'Seating Category', 'Status', 'Party Size', 'Sent', 'RSVP Link'],
      data: visibleGuests.map((g) => [
        g.name,
        g.email,
        guestTypeName(g.guest_type_id),
        g.seating_category_id ? categoryName(g.seating_category_id) : '',
        g.allocation_status,
        g.party_size,
        g.link_sent_at ? 'yes' : 'no',
        rsvpUrl(g.rsvp_token),
      ]),
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'guest-list-export.csv'
    a.click()
    URL.revokeObjectURL(url)
    onToast(`Exported ${filtered.length} guest(s)`)
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

  // ---------- Reserved-seat assignment ----------

  const catFor = (g) => categories?.find((c) => c.id === g.seating_category_id) || null
  const seatAssignable = (g) => catFor(g)?.sales_grain === 'seat'

  const openGuestSeats = (g) => {
    setExpandedAllotmentGuestId(null) // one expander at a time
    setSeatsGuestId(g.id)
    setGuestSeatMap(null)
    setGuestSeatSel([])
    api
      .listPoolSeats(loadedEventId, g.seating_category_id)
      .then((seatList) => {
        setGuestSeatMap(seatList)
        setGuestSeatSel(seatList.filter((s) => s.guest_id === g.id).map((s) => s.id))
      })
      .catch((e) => {
        onToast(e.message, true)
        setSeatsGuestId(null)
      })
  }

  const guestSeatSelectable = (g, s) => {
    if (s.guest_id === g.id) return true // theirs — can deselect to release
    if (s.guest_id) return false // another guest's
    return s.status === 'available' || s.status === 'reserved'
  }

  const toggleGuestSeat = (g, s) => {
    if (!guestSeatSelectable(g, s)) return
    setGuestSeatSel((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
  }

  const saveGuestSeats = async (g) => {
    setSavingGuestSeats(true)
    try {
      const res = await api.setGuestSeats(loadedEventId, g.id, guestSeatSel)
      setGuestSeatMap(res.seats)
      setGuests(guests.map((x) => (x.id === g.id ? res.guest : x)))
      onToast(
        guestSeatSel.length
          ? `${guestSeatSel.length} seat${guestSeatSel.length === 1 ? '' : 's'} assigned to ${g.name}`
          : `${g.name}'s seats released — they stay reserved`
      )
      setSeatsGuestId(null)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingGuestSeats(false)
    }
  }

  const guestSeatChipStyle = (g, s, isSelected) => {
    const base = {
      minWidth: 34,
      padding: '6px 4px',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'inherit',
      textAlign: 'center',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      color: 'var(--text)',
      cursor: guestSeatSelectable(g, s) ? 'pointer' : 'not-allowed',
    }
    if (s.status === 'sold' || s.status === 'held')
      return { ...base, background: 'var(--surface-alt)', color: 'var(--text-muted)', textDecoration: 'line-through' }
    if (s.guest_id && s.guest_id !== g.id)
      return { ...base, background: 'var(--surface-alt)', color: 'var(--text-muted)', border: '1px dashed var(--warning)' }
    if (isSelected)
      return { ...base, background: 'var(--accent-dark)', borderColor: 'var(--accent-dark)', color: '#fff', fontWeight: 600 }
    if (s.status === 'reserved') return { ...base, border: '1px dashed var(--warning)', fontWeight: 600 }
    return base
  }

  const guestSeatGroups = (seatList) => {
    const groups = []
    const byKey = {}
    for (const s of seatList) {
      const key = `${s.section_label}||${s.row_label || ''}`
      if (!byKey[key]) {
        byKey[key] = { section_label: s.section_label, row_label: s.row_label, seats: [] }
        groups.push(byKey[key])
      }
      byKey[key].seats.push(s)
    }
    return groups
  }

  const copyRsvpLink = async (guest) => {
    try {
      await navigator.clipboard.writeText(rsvpUrl(guest.rsvp_token))
      onToast(`Link copied for ${guest.name}`)
    } catch {
      onToast('Could not copy — your browser may have blocked clipboard access', true)
    }
  }

  // Every distinct day actually in use across the guest list, so the day
  // filter always reflects real event days without needing a separate
  // fetch of configured allotment dates.
  const availableDays = guests
    ? [...new Set(guests.map((g) => g.visit_date).filter(Boolean))].sort()
    : []

  const visibleGuests = (guests || []).filter((g) => {
    if (filterType && g.guest_type_id !== filterType) return false
    if (filterStatus && g.allocation_status !== filterStatus) return false
    if (filterDay && g.visit_date !== filterDay) return false
    if (filterSent === 'sent' && !g.link_sent_at) return false
    if (filterSent === 'not_sent' && g.link_sent_at) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!g.name.toLowerCase().includes(q) && !g.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <>
      <div className="page-title">Guest list</div>
      <p className="page-subtitle">Add guests one at a time, or import a whole list from a CSV or Excel file.</p>


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
                <label htmlFor="g-mode">Mode</label>
                <select
                  id="g-mode"
                  value={guestForm.guest_mode}
                  onChange={(e) => setGuestForm({ ...guestForm, guest_mode: e.target.value })}
                >
                  <option value="">Auto (from guest type)</option>
                  <option value="invite">Invite — RSVP for themselves</option>
                  <option value="distribute">Distribute — hands out an allotment</option>
                  <option value="select">Select — picks their own day</option>
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
                <label htmlFor="g-perks">Perks</label>
                <input
                  id="g-perks"
                  placeholder="drinks, gift bag…"
                  style={{ width: 140 }}
                  value={guestForm.perks}
                  onChange={(e) => setGuestForm({ ...guestForm, perks: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="g-comments">Comments</label>
                <input
                  id="g-comments"
                  placeholder="notes…"
                  style={{ width: 160 }}
                  value={guestForm.comments}
                  onChange={(e) => setGuestForm({ ...guestForm, comments: e.target.value })}
                />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingGuest}>
                Add guest
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              To give this guest tickets to distribute (models, sponsors), add them first, then use the
              "Tickets" button on their row below.
            </p>
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

          {/* ---------- Master guest list — filter, search, export ---------- */}
          {(guests || []).some((g) => g.needs_seating) && (
            <div className="panel" style={{ borderColor: 'var(--danger, #c55)' }}>
              <div className="panel-title">Needs seating</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
                These guests said YES but no section had room. Their yes is safe — nothing is sent yet.
                Pick a section (or raise a capacity in Tickets &amp; seating, then leave it on Auto) and
                send their ticket, or regretfully decline.
              </p>
              {(guests || [])
                .filter((g) => g.needs_seating)
                .map((g) => (
                  <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, minWidth: 140 }}>
                      {g.name}
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {guestTypeName(g.guest_type_id)} · party of {g.party_size}</span>
                    </span>
                    <select
                      value={queueSectionPick[g.id] || ''}
                      onChange={(e) => setQueueSectionPick({ ...queueSectionPick, [g.id]: e.target.value })}
                    >
                      <option value="">Auto (retry priorities)</option>
                      {(categories || []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-primary btn-sm" disabled={queueBusyId === g.id} onClick={() => resolveAndSend(g)}>
                      {queueBusyId === g.id ? 'Sending…' : 'Assign & send ticket'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => declineFromQueue(g)}>
                      Decline
                    </button>
                  </div>
                ))}
            </div>
          )}

          {ticketRequests.some((r) => r.status === 'pending') && (
            <div className="panel">
              <div className="panel-title">Ticket requests</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
                Guests asking to bring more people. Approving grows their party (and sends the extra
                codes if they&apos;re already confirmed).
              </p>
              {ticketRequests
                .filter((r) => r.status === 'pending')
                .map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, minWidth: 160 }}>
                      {r.guest_name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>wants +{r.quantity} (party of {r.current_party_size} now)</span>
                      {r.note && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>&ldquo;{r.note}&rdquo;</span>}
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={() => handleRequest(r, true)}>
                      Approve
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleRequest(r, false)}>
                      Deny
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="panel">
            <div className="panel-title">Guest list</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Search or filter to find someone quickly — the same filters apply to the CSV download below.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ width: 220 }}>
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Name or email…"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>
              <div className="field" style={{ width: 170 }}>
                <label>Guest type</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">All types</option>
                  {guestTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: 150 }}>
                <label>Status</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              {availableDays.length > 0 && (
                <div className="field" style={{ width: 160 }}>
                  <label>Day</label>
                  <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
                    <option value="">All days</option>
                    {availableDays.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field" style={{ width: 140 }}>
                <label>Sent</label>
                <select value={filterSent} onChange={(e) => setFilterSent(e.target.value)}>
                  <option value="">All</option>
                  <option value="sent">Sent only</option>
                  <option value="not_sent">Not yet sent</option>
                </select>
              </div>
              <button className="btn btn-secondary" onClick={handleExportGuests}>
                Download CSV
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
              Showing {visibleGuests.length} of {guests.length} guest{guests.length === 1 ? '' : 's'}
            </p>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Category</th>
                <th>Status</th>
                <th>Tickets</th>
                <th>Sent</th>
                <th>RSVP link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleGuests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    {guests.length === 0 ? 'No guests yet.' : 'No guests match the current filters.'}
                  </td>
                </tr>
              ) : (
                visibleGuests.map((g) => (
                  <Fragment key={g.id}>
                    {editingGuestId === g.id ? (
                      <tr>
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
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              type="number"
                              min={1}
                              title="Party size"
                              style={{ ...selectStyle, width: 45 }}
                              value={guestEditForm.party_size}
                              onChange={(e) => setGuestEditForm({ ...guestEditForm, party_size: e.target.value })}
                            />
                            <input
                              title="Perks"
                              placeholder="Perks"
                              style={{ ...selectStyle, width: 70 }}
                              value={guestEditForm.perks}
                              onChange={(e) => setGuestEditForm({ ...guestEditForm, perks: e.target.value })}
                            />
                            <input
                              title="Comments"
                              placeholder="Comments"
                              style={{ ...selectStyle, width: 80 }}
                              value={guestEditForm.comments}
                              onChange={(e) => setGuestEditForm({ ...guestEditForm, comments: e.target.value })}
                            />
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => toggleSentStatus(g)}
                            style={g.link_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                          >
                            {g.link_sent_at ? '✓ Sent' : 'Not sent'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a
                              href={rsvpUrl(g.rsvp_token)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary btn-sm"
                            >
                              Open
                            </a>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyRsvpLink(g)}>
                              Copy
                            </button>
                          </div>
                        </td>
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
                      <tr>
                        <td>
                          {g.name}
                          <span className="pill pill-pending" style={{ marginLeft: 6, fontSize: 10.5 }}>
                            {g.effective_mode || 'invite'}
                          </span>
                          {g.needs_seating && (
                            <span className="pill pill-declined" style={{ marginLeft: 4, fontSize: 10.5 }}>
                              needs seating
                            </span>
                          )}
                          {(g.perks || g.comments) && (
                            <span
                              title={[g.perks && `Perks: ${g.perks}`, g.comments && `Comments: ${g.comments}`]
                                .filter(Boolean)
                                .join('\n')}
                              style={{ marginLeft: 6, cursor: 'help' }}
                            >
                              📝
                            </span>
                          )}
                        </td>
                        <td className="mono">{g.email}</td>
                        <td>{guestTypeName(g.guest_type_id)}</td>
                        <td>
                          {g.seating_category_id ? categoryName(g.seating_category_id) : '—'}
                          {(g.seat_labels || []).length > 0 && (
                            <div
                              title={g.seat_labels.join('\n')}
                              style={{ fontSize: 11.5, color: 'var(--text-muted)', cursor: 'help' }}
                            >
                              {g.seat_labels.length} seat{g.seat_labels.length === 1 ? '' : 's'} assigned
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`pill pill-${g.allocation_status}`}>{g.allocation_status}</span>
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {g.party_size > 1 && <span>party of {g.party_size}</span>}
                          {g.allotment_total > 0 && (
                            <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                              {g.allotment_distributed} of {g.allotment_total} given out
                            </span>
                          )}
                          {!(g.party_size > 1) && !(g.allotment_total > 0) && '—'}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => toggleSentStatus(g)}
                            style={g.link_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                          >
                            {g.link_sent_at ? '✓ Sent' : 'Not sent'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a
                              href={rsvpUrl(g.rsvp_token)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary btn-sm"
                            >
                              Open
                            </a>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyRsvpLink(g)}>
                              Copy
                            </button>
                          </div>
                        </td>
                        <td className="actions-cell">
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleAllotmentPanel(g)}>
                            Tickets
                          </button>
                          {seatAssignable(g) && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => (seatsGuestId === g.id ? setSeatsGuestId(null) : openGuestSeats(g))}
                            >
                              Seats
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => startEditGuest(g)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteGuest(g)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )}
                    {seatsGuestId === g.id && (
                      <tr>
                        <td></td>
                        <td colSpan={8} style={{ paddingTop: 0, paddingBottom: 16 }}>
                          <div style={{ background: 'var(--surface-alt)', borderRadius: 8, padding: '12px 14px' }}>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                              {g.name}&apos;s seats in {categoryName(g.seating_category_id)} — party of {g.party_size}
                              , {guestSeatSel.length} selected. Assigning takes seats off sale; deselecting
                              releases them from {g.name} but keeps them reserved. Their ticket codes update
                              to show the seat.
                            </div>
                            {guestSeatMap === null ? (
                              <p style={{ fontSize: 13 }}>Loading seats…</p>
                            ) : guestSeatMap.length === 0 ? (
                              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                                No seats in this area yet — set up its sections on Tickets &amp; seating first.
                              </p>
                            ) : (
                              <>
                                {guestSeatGroups(guestSeatMap).map((grp) => (
                                  <div key={`${grp.section_label}|${grp.row_label}`} style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                                      Section {grp.section_label}
                                      {grp.row_label ? ` · ${grp.row_label}` : ''}
                                    </div>
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                      {grp.seats.map((s) => (
                                        <button
                                          key={s.id}
                                          type="button"
                                          style={guestSeatChipStyle(g, s, guestSeatSel.includes(s.id))}
                                          title={
                                            s.guest_id && s.guest_id !== g.id
                                              ? `${s.label} — assigned to ${s.guest_name || 'another guest'}`
                                              : s.status === 'reserved'
                                                ? `${s.label} — reserved${s.block_label ? `: ${s.block_label}` : ''}`
                                                : `${s.label} — ${s.status}`
                                          }
                                          onClick={() => toggleGuestSeat(g, s)}
                                        >
                                          {s.seat_number}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    type="button"
                                    disabled={savingGuestSeats}
                                    onClick={() => saveGuestSeats(g)}
                                  >
                                    {savingGuestSeats ? 'Saving…' : `Save seats (${guestSeatSel.length})`}
                                  </button>
                                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSeatsGuestId(null)}>
                                    Cancel
                                  </button>
                                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    Solid = pick · dashed = reserved hold · greyed dashed = another guest&apos;s · struck = sold
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {expandedAllotmentGuestId === g.id && (
                      <tr>
                        <td></td>
                        <td colSpan={8} style={{ paddingTop: 0, paddingBottom: 16 }}>
                          <div
                            style={{
                              background: 'var(--surface-alt)',
                              borderRadius: 8,
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                              {g.name}'s ticket allotment — per-day quantities they get to hand out
                              themselves. Leave empty to inherit {guestTypeName(g.guest_type_id)}'s default.
                            </div>
                            {allotmentDraftRows.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                                No override — inheriting the guest type's default allotment.
                              </p>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--text-muted)', paddingBottom: 4 }}>
                                      Date
                                    </th>
                                    <th style={{ textAlign: 'left', fontSize: 11.5, color: 'var(--text-muted)', paddingBottom: 4 }}>
                                      Tickets
                                    </th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...allotmentDraftRows]
                                    .sort((a, b) => a.date.localeCompare(b.date))
                                    .map((row) => (
                                      <tr key={row.date}>
                                        <td style={{ fontSize: 13.5, padding: '4px 0' }}>{row.date}</td>
                                        <td style={{ fontSize: 13.5, padding: '4px 0' }} className="mono">
                                          {row.quantity}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => removeAllotmentDraftRow(row.date)}
                                          >
                                            Remove
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            )}
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div className="field" style={{ width: 170 }}>
                                <label>Date</label>
                                <input
                                  type="date"
                                  value={newAllotmentDay.date}
                                  onChange={(e) => setNewAllotmentDay({ ...newAllotmentDay, date: e.target.value })}
                                />
                              </div>
                              <div className="field" style={{ width: 110 }}>
                                <label>Tickets</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={newAllotmentDay.quantity}
                                  onChange={(e) =>
                                    setNewAllotmentDay({ ...newAllotmentDay, quantity: e.target.value })
                                  }
                                />
                              </div>
                              <button className="btn btn-secondary btn-sm" onClick={addAllotmentDraftRow}>
                                Add day
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={savingGuestAllotment}
                                onClick={() => saveGuestAllotment(g)}
                              >
                                Save allotment
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}