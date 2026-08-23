import { useEffect, useState } from 'react'
import { api } from '../api'

export default function EventWorkspaceTab({ onToast }) {
  const [eventId, setEventId] = useState(() => sessionStorage.getItem('eventnxt_last_event_id') || '')
  const [loadedEventId, setLoadedEventId] = useState(null)

  const [guestTypes, setGuestTypes] = useState([])
  const [categories, setCategories] = useState(null)
  const [guests, setGuests] = useState(null)

  const [catForm, setCatForm] = useState({ name: '', capacity: '' })
  const [creatingCat, setCreatingCat] = useState(false)

  const [guestForm, setGuestForm] = useState({
    name: '',
    email: '',
    guest_type_id: '',
    seating_category_id: '',
    allocation_status: 'confirmed',
  })
  const [creatingGuest, setCreatingGuest] = useState(false)

  const loadEventData = (id) => {
    Promise.all([api.listSeatingCategories(id), api.listGuests(id), api.listGuestTypes()])
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
    if (eventId) loadEventData(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLoadEvent = (e) => {
    e.preventDefault()
    setCategories(null)
    setGuests(null)
    loadEventData(eventId)
  }

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    setCreatingCat(true)
    try {
      await api.createSeatingCategory(loadedEventId, {
        name: catForm.name,
        capacity: Number(catForm.capacity),
      })
      onToast(`"${catForm.name}" added`)
      setCatForm({ name: '', capacity: '' })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingCat(false)
    }
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
      setGuestForm({
        name: '',
        email: '',
        guest_type_id: '',
        seating_category_id: '',
        allocation_status: 'confirmed',
      })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreatingGuest(false)
    }
  }

  const categoryName = (id) => categories?.find((c) => c.id === id)?.name || '—'
  const guestTypeName = (id) => guestTypes?.find((t) => t.id === id)?.name || 'unknown'

  return (
    <>
      <div className="page-title">Event workspace</div>
      <p className="page-subtitle">
        Paste an event ID (from your Events360 org dashboard) to manage its seating and guests.
      </p>

      <div className="panel">
        <form className="inline-form" onSubmit={handleLoadEvent}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="event-id">Event ID</label>
            <input
              id="event-id"
              required
              style={{ width: '100%', minWidth: 280 }}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" type="submit">
            Load
          </button>
        </form>
      </div>

      {loadedEventId && categories !== null && guests !== null && (
        <>
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
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={2} className="empty-state">
                    No seating categories yet.
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="mono">{c.capacity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

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
              </tr>
            </thead>
            <tbody>
              {guests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No guests yet.
                  </td>
                </tr>
              ) : (
                guests.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="mono">{g.email}</td>
                    <td>{guestTypeName(g.guest_type_id)}</td>
                    <td>{g.seating_category_id ? categoryName(g.seating_category_id) : '—'}</td>
                    <td>
                      <span className={`pill pill-${g.allocation_status}`}>{g.allocation_status}</span>
                    </td>
                    <td className="mono">{g.rsvp_token}</td>
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