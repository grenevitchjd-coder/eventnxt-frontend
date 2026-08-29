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

const HEADER_ALIASES = {
  name: 'name',
  fullname: 'name',
  guestname: 'name',
  email: 'email',
  emailaddress: 'email',
  guesttype: 'guestType',
  type: 'guestType',
}

const normalizeHeader = (h) => (h || '').toString().toLowerCase().replace(/[^a-z]/g, '')

function rowsFromParsedRecords(records) {
  return records.map((record) => {
    const mapped = {}
    for (const [rawKey, value] of Object.entries(record)) {
      const field = HEADER_ALIASES[normalizeHeader(rawKey)]
      if (field) mapped[field] = (value ?? '').toString().trim()
    }
    return { name: mapped.name || '', email: mapped.email || '', guestTypeText: mapped.guestType || '' }
  })
}

const rsvpUrl = (token) => `${window.location.origin}/rsvp/${token}`

export default function RSVPManagementTab({ onToast }) {
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState(() => sessionStorage.getItem('eventnxt_last_event_id') || '')
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [guestTypes, setGuestTypes] = useState([])
  const [guests, setGuests] = useState(null)

  // ---- Bulk import for allotment-holder types ----
  const fileInputRef = useRef(null)
  const [stagedRows, setStagedRows] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [expandedOverrideIndex, setExpandedOverrideIndex] = useState(null)
  const [newOverrideDay, setNewOverrideDay] = useState({ date: '', quantity: '' })

  const loadEventData = (id) => {
    setGuests(null)
    Promise.all([api.listGuests(id), api.listGuestTypes(id)])
      .then(([gsts, types]) => {
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
    setStagedRows(null)
    if (id) loadEventData(id)
  }

  const guestTypeName = (id) => guestTypes?.find((t) => t.id === id)?.name || 'unknown'

  // ---------- Bulk import ----------

  const downloadTemplate = () => {
    const csv = Papa.unparse({
      fields: ['Name', 'Email', 'Guest Type'],
      data: [
        ['Jane Doe', 'jane@example.com', guestTypes[0]?.name || 'Model'],
        ['John Smith', 'john@example.com', guestTypes[0]?.name || 'Model'],
      ],
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rsvp-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const resolveRow = (raw) => {
    const guestType = guestTypes.find((t) => t.name.toLowerCase() === raw.guestTypeText.toLowerCase())
    const errors = []
    if (!raw.name) errors.push('Missing name')
    if (!raw.email) errors.push('Missing email')
    if (!guestType) errors.push(`Guest type "${raw.guestTypeText || '(blank)'}" not found`)
    return {
      name: raw.name,
      email: raw.email,
      guest_type_id: guestType?.id || '',
      ticketOverride: [], // empty = inherit the guest type's default allotment
      errors,
      importStatus: 'pending',
      importError: null,
    }
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      let records
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        records = Papa.parse(text, { header: true, skipEmptyLines: true }).data
      } else {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        records = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
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

  const removeStagedRow = (index) => setStagedRows((prev) => prev.filter((_, i) => i !== index))
  const clearStagedBatch = () => {
    setStagedRows(null)
    setExpandedOverrideIndex(null)
    setImportProgress({ done: 0, total: 0 })
  }

  const toggleOverride = (index) => {
    setExpandedOverrideIndex(expandedOverrideIndex === index ? null : index)
    setNewOverrideDay({ date: '', quantity: '' })
  }

  const addOverrideDay = (index) => {
    if (!newOverrideDay.date || newOverrideDay.quantity === '') return
    const qty = Number(newOverrideDay.quantity)
    updateStagedRow(index, {
      ticketOverride: [
        ...stagedRows[index].ticketOverride.filter((r) => r.date !== newOverrideDay.date),
        { date: newOverrideDay.date, quantity: qty },
      ],
    })
    setNewOverrideDay({ date: '', quantity: '' })
  }

  const removeOverrideDay = (index, date) => {
    updateStagedRow(index, { ticketOverride: stagedRows[index].ticketOverride.filter((r) => r.date !== date) })
  }

  const runImport = async () => {
    const rowsToImport = stagedRows.filter((r) => r.errors.length === 0)
    if (rowsToImport.length === 0) {
      onToast('No valid rows to import — fix the errors first', true)
      return
    }
    setImporting(true)
    setImportProgress({ done: 0, total: rowsToImport.length })

    let succeeded = 0
    let failed = 0
    const updated = [...stagedRows]

    // Sequential, same reasoning as the Guest List importer: these
    // events are capped well under 200 people, and going one at a time
    // surfaces real per-row feedback instead of a burst of concurrent
    // requests to save a few seconds.
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].errors.length > 0) continue
      try {
        await api.createGuest(loadedEventId, {
          name: updated[i].name,
          email: updated[i].email,
          guest_type_id: updated[i].guest_type_id,
          allocation_status: 'pending',
          ticket_allotment: updated[i].ticketOverride.length > 0 ? updated[i].ticketOverride : undefined,
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

  // ---------- Distribution rollup ----------

  const allotmentHolders = (guests || [])
    .filter((g) => g.allotment_total > 0)
    .sort((a, b) => a.allotment_distributed - b.allotment_distributed) // untouched ones first

  const handleNudge = async (guest) => {
    try {
      await api.setGuestSentStatus(loadedEventId, guest.id, true)
      onToast(`Marked ${guest.name}'s link as sent`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const copyLink = async (guest) => {
    try {
      await navigator.clipboard.writeText(rsvpUrl(guest.rsvp_token))
      onToast(`Link copied for ${guest.name}`)
    } catch {
      onToast('Could not copy — your browser may have blocked clipboard access', true)
    }
  }

  return (
    <>
      <div className="page-title">RSVP management</div>
      <p className="page-subtitle">
        Bulk-add models, sponsors, influencers, or volunteers who'll distribute their own tickets, and keep
        track of who still hasn't.
      </p>

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

      {loadedEventId && guests !== null && (
        <>
          {guestTypes.length === 0 && (
            <div className="panel">
              <p style={{ fontSize: 13, margin: 0 }}>
                This event has no guest types yet — set one up (with a ticket allotment) in Event workspace
                first.
              </p>
            </div>
          )}

          {/* ---------- Bulk import ---------- */}
          <div className="panel">
            <div className="panel-title">Bulk-add ticket distributors</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Everyone imported inherits their guest type's default ticket allotment automatically. For a
              special case — an extra ticket, an added day — click "Customize" on that row before importing.
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
                    <th>Allotment</th>
                    <th>Result</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stagedRows.map((row, i) => (
                    <Fragment key={i}>
                      <tr style={row.errors.length > 0 ? { background: 'rgba(200,80,80,0.08)' } : undefined}>
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
                        <td style={{ fontSize: 12.5 }}>
                          {row.ticketOverride.length > 0 ? (
                            <span>{row.ticketOverride.reduce((s, r) => s + r.quantity, 0)} (custom)</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Type default</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {row.importStatus === 'success' && <span style={{ color: 'var(--success)' }}>✓ Added</span>}
                          {row.importStatus === 'error' && (
                            <span style={{ color: 'var(--danger)' }}>✕ {row.importError}</span>
                          )}
                          {row.importStatus === 'pending' && row.errors.length > 0 && (
                            <span style={{ color: 'var(--danger)' }}>{row.errors.join('; ')}</span>
                          )}
                        </td>
                        <td className="actions-cell">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => toggleOverride(i)}
                            disabled={importing}
                          >
                            Customize
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => removeStagedRow(i)}
                            disabled={importing}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                      {expandedOverrideIndex === i && (
                        <tr>
                          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 16 }}>
                            <div style={{ background: 'var(--surface-alt)', borderRadius: 8, padding: '12px 14px' }}>
                              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                                Custom allotment for {row.name || 'this row'} — overrides the guest type's
                                default. Leave empty to inherit it.
                              </div>
                              {row.ticketOverride.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                                  <tbody>
                                    {[...row.ticketOverride]
                                      .sort((a, b) => a.date.localeCompare(b.date))
                                      .map((r) => (
                                        <tr key={r.date}>
                                          <td style={{ fontSize: 13.5, padding: '4px 0' }}>{r.date}</td>
                                          <td style={{ fontSize: 13.5, padding: '4px 0' }} className="mono">
                                            {r.quantity}
                                          </td>
                                          <td style={{ textAlign: 'right' }}>
                                            <button
                                              className="btn btn-danger btn-sm"
                                              onClick={() => removeOverrideDay(i, r.date)}
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
                                    value={newOverrideDay.date}
                                    onChange={(e) => setNewOverrideDay({ ...newOverrideDay, date: e.target.value })}
                                  />
                                </div>
                                <div className="field" style={{ width: 110 }}>
                                  <label>Tickets</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={newOverrideDay.quantity}
                                    onChange={(e) =>
                                      setNewOverrideDay({ ...newOverrideDay, quantity: e.target.value })
                                    }
                                  />
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={() => addOverrideDay(i)}>
                                  Add day
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------- Distribution rollup ---------- */}
          <div className="panel">
            <div className="panel-title">Distribution progress</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Everyone currently holding tickets to give out, across the whole event — people who haven't
              started are listed first.
            </p>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Progress</th>
                <th>Sent</th>
                <th>RSVP link</th>
              </tr>
            </thead>
            <tbody>
              {allotmentHolders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No one currently holds a ticket allotment.
                  </td>
                </tr>
              ) : (
                allotmentHolders.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="mono">{g.email}</td>
                    <td>{guestTypeName(g.guest_type_id)}</td>
                    <td>
                      <span
                        style={{
                          color: g.allotment_distributed === 0 ? 'var(--danger)' : 'var(--text)',
                          fontWeight: g.allotment_distributed === 0 ? 600 : 400,
                        }}
                      >
                        {g.allotment_distributed} of {g.allotment_total} given out
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleNudge(g)}
                        disabled={!!g.link_sent_at}
                        style={g.link_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                      >
                        {g.link_sent_at ? '✓ Sent' : 'Mark sent'}
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
                        <button className="btn btn-secondary btn-sm" onClick={() => copyLink(g)}>
                          Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}