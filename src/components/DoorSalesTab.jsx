// eventnxt-frontend: src/components/DoorSalesTab.jsx
//
// Cash, walk-up sales at the door (0053) — same live catalog and
// inventory a buyer sees on the public ticket page (multi-day types,
// assigned seats, sectioned pools, promo codes), rung up by a staff
// member instead of self-served. No card is ever touched here: the
// backend skips Stripe entirely and charges no platform fee for now.
//
// v1 scope note: sectioned all-days passes (a different section picked
// per night) aren't sellable from this screen — that's a rare walk-up
// case and the picker UI for it is involved; those events still sell
// fine from the public page. Everything else in the catalog works here.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api'

// Same on-screen QR pattern as Guest list's TicketQR — client-rendered
// so the door tablet itself is a valid scan target the instant a sale
// completes, with no round trip back to the server for an image.
function TicketQR({ code }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(code, { margin: 1, scale: 4 })
      .then((url) => alive && setSrc(url))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [code])
  return src ? <img src={src} alt={`QR for ${code}`} width={110} height={110} /> : <div style={{ width: 110, height: 110 }} />
}

const money = (cents, currency = 'usd') => {
  const symbol = currency.toLowerCase() === 'usd' ? '$' : ''
  return `${symbol}${(cents / 100).toFixed(2)}`
}

export default function DoorSalesTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [quantities, setQuantities] = useState({})
  const [sectionChoice, setSectionChoice] = useState({})
  const [seatMaps, setSeatMaps] = useState({})
  const [seatPicks, setSeatPicks] = useState({})
  const [pickDraft, setPickDraft] = useState({})
  const [buyer, setBuyer] = useState({ name: '', email: '', promo: '' })
  const [promoInfo, setPromoInfo] = useState(null)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [staffAttested, setStaffAttested] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saleResult, setSaleResult] = useState(null)
  const [reconciliation, setReconciliation] = useState(null)

  const load = async (evId) => {
    try {
      const cat = await api.getDoorSalesCatalog(evId)
      setCatalog(cat)
      setLoadedEventId(evId)
      cat
        .filter((t) => t.assigned_seating)
        .forEach((t) => {
          api
            .getDoorSalesSeatMap(evId, t.id)
            .then((m) => m && setSeatMaps((prev) => ({ ...prev, [t.id]: m })))
            .catch(() => {})
        })
    } catch (err) {
      onToast(err.message, true)
    }
  }

  // "Today" from the DOOR DEVICE's own clock — local midnight to local
  // midnight — sent as UTC instants so the backend just buckets
  // timestamps, no timezone guessing server-side.
  const loadReconciliation = async (evId) => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    try {
      setReconciliation(await api.getDoorSalesReconciliation(evId, start.toISOString(), end.toISOString()))
    } catch {
      // reconciliation is a convenience readout — a failed fetch shouldn't block selling
    }
  }

  useEffect(() => {
    if (eventId) {
      load(eventId)
      loadReconciliation(eventId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    const code = buyer.promo.trim()
    if (!code || !loadedEventId) {
      setPromoInfo(null)
      return
    }
    const t = setTimeout(() => {
      api
        .checkDoorSalesPromoCode(loadedEventId, code)
        .then(setPromoInfo)
        .catch(() => setPromoInfo({ valid: false }))
    }, 400)
    return () => clearTimeout(t)
  }, [buyer.promo, loadedEventId])

  const isSectionedPass = (t) => (t.pass_nights || []).length > 0
  const sellable = (catalog || []).filter((t) => !isSectionedPass(t))

  const chosenSection = (t) => (t.sections || []).find((x) => x.id === sectionChoice[t.id]) || null
  const qtyFor = (t) => (t.assigned_seating ? (seatPicks[t.id] || []).length : quantities[t.id] || 0)

  const unitCap = (t) => {
    let cap = Math.min(t.max_per_order, t.available)
    if (t.section_required) {
      const sec = chosenSection(t)
      if (!sec) return 0
      cap = Math.min(cap, Math.floor(sec.remaining / (t.admits || 1)))
    }
    return cap
  }

  const setQty = (t, next) => {
    const cap = unitCap(t)
    setQuantities({ ...quantities, [t.id]: Math.max(0, Math.min(cap, next)) })
  }

  const seatLabelFor = (ttId, seatId) => {
    const map = seatMaps[ttId]
    if (!map) return 'Seat'
    for (const sec of map.sections) {
      const hit = sec.seats.find((x) => x.id === seatId)
      if (hit) return `${sec.section_label}${sec.row_label ? ` · ${sec.row_label}` : ''} · Seat ${hit.seat_number}`
    }
    return 'Seat'
  }

  const addSeatPick = (t) => {
    const draft = pickDraft[t.id]
    if (!draft || !draft.seat) return
    setSeatPicks({ ...seatPicks, [t.id]: [...(seatPicks[t.id] || []), draft.seat] })
    setPickDraft({ ...pickDraft, [t.id]: { section: draft.section, seat: '' } })
  }

  const removeSeatPick = (ttId, seatId) => {
    setSeatPicks({ ...seatPicks, [ttId]: (seatPicks[ttId] || []).filter((x) => x !== seatId) })
  }

  const totalQty = sellable.reduce((a, t) => a + qtyFor(t), 0)
  const totalCents = sellable.reduce((sum, t) => sum + qtyFor(t) * t.price_cents, 0)
  const discountCents = (() => {
    if (!promoInfo?.valid || !promoInfo.discount_type || totalCents === 0) return 0
    const raw =
      promoInfo.discount_type === 'percentage'
        ? Math.round((totalCents * promoInfo.discount_value) / 100)
        : Math.round(promoInfo.discount_value * 100)
    return Math.max(0, Math.min(totalCents, raw))
  })()
  const dueCents = totalCents - discountCents

  const resetCart = () => {
    setQuantities({})
    setSectionChoice({})
    setSeatPicks({})
    setPickDraft({})
    setBuyer({ name: '', email: '', promo: '' })
    setPromoInfo(null)
    setMarketingOptIn(false)
    setStaffAttested(false)
    setSaleResult(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!staffAttested) {
      onToast('Confirm the buyer was walked through the Ticket Purchasing Agreement first.', true)
      return
    }
    setSubmitting(true)
    try {
      const result = await api.sellAtDoor(loadedEventId, {
        buyer_name: buyer.name,
        buyer_email: buyer.email,
        items: sellable
          .filter((t) => qtyFor(t) > 0)
          .map((t) =>
            t.assigned_seating
              ? { ticket_type_id: t.id, quantity: qtyFor(t), seat_ids: seatPicks[t.id] }
              : t.section_required
                ? { ticket_type_id: t.id, quantity: quantities[t.id], zone_section_id: sectionChoice[t.id] }
                : { ticket_type_id: t.id, quantity: quantities[t.id] }
          ),
        promo_code: buyer.promo.trim() || null,
        marketing_opt_in: marketingOptIn,
        staff_attested_terms: staffAttested,
      })
      setSaleResult(result)
      onToast(`Sold ${result.tickets.length} ticket${result.tickets.length === 1 ? '' : 's'} for ${money(result.total_cents)} cash`)
      load(loadedEventId)
      loadReconciliation(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSubmitting(false)
    }
  }

  if (!loadedEventId || catalog === null) return null

  if (saleResult) {
    return (
      <>
        <div className="page-title">Door sales</div>
        <div className="data-table" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Sale complete — {money(saleResult.total_cents)} cash collected</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {saleResult.email_sent
              ? 'A confirmation with PDF tickets was also emailed to the buyer.'
              : "Couldn't email the buyer a copy — show them these codes now."}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {saleResult.tickets.map((t) => (
              <div
                key={t.code}
                style={{ border: '1px solid var(--border, #ccc)', borderRadius: 10, padding: 14, textAlign: 'center' }}
              >
                <TicketQR code={t.code} />
                <div style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 6 }}>{t.code}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.ticket_type_name}</div>
                {t.seat_label && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.seat_label}</div>}
                {t.valid_date && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.valid_date}</div>}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={resetCart}>
            New sale
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-title">Door sales</div>
      <p className="page-subtitle">
        Sell a walk-up ticket for cash — the same live catalog and availability buyers see on the public page. No
        card is ever charged here; collect the cash, ring it up, and the ticket mints immediately.
      </p>

      {reconciliation && (
        <div className="inline-form" style={{ marginBottom: 16, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Cash collected today: <strong>{money(reconciliation.cash_total_cents)}</strong> ·{' '}
            {reconciliation.ticket_count} ticket{reconciliation.ticket_count === 1 ? '' : 's'} ·{' '}
            {reconciliation.sale_count} sale{reconciliation.sale_count === 1 ? '' : 's'}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => loadReconciliation(loadedEventId)}>
            Refresh
          </button>
        </div>
      )}

      {catalog.some(isSectionedPass) && (
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Multi-night passes that pick a different section per night aren't sellable from this screen yet — sell
          those from the public event page for now.
        </p>
      )}

      {sellable.length === 0 ? (
        <div className="empty-state">Nothing sellable for this event yet.</div>
      ) : (
        <div className="ticket-picker">
          {sellable.map((t) => {
            const qty = quantities[t.id] || 0
            const cap = unitCap(t)
            return (
              <div className="ticket-picker-row" key={t.id}>
                <div className="ticket-picker-info">
                  <div className="ticket-picker-name">{t.name}</div>
                  {(t.admits || 1) > 1 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>admits {t.admits} people each</div>
                  )}
                  <div className="ticket-picker-price">
                    {t.price_cents === 0 ? 'Free' : money(t.price_cents, t.currency)}
                    {t.on_sale && t.available > 0 && t.available <= 5 && (
                      <span className="ticket-picker-scarcity"> · only {t.available} left</span>
                    )}
                  </div>
                </div>
                {!t.on_sale ? (
                  <span className="ticket-picker-offsale">{t.available === 0 ? 'Sold out' : 'Not on sale'}</span>
                ) : t.assigned_seating ? (
                  <div className="ticket-picker-controls">
                    {!seatMaps[t.id] ? (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seats…</span>
                    ) : seatMaps[t.id].sections.length === 0 ? (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No seats set up for this type yet.</span>
                    ) : (
                      <>
                        <select
                          className="ticket-section-select"
                          value={(pickDraft[t.id] || {}).section ?? ''}
                          onChange={(e) => setPickDraft({ ...pickDraft, [t.id]: { section: e.target.value, seat: '' } })}
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
                          onChange={(e) =>
                            setPickDraft({ ...pickDraft, [t.id]: { ...(pickDraft[t.id] || {}), seat: e.target.value } })
                          }
                          disabled={(pickDraft[t.id] || {}).section === undefined || (pickDraft[t.id] || {}).section === ''}
                          aria-label="Seat"
                        >
                          <option value="">Seat…</option>
                          {(((seatMaps[t.id].sections[Number((pickDraft[t.id] || {}).section)] || {}).seats || [])).map(
                            (x) => {
                              const gone = !x.available || (seatPicks[t.id] || []).includes(x.id)
                              return (
                                <option key={x.id} value={x.id} disabled={gone} style={gone ? { color: '#999' } : undefined}>
                                  Seat {x.seat_number}
                                  {gone ? ' — taken' : ''}
                                </option>
                              )
                            }
                          )}
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
                ) : t.section_required ? (
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
                      <button
                        type="button"
                        onClick={() => setQty(t, qtyFor(t) + 1)}
                        disabled={!sectionChoice[t.id] || qtyFor(t) >= cap}
                        aria-label="more"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : (
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
                )}
                {t.assigned_seating && (seatPicks[t.id] || []).length > 0 && (
                  <div style={{ flexBasis: '100%', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(seatPicks[t.id] || []).map((sid) => (
                      <span
                        key={sid}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                          border: '1px solid var(--border, #ccc)', borderRadius: 999, padding: '3px 10px',
                        }}
                      >
                        {seatLabelFor(t.id, sid)}
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
              </div>
            )
          })}
        </div>
      )}

      {totalQty > 0 && (
        <form className="ticket-buyer-form" onSubmit={submit}>
          <div className="checkout-card">
            <div className="checkout-card-title">Buyer details</div>
            <div className="checkout-grid">
              <label className="checkout-field">
                <span>Name</span>
                <input required autoComplete="name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
              </label>
              <label className="checkout-field">
                <span>Email</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={buyer.email}
                  onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                />
              </label>
              <label className="checkout-field checkout-field-code">
                <span>Promo code <em>(optional)</em></span>
                <input value={buyer.promo} onChange={(e) => setBuyer({ ...buyer, promo: e.target.value })} />
              </label>
            </div>
            {buyer.promo.trim() && promoInfo && (
              <p className={promoInfo.valid ? 'ticket-promo-ok' : 'ticket-promo-bad'}>
                {!promoInfo.valid
                  ? "This code isn't recognized for this event."
                  : discountCents > 0
                    ? `Code applied — ${money(discountCents)} off.`
                    : 'Code applied.'}
              </p>
            )}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 10 }}>
              <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
              <span>Buyer opted in to hear about future events from the organizer</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 8 }}>
              <input type="checkbox" checked={staffAttested} onChange={(e) => setStaffAttested(e.target.checked)} required />
              <span>
                I confirmed the buyer agrees to the{' '}
                <a href="/terms/purchase" target="_blank" rel="noreferrer">
                  Ticket Purchasing Agreement
                </a>{' '}
                (staff attesting on their behalf)
              </span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                Collect {money(dueCents)} cash
                {discountCents > 0 ? ` (${money(totalCents)} − ${money(discountCents)})` : ''}
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting || !staffAttested}>
                {submitting ? 'Selling…' : `Sell ${totalQty} ticket${totalQty === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  )
}