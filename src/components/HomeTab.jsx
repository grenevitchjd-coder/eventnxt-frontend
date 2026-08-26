import { useEffect, useState } from 'react'
import { api, getNewEventUrl } from '../api'

const MAX_GALLERY_PHOTOS = 3

function formatDateRange(start, end) {
  if (!start) return null
  const startStr = new Date(start).toLocaleDateString()
  if (!end) return startStr
  const endStr = new Date(end).toLocaleDateString()
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function HomeTab({ onToast }) {
  const [events, setEvents] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [profile, setProfile] = useState(null)

  const [form, setForm] = useState({ title: '', description: '', address: '', external_ticket_url: '', slug: '' })
  const [saving, setSaving] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const [links, setLinks] = useState([])
  const [linkForm, setLinkForm] = useState({ kind: 'contact', label: '', value: '' })
  const [addingLink, setAddingLink] = useState(false)

  const [schedule, setSchedule] = useState([])
  const [scheduleForm, setScheduleForm] = useState({ label: '', event_datetime: '' })
  const [addingScheduleItem, setAddingScheduleItem] = useState(false)

  const [gallery, setGallery] = useState([])
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false)

  useEffect(() => {
    api
      .listEvents()
      .then(setEvents)
      .catch((e) => onToast(e.message, true))
  }, [])

  const loadProfileExtras = (eventId) => {
    Promise.all([api.listProfileLinks(eventId), api.listScheduleItems(eventId), api.listGalleryPhotos(eventId)])
      .then(([l, s, g]) => {
        setLinks(l)
        setSchedule(s)
        setGallery(g)
      })
      .catch((e) => onToast(e.message, true))
  }

  const openEvent = (event) => {
    setSelectedEvent(event)
    setProfile(null)
    setLinks([])
    setSchedule([])
    setGallery([])
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
        if (p) loadProfileExtras(event.id)
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
      const isFirstSave = !profile
      setProfile(saved)
      setForm({ ...form, slug: saved.slug })
      onToast('Saved')
      if (isFirstSave) loadProfileExtras(selectedEvent.id)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const handleBannerChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBanner(true)
    try {
      const updated = await api.uploadBannerPhoto(selectedEvent.id, file)
      setProfile(updated)
      onToast('Banner photo uploaded')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setUploadingBanner(false)
    }
  }

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const updated = await api.uploadLogo(selectedEvent.id, file)
      setProfile(updated)
      onToast('Logo uploaded')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setUploadingLogo(false)
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

  const handleAddLink = async (e) => {
    e.preventDefault()
    setAddingLink(true)
    try {
      const created = await api.createProfileLink(selectedEvent.id, linkForm)
      setLinks([...links, created])
      setLinkForm({ kind: linkForm.kind, label: '', value: '' })
      onToast(`"${created.label}" added`)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setAddingLink(false)
    }
  }

  const handleDeleteLink = async (link) => {
    try {
      await api.deleteProfileLink(selectedEvent.id, link.id)
      setLinks(links.filter((l) => l.id !== link.id))
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const handleAddScheduleItem = async (e) => {
    e.preventDefault()
    if (!scheduleForm.event_datetime) {
      onToast('Pick a date and time for this schedule item.', true)
      return
    }
    setAddingScheduleItem(true)
    try {
      const created = await api.createScheduleItem(selectedEvent.id, {
        label: scheduleForm.label,
        event_datetime: new Date(scheduleForm.event_datetime).toISOString(),
        sort_order: schedule.length,
      })
      const next = [...schedule, created].sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime))
      setSchedule(next)
      setScheduleForm({ label: '', event_datetime: '' })
      onToast(`"${created.label}" added`)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setAddingScheduleItem(false)
    }
  }

  const handleDeleteScheduleItem = async (item) => {
    try {
      await api.deleteScheduleItem(selectedEvent.id, item.id)
      setSchedule(schedule.filter((s) => s.id !== item.id))
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const handleGalleryPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingGalleryPhoto(true)
    try {
      const created = await api.uploadGalleryPhoto(selectedEvent.id, file)
      setGallery([...gallery, created])
      onToast('Photo added')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setUploadingGalleryPhoto(false)
      e.target.value = ''
    }
  }

  const handleDeleteGalleryPhoto = async (photo) => {
    try {
      await api.deleteGalleryPhoto(selectedEvent.id, photo.id)
      setGallery(gallery.filter((p) => p.id !== photo.id))
    } catch (err) {
      onToast(err.message, true)
    }
  }

  if (events === null) return null

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
    color: 'var(--text)',
    fontSize: 13.5,
    fontFamily: 'inherit',
  }

  // ---------- Event detail / profile editor ----------
  if (selectedEvent) {
    const dateRange = formatDateRange(profile?.cached_start_date, profile?.cached_end_date)

    return (
      <>
        <button className="nav-item" style={{ marginBottom: 16, padding: '6px 0' }} onClick={backToList}>
          ← Back to events
        </button>
        <div className="page-title">{selectedEvent.name}</div>
        {dateRange && (
          <p className="mono" style={{ marginTop: -14, marginBottom: 8, fontSize: 13 }}>
            {dateRange}
          </p>
        )}
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
                style={{ ...inputStyle, width: '100%' }}
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
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -6, marginBottom: 14 }}>
              Dates ({dateRange || 'not set yet'}) come from Events360 automatically — to change them, update
              the event over there.
            </p>
            <button className="btn btn-secondary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-title">Logo</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              {profile.logo_url && (
                <img
                  src={profile.logo_url}
                  alt=""
                  style={{ height: 64, borderRadius: 8, marginBottom: 12, display: 'block' }}
                />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleLogoChange}
                disabled={uploadingLogo}
              />
              {uploadingLogo && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</p>}
            </>
          )}
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
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleBannerChange}
                disabled={uploadingBanner}
              />
              {uploadingBanner && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</p>}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            Extra photos ({gallery.length}/{MAX_GALLERY_PHOTOS})
          </div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              {gallery.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  {gallery.map((photo) => (
                    <div key={photo.id} style={{ position: 'relative' }}>
                      <img
                        src={photo.url}
                        alt=""
                        style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                      />
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ marginTop: 6, width: '100%' }}
                        onClick={() => handleDeleteGalleryPhoto(photo)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {gallery.length < MAX_GALLERY_PHOTOS ? (
                <>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleGalleryPhotoChange}
                    disabled={uploadingGalleryPhoto}
                  />
                  {uploadingGalleryPhoto && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</p>}
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Maximum of {MAX_GALLERY_PHOTOS} extra photos reached — remove one to add another.
                </p>
              )}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Contacts &amp; socials</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              {links.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {links.map((link) => (
                    <div
                      key={link.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 13.5,
                      }}
                    >
                      <span>
                        <strong>{link.label}</strong> ({link.kind}) — {link.value}
                      </span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLink(link)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form className="inline-form" onSubmit={handleAddLink}>
                <div className="field">
                  <label htmlFor="link-kind">Type</label>
                  <select
                    id="link-kind"
                    style={inputStyle}
                    value={linkForm.kind}
                    onChange={(e) => setLinkForm({ ...linkForm, kind: e.target.value })}
                  >
                    <option value="contact">Contact email</option>
                    <option value="social">Social link</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="link-label">Label</label>
                  <input
                    id="link-label"
                    required
                    placeholder={linkForm.kind === 'contact' ? 'Sponsorships' : 'Instagram'}
                    value={linkForm.label}
                    onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="link-value">{linkForm.kind === 'contact' ? 'Email' : 'URL'}</label>
                  <input
                    id="link-value"
                    type={linkForm.kind === 'contact' ? 'email' : 'url'}
                    required
                    style={{ width: '100%' }}
                    placeholder={linkForm.kind === 'contact' ? 'sponsors@example.com' : 'https://'}
                    value={linkForm.value}
                    onChange={(e) => setLinkForm({ ...linkForm, value: e.target.value })}
                  />
                </div>
                <button className="btn btn-secondary" type="submit" disabled={addingLink}>
                  Add
                </button>
              </form>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Schedule (optional)</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              {schedule.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {schedule.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 13.5,
                      }}
                    >
                      <span>
                        <strong>{item.label}</strong> — {formatDateTime(item.event_datetime)}
                      </span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteScheduleItem(item)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form className="inline-form" onSubmit={handleAddScheduleItem}>
                <div className="field">
                  <label htmlFor="sched-label">Label</label>
                  <input
                    id="sched-label"
                    required
                    placeholder="Doors Open"
                    value={scheduleForm.label}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, label: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sched-time">Date &amp; time</label>
                  <input
                    id="sched-time"
                    type="datetime-local"
                    required
                    value={scheduleForm.event_datetime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, event_datetime: e.target.value })}
                  />
                </div>
                <button className="btn btn-secondary" type="submit" disabled={addingScheduleItem}>
                  Add
                </button>
              </form>
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Home</div>
          <p className="page-subtitle">Your organization's events.</p>
        </div>
        <a className="btn btn-primary" style={{ width: 'auto' }} href={getNewEventUrl()}>
          + New Event
        </a>
      </div>

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