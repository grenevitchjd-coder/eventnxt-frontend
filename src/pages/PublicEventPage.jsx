import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadGoogleFont, SocialIcon, platformLabel } from '../socialAndFonts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

function money(cents, currency) {
  const amount = (cents / 100).toFixed(2)
  return currency?.toLowerCase() === 'usd' ? `$${amount}` : `${amount} ${currency?.toUpperCase()}`
}

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
  const navigate = useNavigate()
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = not found
  const [error, setError] = useState(false)

  // Native ticket sales. null = still loading; [] = event sells nothing
  // natively (external ticket link keeps doing its job, exactly as before).
  const [ticketTypes, setTicketTypes] = useState(null)
  const [quantities, setQuantities] = useState({})
  const [buyer, setBuyer] = useState({ name: '', email: '' })
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)

  useEffect(() => {
    fetch(`${API_URL}/public/events/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then(setProfile)
      .catch(() => setError(true))

    fetch(`${API_URL}/public/events/${slug}/ticket-types`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setTicketTypes)
      .catch(() => setTicketTypes([]))
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

  const hasNativeTickets = Array.isArray(ticketTypes) && ticketTypes.length > 0
  const totalQty = Object.values(quantities).reduce((a, b) => a + b, 0)
  const totalCents = hasNativeTickets
    ? ticketTypes.reduce((sum, t) => sum + (quantities[t.id] || 0) * t.price_cents, 0)
    : 0

  const setQty = (t, next) => {
    const cap = Math.min(t.max_per_order, t.available)
    const clamped = Math.max(0, Math.min(cap, next))
    setQuantities({ ...quantities, [t.id]: clamped })
    setCheckoutError(null)
  }

  const handleCheckout = async (e) => {
    e.preventDefault()
    setCheckingOut(true)
    setCheckoutError(null)
    try {
      const res = await fetch(`${API_URL}/public/events/${slug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_name: buyer.name,
          buyer_email: buyer.email,
          items: ticketTypes
            .filter((t) => (quantities[t.id] || 0) > 0)
            .map((t) => ({ ticket_type_id: t.id, quantity: quantities[t.id] })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Checkout failed — please try again.')
      if (data.checkout_url) {
        // Paid order: off to Stripe. The webhook does the real work; the
        // buyer comes back to the order page via the success redirect.
        window.location.href = data.checkout_url
      } else {
        // $0 order: already paid, tickets already minted — straight there.
        navigate(`/e/${slug}/order/${data.order_token}`)
      }
    } catch (err) {
      setCheckoutError(err.message)
      setCheckingOut(false)
    }
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

        {/* Native ticket sales, when this event has them — otherwise the
            external ticket link keeps working exactly as it always has.
            An event with NO ticket types and NO external link simply shows
            no ticket UI at all, same as before. */}
        {hasNativeTickets ? (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              Tickets
            </h2>
            <div className="ticket-picker">
              {ticketTypes.map((t) => {
                const qty = quantities[t.id] || 0
                const cap = Math.min(t.max_per_order, t.available)
                return (
                  <div key={t.id} className="ticket-picker-row">
                    <div className="ticket-picker-info">
                      <div className="ticket-picker-name">{t.name}</div>
                      {t.description && <div className="ticket-picker-desc">{t.description}</div>}
                      <div className="ticket-picker-price">
                        {t.price_cents === 0 ? 'Free' : money(t.price_cents, t.currency)}
                        {t.on_sale && t.available > 0 && t.available <= 5 && (
                          <span className="ticket-picker-scarcity"> · only {t.available} left</span>
                        )}
                      </div>
                    </div>
                    {t.on_sale ? (
                      <div className="ticket-qty-stepper">
                        <button type="button" onClick={() => setQty(t, qty - 1)} disabled={qty === 0} aria-label="fewer">
                          −
                        </button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => setQty(t, qty + 1)} disabled={qty >= cap} aria-label="more">
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="ticket-picker-offsale">{t.available === 0 ? 'Sold out' : 'Not on sale'}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {totalQty > 0 && (
              <form className="ticket-buyer-form" onSubmit={handleCheckout}>
                <input
                  required
                  placeholder="Your name"
                  value={buyer.name}
                  onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                />
                <input
                  required
                  type="email"
                  placeholder="you@example.com"
                  value={buyer.email}
                  onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                />
                {checkoutError && <p className="ticket-checkout-error">{checkoutError}</p>}
                <button className="btn btn-primary public-event-cta" type="submit" disabled={checkingOut}>
                  {checkingOut
                    ? 'One moment…'
                    : totalCents === 0
                      ? `Get ${totalQty} free ticket${totalQty > 1 ? 's' : ''}`
                      : `Continue to payment — ${money(totalCents, ticketTypes[0].currency)}`}
                </button>
                <p className="ticket-buyer-note">
                  Your tickets will be emailed to you{totalCents > 0 ? ' after payment' : ''}.
                </p>
              </form>
            )}
          </div>
        ) : (
          profile.external_ticket_url && (
            <a
              className="btn btn-primary public-event-cta"
              href={profile.external_ticket_url}
              target="_blank"
              rel="noreferrer"
            >
              Get Tickets
            </a>
          )
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