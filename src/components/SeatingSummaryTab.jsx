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
}

const normalizeSaleHeader = (h) => (h || '').toString().toLowerCase().replace(/[^a-z]/g, '')

function saleRowsFromRecords(records) {
  return records.map((record) => {
    const mapped = {}
    for (const [rawKey, value] of Object.entries(record)) {
      const field = SALE_HEADER_ALIASES[normalizeSaleHeader(rawKey)]
      if (field) mapped[field] = (value ?? '').toString().trim()
    }
    return {
      buyer_name: mapped.buyer_name || '',
      buyer_email: mapped.buyer_email || '',
      amount: mapped.amount || '',
      ticket_type: mapped.ticket_type || '',
      quantity: mapped.quantity || '1',
      promo_code: mapped.promo_code || '',
      sale_date: mapped.sale_date || '',
      external_transaction_id: mapped.external_transaction_id || '',
    }
  })
}

export default function SeatingSummaryTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [settings, setSettings] = useState(null)
  const [summary, setSummary] = useState(null) // pool-level rows
  const [pools, setPools] = useState(null) // per-section decomposition
  const [dayFilter, setDayFilter] = useState('all') // 'all' | iso date | 'undated'

  const loadEventData = (id) => {
    setSummary(null)
    setPools(null)
    Promise.all([
      api.getEventSettings(id).catch(() => null),
      api.getSeatingSummary(id),
      api.getSectionSummary(id),
    ])
      .then(([s, sum, secs]) => {
        setSettings(s)
        setSummary(sum)
        setPools(secs)
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
      setStagedSaleRows(saleRowsFromRecords(records))
      onToast(`Loaded ${records.length} row(s) — review before importing`)
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
      const rows = stagedSaleRows.map((r) => ({
        buyer_name: r.buyer_name || null,
        buyer_email: r.buyer_email || null,
        amount: r.amount ? Number(r.amount) : null,
        ticket_type: r.ticket_type || null,
        quantity: Number(r.quantity) || 1,
        promo_code: r.promo_code || null,
        sale_date: r.sale_date || null,
        external_transaction_id: r.external_transaction_id || null,
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
        Where every seat stands — bought at the box office, given as comps, or still open — per section, with the
        same numbers checkout and automatic placement enforce. Import outside sales at the bottom and watch the
        Bought column move.
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

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Section</th>
              <th title="Sellable/seatable heads in this section">Capacity</th>
              <th title="Box office heads: paid and pending orders × admits, plus imported sales">Bought</th>
              <th title="Comp heads placed here: confirmed guests plus pending pull-now">Given</th>
              <th className="col-flex" title="Room left — the same number checkout and automatic placement enforce">
                Left
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

      {/* ---------- Sales import (moved here from Promos) ---------- */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">Import box office sales</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
          Columns: Buyer Name, Buyer Email, Amount, Ticket Type, Quantity (defaults to 1), Promo Code
          (optional), Sale Date, External Transaction ID (recommended — prevents double-counting if you
          re-upload the same export later). Ticket Type is matched to the area by name, so imports land in the
          Bought column above.
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