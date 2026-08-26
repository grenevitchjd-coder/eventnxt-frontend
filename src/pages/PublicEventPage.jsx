import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

function formatDateRange(start, end) {
  if (!start) return null
  const startDate = new Date(start)
  const startStr = startDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  if (!end) return startStr
  const endDate = new Date(end)
  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate()
  if (sameDay) return startStr
  const endStr = endDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

function formatScheduleTime(value) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PublicEventPage() {
  const { slug } = useParams()
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/public/events/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then(setProfile)
      .catch(() => setError(true))
  }, [slug])

  if (error) {
    return (
      <div className="public-event-page">
        <div className="public-event-notfound">
          <p className="login-eyebrow">EventNXT</p>
          <h1 className="login-title">This event isn't available</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            The link may be incorrect, or the event hasn't been published yet.
          </p>
        </div>
      </div>
    )
  }

  if (profile === undefined) return null

  const dateRange = formatDateRange(profile.cached_start_date, profile.cached_end_date)
  const contactLinks = (profile.links || []).filter((l) => l.kind === 'contact')
  const socialLinks = (profile.links || []).filter((l) => l.kind === 'social')

  return (
    <div className="public-event-page">
      {profile.banner_photo_url && (
        <div className="public-event-hero" style={{ backgroundImage: `url(${profile.banner_photo_url})` }} />
      )}
      <div className="public-event-content">
        {profile.logo_url && <img src={profile.logo_url} alt="" className="public-event-logo" />}

        <h1 className="public-event-title">{profile.title}</h1>
        {dateRange && <p className="public-event-dates">{dateRange}</p>}
        {profile.address && <p className="public-event-address">{profile.address}</p>}
        {profile.description && <p className="public-event-description">{profile.description}</p>}

        {profile.external_ticket_url && (
          <a
            className="btn btn-primary public-event-cta"
            href={profile.external_ticket_url}
            target="_blank"
            rel="noreferrer"
          >
            Get Tickets
          </a>
        )}

        {profile.schedule && profile.schedule.length > 0 && (
          <div className="public-event-section">
            <h2 className="public-event-section-title">Schedule</h2>
            <ul className="public-event-schedule">
              {profile.schedule.map((item, i) => (
                <li key={i}>
                  <span className="public-event-schedule-time">{formatScheduleTime(item.event_datetime)}</span>
                  <span className="public-event-schedule-label">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {profile.photos && profile.photos.length > 0 && (
          <div className="public-event-section">
            <div className="public-event-gallery">
              {profile.photos.map((photo, i) => (
                <img key={i} src={photo.url} alt="" />
              ))}
            </div>
          </div>
        )}

        {(contactLinks.length > 0 || socialLinks.length > 0) && (
          <div className="public-event-section">
            {contactLinks.length > 0 && (
              <div className="public-event-contacts">
                {contactLinks.map((link, i) => (
                  <a key={i} href={`mailto:${link.value}`}>
                    {link.label}: {link.value}
                  </a>
                ))}
              </div>
            )}
            {socialLinks.length > 0 && (
              <div className="public-event-socials">
                {socialLinks.map((link, i) => (
                  <a key={i} href={link.value} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}