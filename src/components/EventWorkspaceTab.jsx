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
  const [typeForm, setTypeForm] = useState({ name: '', guest_mode: '' })
  const [creatingType, setCreatingType] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState(null)
  const [typeEditForm, setTypeEditForm] = useState({ name: '', guest_mode: '' })
  const [savingType, setSavingType] = useState(false)
  const [expandedTypeId, setExpandedTypeId] = useState(null)
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
      await api.createGuestType(loadedEventId, { name: typeForm.name, guest_mode: typeForm.guest_mode || null })
      onToast(`"${typeForm.name}" added`)
      setTypeForm({ name: '' })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingType(false)
    }
  }

  const startEditType = (type) => {
    setEditingTypeId(type.id)
    setTypeEditForm({ name: type.name, guest_mode: type.guest_mode || '' })
  }

  const saveEditType = async (typeId) => {
    setSavingType(true)
    try {
      await api.updateGuestType(loadedEventId, typeId, { name: typeEditForm.name, guest_mode: typeEditForm.guest_mode || null })
      onToast('Saved')
      setEditingTypeId(null)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingType(false)
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

  const handleAddPriority = async (typeId) => {
    if (!addPriorityCategoryId) return
    setAddingPriority(true)
    try {
      await api.addSeatingPriority(loadedEventId, typeId, {
        seating_category_id: addPriorityCategoryId,
        section_label: addPrioritySection || null,
      })
      const updated = await api.listSeatingPriorities(loadedEventId, typeId)
      setPriorityLists({ ...priorityLists, [typeId]: updated })
      setAddPriorityCategoryId('')
      setAddPrioritySection('')
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
                <label htmlFor="type-mode">Guest experience</label>
                <select
                  id="type-mode"
                  value={typeForm.guest_mode}
                  onChange={(e) => setTypeForm({ ...typeForm, guest_mode: e.target.value })}
                >
                  <option value="">Auto — distribute if allotments, else invite</option>
                  <option value="invite">Invite — RSVP for themselves</option>
                  <option value="distribute">Distribute — hands out an allotment</option>
                  <option value="select">Select — picks their own day</option>
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
                    {editingTypeId === t.id ? (
                      <tr>
                        <td></td>
                        <td>
                          <input
                            value={typeEditForm.name}
                            onChange={(e) => setTypeEditForm({ ...typeEditForm, name: e.target.value })}
                            style={{ width: '100%' }}
                          />
                            <select
                              style={{ marginTop: 6 }}
                              value={typeEditForm.guest_mode}
                              onChange={(e) => setTypeEditForm({ ...typeEditForm, guest_mode: e.target.value })}
                            >
                              <option value="">Auto mode</option>
                              <option value="invite">Invite</option>
                              <option value="distribute">Distribute</option>
                              <option value="select">Select</option>
                            </select>
                        </td>
                        <td className="actions-cell">
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={savingType}
                            onClick={() => saveEditType(t.id)}
                          >
                            Save
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingTypeId(null)}>
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ) : (
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
                            Click to set up seating priority &amp; ticket allotment
                          </div>
                        </td>
                        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-secondary btn-sm" onClick={() => startEditType(t)}>
                            Edit
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
                                      {categoryName(p.seating_category_id)}
                                      {p.section_label && (
                                        <span style={{ color: 'var(--text-muted)' }}> · Section {p.section_label}</span>
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
                                {categories
                                  .filter((c) => {
                                    const entries = priorityLists[t.id] || []
                                    // a pool with sections can appear once per section
                                    // (plus once pool-wide); a plain pool only once
                                    if ((c.sections || []).length > 0) {
                                      const used = entries.filter((p) => p.seating_category_id === c.id)
                                      return used.length < new Set((c.sections || []).map((s) => s.section_label)).size + 1
                                    }
                                    return !entries.some((p) => p.seating_category_id === c.id)
                                  })
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                              </select>
                              {sectionLabelsOf(addPriorityCategoryId).length > 0 && (
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
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                              Ticket allotment — how many tickets a guest of this type gets to hand out
                              themselves, per day. Each day is its own separate pool — e.g. 10 Thursday
                              tickets and 5 Saturday tickets never share capacity. Leave empty for an
                              ordinary yes/no guest with nothing to distribute. Overridable per guest when
                              adding them.
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