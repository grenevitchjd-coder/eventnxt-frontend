import { useEffect, useState } from 'react'
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
  const [guests, setGuests] = useState(null)

  // ---- Seating categories ----
  const [catForm, setCatForm] = useState({ name: '', capacity: '' })
  const [creatingCat, setCreatingCat] = useState(false)
  const [editingCatId, setEditingCatId] = useState(null)
  const [catEditForm, setCatEditForm] = useState({ name: '', capacity: '' })
  const [savingCat, setSavingCat] = useState(false)

  // ---- Guest types ----
  const [typeForm, setTypeForm] = useState({ name: '', default_seating_category_id: '' })
  const [creatingType, setCreatingType] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState(null)
  const [typeEditForm, setTypeEditForm] = useState({ name: '', default_seating_category_id: '' })
  const [savingType, setSavingType] = useState(false)

  // ---- Guests ----
  const [guestForm, setGuestForm] = useState({
    name: '',
    email: '',
    guest_type_id: '',
    seating_category_id: '',
    allocation_status: 'confirmed',
  })
  const [creatingGuest, setCreatingGuest] = useState(false)
  const [editingGuestId, setEditingGuestId] = useState(null)
  const [guestEditForm, setGuestEditForm] = useState(null)
  const [savingGuest, setSavingGuest] = useState(false)

  const loadEventData = (id) => {
    setCategories(null)
    setGuests(null)
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
    setEditingGuestId(null)
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

  // ---------- Guest types ----------

  const handleCreateType = async (e) => {
    e.preventDefault()
    setCreatingType(true)
    try {
      await api.createGuestType(loadedEventId, {
        name: typeForm.name,
        default_seating_category_id: typeForm.default_seating_category_id || null,
      })
      onToast(`"${typeForm.name}" added`)
      setTypeForm({ name: '', default_seating_category_id: '' })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingType(false)
    }
  }

  const startEditType = (type) => {
    setEditingTypeId(type.id)
    setTypeEditForm({ name: type.name, default_seating_category_id: type.default_seating_category_id || '' })
  }

  const saveEditType = async (typeId) => {
    setSavingType(true)
    try {
      await api.updateGuestType(loadedEventId, typeId, {
        name: typeEditForm.name,
        default_seating_category_id: typeEditForm.default_seating_category_id || null,
      })
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

  // ---------- Guests ----------

  const handleGuestTypeChange = (e) => {
    const typeId = e.target.value
    const selectedType = guestTypes.find((t) => t.id === typeId)
    setGuestForm({
      ...guestForm,
      guest_type_id: typeId,
      seating_category_id: selectedType?.default_seating_category_id || '',
    })
  }

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
      })
      onToast(`${guestForm.name} added`)
      setGuestForm({ name: '', email: '', guest_type_id: '', seating_category_id: '', allocation_status: 'confirmed' })
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

  const categoryName = (id) => categories?.find((c) => c.id === id)?.name || '—'
  const guestTypeName = (id) => guestTypes?.find((t) => t.id === id)?.name || 'unknown'

  return (
    <>
      <div className="page-title">Event workspace</div>
      <p className="page-subtitle">Pick an event from your org to manage its seating, guest types, and guests.</p>

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

      {loadedEventId && categories !== null && guests !== null && (
        <>
          {/* ---------- Seating categories FIRST — guest types depend on these existing ---------- */}
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

          {/* ---------- Guest types SECOND — can now reference real categories ---------- */}
          <div className="panel">
            <div className="panel-title">Add a guest type</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>
              Specific to this event — Celebrity, Sponsor, Volunteer, etc. The default seating pre-fills
              when adding a guest of this type, but stays fully editable per person.
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
                <label htmlFor="type-default-seating">Default seating (optional)</label>
                <select
                  id="type-default-seating"
                  value={typeForm.default_seating_category_id}
                  onChange={(e) => setTypeForm({ ...typeForm, default_seating_category_id: e.target.value })}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingType}>
                Add guest type
              </button>
            </form>
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Guest type</th>
                <th>Default seating</th>
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
                guestTypes.map((t) =>
                  editingTypeId === t.id ? (
                    <tr key={t.id}>
                      <td>
                        <input
                          value={typeEditForm.name}
                          onChange={(e) => setTypeEditForm({ ...typeEditForm, name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <select
                          style={selectStyle}
                          value={typeEditForm.default_seating_category_id}
                          onChange={(e) =>
                            setTypeEditForm({ ...typeEditForm, default_seating_category_id: e.target.value })
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
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.default_seating_category_id ? categoryName(t.default_seating_category_id) : '—'}</td>
                      <td className="actions-cell">
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditType(t)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteType(t)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>

          {/* ---------- Guests ---------- */}
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
                <select id="g-type" required value={guestForm.guest_type_id} onChange={handleGuestTypeChange}>
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
                  <option value="">None</option>
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
                </select>
              </div>
              <button className="btn btn-secondary" type="submit" disabled={creatingGuest}>
                Add guest
              </button>
            </form>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Category</th>
                <th>Status</th>
                <th>RSVP link</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No guests yet.
                  </td>
                </tr>
              ) : (
                guests.map((g) =>
                  editingGuestId === g.id ? (
                    <tr key={g.id}>
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
                        </select>
                      </td>
                      <td className="mono">{g.rsvp_token}</td>
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
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td className="mono">{g.email}</td>
                      <td>{guestTypeName(g.guest_type_id)}</td>
                      <td>{g.seating_category_id ? categoryName(g.seating_category_id) : '—'}</td>
                      <td>
                        <span className={`pill pill-${g.allocation_status}`}>{g.allocation_status}</span>
                      </td>
                      <td className="mono">{g.rsvp_token}</td>
                      <td className="actions-cell">
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditGuest(g)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteGuest(g)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}