// eventnxt-frontend: src/components/InvitesTab.jsx
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
  tickets: 'partySize',
  party: 'partySize',
  partysize: 'partySize',
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
      partySizeText: mapped.partySize || '',
      // Pending by default — confirmation comes from the RSVP, never
      // from the act of importing (mints happen on yes).
      statusText: (mapped.status || 'pending').toLowerCase(),
    }
  })
}

export default function InvitesTab({ onToast, eventId }) {
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
    section_label: '',
    visit_date: '',
    allocation_status: 'pending',
    party_size: 1,
    perks: '',
    comments: '',
    guest_mode: '',
  })
  const [ticketRequests, setTicketRequests] = useState([])
  const [queueBusyId, setQueueBusyId] = useState(null)
  const [queueSectionPick, setQueueSectionPick] = useState({}) // guestId -> categoryId
  const [creatingGuest, setCreatingGuest] = useState(false)
  // ---- The spreadsheet grid: pending edits per guest, saved in one
  // batch. Keys per guest: guest_type_id, seating_category_id,
  // section_label, party_size, spend_total, hold_timing,
  // allocation_status, and day:<iso> for per-day amounts.
  const [gridEdits, setGridEdits] = useState({})
  const [savingGrid, setSavingGrid] = useState(false)
  const [committing, setCommitting] = useState(false)

  // ---- Per-guest ticket allotment override (expandable panel per row) ----

  // Reserved-seat assignment (guests in an assigned-seating area)
  const [seatsGuestId, setSeatsGuestId] = useState(null)
  const [guestSeatMap, setGuestSeatMap] = useState(null) // null = loading
  const [guestSeatSel, setGuestSeatSel] = useState([])
  const [savingGuestSeats, setSavingGuestSeats] = useState(false)
  const [guestEventSettings, setGuestEventSettings] = useState(null)
  // Labeled reserved-seat holds across the event ("Carey Grant × 2 in
  // Row 1 Front") — used to wave a flag on matching guests' rows.
  const [labeledHolds, setLabeledHolds] = useState([])
  const guestEventDays = (() => {
    const s = guestEventSettings
    if (!s || !s.first_day || !s.last_day || !['per_day', 'mixed', 'multi_day'].includes(s.ticket_span)) return []
    const out = []
    const d = new Date(s.first_day + 'T12:00:00')
    const last = new Date(s.last_day + 'T12:00:00')
    while (d <= last && out.length < 60) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      d.setDate(d.getDate() + 1)
    }
    return out
  })()
  const fmtGuestDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  // External-ticketing events: no native inventory to hold — the
  // organizer orders real tickets on the outside platform, sends them,
  // and marks the guest here. Hold timing hides; a "tickets sent"
  // marker appears instead.
  const externalTicketing = !!guestEventSettings && guestEventSettings.ticketing_mode !== 'native'

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
    api.getEventSettings(id).then(setGuestEventSettings).catch(() => {})
    setCategories(null)
    setGuests(null)
    api.listTicketRequests(id).then(setTicketRequests).catch(() => {}) // absent pre-0021 backend: fine
    Promise.all([api.listSeatingCategories(id), api.listGuests(id), api.listGuestTypes(id)])
      .then(([cats, gsts, types]) => {
        setCategories(cats)
        setGuests(gsts)
        setGuestTypes(types)
        api.listLabeledHolds(id).then(setLabeledHolds).catch(() => setLabeledHolds([]))
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
      const created = await api.createGuest(loadedEventId, {
        name: guestForm.name.trim(),
        email: guestForm.email.trim(),
        guest_type_id: guestForm.guest_type_id,
        allocation_status: 'pending',
        party_size: 1,
        perks: null,
        comments: null,
      })
      onToast(`${created.name} added — adjust their row below, then Save & send invites`)
      setGuestForm({ name: '', email: '', guest_type_id: guestForm.guest_type_id })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingGuest(false)
    }
  }

  const syncAndResend = async (guest) => {
    const note = window.prompt(
      'Update & resend: their codes will be re-trued to their current days/quantities/seats and emailed.\n\nOptional note to highlight in the email (e.g. "You\u2019ve been upgraded to Row 1!"):',
      ''
    )
    if (note === null) return
    try {
      await api.syncGuestTickets(loadedEventId, guest.id, { note: note.trim() || null, resend: true })
      onToast(`${guest.name}'s tickets re-trued and resent`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }


  // ---------- Grid editing ----------

  const dayRowsOf = (g) => Object.fromEntries((g.ticket_allotment || []).map((r) => [r.date, r.quantity]))

  const gridVal = (g, field) => {
    const e = gridEdits[g.id]
    if (e && field in e) return e[field]
    if (field.startsWith('day:')) {
      const v = dayRowsOf(g)[field.slice(4)]
      return v === undefined ? '' : String(v)
    }
    if (field === 'spend_total') return g.spend_total ? String(g.spend_total) : ''
    if (field === 'party_size') return String(g.party_size || 1)
    if (field === 'hold_timing') return g.hold_timing || 'now'
    if (field === 'section_label') return g.section_label || ''
    if (field === 'seating_category_id') return g.seating_category_id || ''
    return g[field] ?? ''
  }

  const setGridVal = (g, field, value) =>
    setGridEdits((prev) => ({ ...prev, [g.id]: { ...(prev[g.id] || {}), [field]: value } }))

  const dirtyIds = Object.keys(gridEdits).filter((id) => Object.keys(gridEdits[id] || {}).length > 0)

  // The type's derived offer, for placeholder hints on untouched day
  // cells ("2" ghosted = comes from the type's all-days/choose default).
  const typeDerivedCount = (g) => {
    const t = guestTypes.find((x) => x.id === (gridVal(g, 'guest_type_id') || g.guest_type_id))
    return t && ['all', 'choose'].includes(t.day_scope) && t.default_ticket_count ? t.default_ticket_count : null
  }

  const buildGridPayload = (g) => {
    const e = gridEdits[g.id] || {}
    const touchedDays = Object.keys(e).some((k) => k.startsWith('day:'))
    let ticket_allotment = null // null = leave the guest's rows as they are
    if (touchedDays) {
      ticket_allotment = guestEventDays
        .map((d) => ({ date: d, quantity: parseInt(gridVal(g, `day:${d}`), 10) || 0 }))
        .filter((r) => r.quantity > 0)
    }
    return {
      name: g.name,
      email: g.email,
      guest_type_id: gridVal(g, 'guest_type_id') || g.guest_type_id,
      seating_category_id: gridVal(g, 'seating_category_id') || null,
      section_label: gridVal(g, 'section_label') || null,
      visit_date: g.visit_date || null,
      allocation_status: gridVal(g, 'allocation_status') || g.allocation_status,
      party_size: parseInt(gridVal(g, 'party_size'), 10) || 1,
      perks: g.perks || null,
      comments: g.comments || null,
      guest_mode: g.guest_mode ?? null,
      hold_timing: gridVal(g, 'hold_timing') || 'now',
      spend_total: parseInt(gridVal(g, 'spend_total'), 10) || null,
      cohort_together: g.cohort_together,
      ...(ticket_allotment !== null ? { ticket_allotment } : {}),
    }
  }

  const saveGrid = async () => {
    if (dirtyIds.length === 0) return 0
    setSavingGrid(true)
    let saved = 0
    try {
      for (const id of dirtyIds) {
        const g = (guests || []).find((x) => x.id === id)
        if (!g) continue
        await api.updateGuest(loadedEventId, id, buildGridPayload(g))
        saved++
      }
      setGridEdits({})
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
      loadEventData(loadedEventId)
    } finally {
      setSavingGrid(false)
    }
    return saved
  }

  // "Add to Invites List": commit every pending row edit, then email
  // every invitee who hasn't been sent their link yet — the one button
  // that turns drafts into real, delivered invites.
  const saveAndSendInvites = async () => {
    setCommitting(true)
    try {
      const saved = await saveGrid()
      const res = await api.sendGuestInvitesBulk(loadedEventId)
      const parts = []
      if (saved) parts.push(`${saved} change${saved === 1 ? '' : 's'} saved`)
      parts.push(
        res.sent === 0 && res.failed === 0
          ? 'everyone already invited'
          : `${res.sent} invite${res.sent === 1 ? '' : 's'} emailed${res.failed ? `, ${res.failed} failed` : ''}`
      )
      onToast(parts.join(' · '), res.failed > 0)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCommitting(false)
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
    if (guest.allocation_status === 'confirmed') {
      onToast(
        `${guest.name} is confirmed — remove them from the Guest list page, which cancels their tickets and emails them (optional note).`,
        true
      )
      return
    }
    if (!window.confirm(`Remove ${guest.name}?`)) return
    try {
      await api.deleteGuest(loadedEventId, guest.id)
      onToast(`${guest.name} removed`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
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

  // External-ticketing marker: "I ordered their real tickets on the
  // outside platform and sent them." Independent of the RSVP-link stamp.
  const toggleTicketsSent = async (guest) => {
    try {
      await api.setGuestSentStatus(loadedEventId, guest.id, !guest.tickets_sent_at, 'tickets')
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
      onToast('No invitees match the current filters', true)
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
          party_size: parseInt(updated[i].partySizeText, 10) || 1,
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
  // Unique section labels of a pool, for section-level placement selects
  const sectionLabelsOf = (categoryId) => {
    const c = categories?.find((x) => x.id === categoryId)
    return [...new Set((c?.sections || []).map((s) => s.section_label))]
  }

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

  const holdsForGuest = (g) => {
    const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const n = norm(g.name)
    if (!n) return []
    return labeledHolds.filter((h) => {
      const l = norm(h.block_label)
      return l && (l === n || l.includes(n) || n.includes(l))
    })
  }

  // "★ 2 reserved seats waiting" → point the guest at that pool (saved
  // immediately) and open the picker, where the claim strip takes over.
  const jumpToHold = async (g, hold) => {
    try {
      if (g.seating_category_id !== hold.seating_category_id) {
        const updated = await api.updateGuest(loadedEventId, g.id, {
          ...buildGridPayload(g),
          seating_category_id: hold.seating_category_id,
          section_label: null,
        })
        setGuests((prev) => prev.map((x) => (x.id === g.id ? updated : x)))
        openGuestSeats(updated)
      } else {
        openGuestSeats(g)
      }
    } catch (err) {
      onToast(err.message, true)
    }
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

  // Email one invitee their RSVP link (offer summary included) and
  // stamp the sent marker — the single-guest form of "Email all unsent".
  const emailInvite = async (guest) => {
    try {
      await api.sendGuestInvite(loadedEventId, guest.id)
      onToast(`Invite emailed to ${guest.name}`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
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

  // This page is the INVITE side only: distributors live on the
  // Allotments page, and their delegated recipients live nested under
  // them there. Everyone still appears together on the Guest list
  // (door roster) page. Counts shown on this page are counts of
  // INVITEES — people who can ever appear here — never of all guests.
  const invitees = (guests || []).filter(
    (g) => !g.allocated_by_guest_id && (g.effective_mode || 'invite') !== 'distribute'
  )
  const elsewhereCount = (guests || []).length - invitees.length
  const visibleGuests = invitees.filter((g) => {
    if (filterType && g.guest_type_id !== filterType) return false
    if (filterStatus && g.allocation_status !== filterStatus) return false
    if (filterDay && g.visit_date !== filterDay) return false
    if (filterSent === 'sent' && !g.link_sent_at) return false
    if (filterSent === 'not_sent' && g.link_sent_at) return false
    if (filterSent === 'tickets_sent' && !g.tickets_sent_at) return false
    if (filterSent === 'tickets_not_sent' && g.tickets_sent_at) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!g.name.toLowerCase().includes(q) && !g.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <>
      <div className="page-title">Invites</div>
      <p className="page-subtitle">Direct offers to named guests who answer for themselves — celebrities, press, VIPs. Grant per-day tickets, track RSVPs and requests, assign seats. Sponsors and other ticket hand-outs live on the Allotments page; the full door roster is on Guest list.</p>


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
            <div className="panel-title">Add people</div>
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
              <button className="btn btn-secondary" type="submit" disabled={creatingGuest}>
                Add guest
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              Just name, email, and type — they land in the list below with their type's defaults,
              where you adjust days, amounts, seating, and timing across the row, then hit
              <strong> Save &amp; send invites</strong>. Nothing is emailed until you do. Ticket
              hand-out budgets (sponsors, agencies) live on the Allotments page.
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
            <div className="panel-title">Find &amp; filter</div>
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
                  <option value="pending">Pending — confirms when they RSVP</option>
                  <option value="confirmed">Confirmed — mints tickets immediately</option>
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
                  {externalTicketing && <option value="tickets_sent">Tickets sent</option>}
                  {externalTicketing && <option value="tickets_not_sent">Tickets not sent</option>}
                </select>
              </div>
              <button
                className="btn btn-secondary"
                disabled={savingGrid || committing || dirtyIds.length === 0}
                onClick={async () => {
                  const n = await saveGrid()
                  if (n) onToast(`${n} change${n === 1 ? '' : 's'} saved — nothing emailed yet`)
                }}
                title="Save row edits without emailing anyone"
              >
                {savingGrid && !committing ? 'Saving…' : `Save changes${dirtyIds.length ? ` (${dirtyIds.length})` : ''}`}
              </button>
              <button
                className="btn btn-primary"
                disabled={committing || savingGrid}
                onClick={saveAndSendInvites}
                title="Save every row edit, then email every invitee who hasn't received their link"
              >
                {committing ? 'Sending…' : 'Save & send invites'}
              </button>
              <button className="btn btn-secondary" onClick={handleExportGuests}>
                Download CSV
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
              Showing {visibleGuests.length} of {invitees.length} invitee{invitees.length === 1 ? '' : 's'}
              {elsewhereCount > 0 &&
                ` · ${elsewhereCount} other guest${elsewhereCount === 1 ? ' lives' : 's live'} on Allotments and Guest list`}
            </p>
          </div>

          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Seating</th>
                {guestEventDays.map((d) => (
                  <th key={d} style={{ textAlign: 'center' }}>{fmtGuestDay(d)}</th>
                ))}
                <th title="Heads in the party — also the seat count when hand-assigning">Party</th>
                <th title="Set LOWER than the day amounts to let the guest choose where to spend">Total</th>
                {!externalTicketing && <th title="When tickets are pulled from sellable inventory">Pull</th>}
                <th>Status</th>
                <th>Progress</th>
                <th>Sent</th>
                <th>RSVP link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleGuests.length === 0 ? (
                <tr>
                  <td colSpan={10 + guestEventDays.length} className="empty-state">
                    {invitees.length === 0
                      ? guests.length === 0
                        ? 'No guests yet — add people above.'
                        : 'No direct invitees yet — add people above. Allotment holders and their recipients live on the Allotments page.'
                      : 'No invitees match the current filters.'}
                  </td>
                </tr>
              ) : (
                visibleGuests.map((g) => (
                  <Fragment key={g.id}>
                    {(
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
                          {holdsForGuest(g).map((h) => (
                            <button
                              key={h.seating_category_id + h.block_label}
                              type="button"
                              className="btn btn-sm"
                              onClick={() => jumpToHold(g, h)}
                              title={`Seats are reserved under "${h.block_label}" in ${h.pool_name} — click to open the picker and claim them`}
                              style={{
                                display: 'block', marginTop: 4, padding: '2px 8px', fontSize: 11,
                                border: '1px dashed var(--success)', color: 'var(--success)',
                                background: 'transparent', borderRadius: 6, cursor: 'pointer',
                              }}
                            >
                              ★ {h.count} reserved seat{h.count === 1 ? '' : 's'} in {h.pool_name}
                            </button>
                          ))}
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
                        <td>
                          <select
                            style={selectStyle}
                            value={gridVal(g, 'guest_type_id')}
                            onChange={(e) => setGridVal(g, 'guest_type_id', e.target.value)}
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
                            title="Seating area — Auto follows the type's priorities on confirm"
                            value={gridVal(g, 'seating_category_id')}
                            onChange={(e) => setGridVal(g, 'seating_category_id', e.target.value)}
                          >
                            <option value="">Auto</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {sectionLabelsOf(gridVal(g, 'seating_category_id')).length > 0 && (
                            <select
                              style={{ ...selectStyle, marginTop: 4 }}
                              title="Section"
                              value={gridVal(g, 'section_label')}
                              onChange={(e) => setGridVal(g, 'section_label', e.target.value)}
                            >
                              <option value="">Anywhere</option>
                              {sectionLabelsOf(gridVal(g, 'seating_category_id')).map((lbl) => (
                                <option key={lbl} value={lbl}>
                                  Sec {lbl}
                                </option>
                              ))}
                            </select>
                          )}
                          {(g.seat_labels || []).length > 0 && (
                            <div
                              title={g.seat_labels.join('\n')}
                              style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'help' }}
                            >
                              {g.seat_labels.length} seat{g.seat_labels.length === 1 ? '' : 's'} assigned
                            </div>
                          )}
                        </td>
                        {guestEventDays.map((d) => (
                          <td key={d} style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min={0}
                              placeholder={typeDerivedCount(g) ? String(typeDerivedCount(g)) : '—'}
                              title={
                                typeDerivedCount(g) && !gridVal(g, `day:${d}`)
                                  ? 'From the type default — type a number to override'
                                  : 'Tickets offered for this day'
                              }
                              style={{ ...selectStyle, width: 48, textAlign: 'center' }}
                              value={gridVal(g, `day:${d}`)}
                              onChange={(e) => setGridVal(g, `day:${d}`, e.target.value)}
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            type="number"
                            min={1}
                            style={{ ...selectStyle, width: 48, textAlign: 'center' }}
                            value={gridVal(g, 'party_size')}
                            onChange={(e) => setGridVal(g, 'party_size', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            placeholder="all"
                            title="Blank = fixed offer. Lower than the day amounts = the guest chooses where to spend."
                            style={{ ...selectStyle, width: 52, textAlign: 'center' }}
                            value={gridVal(g, 'spend_total')}
                            onChange={(e) => setGridVal(g, 'spend_total', e.target.value)}
                          />
                        </td>
                        {!externalTicketing && (
                          <td>
                            <select
                              style={selectStyle}
                              value={gridVal(g, 'hold_timing')}
                              onChange={(e) => setGridVal(g, 'hold_timing', e.target.value)}
                            >
                              <option value="now">Now</option>
                              <option value="on_confirm">On yes</option>
                              <option value="later">Later</option>
                            </select>
                          </td>
                        )}
                        <td>
                          <select
                            style={selectStyle}
                            className={`status-${gridVal(g, 'allocation_status')}`}
                            value={gridVal(g, 'allocation_status')}
                            onChange={(e) => setGridVal(g, 'allocation_status', e.target.value)}
                          >
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="declined">Declined</option>
                          </select>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {g.rsvp_confirmed && <span>RSVP: {g.rsvp_confirmed}</span>}
                          {g.ticket_count > 0 && (
                            <span style={{ display: 'block', color: 'var(--text-muted)' }}>{g.ticket_count} codes</span>
                          )}
                          {g.allotment_total > 0 && g.spend_total == null && !g.ticket_count && (
                            <span style={{ display: 'block', color: 'var(--text-muted)' }}>{g.allotment_total} offered</span>
                          )}
                          {!g.rsvp_confirmed && !g.ticket_count && !(g.allotment_total > 0) && '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => toggleSentStatus(g)}
                              title="RSVP link sent to this guest"
                              style={g.link_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                            >
                              {g.link_sent_at ? '✓ Link sent' : 'Link not sent'}
                            </button>
                            {externalTicketing && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleTicketsSent(g)}
                                title="You ordered this guest's tickets on your external platform and sent them"
                                style={g.tickets_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                              >
                                {g.tickets_sent_at ? '✓ Tickets sent' : 'Tickets not sent'}
                              </button>
                            )}
                          </div>
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
                            <button className="btn btn-secondary btn-sm" onClick={() => emailInvite(g)} title="Email this guest their RSVP link now">
                              Email
                            </button>
                          </div>
                        </td>
                        <td className="actions-cell">
                          {seatAssignable(g) && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => (seatsGuestId === g.id ? setSeatsGuestId(null) : openGuestSeats(g))}
                            >
                              Seats
                            </button>
                          )}
                          {g.allocation_status === 'confirmed' && (
                            <button
                              className="btn btn-secondary btn-sm"
                              title="Re-true codes to current days/quantities/seats and resend, with an optional note"
                              onClick={() => syncAndResend(g)}
                            >
                              Update & resend
                            </button>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={() => deleteGuest(g)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )}
                    {seatsGuestId === g.id && (
                      <tr>
                        <td></td>
                        <td colSpan={9 + guestEventDays.length + (externalTicketing ? 0 : 1)} style={{ paddingTop: 0, paddingBottom: 16 }}>
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
                                {(() => {
                                  const blocks = {}
                                  for (const seat of guestSeatMap) {
                                    if (seat.is_blocked !== false && seat.block_label && (!seat.guest_id || seat.guest_id === g.id) && seat.status !== 'sold') {
                                      ;(blocks[seat.block_label] = blocks[seat.block_label] || []).push(seat.id)
                                    }
                                  }
                                  const names = Object.keys(blocks)
                                  if (names.length === 0) return null
                                  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
                                  const mine = names.filter((n) => norm(n).includes(norm(g.name)) || norm(g.name).includes(norm(n)))
                                  const order = [...mine, ...names.filter((n) => !mine.includes(n))]
                                  return (
                                    <div style={{ marginBottom: 10, fontSize: 12 }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Reserved blocks here — click to select for {g.name}: </span>
                                      {order.map((n) => (
                                        <button
                                          key={n}
                                          type="button"
                                          className="btn btn-secondary btn-sm"
                                          style={{ marginRight: 4, marginBottom: 4, ...(mine.includes(n) ? { borderColor: 'var(--success)', color: 'var(--success)', fontWeight: 600 } : {}) }}
                                          title={mine.includes(n) ? `Label matches ${g.name} — these look like their seats` : `Select the ${blocks[n].length} seat(s) reserved under "${n}"`}
                                          onClick={() => setGuestSeatSel((prev) => [...new Set([...prev, ...blocks[n]])])}
                                        >
                                          {n} × {blocks[n].length}{mine.includes(n) ? ' ★' : ''}
                                        </button>
                                      ))}
                                    </div>
                                  )
                                })()}
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
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </>
  )
}