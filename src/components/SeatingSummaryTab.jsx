// eventnxt-frontend: src/components/SeatingSummaryTab.jsx
//
// The availability page (2026-09-05 slice): every pool as a multi-row
// block — the pool spanning left, one row per section beside it with
// Capacity / Bought / Given / Left — where Left is the SAME number
// checkout and comp placement enforce (the backend computes both from
// one function, so this page can never disagree with reality). Filter
// chips narrow the day-clone families to one night. The box-office
// sales upload lives here too: record outside sales where you watch
// the numbers move.
import { useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { api } from '../api'

// ---------- Sales CSV import parsing helpers ----------

const SALE_HEADER_ALIASES = {
  buyername: 'buyer_name',
  name: 'buyer_name',
  lastname: 'last_name',
  firstname: 'first_name',
  buyeremail: 'buyer_email',
  email: 'buyer_email',
  amount: 'amount',
  price: 'amount',
  tickettype: 'ticket_type',
  type: 'ticket_type',
  category: 'ticket_type',
  quantity: 'quantity',
  qty: 'quantity',
  promocode: 'promo_code',
  code: 'promo_code',
  saledate: 'sale_date',
  date: 'sale_date',
  externaltransactionid: 'external_transaction_id',
  orderid: 'external_transaction_id',
  transactionid: 'external_transaction_id',
  barcode: 'external_transaction_id',
  discounts: 'discount_text',
  discount: 'discount_text',
  coupon: 'discount_text',
}

const normalizeSaleHeader = (h) => (h || '').toString().toLowerCase().replace(/[^a-z]/g, '')

function saleRowsFromRecords(records) {
  return records.map((record) => {
    const mapped = {}
    for (const [rawKey, value] of Object.entries(record)) {
      const field = SALE_HEADER_ALIASES[normalizeSaleHeader(rawKey)]
      if (field) mapped[field] = (value ?? '').toString().trim()
    }
    // Box-office exports split the buyer into Last Name / First Name
    // columns — join them when there's no single name column.
    const joined = [mapped.first_name, mapped.last_name].filter(Boolean).join(' ')
    return {
      buyer_name: mapped.buyer_name || joined || '',
      buyer_email: mapped.buyer_email || '',
      amount: mapped.amount || '',
      ticket_type: mapped.ticket_type || '',
      quantity: mapped.quantity || '1',
      promo_code: mapped.promo_code || '',
      sale_date: mapped.sale_date || '',
      external_transaction_id: mapped.external_transaction_id || '',
      discount_text: mapped.discount_text || '',
    }
  })
}

// The same normalization the backend keys mappings by.
const normLabel = (s) => String(s || '').split(/\s+/).filter(Boolean).join(' ').toLowerCase()

// Light client-side mirror of the server's day-token strip — only for
// PREFILL guesses in the mapping panel (the server re-derives the real
// thing at import): one leading/trailing weekday word or MM/DD token.
const WEEKDAY_RX = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)/i
const stripDayToken = (label) => {
  const t = String(label || '')
  const date = t.match(/\(?\b\d{1,2}\s*\/\s*\d{1,2}\b\)?/)
  if (date) return (t.slice(0, date.index) + ' ' + t.slice(date.index + date[0].length)).trim().replace(/^[-\u2013\u2014:\u00b7,\s]+|[-\u2013\u2014:\u00b7,\s]+$/g, '')
  const lead = t.match(new RegExp('^\\s*' + WEEKDAY_RX.source + '\\b[\\s\\-\\u2013\\u2014:\\u00b7,]*', 'i'))
  if (lead) return t.slice(lead[0].length).trim()
  const trail = t.match(new RegExp('[\\s\\-\\u2013\\u2014:\\u00b7,]*\\b' + WEEKDAY_RX.source + '\\s*$', 'i'))
  if (trail) return t.slice(0, trail.index).trim()
  return t
}

export default function SeatingSummaryTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [settings, setSettings] = useState(null)
  const [summary, setSummary] = useState(null) // pool-level rows
  const [pools, setPools] = useState(null) // per-section decomposition
  const [dayFilter, setDayFilter] = useState('all') // 'all' | iso date | 'undated'
  const [hasCsvSales, setHasCsvSales] = useState(false)

  const loadEventData = (id) => {
    setSummary(null)
    setPools(null)
    Promise.all([
      api.getEventSettings(id).catch(() => null),
      api.getSeatingSummary(id),
      api.getSectionSummary(id),
      api.listSales(id).catch(() => []),
      api.getSaleTypeMappings(id).catch(() => []),
    ])
      .then(([s, sum, secs, saleRows, mappings]) => {
        setSettings(s)
        setSummary(sum)
        setPools(secs)
        setHasCsvSales((saleRows || []).some((x) => x.source === 'csv_upload'))
        setSavedMappings(mappings || [])
        setLoadedEventId(id)
      })
      .catch((err) => onToast(err.message, true))
  }

  useEffect(() => {
    if (eventId && eventId !== loadedEventId) loadEventData(eventId)
  }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Day chips ----------
  // Dated clones carry their day in the name ("… (12/25)"); a bare pool
  // whose family HAS dated siblings is the family's first-night pool
  // (fan-out keeps the base for night one); a bare pool with no dated
  // siblings is undated (all-days / standalone).
  const eventDays = (() => {
    const s = settings
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
  const fmtChip = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })

  const famBase = (name) => String(name || '').replace(/\s*\(\d{2}\/\d{2}\)$/, '')
  const suffixDay = (name) => {
    const m = String(name || '').match(/\((\d{2})\/(\d{2})\)$/)
    if (!m) return null
    return eventDays.find((d) => d.slice(5) === `${m[1]}-${m[2]}`) || `${m[1]}/${m[2]}`
  }
  const poolDay = (pool) => {
    const sfx = suffixDay(pool.category_name)
    if (sfx) return sfx
    const base = famBase(pool.category_name)
    const hasDatedSiblings = (pools || []).some(
      (p) => p !== pool && famBase(p.category_name) === base && suffixDay(p.category_name)
    )
    return hasDatedSiblings ? eventDays[0] || null : null
  }

  const visiblePools = (pools || []).filter((p) => {
    if (dayFilter === 'all') return true
    if (dayFilter === 'undated') return poolDay(p) === null
    return poolDay(p) === dayFilter
  })

  const summaryOf = (pool) => (summary || []).find((r) => r.category_id === pool.category_id)

  // ---------- Sales CSV/Excel import (moved here from Promos) ----------

  const fileInputRef = useRef(null)
  const [stagedSaleRows, setStagedSaleRows] = useState(null)
  const [importingSales, setImportingSales] = useState(false)
  // 0049: label -> area mapping draft, keyed by NORMALIZED label:
  // { pool: category_id | '' (auto) | '__not_admission__', face: '$ string' }
  const [mappingDraft, setMappingDraft] = useState({})
  const [savedMappings, setSavedMappings] = useState([])
  const [fileDay, setFileDay] = useState('')

  const downloadSalesTemplate = () => {
    const csv = Papa.unparse({
      fields: ['Buyer Name', 'Buyer Email', 'Amount', 'Ticket Type', 'Quantity', 'Promo Code', 'Sale Date', 'External Transaction ID'],
      data: [['Jane Buyer', 'jane@example.com', '50', 'GA', '1', 'CODE10', '2026-06-11', 'ORDER-001']],
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sales-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSalesFileSelected = async (e) => {
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
      const rows = saleRowsFromRecords(records)
      setStagedSaleRows(rows)
      // Prefill the label->area draft: saved mapping first, else a pool
      // whose name matches the (day-stripped) label. '' = auto/unmapped.
      const saved = {}
      for (const m of savedMappings) saved[m.raw_label] = m
      const poolByNorm = {}
      for (const p of pools || []) poolByNorm[normLabel(p.category_name)] = p.category_id
      const draft = {}
      for (const r of rows) {
        const key = normLabel(r.ticket_type)
        if (!key || draft[key]) continue
        const baseKey = normLabel(stripDayToken(r.ticket_type))
        const m = saved[key] || saved[baseKey]
        if (m) {
          draft[key] = {
            pool: m.is_admission === false ? '__not_admission__' : m.seating_category_id || '',
            face: m.face_value_cents != null ? String(m.face_value_cents / 100) : '',
            allDays: !!m.all_days,
          }
        } else {
          draft[key] = { pool: poolByNorm[key] || poolByNorm[baseKey] || '', face: '', allDays: false }
        }
      }
      setMappingDraft(draft)
      setFileDay('')
      onToast(`Loaded ${records.length} row(s) — review the area mapping, then import`)
    } catch (err) {
      onToast(`Couldn't read that file: ${err.message}`, true)
    }
  }

  const updateStagedSaleRow = (index, changes) => {
    setStagedSaleRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }
  const removeStagedSaleRow = (index) => setStagedSaleRows((prev) => prev.filter((_, i) => i !== index))
  const clearStagedSales = () => setStagedSaleRows(null)

  const runSalesImport = async () => {
    setImportingSales(true)
    try {
      // Save the label->area answers first — the import right after is
      // what applies them (and every future upload applies them free).
      const mappings = Object.entries(mappingDraft)
        .filter(([, d]) => d.pool || d.face || d.allDays)
        .map(([label, d]) => ({
          raw_label: label,
          seating_category_id: d.pool && d.pool !== '__not_admission__' ? d.pool : null,
          face_value_cents: d.face ? Math.round(Number(d.face) * 100) : null,
          is_admission: d.pool !== '__not_admission__',
          all_days: !!d.allDays && d.pool !== '__not_admission__',
        }))
      if (mappings.length) await api.putSaleTypeMappings(loadedEventId, mappings)
      const rows = stagedSaleRows.map((r) => ({
        buyer_name: r.buyer_name || null,
        buyer_email: r.buyer_email || null,
        amount: r.amount ? Number(r.amount) : null,
        ticket_type: r.ticket_type || null,
        quantity: Number(r.quantity) || 1,
        promo_code: r.promo_code || null,
        sale_date: r.sale_date || null,
        external_transaction_id: r.external_transaction_id || null,
        event_day: fileDay || null,
        discount_text: r.discount_text || null,
      }))
      const result = await api.importSales(loadedEventId, rows)
      onToast(
        `Imported ${result.imported}${result.skipped_duplicates > 0 ? `, ${result.skipped_duplicates} duplicate(s) skipped` : ''}${
          result.unmatched_code_count > 0 ? `, ${result.unmatched_code_count} unmatched code(s)` : ''
        }`,
        result.unmatched_code_count > 0
      )
      setStagedSaleRows(null)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setImportingSales(false)
    }
  }

  if (!pools || !summary) return <div className="empty-state">Loading seating summary…</div>

  return (
    <>
      <div className="page-title">Seating summary</div>
      <p className="page-subtitle">
        Where every seat stands — sold at the box office, given as comps, or still open — per section, with the
        same numbers checkout and automatic placement enforce. Import outside sales at the bottom and watch the
        Sold column move.
      </p>

      {eventDays.length > 0 && (
        <div style={{ display: 'flex', gap: 8, margin: '0 0 16px', flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${dayFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDayFilter('all')}>
            All
          </button>
          {eventDays.map((d) => (
            <button
              key={d}
              className={`btn btn-sm ${dayFilter === d ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDayFilter(d)}
            >
              {fmtChip(d)}
            </button>
          ))}
          <button
            className={`btn btn-sm ${dayFilter === 'undated' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDayFilter('undated')}
            title="Pools that don't belong to a single night"
          >
            All-days
          </button>
        </div>
      )}

      <div className="sticky-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Section</th>
              <th title="Sellable/seatable heads in this section">Capacity</th>
              <th title="Box office heads: paid and pending orders × admits, plus imported sales">Sold</th>
              <th title="Comp heads placed here: confirmed guests plus pending pull-now">Comps</th>
              <th className="col-flex" title="Room left — the same number checkout and automatic placement enforce">
                Avail.
              </th>
            </tr>
          </thead>
          <tbody>
            {visiblePools.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  {pools.length === 0
                    ? 'No seating areas yet — create them on the Seats Setup page.'
                    : 'No areas for this day.'}
                </td>
              </tr>
            ) : (
              visiblePools.map((p) => {
                const s = summaryOf(p)
                return p.sections.map((sec, i) => (
                  <tr key={`${p.category_id}-${sec.section_label ?? 'pool'}`}>
                    {i === 0 && (
                      <td rowSpan={p.sections.length} style={{ verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{p.category_name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {p.sales_grain} · {p.capacity} cap
                        </div>
                        {s && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }} title="Estimated = if every promise lands · Confirmed = sure things only">
                            est. {s.estimated_avail} · conf. {s.confirmed_avail} left
                          </div>
                        )}
                      </td>
                    )}
                    <td>{sec.section_label ? `Sec ${sec.section_label}` : '—'}</td>
                    <td className="mono">{sec.capacity}</td>
                    <td className="mono">{sec.bought}</td>
                    <td className="mono">{sec.given}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {sec.left}
                    </td>
                  </tr>
                ))
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Sales import (moved here from Promos) ----------
          Settings-aware (Joshua's question 2026-09-05): a purely native
          event shouldn't stare at an importer it never needs. Shown when
          the event's sales_source isn't native, OR when imported rows
          already exist — hiding the source of numbers that are visibly
          in the Sold column would be the display lying about its data. */}
      {settings && settings.sales_source === 'native' && !hasCsvSales ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 20 }}>
          Selling some tickets outside EventNXT? Switch your sales data source in Event settings to
          import them here.
        </p>
      ) : (
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">Import box office sales</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
          Upload your ticket platform&apos;s export as-is — common column names are recognized
          automatically, including box-office style Last Name / First Name, Barcode (prevents
          double-counting when you re-upload the same growing export), and Discounts cells like
          &ldquo;Coupon CODE: -$6.50&rdquo; (credited to that referral code). You&apos;ll map each
          ticket-type to an area once in staging; after that, uploads land themselves in the Sold
          column above.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleSalesFileSelected}
            style={{ display: 'none' }}
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Choose file…
          </button>
          <button className="btn btn-secondary" onClick={downloadSalesTemplate}>
            Download template
          </button>
        </div>
      </div>
      )}

      {stagedSaleRows && (
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="panel-title" style={{ margin: 0 }}>
              {stagedSaleRows.length} row{stagedSaleRows.length === 1 ? '' : 's'} staged
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={clearStagedSales} disabled={importingSales}>
                Clear
              </button>
              <button className="btn btn-primary btn-sm" onClick={runSalesImport} disabled={importingSales}>
                {importingSales ? 'Importing…' : `Import ${stagedSaleRows.length} sale(s)`}
              </button>
            </div>
          </div>
          {/* ---------- 0049: label -> area mapping (map once, applies to every future upload) ---------- */}
          {(() => {
            const counts = {}
            const labels = []
            for (const r of stagedSaleRows) {
              const key = normLabel(r.ticket_type)
              if (!key) continue
              if (!(key in counts)) labels.push(key)
              counts[key] = (counts[key] || 0) + (Number(r.quantity) || 1)
            }
            if (!labels.length) return null
            const bare = (pools || []).filter((p) => !/\(\d{2}\/\d{2}\)$/.test(p.category_name))
            const dated = (pools || []).filter((p) => /\(\d{2}\/\d{2}\)$/.test(p.category_name))
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Where do these land?</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 8 }}>
                  One answer per ticket-type in the file — saved, so next month&apos;s upload maps itself.
                  Pick the <strong>base</strong> area; a day in the ticket name (or the selector below)
                  routes to that night&apos;s copy automatically. Face value fills missing amounts (minus
                  any coupon) so percentage rewards can compute. Tick <strong>Every night</strong> for
                  weekend passes/packages — one row then counts into every night of that area.
                </p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticket type in file</th>
                      <th>Tickets</th>
                      <th>Area</th>
                      <th>Face value ($, optional)</th>
                      {eventDays.length > 1 && <th className="col-flex" title="Weekend pass / package — one row consumes a head EVERY night">Every night</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {labels.map((key) => {
                      const d = mappingDraft[key] || { pool: '', face: '' }
                      const setD = (changes) => setMappingDraft({ ...mappingDraft, [key]: { ...d, ...changes } })
                      return (
                        <tr key={key}>
                          <td>{key}</td>
                          <td className="mono">{counts[key]}</td>
                          <td>
                            <select value={d.pool} onChange={(e) => setD({ pool: e.target.value })}>
                              <option value="">Auto (match by name)</option>
                              {bare.map((p) => (
                                <option key={p.category_id} value={p.category_id}>{p.category_name}</option>
                              ))}
                              {dated.length > 0 && (
                                <optgroup label="Single-night copies">
                                  {dated.map((p) => (
                                    <option key={p.category_id} value={p.category_id}>{p.category_name}</option>
                                  ))}
                                </optgroup>
                              )}
                              <option value="__not_admission__">Not admission (drink coupon, merch…)</option>
                            </select>
                          </td>
                          <td>
                            <input
                              style={{ width: 90 }}
                              placeholder="105.00"
                              value={d.face}
                              disabled={d.pool === '__not_admission__'}
                              onChange={(e) => setD({ face: e.target.value })}
                            />
                          </td>
                          {eventDays.length > 1 && (
                            <td>
                              <input
                                type="checkbox"
                                title="A package: counts into every night of this area's family"
                                checked={!!d.allDays}
                                disabled={d.pool === '__not_admission__'}
                                onChange={(e) => setD({ allDays: e.target.checked })}
                              />
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {eventDays.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 12.5 }}>
                    <label htmlFor="file-day" style={{ fontWeight: 600 }}>Which day is this file for?</label>
                    <select id="file-day" value={fileDay} onChange={(e) => setFileDay(e.target.value)}>
                      <option value="">Mixed / day is in the ticket names</option>
                      {eventDays.map((day) => (
                        <option key={day} value={day}>{fmtChip(day)}</option>
                      ))}
                    </select>
                    <span style={{ color: 'var(--text-muted)' }}>
                      A day inside a ticket name always wins over this.
                    </span>
                  </div>
                )}
              </div>
            )
          })()}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Email</th>
                  <th>Amount</th>
                  <th>Ticket type</th>
                  <th>Qty</th>
                  <th>Promo</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stagedSaleRows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input value={row.buyer_name} onChange={(e) => updateStagedSaleRow(i, { buyer_name: e.target.value })} style={{ width: 110 }} />
                    </td>
                    <td>
                      <input value={row.buyer_email} onChange={(e) => updateStagedSaleRow(i, { buyer_email: e.target.value })} style={{ width: 150 }} />
                    </td>
                    <td>
                      <input value={row.amount} onChange={(e) => updateStagedSaleRow(i, { amount: e.target.value })} style={{ width: 60 }} />
                    </td>
                    <td>
                      <input value={row.ticket_type} onChange={(e) => updateStagedSaleRow(i, { ticket_type: e.target.value })} style={{ width: 130 }} />
                    </td>
                    <td>
                      <input value={row.quantity} onChange={(e) => updateStagedSaleRow(i, { quantity: e.target.value })} style={{ width: 40 }} />
                    </td>
                    <td>
                      <input value={row.promo_code} onChange={(e) => updateStagedSaleRow(i, { promo_code: e.target.value })} style={{ width: 80 }} />
                    </td>
                    <td>
                      <input value={row.sale_date} onChange={(e) => updateStagedSaleRow(i, { sale_date: e.target.value })} style={{ width: 90 }} />
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeStagedSaleRow(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}