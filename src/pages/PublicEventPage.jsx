import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { loadGoogleFont, SocialIcon, platformLabel } from '../socialAndFonts'

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

function formatSpecialDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDailyTime(value) {
  // value is "HH:MM" (24-hour, plain string, no timezone) — parsed and
  // reformatted purely for locale-aware 12-hour display, never converted
  // through a Date/UTC round-trip, since it's venue-local wall-clock time,
  // not a moment in UTC.
  const [hours, minutes] = value.split(':')
  const d = new Date()
  d.setHours(Number(hours), Number(minutes))
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

const OVERLAY_LOGO_POSITIONS = ['top-left', 'top-center', 'top-right']

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

  // Load the chosen display font once the profile arrives. Memoized inside
  // loadGoogleFont, so re-renders are harmless. No font_family = nothing
  // to load — the page already ships Fraunces, its original default.
  useEffect(() => {
    if (profile?.font_family) loadGoogleFont(profile.font_family)
  }, [profile])

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
  const dailySchedule = profile.daily_schedule || []
  const specialSchedule = profile.schedule || []

  // The chosen display font, applied inline to the title and section
  // headings only — body text stays in the site's body font. Null falls
  // through to var(--font-display) (Fraunces), the page's original look.
  const displayFont = profile.font_family
    ? { fontFamily: `'${profile.font_family}', var(--font-display)` }
    : undefined

  // Which part of the banner survives the 42vh crop. Null = center,
  // today's behavior.
  const bannerPosition =
    { top: 'center top', bottom: 'center bottom' }[profile.banner_focus] || 'center'

  // Logo placement. Overlay positions only make sense on top of a banner —
  // if a position is set but no banner exists, fall back to the default
  // in-flow centered logo rather than absolutely positioning into nothing.
  const hasBanner = Boolean(profile.banner_photo_url)
  const requestedLogoPosition = profile.logo_position || 'centered'
  let logoMode = 'centered'
  if (requestedLogoPosition === 'hidden') {
    logoMode = 'hidden'
  } else if (OVERLAY_LOGO_POSITIONS.includes(requestedLogoPosition) && hasBanner) {
    logoMode = requestedLogoPosition
  }

  return (
    <div className="public-event-page">
      {hasBanner && (
        <div
          className="public-event-hero"
          style={{
            backgroundImage: `url(${profile.banner_photo_url})`,
            backgroundPosition: bannerPosition,
          }}
        >
          {profile.logo_url && OVERLAY_LOGO_POSITIONS.includes(logoMode) && (
            <img
              src={profile.logo_url}
              alt=""
              className={`public-event-logo public-event-logo-overlay public-event-logo-${logoMode}`}
            />
          )}
        </div>
      )}

      {/* Social icon bar — its own strip below the banner, right-aligned to
          the content column. Deliberately NOT overlaid on the banner photo:
          icon contrast would be at the mercy of whatever image the
          organizer uploads. */}
      {socialLinks.length > 0 && (
        <div className="public-event-social-bar">
          {socialLinks.map((link, i) => (
            <a
              key={i}
              href={link.value}
              target="_blank"
              rel="noreferrer"
              title={link.label || platformLabel(link.value)}
              aria-label={link.label || platformLabel(link.value)}
            >
              <SocialIcon url={link.value} />
            </a>
          ))}
        </div>
      )}

      <div className="public-event-content">
        {profile.logo_url && logoMode === 'centered' && (
          <img src={profile.logo_url} alt="" className="public-event-logo" />
        )}

        <h1 className="public-event-title" style={displayFont}>
          {profile.title}
        </h1>
        {/* Dates are always their own thing on the page — the event's real
            date range, shown once, separate from any schedule detail. */}
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

        {profile.about_us && (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              About Us
            </h2>
            <p className="public-event-about">{profile.about_us}</p>
          </div>
        )}

        {dailySchedule.length > 0 && (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              Daily Schedule
            </h2>
            <ul className="public-event-schedule">
              {dailySchedule.map((item, i) => (
                <li key={i}>
                  <span className="public-event-schedule-time">{formatDailyTime(item.time_of_day)}</span>
                  <span className="public-event-schedule-label">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {specialSchedule.length > 0 && (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              Special Dates
            </h2>
            <ul className="public-event-schedule">
              {specialSchedule.map((item, i) => (
                <li key={i}>
                  <span className="public-event-schedule-time">{formatSpecialDateTime(item.event_datetime)}</span>
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

        {/* Contact emails keep their original spot and plain-text render —
            only socials moved up into the icon bar. */}
        {contactLinks.length > 0 && (
          <div className="public-event-section">
            <div className="public-event-contacts">
              {contactLinks.map((link, i) => (
                <a key={i} href={`mailto:${link.value}`}>
                  {link.label}: {link.value}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}