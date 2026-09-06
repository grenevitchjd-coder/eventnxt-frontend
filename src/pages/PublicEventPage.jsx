// eventnxt-frontend: src/pages/PublicEventPage.jsx
import { Fragment, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
  // Two views, URL-driven so both are shareable: /e/<slug> = About,
  // /e/<slug>/tickets = Tickets. One mount serves both, so tracked-link
  // capture (?ref / ?r) works wherever the buyer lands.
  const showTickets = useLocation().pathname.endsWith('/tickets')
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
  // Sectioned unassigned types: the buyer's chosen section per ticket type.
  const [sectionChoice, setSectionChoice] = useState({})
  // Sectioned all-days passes: the chosen section PER NIGHT — the buyer
  // may sit somewhere new each show. {ttId: {isoDate: zoneSectionId}}
  const [passNightChoice, setPassNightChoice] = useState({})
  const [buyer, setBuyer] = useState({ name: '', email: '', promo: '' })
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  // null = nothing checked; {valid, discount_type, discount_value} once checked
  const [promoInfo, setPromoInfo] = useState(null)
  // Find-my-tickets mini-form: closed | open | sending | sent
  const [dayFilter, setDayFilter] = useState(null) // 'passes' (labeled All days) | iso date | null until types load
  // Default chip once types arrive: "All days" when pass products exist,
  // else the first night. Lives up here with the other hooks — an effect
  // below the loading early-returns changes hook order between renders
  // (Rules of Hooks; the throwaway probe caught exactly that).
  useEffect(() => {
    if (!Array.isArray(ticketTypes) || dayFilter !== null) return
    const dated = ticketTypes.some((t) => t.valid_date)
    if (!dated) return
    const undated = ticketTypes.some((t) => !t.valid_date)
    const days = [...new Set(ticketTypes.map((t) => t.valid_date).filter(Boolean))].sort()
    setDayFilter(undated ? 'passes' : days[0])
  }, [ticketTypes, dayFilter])
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
    const refc = (params.get('r') || '').trim() // per-recipient outreach token (0044)
    if (ref) {
      localStorage.setItem(`eventnxt-ref-${slug}`, ref)
      // Last click wins for the PERSON too: a fresh ref without a token
      // clears the old token, so a later plain-link click doesn't keep
      // crediting an earlier invite's sender.
      if (refc) localStorage.setItem(`eventnxt-refc-${slug}`, refc)
      else localStorage.removeItem(`eventnxt-refc-${slug}`)
      const rq = refc ? `?r=${encodeURIComponent(refc)}` : ''
      fetch(`${API_URL}/public/events/${slug}/promo-codes/${encodeURIComponent(ref)}/click${rq}`, { method: 'POST' }).catch(() => {})
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

  // Multi-day grouping: whole-event passes first, then each day in

  // order. Single-day events (no dated types) keep the flat list.

  const orderedTypes = ticketTypes

    ? [...ticketTypes].sort((a, b) => String(a.valid_date || '') < String(b.valid_date || '') ? -1 : String(a.valid_date || '') > String(b.valid_date || '') ? 1 : 0)

    : []

  const anyDated = orderedTypes.some((t) => t.valid_date)
  const anyUndated = orderedTypes.some((t) => !t.valid_date)
  const eventDays = [...new Set(orderedTypes.map((t) => t.valid_date).filter(Boolean))].sort()

  const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

  // Chips replaced in-list day headings (the active chip IS the label);
  // headingFor now always yields null and dayLabel is kept for chips.
  const headingFor = () => null
  // Display-only day filter (2026-09-05, redirected same day): the
  // chips ARE the sections — "All days" shows the all-days/pass
  // products, each night chip shows that night, and there is no
  // show-everything view. Selections made under other chips stay in
  // the order — the total under the buyer form spans everything.
  const visibleTypes =
    dayFilter === null
      ? orderedTypes
      : dayFilter === 'passes'
        ? orderedTypes.filter((t) => !t.valid_date)
        : orderedTypes.filter((t) => t.valid_date === dayFilter)
  const hiddenSelectedCount = orderedTypes
    .filter((t) => !visibleTypes.includes(t))
    .reduce((sum, t) => sum + (quantities[t.id] || 0), 0)
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

  const chosenSection = (t) => (t.sections || []).find((x) => x.id === sectionChoice[t.id]) || null

  const isSectionedPass = (t) => (t.pass_nights || []).length > 0

  const unitCap = (t) => {
    let cap = Math.min(t.max_per_order, t.available)
    if (t.section_required) {
      const sec = chosenSection(t)
      if (!sec) return 0
      cap = Math.min(cap, Math.floor(sec.remaining / (t.admits || 1)))
    }
    if (isSectionedPass(t)) {
      // Every night needs a pick; the tightest picked section is the cap.
      for (const night of t.pass_nights) {
        const picked = (passNightChoice[t.id] || {})[night.date]
        const sec = (night.sections || []).find((x) => x.id === picked)
        if (!sec) return 0
        cap = Math.min(cap, sec.remaining)
      }
    }
    return cap
  }

  const refreshTicketTypes = () => {
    fetch(`${API_URL}/public/events/${slug}/ticket-types`)
      .then((res) => (res.ok ? res.json() : null))
      .then((tts) => tts && setTicketTypes(tts))
      .catch(() => {})
  }

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
    const cap = unitCap(t)
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
          // Silently ignored server-side when stale; a TYPED different
          // code beats it (the locked attribution policy).
          referral_contact_token: localStorage.getItem(`eventnxt-refc-${slug}`) || null,
          items: ticketTypes
            .filter((t) => qtyFor(t) > 0)
            .map((t) =>
              t.assigned_seating
                ? { ticket_type_id: t.id, quantity: qtyFor(t), seat_ids: seatPicks[t.id] }
                : isSectionedPass(t)
                  ? {
                      ticket_type_id: t.id,
                      quantity: quantities[t.id],
                      zone_section_ids: t.pass_nights.map((n) => (passNightChoice[t.id] || {})[n.date]),
                    }
                  : t.section_required
                    ? { ticket_type_id: t.id, quantity: quantities[t.id], zone_section_id: sectionChoice[t.id] }
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
      refreshTicketTypes()
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

        {/* Two-page split (2026-09-05): About vs Tickets, tabbed and
            URL-addressable. Only shown when there is any ticket UI. */}
        {(hasNativeTickets || profile.external_ticket_url) && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '18px 0 6px' }}>
            <button
              className={`btn btn-small ${!showTickets ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => navigate(`/e/${slug}`)}
            >
              About
            </button>
            <button
              className={`btn btn-small ${showTickets ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => navigate(`/e/${slug}/tickets`)}
            >
              Tickets
            </button>
          </div>
        )}
        {!showTickets && (hasNativeTickets || profile.external_ticket_url) && (
          <div style={{ textAlign: 'center', margin: '10px 0 4px' }}>
            <button className="btn btn-primary public-event-cta" onClick={() => navigate(`/e/${slug}/tickets`)}>
              Get Tickets
            </button>
          </div>
        )}

        {/* Native ticket sales, when this event has them — otherwise the
            external ticket link keeps working exactly as it always has.
            An event with NO ticket types and NO external link simply shows
            no ticket UI at all, same as before. */}
        {showTickets && hasNativeTickets ? (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              Tickets
            </h2>
            {anyDated && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 10px' }}>
                {anyUndated && (
                  <button className={`btn btn-small ${dayFilter === 'passes' ? 'btn-secondary' : 'btn-ghost'}`}
                          onClick={() => setDayFilter('passes')}>
                    All days
                  </button>
                )}
                {eventDays.map((d) => (
                  <button key={d} className={`btn btn-small ${dayFilter === d ? 'btn-secondary' : 'btn-ghost'}`}
                          onClick={() => setDayFilter(d)}>
                    {new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })}
                  </button>
                ))}
              </div>
            )}
            {hiddenSelectedCount > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Also in your order: {hiddenSelectedCount} ticket{hiddenSelectedCount === 1 ? '' : 's'} from
                other days — the total below includes everything.
              </p>
            )}
            <div className="ticket-picker">
              {visibleTypes.map((t, ti) => {
                const qty = quantities[t.id] || 0
                const cap = unitCap(t)
                return (
                  <Fragment key={t.id}>
                    {headingFor(t, ti) && (
                      <div
                        style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '14px 0 2px' }}
                      >
                        {headingFor(t, ti)}
                      </div>
                    )}
                  <div className="ticket-picker-row">
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
                      <div className="ticket-picker-controls">
                        {!seatMaps[t.id] ? (
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seats…</span>
                        ) : seatMaps[t.id].sections.length === 0 ? (
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            Seats for this ticket are still being set up — check back shortly.
                          </span>
                        ) : (
                          <>
                            <select
                              className="ticket-section-select"
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
                              className="ticket-seat-select"
                              value={(pickDraft[t.id] || {}).seat || ''}
                              onChange={(e) => setPickDraft({ ...pickDraft, [t.id]: { ...(pickDraft[t.id] || {}), seat: e.target.value } })}
                              disabled={(pickDraft[t.id] || {}).section === undefined || (pickDraft[t.id] || {}).section === ''}
                              aria-label="Seat"
                            >
                              <option value="">Seat…</option>
                              {(((seatMaps[t.id].sections[Number((pickDraft[t.id] || {}).section)] || {}).seats || [])).map((x) => {
                                const gone = !x.available || (seatPicks[t.id] || []).includes(x.id)
                                return (
                                  <option key={x.id} value={x.id} disabled={gone} style={gone ? { color: '#999' } : undefined}>
                                    Seat {x.seat_number}
                                    {gone ? ' — taken' : ''}
                                  </option>
                                )
                              })}
                            </select>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => addSeatPick(t)}
                              disabled={!(pickDraft[t.id] || {}).seat || qtyFor(t) >= Math.min(t.max_per_order, t.available)}
                            >
                              Add seat
                            </button>
                          </>
                        )}
                      </div>
                    ) : t.on_sale && isSectionedPass(t) ? (
                      <div className="ticket-picker-controls" style={{ alignItems: 'flex-end' }}>
                        {t.pass_nights.map((night) => (
                          <label key={night.date || 'night'} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {night.date ? dayLabel(night.date) : 'Night'}
                            <select
                              className="ticket-section-select"
                              value={(passNightChoice[t.id] || {})[night.date] || ''}
                              onChange={(e) => {
                                setPassNightChoice({
                                  ...passNightChoice,
                                  [t.id]: { ...(passNightChoice[t.id] || {}), [night.date]: e.target.value },
                                })
                                setQuantities({ ...quantities, [t.id]: 0 })
                              }}
                              aria-label={`Section for ${night.date || 'this night'}`}
                            >
                              <option value="">Section…</option>
                              {(night.sections || []).map((x) => (
                                <option key={x.id} value={x.id} disabled={x.remaining < 1}>
                                  {x.section_label}
                                  {x.row_label ? ` · ${x.row_label}` : ''}
                                  {x.remaining < 1 ? ' — full' : ` · ${x.remaining} left`}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                        <div className="ticket-qty-stepper">
                          <button type="button" onClick={() => setQty(t, qtyFor(t) - 1)} disabled={qtyFor(t) === 0} aria-label="fewer">
                            −
                          </button>
                          <span>{qtyFor(t)}</span>
                          <button
                            type="button"
                            onClick={() => setQty(t, qtyFor(t) + 1)}
                            disabled={unitCap(t) === 0 || qtyFor(t) >= unitCap(t)}
                            aria-label="more"
                          >
                            +
                          </button>
                        </div>
                        {unitCap(t) === 0 && qtyFor(t) === 0 && (
                          <span style={{ flexBasis: '100%', textAlign: 'right', fontSize: 11.5, color: 'var(--text-muted)' }}>
                            Pick a section for every night — a different one each night is fine.
                          </span>
                        )}
                      </div>
                    ) : t.on_sale && t.section_required ? (
                      <div className="ticket-picker-controls">
                        <select
                          className="ticket-section-select"
                          value={sectionChoice[t.id] || ''}
                          onChange={(e) => {
                            setSectionChoice({ ...sectionChoice, [t.id]: e.target.value })
                            setQuantities({ ...quantities, [t.id]: 0 })
                          }}
                          aria-label="Section"
                        >
                          <option value="">Section…</option>
                          {(t.sections || []).map((x) => {
                            const units = Math.floor(x.remaining / (t.admits || 1))
                            return (
                              <option key={x.id} value={x.id} disabled={units < 1}>
                                {x.section_label}
                                {x.row_label ? ` · ${x.row_label}` : ''}
                                {units < 1 ? ' — full' : ` · ${units} left`}
                              </option>
                            )
                          })}
                        </select>
                        <div className="ticket-qty-stepper">
                          <button type="button" onClick={() => setQty(t, qtyFor(t) - 1)} disabled={qtyFor(t) === 0} aria-label="fewer">
                            −
                          </button>
                          <span>{qtyFor(t)}</span>
                          <button type="button" onClick={() => setQty(t, qtyFor(t) + 1)} disabled={!sectionChoice[t.id] || qtyFor(t) >= cap} aria-label="more">
                            +
                          </button>
                        </div>
                      </div>
                    ) : t.on_sale ? (
                      <div className="ticket-picker-controls">
                      <div className="ticket-qty-stepper">
                        <button type="button" onClick={() => setQty(t, qty - 1)} disabled={qty === 0} aria-label="fewer">
                          −
                        </button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => setQty(t, qty + 1)} disabled={qty >= cap} aria-label="more">
                          +
                        </button>
                      </div>
                      </div>
                    ) : (
                      <span className="ticket-picker-offsale">{t.available === 0 ? 'Sold out' : 'Not on sale'}</span>
                    )}
                    {t.on_sale && t.assigned_seating && (seatPicks[t.id] || []).length > 0 && (
                      <div style={{ flexBasis: '100%', marginTop: 2 }}>
                        {(
                          <>
                            {/* Picked chips (dropdowns moved inline into the row, 2026-09-05) */}
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
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  </Fragment>
                )
              })}
            </div>

            {totalQty > 0 && (
              <form className="ticket-buyer-form" onSubmit={handleCheckout}>
                {/* Checkout card (2026-09-05): labeled fields in a bounded
                    card, styled entirely from the page's existing tokens so
                    it inherits each organizer's colors and fonts. */}
                <div className="checkout-card">
                  <div className="checkout-card-title" style={displayFont}>Your details</div>
                  <div className="checkout-grid">
                    <label className="checkout-field">
                      <span>Name</span>
                      <input
                        required
                        autoComplete="name"
                        placeholder="Jordan Rivera"
                        value={buyer.name}
                        onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                      />
                    </label>
                    <label className="checkout-field">
                      <span>Email</span>
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={buyer.email}
                        onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                      />
                    </label>
                    <label className="checkout-field checkout-field-code">
                      <span>Referral code <em>(optional)</em></span>
                      <input
                        placeholder=""
                        value={buyer.promo}
                        onChange={(e) => setBuyer({ ...buyer, promo: e.target.value })}
                      />
                    </label>
                  </div>
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
                <button className="btn btn-primary public-event-cta checkout-submit" type="submit" disabled={checkingOut}>
                  {checkingOut
                    ? 'One moment…'
                    : dueCents === 0
                      ? `Get ${totalQty} free ticket${totalQty > 1 ? 's' : ''}`
                      : `Continue to payment — ${money(dueCents, ticketTypes[0].currency)}`}
                </button>
                <p className="ticket-buyer-note">
                  Your tickets will be emailed to you{dueCents > 0 ? ' after payment' : ''}.
                </p>
                </div>
              </form>
            )}
          </div>
        ) : showTickets ? (
          profile.external_ticket_url && (
            <a
              className="btn btn-primary public-event-cta"
              href={(() => {
                const base = profile.external_ticket_url
                const ref = localStorage.getItem(`eventnxt-ref-${slug}`)
                if (!ref) return base
                const sep = base.includes('?') ? '&' : '?'
                const refc = localStorage.getItem(`eventnxt-refc-${slug}`)
                return `${base}${sep}utm_source=eventnxt&utm_medium=referral&utm_campaign=${encodeURIComponent(ref)}${refc ? `&utm_content=${encodeURIComponent(refc)}` : ''}`
              })()}
              target="_blank"
              rel="noreferrer"
            >
              Get Tickets
            </a>
          )
        ) : null}

        {/* Self-serve recovery — send-to-the-inbox, never display-for-a-typed-email. */}
        {showTickets && (
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
        )}

        {showTickets && profile.venue_map_url && (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              Venue map
            </h2>
            <img src={profile.venue_map_url} alt="Venue and seating map" className="public-event-venue-map" />
          </div>
        )}

        {!showTickets && profile.about_us && (
          <div className="public-event-section">
            <h2 className="public-event-section-title" style={displayFont}>
              About Us
            </h2>
            <p className="public-event-about">{profile.about_us}</p>
          </div>
        )}

        {!showTickets && dailySchedule.length > 0 && (
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

        {!showTickets && specialSchedule.length > 0 && (
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

        {!showTickets && profile.photos && profile.photos.length > 0 && (
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
        {!showTickets && contactLinks.length > 0 && (
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