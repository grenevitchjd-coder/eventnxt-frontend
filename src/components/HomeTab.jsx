import { useEffect, useState } from 'react'
import { api } from '../api'

export default function HomeTab({ onToast }) {
  const [events, setEvents] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [profile, setProfile] = useState(null)

  const [form, setForm] = useState({ title: '', description: '', address: '', external_ticket_url: '', slug: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    api
      .listEvents()
      .then(setEvents)
      .catch((e) => onToast(e.message, true))
  }, [])

  const openEvent = (event) => {
    setSelectedEvent(event)
    setProfile(null)
    api
      .getEventProfile(event.id)
      .then((p) => {
        setProfile(p)
        setForm({
          title: p?.title || event.name,
          description: p?.description || '',
          address: p?.address || '',
          external_ticket_url: p?.external_ticket_url || '',
          slug: p?.slug || '',
        })
      })
      .catch((e) => onToast(e.message, true))
  }

  const backToList = () => {
    setSelectedEvent(null)
    setProfile(null)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Always send every field together — the backend does a full
      // replace, not a partial patch, so omitting a field would wipe it.
      const saved = await api.saveEventProfile(selectedEvent.id, {
        title: form.title,
        description: form.description || null,
        address: form.address || null,
        external_ticket_url: form.external_ticket_url || null,
        slug: form.slug || null,
      })
      setProfile(saved)
      setForm({ ...form, slug: saved.slug })
      onToast('Saved')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const updated = await api.uploadBannerPhoto(selectedEvent.id, file)
      setProfile(updated)
      onToast('Photo uploaded')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setUploading(false)
    }
  }

  const togglePublish = async () => {
    if (!profile) {
      onToast('Save the profile before publishing.', true)
      return
    }
    setPublishing(true)
    try {
      const updated = profile.is_published
        ? await api.unpublishEventProfile(selectedEvent.id)
        : await api.publishEventProfile(selectedEvent.id)
      setProfile(updated)
      onToast(updated.is_published ? 'Published — the public page is now live' : 'Unpublished')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setPublishing(false)
    }
  }

  if (events === null) return null

  // ---------- Event detail / profile editor ----------
  if (selectedEvent) {
    return (
      <>
        <button className="nav-item" style={{ marginBottom: 16, padding: '6px 0' }} onClick={backToList}>
          ← Back to events
        </button>
        <div className="page-title">{selectedEvent.name}</div>
        <p className="page-subtitle">
          Public event page — what press, sponsors, and guests actually see when you share the link.
        </p>

        <div className="panel">
          <div className="panel-title">Details</div>
          <form onSubmit={handleSave}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-title">Title</label>
              <input
                id="p-title"
                required
                style={{ width: '100%' }}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-description">Description</label>
              <textarea
                id="p-description"
                rows={4}
                style={{
                  width: '100%',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '9px 12px',
                  color: 'var(--text)',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                }}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-address">Address</label>
              <input
                id="p-address"
                style={{ width: '100%' }}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-ticket">Ticket link (where guests actually buy tickets)</label>
              <input
                id="p-ticket"
                type="url"
                placeholder="https://"
                style={{ width: '100%' }}
                value={form.external_ticket_url}
                onChange={(e) => setForm({ ...form, external_ticket_url: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-slug">Public URL</label>
              <input
                id="p-slug"
                style={{ width: '100%' }}
                placeholder="auto-generated from title if left blank"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
              {profile && (
                <p className="mono" style={{ marginTop: 6, fontSize: 12 }}>
                  {window.location.origin}/e/{profile.slug}
                </p>
              )}
            </div>
            <button className="btn btn-secondary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-title">Banner photo</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              {profile.banner_photo_url && (
                <img
                  src={profile.banner_photo_url}
                  alt=""
                  style={{ width: '100%', maxWidth: 480, borderRadius: 10, marginBottom: 12, display: 'block' }}
                />
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhotoChange} disabled={uploading} />
              {uploading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</p>}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Visibility</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above before publishing.</p>
          ) : (
            <>
              <p style={{ fontSize: 13.5, marginBottom: 12 }}>
                {profile.is_published
                  ? 'Live — anyone with the link can see this page.'
                  : "Not published — the link won't work until you publish."}
              </p>
              <button
                className={profile.is_published ? 'btn btn-danger' : 'btn btn-primary'}
                style={profile.is_published ? {} : { width: 'auto' }}
                onClick={togglePublish}
                disabled={publishing}
              >
                {profile.is_published ? 'Unpublish' : 'Publish'}
              </button>
            </>
          )}
        </div>
      </>
    )
  }

  // ---------- Event list ----------
  return (
    <>
      <div className="page-title">Home</div>
      <p className="page-subtitle">Your organization's events.</p>

      {events.length === 0 ? (
        <div className="data-table">
          <div className="empty-state">
            No events yet — create one in Events360's org dashboard, then it'll show up here.
          </div>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => openEvent(ev)}>
                <td>{ev.name}</td>
                <td>
                  <span className={`pill pill-${ev.status === 'active' ? 'confirmed' : 'pending'}`}>
                    {ev.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEvent(ev)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}