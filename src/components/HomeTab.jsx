import { useEffect, useState } from 'react'
import { api, getNewEventUrl } from '../api'
import { FONT_OPTIONS, loadGoogleFont, platformLabel, SocialIcon } from '../socialAndFonts'

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

function formatTimeOfDay(value) {
  // value is "HH:MM:SS" from the backend — build a throwaway Date just to
  // reuse locale-aware time formatting.
  const [hours, minutes] = value.split(':')
  const d = new Date()
  d.setHours(Number(hours), Number(minutes))
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function HomeTab({ onToast }) {
  const [events, setEvents] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [profile, setProfile] = useState(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    address: '',
    external_ticket_url: '',
    slug: '',
    font_family: '',
    about_us: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const [links, setLinks] = useState([])
  // Contacts and socials are two genuinely different things — separate
  // forms, no shared kind-dropdown to mis-file an Instagram URL as an email.
  const [contactForm, setContactForm] = useState({ label: '', value: '' })
  const [addingContact, setAddingContact] = useState(false)
  const [socialForm, setSocialForm] = useState({ label: '', value: '' })
  const [addingSocial, setAddingSocial] = useState(false)

  const [schedule, setSchedule] = useState([])
  const [scheduleForm, setScheduleForm] = useState({ label: '', is_recurring: false, event_datetime: '', time_of_day: '' })
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
          font_family: p?.font_family || '',
          about_us: p?.about_us || '',
        })
        if (p?.font_family) loadGoogleFont(p.font_family)
        if (p) loadProfileExtras(event.id)
      })
      .catch((e) => onToast(e.message, true))
  }

  const backToList = () => {
    setSelectedEvent(null)
    setProfile(null)
  }

  // Always send every field together — the backend does a full replace,
  // not a partial patch, so omitting a field would wipe it. That includes
  // logo_position / banner_focus, which live on the saved profile (they
  // have their own immediate-save dropdowns) rather than in the form —
  // the main Save must carry them along or it would reset them.
  const buildFullPayload = (overrides = {}) => ({
    title: form.title,
    description: form.description || null,
    address: form.address || null,
    external_ticket_url: form.external_ticket_url || null,
    slug: form.slug || null,
    font_family: form.font_family || null,
    about_us: form.about_us || null,
    logo_position: profile?.logo_position || null,
    banner_focus: profile?.banner_focus || null,
    ...overrides,
  })

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const saved = await api.saveEventProfile(selectedEvent.id, buildFullPayload())
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

  // Logo position and banner focus save immediately on change (they only
  // appear once the relevant image is uploaded, i.e. once a profile
  // definitely exists — no draft state to worry about).
  const handleLogoPositionChange = async (e) => {
    const value = e.target.value
    try {
      const saved = await api.saveEventProfile(
        selectedEvent.id,
        buildFullPayload({ logo_position: value || null })
      )
      setProfile(saved)
      onToast('Logo position saved')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const handleBannerFocusChange = async (e) => {
    const value = e.target.value
    try {
      const saved = await api.saveEventProfile(
        selectedEvent.id,
        buildFullPayload({ banner_focus: value || null })
      )
      setProfile(saved)
      onToast('Banner focus saved')
    } catch (err) {
      onToast(err.message, true)
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

  const handleAddContact = async (e) => {
    e.preventDefault()
    setAddingContact(true)
    try {
      const created = await api.createProfileLink(selectedEvent.id, { kind: 'contact', ...contactForm })
      setLinks([...links, created])
      setContactForm({ label: '', value: '' })
      onToast(`"${created.label}" added`)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setAddingContact(false)
    }
  }

  const handleAddSocial = async (e) => {
    e.preventDefault()
    setAddingSocial(true)
    try {
      const created = await api.createProfileLink(selectedEvent.id, { kind: 'social', ...socialForm })
      setLinks([...links, created])
      setSocialForm({ label: '', value: '' })
      onToast(`"${created.label}" added`)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setAddingSocial(false)
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
    if (scheduleForm.is_recurring && !scheduleForm.time_of_day) {
      onToast('Pick a time for this daily item.', true)
      return
    }
    if (!scheduleForm.is_recurring && !scheduleForm.event_datetime) {
      onToast('Pick a date and time for this schedule item.', true)
      return
    }
    setAddingScheduleItem(true)
    try {
      const created = await api.createScheduleItem(selectedEvent.id, {
        label: scheduleForm.label,
        is_recurring: scheduleForm.is_recurring,
        event_datetime: scheduleForm.is_recurring
          ? null
          : new Date(scheduleForm.event_datetime).toISOString(),
        time_of_day: scheduleForm.is_recurring ? `${scheduleForm.time_of_day}:00` : null,
        sort_order: schedule.length,
      })
      setSchedule([...schedule, created])
      setScheduleForm({ label: '', is_recurring: scheduleForm.is_recurring, event_datetime: '', time_of_day: '' })
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
            <form id="details-form" onSubmit={handleSave}>
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
                  {window.location.origin}/e/{profile.slug}{' '}
                  <a
                    href={`/e/${profile.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-dark)', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    Preview ↗
                  </a>
                </p>
              )}
              {profile && !profile.is_published && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Note: the page shows "not available" until you publish — unpublished pages are hidden
                  from everyone, on purpose. Publish, preview, and unpublish if it's not ready.
                </p>
              )}
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-font">Display font (title &amp; section headings)</label>
              <select
                id="p-font"
                style={{ ...inputStyle, width: '100%' }}
                value={form.font_family}
                onChange={(e) => {
                  const family = e.target.value
                  if (family) loadGoogleFont(family)
                  setForm({ ...form, font_family: family })
                }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.family} value={f.family === 'Fraunces' ? '' : f.family}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p
                style={{
                  fontFamily: `'${form.font_family || 'Fraunces'}', serif`,
                  fontSize: 24,
                  fontWeight: 700,
                  margin: '10px 0 0',
                }}
              >
                {form.title || 'Sample Event Title'}
              </p>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="p-about">About Us (optional — its own section near the bottom of the page)</label>
              <textarea
                id="p-about"
                rows={4}
                style={{ ...inputStyle, width: '100%' }}
                placeholder="Who you are, your story, what guests can expect…"
                value={form.about_us}
                onChange={(e) => setForm({ ...form, about_us: e.target.value })}
              />
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
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Suggested: roughly square, ~400×400px, PNG with a transparent background. It displays
                small (56px tall), so a clean simple mark beats a detailed one.
              </p>
              {uploadingLogo && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</p>}
              {profile.logo_url && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="p-logo-position">Placement on the public page (saves immediately)</label>
                  <select
                    id="p-logo-position"
                    style={inputStyle}
                    value={profile.logo_position || ''}
                    onChange={handleLogoPositionChange}
                  >
                    <option value="">Centered above the title (default)</option>
                    <option value="top-left">Top-left, on the banner</option>
                    <option value="top-center">Top-center, on the banner</option>
                    <option value="top-right">Top-right, on the banner</option>
                    <option value="hidden">Hidden — don't show the logo</option>
                  </select>
                  {['top-left', 'top-center', 'top-right'].includes(profile.logo_position) &&
                    !profile.banner_photo_url && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                        No banner photo yet — until one is uploaded, the logo will show centered instead.
                      </p>
                    )}
                </div>
              )}
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
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Suggested: wide landscape, ~1600×675px. It displays as a full-width strip and gets
                cropped top/bottom to fit — keep faces and key details away from the very edges.
              </p>
              {uploadingBanner && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</p>}
              {profile.banner_photo_url && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="p-banner-focus">
                    Crop focus — which part of the photo to keep visible (saves immediately)
                  </label>
                  <select
                    id="p-banner-focus"
                    style={inputStyle}
                    value={profile.banner_focus || ''}
                    onChange={handleBannerFocusChange}
                  >
                    <option value="">Center (default)</option>
                    <option value="top">Top of the photo</option>
                    <option value="bottom">Bottom of the photo</option>
                  </select>
                </div>
              )}
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
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    Suggested: at least ~800×800px. These display as uniform square-ish tiles, cropped to
                    the center.
                  </p>
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
          <div className="panel-title">Contact emails</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              {links.filter((l) => l.kind === 'contact').length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {links
                    .filter((l) => l.kind === 'contact')
                    .map((link) => (
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
                          <strong>{link.label}</strong> — {link.value}
                        </span>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLink(link)}>
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              )}
              <form className="inline-form" onSubmit={handleAddContact}>
                <div className="field">
                  <label htmlFor="contact-label">Label</label>
                  <input
                    id="contact-label"
                    required
                    placeholder="Sponsorships"
                    value={contactForm.label}
                    onChange={(e) => setContactForm({ ...contactForm, label: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="contact-value">Email</label>
                  <input
                    id="contact-value"
                    type="email"
                    required
                    style={{ width: '100%' }}
                    placeholder="sponsors@example.com"
                    value={contactForm.value}
                    onChange={(e) => setContactForm({ ...contactForm, value: e.target.value })}
                  />
                </div>
                <button className="btn btn-secondary" type="submit" disabled={addingContact}>
                  Add
                </button>
              </form>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Social links</div>
          {!profile ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Save the details above first.</p>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
                These show as icon buttons at the top of the public page — the platform is detected
                automatically from the URL.
              </p>
              {links.filter((l) => l.kind === 'social').length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {links
                    .filter((l) => l.kind === 'social')
                    .map((link) => (
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <SocialIcon url={link.value} size={16} />
                          <strong>{link.label}</strong> — {link.value}
                        </span>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLink(link)}>
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              )}
              <form className="inline-form" onSubmit={handleAddSocial}>
                <div className="field">
                  <label htmlFor="social-label">Label</label>
                  <input
                    id="social-label"
                    required
                    placeholder="Instagram"
                    value={socialForm.label}
                    onChange={(e) => setSocialForm({ ...socialForm, label: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="social-value">URL</label>
                  <input
                    id="social-value"
                    type="url"
                    required
                    style={{ width: '100%' }}
                    placeholder="https://instagram.com/yourevent"
                    value={socialForm.value}
                    onChange={(e) => setSocialForm({ ...socialForm, value: e.target.value })}
                  />
                </div>
                <button className="btn btn-secondary" type="submit" disabled={addingSocial}>
                  Add
                </button>
              </form>
              {socialForm.value && (
                <p
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12.5,
                    color: 'var(--text-muted)',
                    marginTop: 10,
                  }}
                >
                  <SocialIcon url={socialForm.value} size={16} />
                  Detected: {platformLabel(socialForm.value)}
                </p>
              )}
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
                        <strong>{item.label}</strong> —{' '}
                        {item.is_recurring
                          ? `Every day at ${formatTimeOfDay(item.time_of_day)}`
                          : formatDateTime(item.event_datetime)}
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
                  <label htmlFor="sched-mode">When</label>
                  <select
                    id="sched-mode"
                    style={inputStyle}
                    value={scheduleForm.is_recurring ? 'daily' : 'once'}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, is_recurring: e.target.value === 'daily' })}
                  >
                    <option value="once">One specific date</option>
                    <option value="daily">Every day of the event</option>
                  </select>
                </div>
                {scheduleForm.is_recurring ? (
                  <div className="field">
                    <label htmlFor="sched-time-of-day">Time</label>
                    <input
                      id="sched-time-of-day"
                      type="time"
                      required
                      value={scheduleForm.time_of_day}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, time_of_day: e.target.value })}
                    />
                  </div>
                ) : (
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
                )}
                <button className="btn btn-secondary" type="submit" disabled={addingScheduleItem}>
                  Add
                </button>
              </form>
              {scheduleForm.is_recurring && (
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
                  This will apply automatically to every day of the event — no need to re-enter it per night.
                </p>
              )}
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

        <button className="btn btn-secondary" type="submit" form="details-form" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
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