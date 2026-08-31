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
  // Assigned seating: seat maps by ticket type, the buyer's picked seat
  // ids, and the in-progress dropdown pair (section index + seat id).
  const [seatMaps, setSeatMaps] = useState({})
  const [seatPicks, setSeatPicks] = useState({})
  const [pickDraft, setPickDraft] = useState({})
  const [buyer, setBuyer] = useState({ name: '', email: '', promo: '' })
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  // null = nothing checked; {valid, discount_type, discount_value} once checked
  const [promoInfo, setPromoInfo] = useState(null)
  // Find-my-tickets mini-form: closed | open | sending | sent
  const [findState, setFindState] = useState('closed')
  const [findEmail, setFindEmail] = useState('')

  // Tracked influencer links: /e/<slug>?ref=CODE. Remember the code per
  // event (so it survives the buyer leaving and returning), pre-fill it
  // at checkout, and ping the click counter once per landing. A code the
  // buyer TYPES over this always wins — the deliberate action beats the
  // remembered link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = (params.get('ref') || '').trim()
    if (ref) {
      localStorage.setItem(`eventnxt-ref-${slug}`, ref)
      fetch(`${API_URL}/public/events/${slug}/promo-codes/${encodeURIComponent(ref)}/click`, { method: 'POST' }).catch(() => {})
    }
    const remembered = ref || localStorage.getItem(`eventnxt-ref-${slug}`) || ''
    if (remembered) setBuyer((b) => (b.promo ? b : { ...b, promo: remembered }))
  }, [slug])

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
      .then((tts) => {
        setTicketTypes(tts)
        // Inline (not via the loadSeatMap helper): this closure outlives
        // the first render, which early-returns before the helper consts
        // initialize — calling the helper from here is a TDZ crash.
        tts
          .filter((t) => t.assigned_seating)
          .forEach((t) => {
            fetch(`${API_URL}/public/events/${slug}/ticket-types/${t.id}/seats`)
              .then((r) => (r.ok ? r.json() : null))
              .then((m) => m && setSeatMaps((prev) => ({ ...prev, [t.id]: m })))
              .catch(() => {})
          })
      })
      .catch(() => setTicketTypes([]))
  }, [slug])

  // Load the chosen display font once the profile arrives. Memoized inside
  // loadGoogleFont, so re-renders are harmless. No font_family = nothing
  // to load — the page already ships Fraunces, its original default.
  useEffect(() => {
    if (profile?.font_family) loadGoogleFont(profile.font_family)
  }, [profile])

  // Debounced live check of the typed code — display only; the backend
  // re-validates authoritatively at checkout either way.
  useEffect(() => {
    const code = buyer.promo.trim()
    if (!code) {
      setPromoInfo(null)
      return
    }
    const t = setTimeout(() => {
      fetch(`${API_URL}/public/events/${slug}/promo-codes/${encodeURIComponent(code)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setPromoInfo)
        .catch(() => setPromoInfo(null))
    }, 500)
    return () => clearTimeout(t)
  }, [buyer.promo, slug])


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
  const loadSeatMap = (ttId) => {
    fetch(`${API_URL}/public/events/${slug}/ticket-types/${ttId}/seats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((map) => map && setSeatMaps((m) => ({ ...m, [ttId]: map })))
      .catch(() => {})
  }

  const refreshSeatMaps = () => {
    ;(ticketTypes || []).filter((t) => t.assigned_seating).forEach((t) => loadSeatMap(t.id))
  }

  const seatById = (ttId, seatId) => {
    const map = seatMaps[ttId]
    if (!map) return null
    for (const sec of map.sections) {
      const hit = sec.seats.find((x) => x.id === seatId)
      if (hit) return { ...hit, section_label: sec.section_label, row_label: sec.row_label }
    }
    return null
  }

  const seatChipLabel = (ttId, seatId) => {
    const seat = seatById(ttId, seatId)
    if (!seat) return 'Seat'
    return `${seat.section_label}${seat.row_label ? ` · ${seat.row_label}` : ''} · #${seat.seat_number}`
  }

  const addSeatPick = (t) => {
    const draft = pickDraft[t.id] || {}
    if (!draft.seat) return
    const current = seatPicks[t.id] || []
    if (current.includes(draft.seat) || current.length >= Math.min(t.max_per_order, t.available)) return
    setSeatPicks({ ...seatPicks, [t.id]: [...current, draft.seat] })
    setPickDraft({ ...pickDraft, [t.id]: { ...draft, seat: '' } })
  }

  const removeSeatPick = (ttId, seatId) => {
    setSeatPicks({ ...seatPicks, [ttId]: (seatPicks[ttId] || []).filter((x) => x !== seatId) })
  }

  const qtyFor = (t) => (t.assigned_seating ? (seatPicks[t.id] || []).length : quantities[t.id] || 0)

  const totalQty = (ticketTypes || []).reduce((a, t) => a + qtyFor(t), 0)
  const totalCents = hasNativeTickets
    ? ticketTypes.reduce((sum, t) => sum + qtyFor(t) * t.price_cents, 0)
    : 0
  const discountCents = (() => {
    if (!promoInfo?.valid || !promoInfo.discount_type || totalCents === 0) return 0
    const raw =
      promoInfo.discount_type === 'percentage'
        ? Math.round((totalCents * promoInfo.discount_value) / 100)
        : Math.round(promoInfo.discount_value * 100)
    return Math.max(0, Math.min(totalCents, raw))
  })()
  const dueCents = totalCents - discountCents

  const setQty = (t, next) => {
    const cap = Math.min(t.max_per_order, t.available)
    const clamped = Math.max(0, Math.min(cap, next))
    setQuantities({ ...quantities, [t.id]: clamped })
    setCheckoutError(null)
  }

  const handleFindTickets = async (e) => {
    e.preventDefault()
    setFindState('sending')
    try {
      await fetch(`${API_URL}/public/events/${slug}/find-my-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: findEmail }),
      })
    } catch {
      // deliberately identical outcome — the message below stays honest either way
    }
    setFindState('sent')
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
            .filter((t) => qtyFor(t) > 0)
            .map((t) =>
              t.assigned_seating
                ? { ticket_type_id: t.id, quantity: qtyFor(t), seat_ids: seatPicks[t.id] }
                : { ticket_type_id: t.id, quantity: quantities[t.id] }
            ),
          promo_code: buyer.promo.trim() || null,
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
      refreshSeatMaps()
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
                      {(t.admits || 1) > 1 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          admits {t.admits} people each
                        </div>
                      )}
                      {t.description && <div className="ticket-picker-desc">{t.description}</div>}
                      <div className="ticket-picker-price">
                        {t.price_cents === 0 ? 'Free' : money(t.price_cents, t.currency)}
                        {t.on_sale && t.available > 0 && t.available <= 5 && (
                          <span className="ticket-picker-scarcity"> · only {t.available} left</span>
                        )}
                      </div>
                    </div>
                    {t.on_sale && t.assigned_seating ? (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        {qtyFor(t) > 0 ? `${qtyFor(t)} seat${qtyFor(t) === 1 ? '' : 's'} picked` : 'Pick your seats below'}
                      </span>
                    ) : t.on_sale ? (
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
                    {t.on_sale && t.assigned_seating && (
                      <div style={{ flexBasis: '100%', marginTop: 10 }}>
                        {!seatMaps[t.id] ? (
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seats…</span>
                        ) : (
                          <>
                            {/* Section + seat dropdowns */}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <select
                                value={(pickDraft[t.id] || {}).section ?? ''}
                                onChange={(e) =>
                                  setPickDraft({ ...pickDraft, [t.id]: { section: e.target.value, seat: '' } })
                                }
                                aria-label="Section"
                              >
                                <option value="">Section…</option>
                                {seatMaps[t.id].sections.map((sec, i) => (
                                  <option key={i} value={String(i)}>
                                    {sec.section_label}
                                    {sec.row_label ? ` · ${sec.row_label}` : ''}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={(pickDraft[t.id] || {}).seat || ''}
                                onChange={(e) => setPickDraft({ ...pickDraft, [t.id]: { ...(pickDraft[t.id] || {}), seat: e.target.value } })}
                                disabled={(pickDraft[t.id] || {}).section === undefined || (pickDraft[t.id] || {}).section === ''}
                                aria-label="Seat"
                              >
                                <option value="">Seat…</option>
                                {((seatMaps[t.id].sections[Number((pickDraft[t.id] || {}).section)] || {}).seats || [])
                                  .filter((x) => x.available && !(seatPicks[t.id] || []).includes(x.id))
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      Seat {x.seat_number}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => addSeatPick(t)}
                                disabled={!(pickDraft[t.id] || {}).seat || qtyFor(t) >= Math.min(t.max_per_order, t.available)}
                              >
                                Add seat
                              </button>
                            </div>
                            {/* Picked chips */}
                            {(seatPicks[t.id] || []).length > 0 && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                {(seatPicks[t.id] || []).map((sid) => (
                                  <span
                                    key={sid}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                                      border: '1px solid var(--border, #ccc)', borderRadius: 999, padding: '3px 10px',
                                    }}
                                  >
                                    {seatChipLabel(t.id, sid)}
                                    <button
                                      type="button"
                                      onClick={() => removeSeatPick(t.id, sid)}
                                      aria-label="remove seat"
                                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Schematic map — visual reference */}
                            <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                              {seatMaps[t.id].sections.map((sec, i) => (
                                <div key={i}>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {sec.section_label}
                                    {sec.row_label ? ` · ${sec.row_label}` : ''}
                                  </div>
                                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 220 }}>
                                    {sec.seats.map((x) => {
                                      const picked = (seatPicks[t.id] || []).includes(x.id)
                                      return (
                                        <span
                                          key={x.id}
                                          title={`Seat ${x.seat_number}${x.available ? '' : ' — taken'}`}
                                          style={{
                                            width: 13, height: 13, borderRadius: 3,
                                            background: picked ? '#534AB7' : x.available ? '#9BD4C3' : '#D8D6D0',
                                          }}
                                        />
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                              green = open · gray = taken · purple = yours
                            </div>
                          </>
                        )}
                      </div>
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
                <input
                  placeholder="Referral code (optional)"
                  value={buyer.promo}
                  onChange={(e) => setBuyer({ ...buyer, promo: e.target.value })}
                />
                {buyer.promo.trim() && promoInfo && (
                  <p className={promoInfo.valid ? 'ticket-promo-ok' : 'ticket-promo-bad'}>
                    {!promoInfo.valid
                      ? "This code isn't recognized for this event."
                      : discountCents > 0
                        ? `Code applied — you save ${money(discountCents, ticketTypes[0].currency)}.`
                        : 'Referral code applied.'}
                  </p>
                )}
                {checkoutError && <p className="ticket-checkout-error">{checkoutError}</p>}
                <button className="btn btn-primary public-event-cta" type="submit" disabled={checkingOut}>
                  {checkingOut
                    ? 'One moment…'
                    : dueCents === 0
                      ? `Get ${totalQty} free ticket${totalQty > 1 ? 's' : ''}`
                      : `Continue to payment — ${money(dueCents, ticketTypes[0].currency)}`}
                </button>
                <p className="ticket-buyer-note">
                  Your tickets will be emailed to you{dueCents > 0 ? ' after payment' : ''}.
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

        {/* Self-serve recovery — send-to-the-inbox, never display-for-a-typed-email. */}
        <div className="find-tickets">
          {findState === 'closed' && (
            <button type="button" className="find-tickets-link" onClick={() => setFindState('open')}>
              Already bought tickets? Find my tickets
            </button>
          )}
          {(findState === 'open' || findState === 'sending') && (
            <form className="find-tickets-form" onSubmit={handleFindTickets}>
              <input
                required
                type="email"
                placeholder="Email you bought with"
                value={findEmail}
                onChange={(e) => setFindEmail(e.target.value)}
              />
              <button className="btn btn-secondary" type="submit" disabled={findState === 'sending'}>
                {findState === 'sending' ? 'Sending…' : 'Email my tickets'}
              </button>
            </form>
          )}
          {findState === 'sent' && (
            <p className="find-tickets-note">
              If tickets exist for that email, we've sent them. Check your inbox (and spam).
            </p>
          )}
        </div>

        {profile.venue_map_url && (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              Venue map
            </h2>
            <img src={profile.venue_map_url} alt="Venue and seating map" className="public-event-venue-map" />
          </div>
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