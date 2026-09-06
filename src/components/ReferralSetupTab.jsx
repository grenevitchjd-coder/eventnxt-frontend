// eventnxt-frontend: src/components/ReferralSetupTab.jsx
//
// "Referral setup" page (Promote group) — person-first: add referral
// people from scratch (influencers, salespeople — they need not attend)
// and define their payout deals. Each person is a Guest row; a pure
// referrer carries is_referrer_only and is fenced out of every attendee
// flow. Adding a person with their first code auto-emails them their
// portal link (dashboard + reward claiming at /referrer/<token>) — per
// answer 1 of the Promote-redesign scoping.
//
// The event-wide referral economics (Redemption tiers, Default volume
// bonus tiers) moved here from Sales & Referrals — they're referral
// config, not promotion config. Self promos live on the Promos page;
// this page shows only codes with a person behind them.
import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'

const REWARD_LABELS = {
  flat_amount: (v) => `$${Number(v)} per ticket`,
  percentage: (v) => `${Number(v)}% of each sale`,
  free_tickets: (v) => `${Number(v)} free ticket${Number(v) === 1 ? '' : 's'} per ticket sold`,
  points: () => 'points per ticket type',
}

const QUICK_ADD_EMPTY = {
  name: '', email: '', code: '', reward_type: 'flat_amount', reward_value: '',
  discount_type: '', discount_value: '',
}

export default function ReferralSetupTab({ onToast, eventId }) {
  const [guests, setGuests] = useState(null)
  const [promoCodes, setPromoCodes] = useState(null)
  const [redemptionTiers, setRedemptionTiers] = useState([])
  const [bonusTiers, setBonusTiers] = useState([])
  const [eventSlug, setEventSlug] = useState(null)

  const loadAll = () => {
    api.listGuests(eventId).then(setGuests).catch((e) => onToast(e.message, true))
    api.listPromoCodes(eventId).then(setPromoCodes).catch((e) => onToast(e.message, true))
    api.listRedemptionTiers(eventId).then(setRedemptionTiers).catch((e) => onToast(e.message, true))
    api.listBonusTiers(eventId).then(setBonusTiers).catch((e) => onToast(e.message, true))
    api.getEventProfile(eventId).then((prof) => setEventSlug(prof?.slug || null)).catch(() => {})
  }

  // Dashboard remounts on event change (key={eventId}); once is enough.
  useEffect(() => {
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Quick add: person + first code + auto portal email ----------

  const [quickAdd, setQuickAdd] = useState(QUICK_ADD_EMPTY)
  const [adding, setAdding] = useState(false)

  const codePayloadFrom = (f, guestId) => {
    const payload = { guest_id: guestId, code: f.code.trim(), reward_type: f.reward_type }
    if (f.reward_type !== 'points') payload.reward_value = Number(f.reward_value)
    if (f.discount_type && f.discount_value !== '') {
      payload.discount_type = f.discount_type
      payload.discount_value = Number(f.discount_value)
    }
    return payload
  }

  const handleQuickAdd = async (e) => {
    e.preventDefault()
    setAdding(true)
    try {
      const person = await api.createReferrer(eventId, { name: quickAdd.name.trim(), email: quickAdd.email.trim() })
      await api.createPromoCode(eventId, codePayloadFrom(quickAdd, person.id))
      // Auto-email the portal link the moment the deal exists (answer 1).
      // Best-effort: a dead SMTP config shouldn't lose the created deal.
      let emailed = true
      try {
        await api.sendReferrerPortalLink(eventId, person.id, window.location.origin)
      } catch {
        emailed = false
      }
      onToast(
        emailed
          ? `${person.name} added — portal link emailed`
          : `${person.name} added, but the portal email didn't send (check SMTP settings; use Resend later)`,
        !emailed
      )
      setQuickAdd(QUICK_ADD_EMPTY)
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setAdding(false)
    }
  }

  const resendPortalLink = async (person) => {
    try {
      await api.sendReferrerPortalLink(eventId, person.id, window.location.origin)
      onToast(`Portal link emailed to ${person.name}`)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Add another code to an existing person ----------

  const [addCodeForId, setAddCodeForId] = useState(null)
  const [addCodeForm, setAddCodeForm] = useState(QUICK_ADD_EMPTY)

  const handleAddCode = async (person) => {
    try {
      await api.createPromoCode(eventId, codePayloadFrom(addCodeForm, person.id))
      onToast(`Code "${addCodeForm.code.trim()}" added for ${person.name}`)
      setAddCodeForId(null)
      setAddCodeForm(QUICK_ADD_EMPTY)
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Per-code edit (code text, reward, discount, message) ----------

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
      await api.updatePromoCode(eventId, code.id, payload)
      onToast(`"${payload.code}" updated`)
      setEditingCodeId(null)
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingCodeEdit(false)
    }
  }

  const deleteCode = async (code) => {
    if (!window.confirm(`Delete code "${code.code}"?`)) return
    try {
      await api.deletePromoCode(eventId, code.id)
      onToast('Code deleted')
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Expandable per-code config: points rates, redemption options, bonus override ----------

  const [expandedCodeId, setExpandedCodeId] = useState(null)
  const [pointsRatesDraft, setPointsRatesDraft] = useState([])
  const [newPointsRate, setNewPointsRate] = useState({ ticket_type: '', points: '' })
  const [redemptionOptionsDraft, setRedemptionOptionsDraft] = useState({})
  const [bonusTiersInfo, setBonusTiersInfo] = useState(null)
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
      .listRedemptionOptions(eventId, code.id)
      .then((options) => {
        const map = {}
        options.forEach((o) => {
          map[o.redemption_tier_id] = { cash_value: o.cash_value ?? '', ticket_value: o.ticket_value ?? '' }
        })
        setRedemptionOptionsDraft(map)
      })
      .catch((e) => onToast(e.message, true))
    api.getPromoCodeBonusTiers(eventId, code.id).then(setBonusTiersInfo).catch((e) => onToast(e.message, true))
  }

  const addPointsRateRow = () => {
    if (!newPointsRate.ticket_type || newPointsRate.points === '') return
    setPointsRatesDraft((prev) => [
      ...prev.filter((r) => r.ticket_type.toLowerCase() !== newPointsRate.ticket_type.toLowerCase()),
      { ticket_type: newPointsRate.ticket_type, points: Number(newPointsRate.points) },
    ])
    setNewPointsRate({ ticket_type: '', points: '' })
  }

  const savePointsRates = async (code) => {
    try {
      await api.updatePromoCode(eventId, code.id, {
        code: code.code,
        reward_type: code.reward_type,
        points_rates: pointsRatesDraft,
        referral_message_draft: code.referral_message_draft,
        // PATCH full-replaces these — resend or saving rates would wipe
        // the buyer discount.
        discount_type: code.discount_type || null,
        discount_value: code.discount_value != null ? Number(code.discount_value) : null,
      })
      onToast('Points rates saved')
      loadAll()
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
      await api.upsertRedemptionOption(eventId, code.id, tier.id, {
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
      await api.deleteRedemptionOption(eventId, code.id, tier.id)
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
      const result = await api.setPromoCodeBonusTiers(eventId, code.id, bonusTiersInfo.tiers)
      setBonusTiersInfo(result)
      onToast('Bonus override saved')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const clearBonusTierOverride = async (code) => {
    try {
      const result = await api.clearPromoCodeBonusTiers(eventId, code.id)
      setBonusTiersInfo(result)
      onToast("Reverted to the event's default bonus tiers")
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Event-wide referral economics (moved from Sales & Referrals) ----------

  const [newTierForm, setNewTierForm] = useState({ points_required: '', label: '' })
  const handleCreateTier = async (e) => {
    e.preventDefault()
    try {
      await api.createRedemptionTier(eventId, {
        points_required: Number(newTierForm.points_required),
        label: newTierForm.label || null,
      })
      onToast('Redemption tier created')
      setNewTierForm({ points_required: '', label: '' })
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }
  const deleteTier = async (tier) => {
    if (!window.confirm(`Delete the "${tier.points_required} points" tier?`)) return
    try {
      await api.deleteRedemptionTier(eventId, tier.id)
      onToast('Tier deleted')
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const [newBonusDefaultForm, setNewBonusDefaultForm] = useState({ tickets_required: '', bonus_value: '' })
  const handleCreateBonusDefault = async (e) => {
    e.preventDefault()
    try {
      await api.createBonusTier(eventId, {
        tickets_required: Number(newBonusDefaultForm.tickets_required),
        bonus_value: Number(newBonusDefaultForm.bonus_value),
      })
      onToast('Default bonus tier created')
      setNewBonusDefaultForm({ tickets_required: '', bonus_value: '' })
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }
  const deleteBonusDefault = async (tier) => {
    if (!window.confirm(`Delete the default "${tier.tickets_required} tickets" bonus tier?`)) return
    try {
      await api.deleteBonusTier(eventId, tier.id)
      onToast('Deleted')
      loadAll()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Derived: people with deals ----------

  const referralCodes = (promoCodes || []).filter((c) => c.guest_id !== null)
  const codesByGuest = {}
  referralCodes.forEach((c) => {
    ;(codesByGuest[c.guest_id] = codesByGuest[c.guest_id] || []).push(c)
  })
  const people = (guests || [])
    .filter((g) => codesByGuest[g.id] || g.is_referrer_only)
    .sort((a, b) => a.name.localeCompare(b.name))

  const shareLink = (code) =>
    eventSlug ? `${window.location.origin}/e/${eventSlug}?ref=${encodeURIComponent(code.code)}` : null

  const rewardSummary = (code) =>
    (REWARD_LABELS[code.reward_type] || (() => code.reward_type))(code.reward_value)

  const rewardFields = (form, setForm, idPrefix) => (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-rt`}>They earn</label>
        <select
          id={`${idPrefix}-rt`}
          value={form.reward_type}
          onChange={(e) => setForm({ ...form, reward_type: e.target.value, reward_value: '' })}
        >
          <option value="flat_amount">$ per ticket</option>
          <option value="percentage">% of each sale</option>
          <option value="free_tickets">Free tickets</option>
          <option value="points">Points</option>
        </select>
      </div>
      {form.reward_type !== 'points' && (
        <div className="field">
          <label htmlFor={`${idPrefix}-rv`}>
            {form.reward_type === 'percentage' ? 'Percent' : form.reward_type === 'free_tickets' ? 'Tickets' : 'Dollars'}
          </label>
          <input
            id={`${idPrefix}-rv`}
            required
            type="number"
            min={0}
            step={form.reward_type === 'flat_amount' ? 0.01 : 1}
            value={form.reward_value}
            onChange={(e) => setForm({ ...form, reward_value: e.target.value })}
          />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${idPrefix}-dt`}>Buyer discount</label>
        <select
          id={`${idPrefix}-dt`}
          value={form.discount_type}
          onChange={(e) => setForm({ ...form, discount_type: e.target.value, discount_value: '' })}
        >
          <option value="">None</option>
          <option value="percentage">Percent off</option>
          <option value="flat_amount">Dollars off</option>
        </select>
      </div>
      {form.discount_type && (
        <div className="field">
          <label htmlFor={`${idPrefix}-dv`}>{form.discount_type === 'percentage' ? 'Percent' : 'Dollars'}</label>
          <input
            id={`${idPrefix}-dv`}
            required
            type="number"
            min={0}
            max={form.discount_type === 'percentage' ? 100 : undefined}
            step={form.discount_type === 'percentage' ? 1 : 0.01}
            value={form.discount_value}
            onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
          />
        </div>
      )}
    </>
  )

  return (
    <div>
      <h2 className="page-title">Referral setup</h2>
      <p className="page-subtitle">
        Your referral people and their payout deals. Adding someone with their first code emails them
        their portal link automatically — they track sales and claim rewards there. Points-per-ticket
        rates on a points code are set after creating it (expand the code below).
      </p>

      {guests !== null && promoCodes !== null && (
        <>
          {/* ---------- Quick add ---------- */}
          <div className="panel">
            <div className="panel-title">Add a referrer</div>
            <form className="inline-form" onSubmit={handleQuickAdd}>
              <div className="field">
                <label htmlFor="ra-name">Name</label>
                <input id="ra-name" required placeholder="Ivy Influencer" value={quickAdd.name}
                       onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ra-email">Email</label>
                <input id="ra-email" required type="email" placeholder="ivy@example.com" value={quickAdd.email}
                       onChange={(e) => setQuickAdd({ ...quickAdd, email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ra-code">Code</label>
                <input id="ra-code" required placeholder="IVY15" value={quickAdd.code}
                       onChange={(e) => setQuickAdd({ ...quickAdd, code: e.target.value })} />
              </div>
              {rewardFields(quickAdd, setQuickAdd, 'ra')}
              <button className="btn btn-secondary" type="submit" disabled={adding}>
                Add & email portal link
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              Someone already on your guest list can refer too — use their exact email and the code
              attaches to their existing row.
            </p>
          </div>

          {/* ---------- People and their deals ---------- */}
          {people.length === 0 ? (
            <p className="empty-state" style={{ marginBottom: 28 }}>No referrers yet.</p>
          ) : (
            people.map((person) => (
              <div className="panel" key={person.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <div className="panel-title" style={{ marginBottom: 0 }}>{person.name}</div>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{person.email}</span>
                  {!person.is_referrer_only && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>(also on your guest list)</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-small" onClick={() => resendPortalLink(person)}>
                    Resend portal link
                  </button>
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setAddCodeForId(addCodeForId === person.id ? null : person.id)
                      setAddCodeForm(QUICK_ADD_EMPTY)
                    }}
                  >
                    {addCodeForId === person.id ? 'Cancel' : 'Add code'}
                  </button>
                </div>

                {addCodeForId === person.id && (
                  <div className="inline-form" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label htmlFor={`ac-code-${person.id}`}>Code</label>
                      <input id={`ac-code-${person.id}`} required value={addCodeForm.code}
                             onChange={(e) => setAddCodeForm({ ...addCodeForm, code: e.target.value })} />
                    </div>
                    {rewardFields(addCodeForm, setAddCodeForm, `ac-${person.id}`)}
                    <button className="btn btn-secondary" onClick={() => handleAddCode(person)}>
                      Save code
                    </button>
                  </div>
                )}

                <table className="data-table" style={{ marginTop: 12, marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Code</th>
                      <th>Deal</th>
                      <th>Buyer discount</th>
                      <th>Share</th>
                      <th style={{ width: 150 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(codesByGuest[person.id] || []).map((code) => (
                      <Fragment key={code.id}>
                        {editingCodeId === code.id ? (
                          <tr>
                            <td></td>
                            <td>
                              <input style={{ width: '100%', minWidth: 0 }} value={codeEditForm.code}
                                     onChange={(e) => setCodeEditForm({ ...codeEditForm, code: e.target.value })} />
                            </td>
                            <td colSpan={2}>
                              <div className="inline-form" style={{ margin: 0 }}>
                                {rewardFields(codeEditForm, setCodeEditForm, `ce-${code.id}`)}
                              </div>
                              <div className="field" style={{ marginTop: 8 }}>
                                <label>Message draft (what they send their followers)</label>
                                <textarea
                                  rows={2}
                                  style={{ width: '100%', minWidth: 0 }}
                                  value={codeEditForm.referral_message_draft}
                                  onChange={(e) =>
                                    setCodeEditForm({ ...codeEditForm, referral_message_draft: e.target.value })
                                  }
                                />
                              </div>
                              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                                Renaming keeps sales history; the old spelling stops working.
                              </p>
                            </td>
                            <td></td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="btn btn-secondary btn-small" disabled={savingCodeEdit}
                                      onClick={() => saveEditCode(code)}>
                                Save
                              </button>{' '}
                              <button className="btn btn-ghost btn-small" onClick={() => setEditingCodeId(null)}>
                                Cancel
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpandCode(code)}>
                            <td style={{ width: 24, color: 'var(--text-muted)' }}>
                              {expandedCodeId === code.id ? '▾' : '▸'}
                            </td>
                            <td className="mono">{code.code}</td>
                            <td>
                              {rewardSummary(code)}
                              {code.reward_type === 'points' && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {' '}
                                  — {code.points_available ?? 0} pts available
                                </span>
                              )}
                            </td>
                            <td>
                              {code.discount_type
                                ? code.discount_type === 'percentage'
                                  ? `${Number(code.discount_value)}% off`
                                  : `$${Number(code.discount_value)} off`
                                : '—'}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {shareLink(code) ? (
                                <button
                                  className="btn btn-ghost btn-small"
                                  onClick={() => {
                                    navigator.clipboard.writeText(shareLink(code))
                                    onToast('Share link copied')
                                  }}
                                >
                                  Copy link
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unpublished</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              <button className="btn btn-ghost btn-small" onClick={() => startEditCode(code)}>
                                Edit
                              </button>{' '}
                              <button className="btn btn-ghost btn-small" onClick={() => deleteCode(code)}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        )}

                        {expandedCodeId === code.id && editingCodeId !== code.id && (
                          <tr>
                            <td></td>
                            <td colSpan={5} style={{ paddingBottom: 16 }}>
                              {code.reward_type === 'points' && (
                                <div style={{ marginBottom: 14 }}>
                                  <strong style={{ fontSize: 13 }}>Points per ticket type</strong>
                                  {pointsRatesDraft.map((r) => (
                                    <div key={r.ticket_type} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                                      <span>{r.ticket_type}</span>
                                      <span className="mono">{r.points} pts</span>
                                      <button className="btn btn-ghost btn-small"
                                              onClick={() => setPointsRatesDraft((prev) => prev.filter((x) => x.ticket_type !== r.ticket_type))}>
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
                                    <div className="field">
                                      <label>Ticket type</label>
                                      <input value={newPointsRate.ticket_type}
                                             onChange={(e) => setNewPointsRate({ ...newPointsRate, ticket_type: e.target.value })} />
                                    </div>
                                    <div className="field">
                                      <label>Points</label>
                                      <input type="number" min={0} style={{ width: 80, minWidth: 0 }} value={newPointsRate.points}
                                             onChange={(e) => setNewPointsRate({ ...newPointsRate, points: e.target.value })} />
                                    </div>
                                    <button className="btn btn-ghost btn-small" onClick={addPointsRateRow}>Add</button>
                                    <button className="btn btn-secondary btn-small" onClick={() => savePointsRates(code)}>
                                      Save rates
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div style={{ marginBottom: 14 }}>
                                <strong style={{ fontSize: 13 }}>Redemption options</strong>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                                  What each event-wide tier is worth for THIS code — cash, tickets, or both.
                                  Tiers with neither aren't offered to this referrer.
                                </p>
                                {redemptionTiers.length === 0 ? (
                                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    No event-wide tiers yet — create them in the panel below.
                                  </p>
                                ) : (
                                  redemptionTiers.map((tier) => {
                                    const draft = redemptionOptionsDraft[tier.id] || { cash_value: '', ticket_value: '' }
                                    return (
                                      <div key={tier.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
                                        <span style={{ minWidth: 110 }}>
                                          {tier.points_required} pts{tier.label ? ` (${tier.label})` : ''}
                                        </span>
                                        <div className="field">
                                          <label>Cash $</label>
                                          <input type="number" min={0} step={0.01} style={{ width: 90, minWidth: 0 }}
                                                 value={draft.cash_value}
                                                 onChange={(e) => setRedemptionOptionsDraft((prev) => ({
                                                   ...prev, [tier.id]: { ...draft, cash_value: e.target.value },
                                                 }))} />
                                        </div>
                                        <div className="field">
                                          <label>Tickets</label>
                                          <input type="number" min={0} style={{ width: 80, minWidth: 0 }}
                                                 value={draft.ticket_value}
                                                 onChange={(e) => setRedemptionOptionsDraft((prev) => ({
                                                   ...prev, [tier.id]: { ...draft, ticket_value: e.target.value },
                                                 }))} />
                                        </div>
                                        <button className="btn btn-ghost btn-small" onClick={() => saveRedemptionOption(code, tier)}>
                                          Save
                                        </button>
                                        <button className="btn btn-ghost btn-small" onClick={() => removeRedemptionOption(code, tier)}>
                                          Clear
                                        </button>
                                      </div>
                                    )
                                  })
                                )}
                              </div>

                              <div>
                                <strong style={{ fontSize: 13 }}>Volume bonuses</strong>
                                {bonusTiersInfo === null ? null : bonusTiersInfo.overridden ? (
                                  <>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                                      This code uses its OWN tiers (an empty list means no bonuses).
                                    </p>
                                    {(bonusTiersInfo.tiers || []).map((t) => (
                                      <div key={t.tickets_required} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                                        <span>{t.tickets_required} tickets → ${Number(t.bonus_value)}</span>
                                        <button className="btn btn-ghost btn-small" onClick={() => removeBonusTierOverrideRow(t.tickets_required)}>
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                                    Inheriting the event's default tiers. Adding a row below overrides them for
                                    this code only.
                                  </p>
                                )}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
                                  <div className="field">
                                    <label>Tickets</label>
                                    <input type="number" min={1} style={{ width: 80, minWidth: 0 }} value={newBonusTier.tickets_required}
                                           onChange={(e) => setNewBonusTier({ ...newBonusTier, tickets_required: e.target.value })} />
                                  </div>
                                  <div className="field">
                                    <label>Bonus $</label>
                                    <input type="number" min={0} step={0.01} style={{ width: 90, minWidth: 0 }} value={newBonusTier.bonus_value}
                                           onChange={(e) => setNewBonusTier({ ...newBonusTier, bonus_value: e.target.value })} />
                                  </div>
                                  <button className="btn btn-ghost btn-small" onClick={addBonusTierOverrideRow}>Add</button>
                                  {bonusTiersInfo?.overridden && (
                                    <>
                                      <button className="btn btn-secondary btn-small" onClick={() => saveBonusTierOverride(code)}>
                                        Save override
                                      </button>
                                      <button className="btn btn-ghost btn-small" onClick={() => clearBonusTierOverride(code)}>
                                        Use event default
                                      </button>
                                    </>
                                  )}
                                  {bonusTiersInfo && !bonusTiersInfo.overridden && (bonusTiersInfo.tiers || []).length >= 0 && (
                                    <button className="btn btn-secondary btn-small" onClick={() => saveBonusTierOverride(code)}
                                            disabled={!bonusTiersInfo.tiers || bonusTiersInfo.tiers.length === 0}>
                                      Save override
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {(codesByGuest[person.id] || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          No code yet — add one so their portal email has something to share.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))
          )}

          {/* ---------- Event-wide referral economics ---------- */}
          <div className="panel">
            <div className="panel-title">Redemption tiers</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Event-wide point thresholds referrers can redeem at. What each tier pays a specific
              referrer is set per code above.
            </p>
            <form className="inline-form" onSubmit={handleCreateTier}>
              <div className="field">
                <label htmlFor="rt-points">Points required</label>
                <input id="rt-points" required type="number" min={1} value={newTierForm.points_required}
                       onChange={(e) => setNewTierForm({ ...newTierForm, points_required: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="rt-label">Label (optional)</label>
                <input id="rt-label" placeholder="Bronze" value={newTierForm.label}
                       onChange={(e) => setNewTierForm({ ...newTierForm, label: e.target.value })} />
              </div>
              <button className="btn btn-secondary" type="submit">Add tier</button>
            </form>
            {redemptionTiers.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {redemptionTiers.map((tier) => (
                  <div key={tier.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span>{tier.points_required} pts{tier.label ? ` — ${tier.label}` : ''}</span>
                    <button className="btn btn-ghost btn-small" onClick={() => deleteTier(tier)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">Default volume bonus tiers</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Sell-N-tickets bonuses every referral code inherits unless it sets its own (expand a code
              above to override).
            </p>
            <form className="inline-form" onSubmit={handleCreateBonusDefault}>
              <div className="field">
                <label htmlFor="bd-tickets">Tickets required</label>
                <input id="bd-tickets" required type="number" min={1} value={newBonusDefaultForm.tickets_required}
                       onChange={(e) => setNewBonusDefaultForm({ ...newBonusDefaultForm, tickets_required: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="bd-value">Bonus $</label>
                <input id="bd-value" required type="number" min={0} step={0.01} value={newBonusDefaultForm.bonus_value}
                       onChange={(e) => setNewBonusDefaultForm({ ...newBonusDefaultForm, bonus_value: e.target.value })} />
              </div>
              <button className="btn btn-secondary" type="submit">Add default tier</button>
            </form>
            {bonusTiers.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {bonusTiers.map((tier) => (
                  <div key={tier.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span>{tier.tickets_required} tickets → ${Number(tier.bonus_value)}</span>
                    <button className="btn btn-ghost btn-small" onClick={() => deleteBonusDefault(tier)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}