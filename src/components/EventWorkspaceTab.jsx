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

export default function EventWorkspaceTab({ onToast }) {
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState(() => sessionStorage.getItem('eventnxt_last_event_id') || '')
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [guestTypes, setGuestTypes] = useState([])
  const [categories, setCategories] = useState(null)

  // ---- Seating categories ----
  const [catForm, setCatForm] = useState({ name: '', capacity: '' })
  const [creatingCat, setCreatingCat] = useState(false)
  const [editingCatId, setEditingCatId] = useState(null)
  const [catEditForm, setCatEditForm] = useState({ name: '', capacity: '' })
  const [savingCat, setSavingCat] = useState(false)

  // ---- Guest types (accordion) ----
  const [typeForm, setTypeForm] = useState({ name: '' })
  const [creatingType, setCreatingType] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState(null)
  const [typeEditForm, setTypeEditForm] = useState({ name: '' })
  const [savingType, setSavingType] = useState(false)
  const [expandedTypeId, setExpandedTypeId] = useState(null)
  const [priorityLists, setPriorityLists] = useState({}) // guestTypeId -> [priority entries]
  const [addPriorityCategoryId, setAddPriorityCategoryId] = useState('')
  const [addingPriority, setAddingPriority] = useState(false)
  // Ticket allotment defaults, edited inline in the accordion
  const [allotmentDraft, setAllotmentDraft] = useState({ ticketCount: '', dates: [], newDate: '' })
  const [savingAllotment, setSavingAllotment] = useState(false)

  const loadEventData = (id) => {
    setCategories(null)
    Promise.all([api.listSeatingCategories(id), api.listGuestTypes(id)])
      .then(([cats, types]) => {
        setCategories(cats)
        setGuestTypes(types)
        setLoadedEventId(id)
        setExpandedTypeId(null)
        setPriorityLists({})
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
    setEditingCatId(null)
    setEditingTypeId(null)
    if (id) loadEventData(id)
  }

  // ---------- Seating categories ----------

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    setCreatingCat(true)
    try {
      await api.createSeatingCategory(loadedEventId, { name: catForm.name, capacity: Number(catForm.capacity) })
      onToast(`"${catForm.name}" added`)
      setCatForm({ name: '', capacity: '' })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingCat(false)
    }
  }

  const startEditCat = (cat) => {
    setEditingCatId(cat.id)
    setCatEditForm({ name: cat.name, capacity: cat.capacity })
  }

  const saveEditCat = async (catId) => {
    setSavingCat(true)
    try {
      await api.updateSeatingCategory(loadedEventId, catId, {
        name: catEditForm.name,
        capacity: Number(catEditForm.capacity),
      })
      onToast('Saved')
      setEditingCatId(null)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingCat(false)
    }
  }

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? Any guests assigned to it will become unassigned.`)) return
    try {
      await api.deleteSeatingCategory(loadedEventId, cat.id)
      onToast(`"${cat.name}" deleted`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // ---------- Guest types + priority seating ----------

  const handleCreateType = async (e) => {
    e.preventDefault()
    setCreatingType(true)
    try {
      await api.createGuestType(loadedEventId, { name: typeForm.name })
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
    setTypeEditForm({ name: type.name })
  }

  const saveEditType = async (typeId) => {
    setSavingType(true)
    try {
      await api.updateGuestType(loadedEventId, typeId, { name: typeEditForm.name })
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
    const type = guestTypes.find((t) => t.id === typeId)
    setAllotmentDraft({
      ticketCount: type?.default_ticket_count ?? '',
      dates: type?.default_valid_dates || [],
      newDate: '',
    })
    if (!priorityLists[typeId]) {
      api
        .listSeatingPriorities(loadedEventId, typeId)
        .then((list) => setPriorityLists({ ...priorityLists, [typeId]: list }))
        .catch((e) => onToast(e.message, true))
    }
  }

  const saveAllotmentDefaults = async (type) => {
    setSavingAllotment(true)
    try {
      await api.updateGuestType(loadedEventId, type.id, {
        name: type.name,
        default_ticket_count: allotmentDraft.ticketCount === '' ? null : Number(allotmentDraft.ticketCount),
        default_valid_dates: allotmentDraft.dates.length > 0 ? allotmentDraft.dates : null,
      })
      onToast('Ticket allotment saved')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingAllotment(false)
    }
  }

  const addAllotmentDate = () => {
    if (!allotmentDraft.newDate || allotmentDraft.dates.includes(allotmentDraft.newDate)) return
    setAllotmentDraft({
      ...allotmentDraft,
      dates: [...allotmentDraft.dates, allotmentDraft.newDate].sort(),
      newDate: '',
    })
  }

  const removeAllotmentDate = (date) => {
    setAllotmentDraft({ ...allotmentDraft, dates: allotmentDraft.dates.filter((d) => d !== date) })
  }

  const handleAddPriority = async (typeId) => {
    if (!addPriorityCategoryId) return
    setAddingPriority(true)
    try {
      await api.addSeatingPriority(loadedEventId, typeId, { seating_category_id: addPriorityCategoryId })
      const updated = await api.listSeatingPriorities(loadedEventId, typeId)
      setPriorityLists({ ...priorityLists, [typeId]: updated })
      setAddPriorityCategoryId('')
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
      <div className="page-title">Event workspace</div>
      <p className="page-subtitle">
        Pick an event from your org to manage its seating categories and guest types. Add or import guests
        from the Guest list tab.
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

      {loadedEventId && categories !== null && (
        <>
          {/* ---------- Seating categories FIRST — guest types' priority lists depend on these existing ---------- */}
          <div className="panel">
            <div className="panel-title">Add a seating category</div>
            <form className="inline-form" onSubmit={handleCreateCategory}>
              <div className="field">
                <label htmlFor="cat-name">Name</label>
                <input
                  id="cat-name"
                  required
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="cat-capacity">Capacity</label>
                <input
                  id="cat-capacity"
                  type="number"
                  min={1}
                  required
                  style={{ minWidth: 90 }}
                  value={catForm.capacity}
                  onChange={(e) => setCatForm({ ...catForm, capacity: e.target.value })}
                />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingCat}>
                Add category
              </button>
            </form>
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Capacity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">
                    No seating categories yet.
                  </td>
                </tr>
              ) : (
                categories.map((c) =>
                  editingCatId === c.id ? (
                    <tr key={c.id}>
                      <td>
                        <input
                          value={catEditForm.name}
                          onChange={(e) => setCatEditForm({ ...catEditForm, name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={catEditForm.capacity}
                          onChange={(e) => setCatEditForm({ ...catEditForm, capacity: e.target.value })}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={savingCat}
                          onClick={() => saveEditCat(c.id)}
                        >
                          Save
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingCatId(null)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="mono">{c.capacity}</td>
                      <td className="actions-cell">
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditCat(c)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>

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
                  onChange={(e) => setTypeForm({ name: e.target.value })}
                />
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
                            onChange={(e) => setTypeEditForm({ name: e.target.value })}
                            style={{ width: '100%' }}
                          />
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
                                    <span>{categoryName(p.seating_category_id)}</span>
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
                                  .filter(
                                    (c) => !(priorityLists[t.id] || []).some((p) => p.seating_category_id === c.id)
                                  )
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                              </select>
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
                              themselves, and which dates those tickets are valid for. Leave ticket count
                              blank for an ordinary yes/no guest with nothing to distribute. Overridable per
                              guest when adding them.
                            </div>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div className="field" style={{ width: 140 }}>
                                <label>Ticket count</label>
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="None"
                                  value={allotmentDraft.ticketCount}
                                  onChange={(e) => setAllotmentDraft({ ...allotmentDraft, ticketCount: e.target.value })}
                                />
                              </div>
                              <div className="field" style={{ width: 170 }}>
                                <label>Add a valid date</label>
                                <input
                                  type="date"
                                  value={allotmentDraft.newDate}
                                  onChange={(e) => setAllotmentDraft({ ...allotmentDraft, newDate: e.target.value })}
                                />
                              </div>
                              <button className="btn btn-secondary btn-sm" onClick={addAllotmentDate}>
                                Add date
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={savingAllotment}
                                onClick={() => saveAllotmentDefaults(t)}
                              >
                                Save allotment
                              </button>
                            </div>
                            {allotmentDraft.dates.length > 0 && (
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                {allotmentDraft.dates.map((d) => (
                                  <span
                                    key={d}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: 'var(--bg)',
                                      border: '1px solid var(--border)',
                                      borderRadius: 100,
                                      padding: '4px 6px 4px 12px',
                                      fontSize: 12.5,
                                    }}
                                  >
                                    {d}
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ padding: '2px 8px' }}
                                      onClick={() => removeAllotmentDate(d)}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
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