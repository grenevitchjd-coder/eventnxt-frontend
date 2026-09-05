// eventnxt-frontend: src/components/EventWorkspaceTab.jsx
//
// "Seating & capacity" tab. Event context comes from the Dashboard shell.
import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'

const selectStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '6px 8px',
  color: 'var(--text)',
  fontSize: 13,
}

export default function EventWorkspaceTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [guestTypes, setGuestTypes] = useState([])
  const [categories, setCategories] = useState(null)


  // ---- Guest types (accordion) ----
  // One type = one offer, edited in ONE place: the expanded panel. The
  // create form takes just name + mode; everything else (days, tickets,
  // total, pull, seating) lives in the panel.
  const [typeForm, setTypeForm] = useState({ name: '', guest_mode: 'invite' })
  const [creatingType, setCreatingType] = useState(false)
  const [expandedTypeId, setExpandedTypeId] = useState(null)
  // Per-type offer drafts ({typeId: {field: value}}); a field absent
  // from the draft reads from the stored type. day_scope '' = plain
  // yes/no guest (stored null); 'specific' reveals the date grid.
  const [offerDrafts, setOfferDrafts] = useState({})
  const [savingOfferId, setSavingOfferId] = useState(null)
  const [priorityLists, setPriorityLists] = useState({}) // guestTypeId -> [priority entries]
  const [addPriorityCategoryId, setAddPriorityCategoryId] = useState('')
  const [addPrioritySection, setAddPrioritySection] = useState('')
  const [addingPriority, setAddingPriority] = useState(false)
  // Ticket allotment defaults (per-day), edited inline in the accordion
  const [ticketAllotments, setTicketAllotments] = useState({}) // guestTypeId -> [{date, quantity}]
  const [newAllotmentDay, setNewAllotmentDay] = useState({ date: '', quantity: '' })
  const [savingAllotmentDay, setSavingAllotmentDay] = useState(false)

  const loadEventData = (id) => {
    setCategories(null)
    Promise.all([api.listSeatingCategories(id), api.listGuestTypes(id)])
      .then(([cats, types]) => {
        setCategories(cats)
        setGuestTypes(types)
        setLoadedEventId(id)
        setExpandedTypeId(null)
        setPriorityLists({})
        setTicketAllotments({})
        // Prefetch each type's date rows so the collapsed glance line can
        // say "specific dates" for legacy row-configured types before
        // they're ever opened (best-effort).
        Promise.all(
          types.map(async (t) => {
            try {
              return [t.id, await api.listTicketAllotments(id, t.id)]
            } catch {
              return [t.id, []]
            }
          })
        ).then((entries) => setTicketAllotments(Object.fromEntries(entries)))
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


  // ---------- Guest types + priority seating ----------

  const handleCreateType = async (e) => {
    e.preventDefault()
    setCreatingType(true)
    try {
      const created = await api.createGuestType(loadedEventId, {
        name: typeForm.name,
        guest_mode: typeForm.guest_mode || null,
      })
      onToast(`"${typeForm.name}" added — set up its offer below`)
      setTypeForm({ name: '', guest_mode: 'invite' })
      loadEventData(loadedEventId)
      // open the new type's panel so the offer gets configured right away
      if (created && created.id) setTimeout(() => toggleExpandType(created.id), 0)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingType(false)
    }
  }

  // ---- The offer editor (in the expanded panel) ----

  const offerVal = (t, field) => {
    const d = offerDrafts[t.id] || {}
    if (field in d) return d[field]
    if (field === 'day_scope') {
      // legacy types with explicit date rows but no scope open as
      // 'specific' so their rows are visible and editable
      if (t.day_scope) return t.day_scope
      return (ticketAllotments[t.id] || []).length > 0 ? 'specific' : ''
    }
    const v = t[field]
    return v === null || v === undefined ? '' : String(v)
  }

  const setOfferVal = (t, field, value) =>
    setOfferDrafts((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] || {}), [field]: value } }))

  const offerDirty = (t) => Object.keys(offerDrafts[t.id] || {}).length > 0

  const saveOffer = async (t) => {
    const scope = offerVal(t, 'day_scope')
    const rows = ticketAllotments[t.id] || []
    if (scope !== 'specific' && rows.length > 0) {
      const ok = window.confirm(
        `"${t.name}" has ${rows.length} specific date row${rows.length === 1 ? '' : 's'}. ` +
          'Saving with a different Days setting removes them (the new setting takes over). Continue?'
      )
      if (!ok) return
    }
    setSavingOfferId(t.id)
    try {
      if (scope !== 'specific' && rows.length > 0) {
        for (const r of rows) await api.deleteTicketAllotmentDay(loadedEventId, t.id, r.date)
        setTicketAllotments((prev) => ({ ...prev, [t.id]: [] }))
      }
      await api.updateGuestType(loadedEventId, t.id, {
        name: offerVal(t, 'name') || t.name,
        guest_mode: offerVal(t, 'guest_mode') || null,
        day_scope: scope === 'specific' ? 'specific' : scope || null,
        default_ticket_count: parseInt(offerVal(t, 'default_ticket_count'), 10) || null,
        default_hold_timing: offerVal(t, 'default_hold_timing') || null,
        default_spend_total: parseInt(offerVal(t, 'default_spend_total'), 10) || null,
      })
      onToast(`"${offerVal(t, 'name') || t.name}" saved — newly added guests get these defaults`)
      setOfferDrafts((prev) => ({ ...prev, [t.id]: {} }))
      loadEventData(loadedEventId)
      setTimeout(() => toggleExpandType(t.id), 0)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingOfferId(null)
    }
  }

  const deleteType = async (type) => {
    if (!window.confirm(`Delete "${type.name}"?`)) return
    try {
      await api.deleteGuestType(loadedEventId, type.id)
      onToast(`"${type.name}" deleted`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const toggleExpandType = (typeId) => {
    if (expandedTypeId === typeId) {
      setExpandedTypeId(null)
      return
    }
    setExpandedTypeId(typeId)
    setAddPriorityCategoryId('')
    setAddPrioritySection('')
    setNewAllotmentDay({ date: '', quantity: '' })
    if (!priorityLists[typeId]) {
      api
        .listSeatingPriorities(loadedEventId, typeId)
        .then((list) => setPriorityLists({ ...priorityLists, [typeId]: list }))
        .catch((e) => onToast(e.message, true))
    }
    if (!ticketAllotments[typeId]) {
      api
        .listTicketAllotments(loadedEventId, typeId)
        .then((list) => setTicketAllotments({ ...ticketAllotments, [typeId]: list }))
        .catch((e) => onToast(e.message, true))
    }
  }

  const handleSaveAllotmentDay = async (typeId) => {
    if (!newAllotmentDay.date || newAllotmentDay.quantity === '') return
    setSavingAllotmentDay(true)
    try {
      await api.upsertTicketAllotmentDay(
        loadedEventId,
        typeId,
        newAllotmentDay.date,
        Number(newAllotmentDay.quantity)
      )
      const updated = await api.listTicketAllotments(loadedEventId, typeId)
      setTicketAllotments({ ...ticketAllotments, [typeId]: updated })
      setNewAllotmentDay({ date: '', quantity: '' })
      onToast('Ticket allotment saved')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingAllotmentDay(false)
    }
  }

  const handleDeleteAllotmentDay = async (typeId, date) => {
    try {
      await api.deleteTicketAllotmentDay(loadedEventId, typeId, date)
      const updated = await api.listTicketAllotments(loadedEventId, typeId)
      setTicketAllotments({ ...ticketAllotments, [typeId]: updated })
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const sectionLabelsOf = (categoryId) => {
    const c = (categories || []).find((x) => x.id === categoryId)
    return [...new Set((c?.sections || []).map((s) => s.section_label))]
  }

  const [addPriorityMulti, setAddPriorityMulti] = useState([]) // multiple allowed sections
  const [addPriorityPlacement, setAddPriorityPlacement] = useState('together')

  const handleAddPriority = async (typeId) => {
    if (!addPriorityCategoryId) return
    setAddingPriority(true)
    try {
      await api.addSeatingPriority(loadedEventId, typeId, {
        seating_category_id: addPriorityCategoryId,
        section_label: addPriorityMulti.length ? null : addPrioritySection || null,
        allowed_sections: addPriorityMulti.length ? addPriorityMulti : null,
        placement: addPriorityPlacement,
      })
      const updated = await api.listSeatingPriorities(loadedEventId, typeId)
      setPriorityLists({ ...priorityLists, [typeId]: updated })
      setAddPriorityCategoryId('')
      setAddPrioritySection('')
      setAddPriorityMulti([])
      setAddPriorityPlacement('together')
      onToast('Added to priority list')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setAddingPriority(false)
    }
  }

  const handleDeletePriority = async (typeId, priorityId) => {
    try {
      await api.deleteSeatingPriority(loadedEventId, typeId, priorityId)
      const updated = await api.listSeatingPriorities(loadedEventId, typeId)
      setPriorityLists({ ...priorityLists, [typeId]: updated })
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const categoryName = (id) => categories?.find((c) => c.id === id)?.name || '—'
  // Day-cloned pool families ("Row 2", "Row 2 (12/25)", ...): priorities
  // are configured once per AREA — the backend maps them to the right
  // day's sibling per guest (pool_for_day). So the add-dropdown shows
  // one entry per family, and existing priorities display the family
  // name even when they point at a dated clone.
  const famBase = (name) => String(name || '').replace(/\s*\(\d{2}\/\d{2}\)$/, '')
  const familyCategories = (() => {
    const byBase = new Map()
    for (const c of categories || []) {
      const base = famBase(c.name)
      const cur = byBase.get(base)
      const isBare = c.name === base
      if (!cur || (isBare && !cur.bare)) byBase.set(base, { ...c, name: base, bare: isBare })
    }
    return [...byBase.values()]
  })()
  const familyName = (id) => famBase(categoryName(id))

  return (
    <>
      <div className="page-title">Guest types</div>
      <p className="page-subtitle">
        The kinds of comp guests this event has — models, sponsors, press — each with its seating
        priority list (which sections it fills, in order) and default per-day ticket allotments.
        Sections themselves live in Tickets &amp; seating; guests are added on the Guest list tab.
      </p>


      {loadedEventId && categories !== null && (
        <>
          {/* ---------- Guest types SECOND — accordion, expand to manage priority seating list ---------- */}
          <div className="panel">
            <div className="panel-title">Add a guest type</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Specific to this event — Celebrity, Sponsor, Volunteer, etc. Once added, expand it to set an
              ordered seating preference list — e.g. try 2A, then 2B, then 4A — used automatically when a
              guest of this type is added without a specific seat.
            </p>
            <form className="inline-form" onSubmit={handleCreateType}>
              <div className="field">
                <label htmlFor="type-name">Name</label>
                <input
                  id="type-name"
                  required
                  placeholder="Volunteer"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="type-mode" title="Which page guests of this type live on, and which flow they get">
                  Offering type
                </label>
                <select
                  id="type-mode"
                  value={typeForm.guest_mode}
                  onChange={(e) => setTypeForm({ ...typeForm, guest_mode: e.target.value })}
                >
                  <option value="invite">Guest invite — RSVPs for themselves (Invites page)</option>
                  <option value="select">Guest invite — picks their own days (Invites page)</option>
                  <option value="distribute">Allotment — hands tickets out to their people (Allotments page)</option>
                </select>
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingType}>
                Add guest type
              </button>
            </form>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Guest type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guestTypes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">
                    No guest types yet for this event.
                  </td>
                </tr>
              ) : (
                guestTypes.map((t) => (
                  <Fragment key={t.id}>
                    {(
                      <tr
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleExpandType(t.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-alt)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ width: 32 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: 'var(--accent)',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {expandedTypeId === t.id ? '▾' : '▸'}
                          </span>
                        </td>
                        <td>
                          <div>{t.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {[
                              { invite: 'Invite', select: 'Invite (picks days)', distribute: 'Allotment' }[t.guest_mode] || 'Invite',
                              { all: 'all days', single: 'one day per guest', choose: 'guest chooses', specific: 'specific dates' }[
                                t.day_scope || ((ticketAllotments[t.id] || []).length > 0 ? 'specific' : '')
                              ] || 'no ticket default',
                              t.default_ticket_count ? `${t.default_ticket_count}/day` : null,
                              t.default_spend_total ? `cap ${t.default_spend_total}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </td>
                        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleExpandType(t.id)}>
                            {expandedTypeId === t.id ? 'Close' : 'Edit'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteType(t)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )}
                    {expandedTypeId === t.id && (
                      <tr>
                        <td></td>
                        <td colSpan={2} style={{ paddingTop: 0, paddingBottom: 16 }}>
                          <div
                            style={{
                              background: 'var(--surface-alt)',
                              borderRadius: 8,
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                              The offer — what a &ldquo;{offerVal(t, 'name') || t.name}&rdquo; gets when added.
                              Days and amounts here are defaults; both stay overridable per guest.
                            </div>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
                              <div className="field" style={{ minWidth: 150 }}>
                                <label>Name</label>
                                <input value={offerVal(t, 'name') || t.name} onChange={(e) => setOfferVal(t, 'name', e.target.value)} />
                              </div>
                              <div className="field">
                                <label title="Which page guests of this type live on, and which flow they get">Offering type</label>
                                <select value={offerVal(t, 'guest_mode')} onChange={(e) => setOfferVal(t, 'guest_mode', e.target.value)}>
                                  <option value="invite">Guest invite — RSVPs for themselves</option>
                                  <option value="select">Guest invite — picks their own days</option>
                                  <option value="distribute">Allotment — hands tickets out</option>
                                  {offerVal(t, 'guest_mode') === '' && <option value="">Auto (legacy — retired)</option>}
                                </select>
                              </div>
                              <div className="field">
                                <label title="The SHAPE of the offer — 'All days' follows the event's dates automatically when they shift">Days</label>
                                <select value={offerVal(t, 'day_scope')} onChange={(e) => setOfferVal(t, 'day_scope', e.target.value)}>
                                  <option value="">No ticket default — plain yes/no guest</option>
                                  <option value="all">All days — every event day</option>
                                  <option value="single">One day — picked per guest</option>
                                  <option value="choose">Guest chooses — spends a total across days</option>
                                  <option value="specific">Specific dates — set below</option>
                                </select>
                              </div>
                              {['all', 'single', 'choose'].includes(offerVal(t, 'day_scope')) && (
                                <div className="field" style={{ width: 100 }}>
                                  <label title="Tickets per day">Tickets</label>
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="e.g. 2"
                                    value={offerVal(t, 'default_ticket_count')}
                                    onChange={(e) => setOfferVal(t, 'default_ticket_count', e.target.value)}
                                  />
                                </div>
                              )}
                              {offerVal(t, 'day_scope') !== '' && (
                                <div className="field" style={{ width: 100 }}>
                                  <label title="The across-days cap stamped on each added guest. Lower than the day amounts = their RSVP becomes a chooser. Blank = fixed offer.">
                                    Total (cap)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="all"
                                    value={offerVal(t, 'default_spend_total')}
                                    onChange={(e) => setOfferVal(t, 'default_spend_total', e.target.value)}
                                  />
                                </div>
                              )}
                              <div className="field">
                                <label title="Default for new guests of this type — when their tickets are pulled from sellable inventory">Pull</label>
                                <select value={offerVal(t, 'default_hold_timing')} onChange={(e) => setOfferVal(t, 'default_hold_timing', e.target.value)}>
                                  <option value="">Now (default)</option>
                                  <option value="now">Now</option>
                                  <option value="on_confirm">On RSVP yes</option>
                                  <option value="later">Later</option>
                                </select>
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={savingOfferId === t.id || !offerDirty(t)}
                                onClick={() => saveOffer(t)}
                              >
                                {savingOfferId === t.id ? 'Saving…' : 'Save offer'}
                              </button>
                            </div>

                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                              Seating priority — tried in order, top first
                            </div>
                            {!priorityLists[t.id] ? (
                              <p style={{ fontSize: 13 }}>Loading…</p>
                            ) : priorityLists[t.id].length === 0 ? (
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                                No preferences set — guests of this type stay unassigned unless a seat is
                                picked manually.
                              </p>
                            ) : (
                              <ol style={{ margin: '0 0 10px', paddingLeft: 20 }}>
                                {priorityLists[t.id].map((p) => (
                                  <li
                                    key={p.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      fontSize: 13.5,
                                      padding: '4px 0',
                                    }}
                                  >
                                    <span>
                                      {familyName(p.seating_category_id)}
                                      {p.section_label && !p.allowed_sections && (
                                        <span style={{ color: 'var(--text-muted)' }}> · Section {p.section_label}</span>
                                      )}
                                      {p.allowed_sections && (
                                        <span style={{ color: 'var(--text-muted)' }}>
                                          {' '}· Sections {p.allowed_sections}
                                          {p.placement === 'spread' ? ' · spread' : ' · in order'}
                                        </span>
                                      )}
                                    </span>
                                    <button
                                      className="btn btn-danger btn-sm"
                                      onClick={() => handleDeletePriority(t.id, p.id)}
                                    >
                                      Remove
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            )}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <select
                                style={selectStyle}
                                value={addPriorityCategoryId}
                                onChange={(e) => setAddPriorityCategoryId(e.target.value)}
                              >
                                <option value="">Choose a category to add…</option>
                                {familyCategories
                                  .filter((c) => {
                                    const entries = priorityLists[t.id] || []
                                    // a pool with sections can appear once per section
                                    // (plus once pool-wide); a plain pool only once
                                    if ((c.sections || []).length > 0) {
                                      const used = entries.filter((p) => familyName(p.seating_category_id) === c.name)
                                      return used.length < new Set((c.sections || []).map((s) => s.section_label)).size + 1
                                    }
                                    return !entries.some((p) => familyName(p.seating_category_id) === c.name)
                                  })
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                              </select>
                              {sectionLabelsOf(addPriorityCategoryId).length > 1 && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Allowed:</span>
                                  {sectionLabelsOf(addPriorityCategoryId).map((lbl) => (
                                    <label key={lbl} style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={addPriorityMulti.includes(lbl)}
                                        onChange={(e) =>
                                          setAddPriorityMulti(
                                            e.target.checked
                                              ? [...addPriorityMulti, lbl]
                                              : addPriorityMulti.filter((x) => x !== lbl)
                                          )
                                        }
                                      />
                                      {lbl}
                                    </label>
                                  ))}
                                  {addPriorityMulti.length > 1 && (
                                    <select
                                      style={selectStyle}
                                      value={addPriorityPlacement}
                                      onChange={(e) => setAddPriorityPlacement(e.target.value)}
                                      title="How guests fill the allowed sections"
                                    >
                                      <option value="together">Fill in order (together)</option>
                                      <option value="spread">Spread evenly</option>
                                    </select>
                                  )}
                                </div>
                              )}
                              {sectionLabelsOf(addPriorityCategoryId).length > 0 && addPriorityMulti.length === 0 && (
                                <select
                                  style={selectStyle}
                                  value={addPrioritySection}
                                  onChange={(e) => setAddPrioritySection(e.target.value)}
                                >
                                  <option value="">Whole area</option>
                                  {sectionLabelsOf(addPriorityCategoryId)
                                    .filter(
                                      (lbl) =>
                                        !(priorityLists[t.id] || []).some(
                                          (p) => p.seating_category_id === addPriorityCategoryId && p.section_label === lbl
                                        )
                                    )
                                    .map((lbl) => (
                                      <option key={lbl} value={lbl}>
                                        Section {lbl}
                                      </option>
                                    ))}
                                </select>
                              )}
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={addingPriority || !addPriorityCategoryId}
                                onClick={() => handleAddPriority(t.id)}
                              >
                                Add
                              </button>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                              New entries go to the bottom of the list. To reorder, remove and re-add in the
                              order you want.
                            </p>
                          </div>

                          <div
                            style={{
                              background: 'var(--surface-alt)',
                              borderRadius: 8,
                              padding: '12px 14px',
                              marginTop: 12,
                            }}
                          >
                            {offerVal(t, 'day_scope') === 'specific' && (
                            <>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                              Specific dates — the exact days and amounts a &ldquo;{offerVal(t, 'name') || t.name}&rdquo;
                              is offered. With a Total (cap) above that&apos;s lower than these amounts, the
                              guest&apos;s RSVP becomes a chooser (&ldquo;place your {t.default_spend_total || 'N'} across
                              these caps&rdquo;). Overridable per guest.
                            </div>

                            {!ticketAllotments[t.id] ? (
                              <p style={{ fontSize: 13 }}>Loading…</p>
                            ) : ticketAllotments[t.id].length === 0 ? (
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                                No ticket allotment set — guests of this type have nothing to distribute.
                              </p>
                            ) : (
                              <table
                                style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}
                              >
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
                                  {[...ticketAllotments[t.id]]
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
                                            onClick={() => handleDeleteAllotmentDay(t.id, row.date)}
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
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={savingAllotmentDay}
                                onClick={() => handleSaveAllotmentDay(t.id)}
                              >
                                Add / update day
                              </button>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                              Setting a date that's already listed updates its quantity instead of adding a
                              duplicate.
                            </p>
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
        </>
      )}
    </>
  )
}