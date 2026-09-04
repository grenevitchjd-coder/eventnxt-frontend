// eventnxt-frontend: src/components/SalesReferralsTab.jsx
//
// "Promos & referrals" tab. Event context comes from the Dashboard shell.
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

const REWARD_TYPE_LABELS = {
  flat_amount: 'Flat amount per sale',
  percentage: 'Percentage of sale',
  free_tickets: 'Free tickets',
  points: 'Points',
}

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

export default function SalesReferralsTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [guests, setGuests] = useState([])
  const [salesConfig, setSalesConfig] = useState(null)
  const [promoCodes, setPromoCodes] = useState(null)
  const [redemptionTiers, setRedemptionTiers] = useState([])
  const [bonusTiers, setBonusTiers] = useState([])
  const [sales, setSales] = useState(null)
  const [redemptions, setRedemptions] = useState(null)

  const loadAll = (id) => {
    setPromoCodes(null)
    setSales(null)
    setRedemptions(null)
    api.listGuests(id).then(setGuests).catch((e) => onToast(e.message, true))
    api.getSalesConfig(id).then(setSalesConfig).catch((e) => onToast(e.message, true))
    api.listPromoCodes(id).then(setPromoCodes).catch((e) => onToast(e.message, true))
    api.listRedemptionTiers(id).then(setRedemptionTiers).catch((e) => onToast(e.message, true))
    api.listBonusTiers(id).then(setBonusTiers).catch((e) => onToast(e.message, true))
    api.listSales(id).then(setSales).catch((e) => onToast(e.message, true))
    api.listRewardRedemptions(id).then(setRedemptions).catch((e) => onToast(e.message, true))
    setLoadedEventId(id)
    sessionStorage.setItem('eventnxt_last_event_id', id)
  }

  // Event context (eventId) comes from the Dashboard shell, which also
  // guarantees it's non-empty before rendering this tab and remounts it
  // (key={eventId}) when the event changes, so loading once on mount is all
  // that's needed here.
  useEffect(() => {
    loadAll(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const guestName = (id) => guests?.find((g) => g.id === id)?.name || 'unknown'

  // ---------- Sales config ----------

  const handleSetPlatform = async (platform) => {
    try {
      const updated = await api.setSalesConfig(loadedEventId, platform)
      setSalesConfig(updated)
      onToast('Sales platform updated')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Promo codes ----------

  const [codeForm, setCodeForm] = useState({ guest_id: '', code: '', reward_type: 'flat_amount', reward_value: '', discount_type: '', discount_value: '' })
  // ---- Promo edit view: per-row form covering everything the PATCH
  // supports — code text, reward, buyer discount, message draft.
  const [editingCodeId, setEditingCodeId] = useState(null)
  const [codeEditForm, setCodeEditForm] = useState(null)
  const [savingCodeEdit, setSavingCodeEdit] = useState(false)

  const startEditCode = (code) => {
    setEditingCodeId(code.id)
    setCodeEditForm({
      code: code.code,
      reward_type: code.reward_type,
      reward_value: code.reward_value != null ? String(code.reward_value) : '',
      discount_type: code.discount_type || '',
      discount_value: code.discount_value != null ? String(code.discount_value) : '',
      referral_message_draft: code.referral_message_draft || '',
    })
  }

  const saveEditCode = async (code) => {
    setSavingCodeEdit(true)
    try {
      const payload = {
        code: codeEditForm.code.trim(),
        reward_type: codeEditForm.reward_type,
        referral_message_draft: codeEditForm.referral_message_draft || null,
        // PATCH full-replaces: points rates must ride along untouched.
        points_rates: code.points_rates || [],
        discount_type: codeEditForm.discount_type || null,
        discount_value:
          codeEditForm.discount_type && codeEditForm.discount_value !== '' ? Number(codeEditForm.discount_value) : null,
      }
      if (codeEditForm.reward_type !== 'points') {
        payload.reward_value = codeEditForm.reward_value === '' ? null : Number(codeEditForm.reward_value)
      }
      await api.updatePromoCode(loadedEventId, code.id, payload)
      onToast(`"${payload.code}" updated`)
      setEditingCodeId(null)
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingCodeEdit(false)
    }
  }
  const [eventSlug, setEventSlug] = useState(null) // public slug, for building influencer links

  useEffect(() => {
    if (!loadedEventId) return
    setEventSlug(null)
    api.getEventProfile(loadedEventId).then((prof) => setEventSlug(prof?.slug || null)).catch(() => {})
  }, [loadedEventId])
  const [creatingCode, setCreatingCode] = useState(false)

  const handleCreateCode = async (e) => {
    e.preventDefault()
    setCreatingCode(true)
    try {
      const payload = {
        guest_id: codeForm.guest_id,
        code: codeForm.code,
        reward_type: codeForm.reward_type,
      }
      if (codeForm.reward_type !== 'points') {
        payload.reward_value = Number(codeForm.reward_value)
      }
      if (codeForm.discount_type && codeForm.discount_value !== '') {
        payload.discount_type = codeForm.discount_type
        payload.discount_value = Number(codeForm.discount_value)
      }
      await api.createPromoCode(loadedEventId, payload)
      onToast(`Code "${codeForm.code}" created`)
      setCodeForm({ guest_id: '', code: '', reward_type: 'flat_amount', reward_value: '', discount_type: '', discount_value: '' })
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingCode(false)
    }
  }

  const deleteCode = async (code) => {
    if (!window.confirm(`Delete code "${code.code}"?`)) return
    try {
      await api.deletePromoCode(loadedEventId, code.id)
      onToast('Code deleted')
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Expandable per-code panel: points rates, redemption options, bonus override ----------

  const [expandedCodeId, setExpandedCodeId] = useState(null)
  const [pointsRatesDraft, setPointsRatesDraft] = useState([])
  const [newPointsRate, setNewPointsRate] = useState({ ticket_type: '', points: '' })
  const [redemptionOptionsDraft, setRedemptionOptionsDraft] = useState({}) // tierId -> {cash_value, ticket_value}
  const [bonusTiersInfo, setBonusTiersInfo] = useState(null) // {overridden, tiers}
  const [newBonusTier, setNewBonusTier] = useState({ tickets_required: '', bonus_value: '' })

  const toggleExpandCode = (code) => {
    if (expandedCodeId === code.id) {
      setExpandedCodeId(null)
      return
    }
    setExpandedCodeId(code.id)
    setPointsRatesDraft(code.points_rates || [])
    setNewPointsRate({ ticket_type: '', points: '' })
    setNewBonusTier({ tickets_required: '', bonus_value: '' })
    setRedemptionOptionsDraft({})
    setBonusTiersInfo(null)

    api
      .listRedemptionOptions(loadedEventId, code.id)
      .then((options) => {
        const map = {}
        options.forEach((o) => {
          map[o.redemption_tier_id] = { cash_value: o.cash_value ?? '', ticket_value: o.ticket_value ?? '' }
        })
        setRedemptionOptionsDraft(map)
      })
      .catch((e) => onToast(e.message, true))

    api.getPromoCodeBonusTiers(loadedEventId, code.id).then(setBonusTiersInfo).catch((e) => onToast(e.message, true))
  }

  const addPointsRateRow = () => {
    if (!newPointsRate.ticket_type || newPointsRate.points === '') return
    setPointsRatesDraft((prev) => [
      ...prev.filter((r) => r.ticket_type.toLowerCase() !== newPointsRate.ticket_type.toLowerCase()),
      { ticket_type: newPointsRate.ticket_type, points: Number(newPointsRate.points) },
    ])
    setNewPointsRate({ ticket_type: '', points: '' })
  }

  const removePointsRateRow = (ticketType) => {
    setPointsRatesDraft((prev) => prev.filter((r) => r.ticket_type !== ticketType))
  }

  const savePointsRates = async (code) => {
    try {
      await api.updatePromoCode(loadedEventId, code.id, {
        code: code.code,
        reward_type: code.reward_type,
        points_rates: pointsRatesDraft,
        referral_message_draft: code.referral_message_draft,
        // PATCH full-replaces these — resend them or saving points rates
        // would silently wipe the code's buyer discount.
        discount_type: code.discount_type || null,
        discount_value: code.discount_value != null ? Number(code.discount_value) : null,
      })
      onToast('Points rates saved')
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const saveRedemptionOption = async (code, tier) => {
    const draft = redemptionOptionsDraft[tier.id] || { cash_value: '', ticket_value: '' }
    if (draft.cash_value === '' && draft.ticket_value === '') {
      onToast('Set at least a cash or ticket value for this tier', true)
      return
    }
    try {
      await api.upsertRedemptionOption(loadedEventId, code.id, tier.id, {
        cash_value: draft.cash_value === '' ? null : Number(draft.cash_value),
        ticket_value: draft.ticket_value === '' ? null : Number(draft.ticket_value),
      })
      onToast('Redemption option saved')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const removeRedemptionOption = async (code, tier) => {
    try {
      await api.deleteRedemptionOption(loadedEventId, code.id, tier.id)
      setRedemptionOptionsDraft((prev) => ({ ...prev, [tier.id]: { cash_value: '', ticket_value: '' } }))
      onToast('Removed')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const addBonusTierOverrideRow = () => {
    if (!newBonusTier.tickets_required || newBonusTier.bonus_value === '') return
    setBonusTiersInfo((prev) => ({
      overridden: true,
      tiers: [
        ...(prev?.tiers || []).filter((t) => t.tickets_required !== Number(newBonusTier.tickets_required)),
        { tickets_required: Number(newBonusTier.tickets_required), bonus_value: Number(newBonusTier.bonus_value) },
      ],
    }))
    setNewBonusTier({ tickets_required: '', bonus_value: '' })
  }

  const removeBonusTierOverrideRow = (ticketsRequired) => {
    setBonusTiersInfo((prev) => ({ ...prev, tiers: prev.tiers.filter((t) => t.tickets_required !== ticketsRequired) }))
  }

  const saveBonusTierOverride = async (code) => {
    try {
      const result = await api.setPromoCodeBonusTiers(loadedEventId, code.id, bonusTiersInfo.tiers)
      setBonusTiersInfo(result)
      onToast('Bonus override saved')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const clearBonusTierOverride = async (code) => {
    try {
      const result = await api.clearPromoCodeBonusTiers(loadedEventId, code.id)
      setBonusTiersInfo(result)
      onToast("Reverted to the event's default bonus tiers")
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Redemption tiers (event-wide shared thresholds) ----------

  const [newTierForm, setNewTierForm] = useState({ points_required: '', label: '' })
  const [creatingTier, setCreatingTier] = useState(false)

  const handleCreateTier = async (e) => {
    e.preventDefault()
    setCreatingTier(true)
    try {
      await api.createRedemptionTier(loadedEventId, {
        points_required: Number(newTierForm.points_required),
        label: newTierForm.label || null,
      })
      onToast('Redemption tier created')
      setNewTierForm({ points_required: '', label: '' })
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingTier(false)
    }
  }

  const deleteTier = async (tier) => {
    if (!window.confirm(`Delete the "${tier.points_required} points" tier?`)) return
    try {
      await api.deleteRedemptionTier(loadedEventId, tier.id)
      onToast('Tier deleted')
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Bonus tiers (event-wide default) ----------

  const [newBonusDefaultForm, setNewBonusDefaultForm] = useState({ tickets_required: '', bonus_value: '' })
  const [creatingBonusDefault, setCreatingBonusDefault] = useState(false)

  const handleCreateBonusDefault = async (e) => {
    e.preventDefault()
    setCreatingBonusDefault(true)
    try {
      await api.createBonusTier(loadedEventId, {
        tickets_required: Number(newBonusDefaultForm.tickets_required),
        bonus_value: Number(newBonusDefaultForm.bonus_value),
      })
      onToast('Default bonus tier created')
      setNewBonusDefaultForm({ tickets_required: '', bonus_value: '' })
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingBonusDefault(false)
    }
  }

  const deleteBonusDefault = async (tier) => {
    if (!window.confirm(`Delete the default "${tier.tickets_required} tickets" bonus tier?`)) return
    try {
      await api.deleteBonusTier(loadedEventId, tier.id)
      onToast('Deleted')
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Sales CSV/Excel import ----------

  const fileInputRef = useRef(null)
  const [stagedSaleRows, setStagedSaleRows] = useState(null)
  const [importingSales, setImportingSales] = useState(false)

  const downloadSalesTemplate = () => {
    const csv = Papa.unparse({
      fields: ['Buyer Name', 'Buyer Email', 'Amount', 'Ticket Type', 'Quantity', 'Promo Code', 'Sale Date', 'External Transaction ID'],
      data: [['Jane Buyer', 'jane@example.com', '50', 'GA', '1', promoCodes?.[0]?.code || 'CODE10', '2026-06-11', 'ORDER-001']],
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
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setImportingSales(false)
    }
  }

  // ---------- Organizer payout queue ----------

  const markPaid = async (redemption) => {
    try {
      await api.markRedemptionPaid(loadedEventId, redemption.id)
      onToast('Marked as paid')
      loadAll(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  return (
    <>
      <div className="page-title">Sales & Referrals</div>
      <p className="page-subtitle">
        Promo codes, redemption and bonus tiers, box office reconciliation, and payouts owed.
      </p>


      {loadedEventId && promoCodes !== null && (
        <>
          {/* ---------- Sales platform setup ---------- */}
          <div className="panel">
            <div className="panel-title">Sales platform</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Which box office platform you sell through. Every platform currently falls back to CSV
              upload below — none have a live connection built yet — but this is where that would switch
              on automatically once one exists.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ width: 240 }}>
                <label>Platform</label>
                <select
                  value={salesConfig?.platform || 'custom_csv'}
                  onChange={(e) => handleSetPlatform(e.target.value)}
                >
                  {(salesConfig?.available_platforms || []).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} {p.has_live_api ? '' : '(CSV only)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ---------- Promo codes ---------- */}
          <div className="panel">
            <div className="panel-title">Add a promo code</div>
            <form className="inline-form" onSubmit={handleCreateCode}>
              <div className="field">
                <label htmlFor="pc-guest">Referrer</label>
                <select
                  id="pc-guest"
                  required
                  value={codeForm.guest_id}
                  onChange={(e) => setCodeForm({ ...codeForm, guest_id: e.target.value })}
                >
                  <option value="" disabled>
                    Choose a guest…
                  </option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pc-code">Code</label>
                <input
                  id="pc-code"
                  required
                  placeholder="BENZO10"
                  value={codeForm.code}
                  onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="pc-type">Reward type</label>
                <select
                  id="pc-type"
                  value={codeForm.reward_type}
                  onChange={(e) => setCodeForm({ ...codeForm, reward_type: e.target.value })}
                >
                  {Object.entries(REWARD_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {codeForm.reward_type !== 'points' && (
                <div className="field">
                  <label htmlFor="pc-value">
                    {codeForm.reward_type === 'percentage'
                      ? 'Percent'
                      : codeForm.reward_type === 'free_tickets'
                      ? 'Tickets'
                      : 'Amount ($)'}
                  </label>
                  <input
                    id="pc-value"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    style={{ width: 110 }}
                    value={codeForm.reward_value}
                    onChange={(e) => setCodeForm({ ...codeForm, reward_value: e.target.value })}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="pc-discount-type">Buyer discount (optional)</label>
                <select
                  id="pc-discount-type"
                  style={selectStyle}
                  value={codeForm.discount_type}
                  onChange={(e) => setCodeForm({ ...codeForm, discount_type: e.target.value, discount_value: e.target.value ? codeForm.discount_value : '' })}
                >
                  <option value="">None — attribution only</option>
                  <option value="percentage">% off the order</option>
                  <option value="flat_amount">$ off the order</option>
                </select>
              </div>
              {codeForm.discount_type && (
                <div className="field" style={{ width: 120 }}>
                  <label htmlFor="pc-discount-value">
                    {codeForm.discount_type === 'percentage' ? 'Percent off' : 'Dollars off'}
                  </label>
                  <input
                    id="pc-discount-value"
                    required
                    type="number"
                    min={0}
                    max={codeForm.discount_type === 'percentage' ? 100 : undefined}
                    step={codeForm.discount_type === 'percentage' ? 1 : 0.01}
                    value={codeForm.discount_value}
                    onChange={(e) => setCodeForm({ ...codeForm, discount_value: e.target.value })}
                  />
                </div>
              )}
              <button className="btn btn-secondary" type="submit" disabled={creatingCode}>
                Add code
              </button>
            </form>
            {codeForm.reward_type === 'points' && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
                Points-per-ticket-type rates are set after creating the code — expand it below.
              </p>
            )}
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th></th>
                <th>Code</th>
                <th>Referrer</th>
                <th>Reward</th>
                <th>Sales</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promoCodes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No promo codes yet.
                  </td>
                </tr>
              ) : (
                promoCodes.map((code) => (
                  <Fragment key={code.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpandCode(code)}>
                      <td style={{ width: 24, color: 'var(--text-muted)' }}>
                        {expandedCodeId === code.id ? '▾' : '▸'}
                      </td>
                      <td className="mono">{code.code}</td>
                      <td>{guestName(code.guest_id)}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {REWARD_TYPE_LABELS[code.reward_type]}
                        {code.discount_type && (
                          <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--accent-dark)', fontWeight: 600 }}>
                            buyer saves {code.discount_type === 'percentage' ? `${Number(code.discount_value)}%` : `$${Number(code.discount_value).toFixed(2)}`}
                          </span>
                        )}
                        <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {code.link_clicks || 0} link click{(code.link_clicks || 0) === 1 ? '' : 's'}
                        </span>
                        {eventSlug && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ marginLeft: 8 }}
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/e/${eventSlug}?ref=${encodeURIComponent(code.code)}`)
                              onToast('Influencer link copied')
                            }}
                          >
                            Copy link
                          </button>
                        )}
                        {code.reward_type !== 'points' && code.reward_value != null && (
                          <span style={{ color: 'var(--text-muted)' }}>
                            {' '}
                            ({code.reward_type === 'percentage' ? `${code.reward_value}%` : code.reward_value})
                          </span>
                        )}
                      </td>
                      <td className="mono">{code.sale_count}</td>
                      <td className="mono">
                        {code.reward_type === 'points'
                          ? `${code.points_available ?? 0} avail.`
                          : code.total_reward != null
                          ? code.total_reward
                          : '—'}
                      </td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-secondary btn-sm" onClick={() => (editingCodeId === code.id ? setEditingCodeId(null) : startEditCode(code))}>
                          {editingCodeId === code.id ? 'Cancel' : 'Edit'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteCode(code)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {editingCodeId === code.id && codeEditForm && (
                      <tr>
                        <td></td>
                        <td colSpan={6} style={{ background: 'var(--surface-alt)', paddingTop: 10, paddingBottom: 14 }}>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div className="field" style={{ width: 140 }}>
                              <label>Code</label>
                              <input
                                value={codeEditForm.code}
                                onChange={(e) => setCodeEditForm({ ...codeEditForm, code: e.target.value })}
                              />
                            </div>
                            <div className="field">
                              <label>Reward</label>
                              <select
                                value={codeEditForm.reward_type}
                                onChange={(e) => setCodeEditForm({ ...codeEditForm, reward_type: e.target.value })}
                              >
                                <option value="flat_amount">Flat $ per sale</option>
                                <option value="percentage">% of sale</option>
                                <option value="free_tickets">Free tickets</option>
                                <option value="points">Points</option>
                              </select>
                            </div>
                            {codeEditForm.reward_type !== 'points' && (
                              <div className="field" style={{ width: 110 }}>
                                <label>
                                  {codeEditForm.reward_type === 'percentage'
                                    ? '% per sale'
                                    : codeEditForm.reward_type === 'free_tickets'
                                      ? 'Tickets'
                                      : '$ per sale'}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={codeEditForm.reward_value}
                                  onChange={(e) => setCodeEditForm({ ...codeEditForm, reward_value: e.target.value })}
                                />
                              </div>
                            )}
                            <div className="field">
                              <label title="What the BUYER saves when they use this code at checkout">Buyer discount</label>
                              <select
                                value={codeEditForm.discount_type}
                                onChange={(e) =>
                                  setCodeEditForm({
                                    ...codeEditForm,
                                    discount_type: e.target.value,
                                    discount_value: e.target.value ? codeEditForm.discount_value : '',
                                  })
                                }
                              >
                                <option value="">None</option>
                                <option value="percentage">% off</option>
                                <option value="flat_amount">$ off</option>
                              </select>
                            </div>
                            {codeEditForm.discount_type && (
                              <div className="field" style={{ width: 100 }}>
                                <label>{codeEditForm.discount_type === 'percentage' ? '% off' : '$ off'}</label>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={codeEditForm.discount_value}
                                  onChange={(e) => setCodeEditForm({ ...codeEditForm, discount_value: e.target.value })}
                                />
                              </div>
                            )}
                            <div className="field" style={{ flex: 1, minWidth: 200 }}>
                              <label title="Prefilled share text for this influencer">Share message</label>
                              <input
                                value={codeEditForm.referral_message_draft}
                                onChange={(e) => setCodeEditForm({ ...codeEditForm, referral_message_draft: e.target.value })}
                              />
                            </div>
                            <button className="btn btn-primary btn-sm" disabled={savingCodeEdit} onClick={() => saveEditCode(code)}>
                              {savingCodeEdit ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                            Renaming a code keeps its sales history; the old spelling stops working for new buyers.
                            Points rates are edited in the expanded view below.
                          </p>
                        </td>
                      </tr>
                    )}
                    {expandedCodeId === code.id && (
                      <tr>
                        <td></td>
                        <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 16 }}>
                          <div style={{ background: 'var(--surface-alt)', borderRadius: 8, padding: '12px 14px' }}>
                            {code.referral_message_draft && (
                              <p style={{ fontSize: 12.5, marginTop: 0 }}>
                                <strong>Message draft:</strong> {code.referral_message_draft}
                              </p>
                            )}

                            {/* Points rates */}
                            {code.reward_type === 'points' && (
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                                  Points per ticket type
                                </div>
                                {pointsRatesDraft.length > 0 && (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                                    <tbody>
                                      {pointsRatesDraft.map((r) => (
                                        <tr key={r.ticket_type}>
                                          <td style={{ fontSize: 13, padding: '3px 0' }}>{r.ticket_type}</td>
                                          <td style={{ fontSize: 13, padding: '3px 0' }} className="mono">
                                            {r.points} pts
                                          </td>
                                          <td style={{ textAlign: 'right' }}>
                                            <button
                                              className="btn btn-danger btn-sm"
                                              onClick={() => removePointsRateRow(r.ticket_type)}
                                            >
                                              Remove
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                  <div className="field" style={{ width: 130 }}>
                                    <label>Ticket type</label>
                                    <input
                                      value={newPointsRate.ticket_type}
                                      onChange={(e) => setNewPointsRate({ ...newPointsRate, ticket_type: e.target.value })}
                                    />
                                  </div>
                                  <div className="field" style={{ width: 90 }}>
                                    <label>Points</label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={newPointsRate.points}
                                      onChange={(e) => setNewPointsRate({ ...newPointsRate, points: e.target.value })}
                                    />
                                  </div>
                                  <button className="btn btn-secondary btn-sm" onClick={addPointsRateRow}>
                                    Add
                                  </button>
                                  <button className="btn btn-secondary btn-sm" onClick={() => savePointsRates(code)}>
                                    Save rates
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Redemption options per shared tier */}
                            {redemptionTiers.length > 0 && (
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                                  What this code offers at each redemption tier
                                </div>
                                {redemptionTiers.map((tier) => (
                                  <div
                                    key={tier.id}
                                    style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' }}
                                  >
                                    <span style={{ fontSize: 13, width: 130 }}>
                                      {tier.points_required} pts{tier.label ? ` (${tier.label})` : ''}
                                    </span>
                                    <div className="field" style={{ width: 90 }}>
                                      <label>Cash $</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={redemptionOptionsDraft[tier.id]?.cash_value ?? ''}
                                        onChange={(e) =>
                                          setRedemptionOptionsDraft({
                                            ...redemptionOptionsDraft,
                                            [tier.id]: { ...redemptionOptionsDraft[tier.id], cash_value: e.target.value },
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="field" style={{ width: 90 }}>
                                      <label>Tickets</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={redemptionOptionsDraft[tier.id]?.ticket_value ?? ''}
                                        onChange={(e) =>
                                          setRedemptionOptionsDraft({
                                            ...redemptionOptionsDraft,
                                            [tier.id]: { ...redemptionOptionsDraft[tier.id], ticket_value: e.target.value },
                                          })
                                        }
                                      />
                                    </div>
                                    <button className="btn btn-secondary btn-sm" onClick={() => saveRedemptionOption(code, tier)}>
                                      Save
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => removeRedemptionOption(code, tier)}>
                                      Clear
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Bonus tier override */}
                            <div>
                              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                                Volume bonus tiers —{' '}
                                {bonusTiersInfo?.overridden ? 'custom for this code' : "inheriting the event's default"}
                              </div>
                              {bonusTiersInfo && bonusTiersInfo.tiers.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                                  <tbody>
                                    {bonusTiersInfo.tiers.map((t) => (
                                      <tr key={t.tickets_required}>
                                        <td style={{ fontSize: 13, padding: '3px 0' }}>{t.tickets_required} tickets</td>
                                        <td style={{ fontSize: 13, padding: '3px 0' }} className="mono">
                                          +{t.bonus_value}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => removeBonusTierOverrideRow(t.tickets_required)}
                                          >
                                            Remove
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="field" style={{ width: 110 }}>
                                  <label>Tickets</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={newBonusTier.tickets_required}
                                    onChange={(e) => setNewBonusTier({ ...newBonusTier, tickets_required: e.target.value })}
                                  />
                                </div>
                                <div className="field" style={{ width: 90 }}>
                                  <label>Bonus</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={newBonusTier.bonus_value}
                                    onChange={(e) => setNewBonusTier({ ...newBonusTier, bonus_value: e.target.value })}
                                  />
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={addBonusTierOverrideRow}>
                                  Add
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => saveBonusTierOverride(code)}>
                                  Save as custom
                                </button>
                                {bonusTiersInfo?.overridden && (
                                  <button className="btn btn-secondary btn-sm" onClick={() => clearBonusTierOverride(code)}>
                                    Revert to default
                                  </button>
                                )}
                              </div>
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

          {/* ---------- Redemption tiers (event-wide shared thresholds) ---------- */}
          <div className="panel">
            <div className="panel-title">Redemption tiers</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              The shared point thresholds every code redeems against — what each code actually offers at a
              given tier is set per-code above.
            </p>
            <form className="inline-form" onSubmit={handleCreateTier}>
              <div className="field">
                <label htmlFor="rt-points">Points required</label>
                <input
                  id="rt-points"
                  type="number"
                  min={1}
                  required
                  style={{ width: 110 }}
                  value={newTierForm.points_required}
                  onChange={(e) => setNewTierForm({ ...newTierForm, points_required: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="rt-label">Label (optional)</label>
                <input
                  id="rt-label"
                  placeholder="Bronze"
                  value={newTierForm.label}
                  onChange={(e) => setNewTierForm({ ...newTierForm, label: e.target.value })}
                />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingTier}>
                Add tier
              </button>
            </form>
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Points required</th>
                <th>Label</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {redemptionTiers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">
                    No redemption tiers yet.
                  </td>
                </tr>
              ) : (
                redemptionTiers.map((tier) => (
                  <tr key={tier.id}>
                    <td className="mono">{tier.points_required}</td>
                    <td>{tier.label || '—'}</td>
                    <td className="actions-cell">
                      <button className="btn btn-danger btn-sm" onClick={() => deleteTier(tier)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ---------- Bonus tiers (event-wide default) ---------- */}
          <div className="panel">
            <div className="panel-title">Default volume bonus tiers</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Applies to every code that hasn't set its own custom bonus tiers. Works as an add-on to any
              reward type — a flat-cash code can still get a bonus at a volume milestone.
            </p>
            <form className="inline-form" onSubmit={handleCreateBonusDefault}>
              <div className="field">
                <label htmlFor="bt-tickets">Tickets sold</label>
                <input
                  id="bt-tickets"
                  type="number"
                  min={1}
                  required
                  style={{ width: 110 }}
                  value={newBonusDefaultForm.tickets_required}
                  onChange={(e) => setNewBonusDefaultForm({ ...newBonusDefaultForm, tickets_required: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="bt-value">Bonus</label>
                <input
                  id="bt-value"
                  type="number"
                  min={0}
                  required
                  style={{ width: 110 }}
                  value={newBonusDefaultForm.bonus_value}
                  onChange={(e) => setNewBonusDefaultForm({ ...newBonusDefaultForm, bonus_value: e.target.value })}
                />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingBonusDefault}>
                Add tier
              </button>
            </form>
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Tickets sold</th>
                <th>Bonus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bonusTiers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">
                    No default bonus tiers yet.
                  </td>
                </tr>
              ) : (
                bonusTiers.map((tier) => (
                  <tr key={tier.id}>
                    <td className="mono">{tier.tickets_required}</td>
                    <td className="mono">+{tier.bonus_value}</td>
                    <td className="actions-cell">
                      <button className="btn btn-danger btn-sm" onClick={() => deleteBonusDefault(tier)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ---------- Sales import ---------- */}
          <div className="panel">
            <div className="panel-title">Import box office sales</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Columns: Buyer Name, Buyer Email, Amount, Ticket Type, Quantity (defaults to 1), Promo Code
              (optional), Sale Date, External Transaction ID (recommended — prevents double-counting if you
              re-upload the same export later).
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
                  <button className="btn btn-secondary btn-sm" onClick={runSalesImport} disabled={importingSales}>
                    {importingSales ? 'Importing…' : `Import ${stagedSaleRows.length} sale(s)`}
                  </button>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Email</th>
                    <th>Amount</th>
                    <th>Ticket type</th>
                    <th>Qty</th>
                    <th>Promo code</th>
                    <th>Order ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stagedSaleRows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          value={row.buyer_name}
                          onChange={(e) => updateStagedSaleRow(i, { buyer_name: e.target.value })}
                          style={{ width: '100%' }}
                          disabled={importingSales}
                        />
                      </td>
                      <td>
                        <input
                          value={row.buyer_email}
                          onChange={(e) => updateStagedSaleRow(i, { buyer_email: e.target.value })}
                          style={{ width: '100%' }}
                          disabled={importingSales}
                        />
                      </td>
                      <td>
                        <input
                          value={row.amount}
                          onChange={(e) => updateStagedSaleRow(i, { amount: e.target.value })}
                          style={{ width: 70 }}
                          disabled={importingSales}
                        />
                      </td>
                      <td>
                        <input
                          value={row.ticket_type}
                          onChange={(e) => updateStagedSaleRow(i, { ticket_type: e.target.value })}
                          style={{ width: 90 }}
                          disabled={importingSales}
                        />
                      </td>
                      <td>
                        <input
                          value={row.quantity}
                          onChange={(e) => updateStagedSaleRow(i, { quantity: e.target.value })}
                          style={{ width: 50 }}
                          disabled={importingSales}
                        />
                      </td>
                      <td>
                        <input
                          value={row.promo_code}
                          onChange={(e) => updateStagedSaleRow(i, { promo_code: e.target.value })}
                          style={{ width: 90 }}
                          disabled={importingSales}
                        />
                      </td>
                      <td>
                        <input
                          value={row.external_transaction_id}
                          onChange={(e) => updateStagedSaleRow(i, { external_transaction_id: e.target.value })}
                          style={{ width: 100 }}
                          disabled={importingSales}
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => removeStagedSaleRow(i)}
                          disabled={importingSales}
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

          {/* ---------- Sales audit list ---------- */}
          <div className="panel">
            <div className="panel-title">Sales</div>
          </div>
          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Reward</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {sales === null ? null : sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No sales recorded yet.
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.buyer_name || '—'}
                      <span className="mono" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {s.buyer_email}
                      </span>
                    </td>
                    <td className="mono">{s.amount != null ? s.amount : '—'}</td>
                    <td>{s.ticket_type || '—'}</td>
                    <td className="mono">{s.quantity}</td>
                    <td className="mono">{s.computed_reward != null ? s.computed_reward : '—'}</td>
                    <td>{s.sale_date || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ---------- Organizer payout queue ---------- */}
          <div className="panel">
            <div className="panel-title">Payout queue</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Cash redemptions referrers have claimed — pay them outside the app, then mark paid here.
            </p>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Code</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {redemptions === null ? null : redemptions.filter((r) => r.choice === 'cash').length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No cash redemptions yet.
                  </td>
                </tr>
              ) : (
                redemptions
                  .filter((r) => r.choice === 'cash')
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.referrer_name}</td>
                      <td className="mono">{r.promo_code}</td>
                      <td className="mono">{r.cash_value}</td>
                      <td>
                        <span className={`pill pill-${r.payout_status === 'paid' ? 'confirmed' : 'pending'}`}>
                          {r.payout_status}
                        </span>
                      </td>
                      <td className="actions-cell">
                        {r.payout_status === 'pending' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => markPaid(r)}>
                            Mark paid
                          </button>
                        )}
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