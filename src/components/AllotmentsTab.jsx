// eventnxt-frontend: src/components/AllotmentsTab.jsx
//
// Allotments — the second ticket-offering surface, now the same
// two-part shape as Invites:
//   TOP: quick add (or CSV import) — entity name, email, guest type.
//   BOTTOM: the budget grid — one row per allotment, day-budget
//   columns + a TOTAL cap (set it lower than the day amounts and the
//   sponsor can spend, say, 25 across 10/10/10 — the portal enforces
//   it), placement toggle, seating visibility (where the type's
//   priorities will put recipients — automation still places, this is
//   just the plan made visible), recipients nested under each row.
//   Nothing is emailed until "Save & send portal links".
//
// Direct invitees live on Invites; the door roster is Guest list.
import { Fragment, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import { api } from '../api'

const rsvpUrl = (token) => `${window.location.origin}/rsvp/${token}`
const selectStyle = { fontSize: 12.5, padding: '4px 6px', width: '100%' }

export default function AllotmentsTab({ onToast, eventId }) {
  const [loadedEventId, setLoadedEventId] = useState(null)
  const [guests, setGuests] = useState(null)
  const [guestTypes, setGuestTypes] = useState([])
  const [categories, setCategories] = useState([])
  const [settings, setSettings] = useState(null)
  const [prioritiesByType, setPrioritiesByType] = useState({})

  const [form, setForm] = useState({ name: '', email: '', guest_type_id: '' })
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // Grid edits per distributor: guest_type_id, spend_total, day:<iso>
  // (or day: for the undated "any day" budget on single-day events).
  const [gridEdits, setGridEdits] = useState({})
  const [savingGrid, setSavingGrid] = useState(false)
  const [committing, setCommitting] = useState(false)

  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  // Two views, matching the Invites page: 'tosend' = staging (add/import
  // + every allotment whose portal link hasn't gone out); 'sent' =
  // tracking portals that are live. Sending moves people across.
  const [view, setView] = useState('tosend')
  // Per-type default budgets ({guest_type_id: {date: qty}}) so untouched
  // budget cells ghost what the backend will grant (same rules as the
  // Invites grid: ghosts materialize on save, silence after override).
  const [typeAllotments, setTypeAllotments] = useState({})

  const loadEventData = async (evId) => {
    try {
      const [g, gt, st, cats] = await Promise.all([
        api.listGuests(evId),
        api.listGuestTypes(evId),
        api.getEventSettings(evId),
        api.listSeatingCategories(evId),
      ])
      setGuests(g)
      setGuestTypes(gt)
      setSettings(st)
      setCategories(cats)
      setLoadedEventId(evId)
      // Seating visibility: pull each allotment type's priority list once
      // (best-effort — the grid just shows a warning when unavailable).
      const typeIds = [...new Set(
        g.filter((x) => !x.allocated_by_guest_id && (x.effective_mode || 'invite') === 'distribute').map((x) => x.guest_type_id)
      )]
      Promise.all(
        gt.map(async (t) => {
          try {
            const rows = await api.listTicketAllotments(evId, t.id)
            return [t.id, Object.fromEntries(rows.map((r) => [r.date, r.quantity]))]
          } catch {
            return [t.id, {}]
          }
        })
      ).then((es) => setTypeAllotments(Object.fromEntries(es)))
      const entries = await Promise.all(
        typeIds.map(async (id) => {
          try {
            return [id, await api.listSeatingPriorities(evId, id)]
          } catch {
            return [id, []]
          }
        })
      )
      setPrioritiesByType(Object.fromEntries(entries))
    } catch (err) {
      onToast(err.message, true)
    }
  }

  useEffect(() => {
    if (eventId) loadEventData(eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const externalTicketing = !!settings && settings.ticketing_mode !== 'native'

  const eventDays = (() => {
    if (!settings || !settings.first_day || !settings.last_day) return []
    if (!['per_day', 'mixed', 'multi_day'].includes(settings.ticket_span)) return []
    const out = []
    const d = new Date(settings.first_day + 'T12:00:00')
    const last = new Date(settings.last_day + 'T12:00:00')
    while (d <= last && out.length < 60) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      d.setDate(d.getDate() + 1)
    }
    return out
  })()
  const budgetCols = eventDays.length > 0 ? eventDays : [''] // '' = any-day budget
  const fmtDay = (iso) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'Budget'

  const distributors = (guests || []).filter(
    (g) => !g.allocated_by_guest_id && (g.effective_mode || 'invite') === 'distribute'
  )
  const recipientsOf = (id) => (guests || []).filter((g) => g.allocated_by_guest_id === id)

  const unsentCount = distributors.filter((g) => !g.link_sent_at).length
  const sentCount = distributors.length - unsentCount
  const viewDistributors = distributors.filter((g) => (view === 'tosend' ? !g.link_sent_at : !!g.link_sent_at))

  // Type-default ghosts — identical semantics to the Invites grid.
  const typeShapeCount = (g) => {
    const t = guestTypes.find((x) => x.id === (gridVal(g, 'guest_type_id') || g.guest_type_id))
    return t && ['all', 'choose'].includes(t.day_scope) && t.default_ticket_count ? t.default_ticket_count : null
  }
  const typeDayDefault = (g, d) => {
    const shape = typeShapeCount(g)
    if (shape) return shape
    const rows = typeAllotments[gridVal(g, 'guest_type_id') || g.guest_type_id]
    return rows && rows[d] ? rows[d] : null
  }
  const typeDayGhost = (g, d) => (g.ticket_allotment_overridden ? null : typeDayDefault(g, d))
  // Day-cloned pool families, collapsed exactly like the Invites Seating
  // dropdown — recipients' seating is chosen per AREA; the backend maps
  // each recipient to the sibling pool serving their night.
  const famBase = (name) => String(name || '').replace(/\s*\(\d{2}\/\d{2}\)$/, '')
  const seatingFamilies = (() => {
    const byBase = new Map()
    for (const c of categories || []) {
      const base = famBase(c.name)
      const cur = byBase.get(base)
      const isBare = c.name === base
      if (!cur || (isBare && !cur.bare)) byBase.set(base, { base, rep: c, bare: isBare })
    }
    return [...byBase.values()]
  })()
  const familyRepId = (id) => {
    const c = (categories || []).find((x) => String(x.id) === String(id))
    if (!c) return id || ''
    const fam = seatingFamilies.find((f) => f.base === famBase(c.name))
    return fam ? fam.rep.id : id
  }
  const sectionLabelsOf = (catId) => {
    const c = (categories || []).find((x) => String(x.id) === String(catId))
    return c && c.sections ? c.sections.map((s) => s.section_label) : []
  }

  const typeTotalGhost = (g) => {
    const t = guestTypes.find((x) => x.id === (gridVal(g, 'guest_type_id') || g.guest_type_id))
    return t && t.default_spend_total ? t.default_spend_total : null
  }

  // ---------- Grid editing ----------

  const dayRowsOf = (g) => Object.fromEntries((g.ticket_allotment || []).map((r) => [r.date || '', r.quantity]))

  const gridVal = (g, field) => {
    const e = gridEdits[g.id]
    if (e && field in e) return e[field]
    if (field.startsWith('day:')) {
      const v = dayRowsOf(g)[field.slice(4)]
      return v === undefined ? '' : String(v)
    }
    if (field === 'spend_total') return g.spend_total ? String(g.spend_total) : ''
    if (field === 'hold_timing') return g.hold_timing || 'now'
    if (field === 'recipient_seating_category_id') return g.recipient_seating_category_id || ''
    if (field === 'recipient_section_label') return g.recipient_section_label || ''
    return g[field] ?? ''
  }

  const setGridVal = (g, field, value) =>
    setGridEdits((prev) => ({ ...prev, [g.id]: { ...(prev[g.id] || {}), [field]: value } }))

  const dirtyIds = Object.keys(gridEdits).filter((id) => Object.keys(gridEdits[id] || {}).length > 0)

  // Where the type's priorities will place recipients — the PLAN, not a
  // control. Automation still does the placing on confirm.
  const seatingSummary = (g) => {
    const prios = prioritiesByType[gridVal(g, 'guest_type_id') || g.guest_type_id] || []
    if (prios.length === 0) return null
    const first = prios[0]
    const cat = categories.find((c) => c.id === first.seating_category_id)
    if (!cat) return null
    // allowed_sections arrives comma-joined as stored ("C,D") — the create
    // REQUEST takes a list, but the response is the string. Rendering with
    // .join() on it was a render-crash (white page) the moment the first
    // allotment row appeared for a type with multi-section priorities.
    const secs = first.allowed_sections
      ? ` (Sec ${String(first.allowed_sections).split(',').map((s) => s.trim()).filter(Boolean).join(', ')})`
      : first.section_label
        ? ` (Sec ${first.section_label})`
        : ''
    return `${cat.name}${secs}${prios.length > 1 ? ` +${prios.length - 1} more` : ''}`
  }

  const buildGridPayload = (g) => {
    const e = gridEdits[g.id] || {}
    const touchedDays = Object.keys(e).some((k) => k.startsWith('day:'))
    let ticket_allotment = null
    if (touchedDays) {
      ticket_allotment = budgetCols
        .map((d) => {
          const raw = String(gridVal(g, `day:${d}`))
          const quantity =
            raw !== ''
              ? parseInt(raw, 10) || 0
              : g.ticket_allotment_overridden
                ? 0
                : typeDayDefault(g, d) || 0
          return { date: d || null, quantity }
        })
        .filter((r) => r.quantity > 0)
    }
    return {
      name: g.name,
      email: g.email,
      guest_type_id: gridVal(g, 'guest_type_id') || g.guest_type_id,
      seating_category_id: g.seating_category_id || null,
      section_label: g.section_label || null,
      visit_date: g.visit_date || null,
      allocation_status: g.allocation_status,
      party_size: g.party_size || 1,
      perks: g.perks || null,
      comments: g.comments || null,
      guest_mode: g.guest_mode ?? 'distribute',
      hold_timing: gridVal(g, 'hold_timing') || 'now',
      recipient_seating_category_id: gridVal(g, 'recipient_seating_category_id') || null,
      recipient_section_label: gridVal(g, 'recipient_section_label') || null,
      spend_total: parseInt(gridVal(g, 'spend_total'), 10) || null,
      cohort_together: g.cohort_together,
      ...(ticket_allotment !== null ? { ticket_allotment } : {}),
    }
  }

  const saveGrid = async () => {
    if (dirtyIds.length === 0) return 0
    setSavingGrid(true)
    let saved = 0
    try {
      for (const id of dirtyIds) {
        const g = (guests || []).find((x) => x.id === id)
        if (!g) continue
        await api.updateGuest(loadedEventId, id, buildGridPayload(g))
        saved++
      }
      setGridEdits({})
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
      loadEventData(loadedEventId)
    } finally {
      setSavingGrid(false)
    }
    return saved
  }

  const saveAndSendPortalLinks = async () => {
    setCommitting(true)
    try {
      const saved = await saveGrid()
      const res = await api.sendPortalLinksBulk(loadedEventId)
      const parts = []
      if (saved) parts.push(`${saved} change${saved === 1 ? '' : 's'} saved`)
      parts.push(
        res.sent === 0 && res.failed === 0
          ? 'every allotment already has its link'
          : `${res.sent} portal link${res.sent === 1 ? '' : 's'} emailed${res.failed ? `, ${res.failed} failed` : ''}`
      )
      onToast(parts.join(' · '), res.failed > 0)
      loadEventData(loadedEventId)
      if (res.sent > 0) setView('sent')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCommitting(false)
    }
  }

  // ---------- Quick add + CSV import ----------

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const created = await api.createGuest(loadedEventId, {
        name: form.name.trim(),
        email: form.email.trim(),
        guest_type_id: form.guest_type_id || (guestTypes[0] || {}).id,
        allocation_status: 'confirmed',
        party_size: 1,
        perks: null,
        comments: null,
        guest_mode: 'distribute',
      })
      onToast(`${created.name} added — set their budget below, then Save & send portal links`)
      setForm({ name: '', email: '', guest_type_id: form.guest_type_id })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreating(false)
    }
  }

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        let ok = 0
        let bad = 0
        for (const rec of result.data) {
          const keys = Object.fromEntries(
            Object.entries(rec).map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ''), (v ?? '').toString().trim()])
          )
          const name = keys.name || keys.fullname || ''
          const email = keys.email || keys.emailaddress || ''
          const typeText = (keys.guesttype || keys.type || '').toLowerCase()
          const gt =
            guestTypes.find((t) => t.name.toLowerCase() === typeText) ||
            guestTypes.find((t) => t.id === form.guest_type_id) ||
            guestTypes[0]
          if (!name || !email || !gt) {
            bad++
            continue
          }
          try {
            await api.createGuest(loadedEventId, {
              name,
              email,
              guest_type_id: gt.id,
              allocation_status: 'confirmed',
              party_size: 1,
              perks: null,
              comments: null,
              guest_mode: 'distribute',
            })
            ok++
          } catch {
            bad++
          }
        }
        setImporting(false)
        e.target.value = ''
        onToast(
          `${ok} allotment${ok === 1 ? '' : 's'} imported${bad ? ` — ${bad} row${bad === 1 ? '' : 's'} skipped` : ''} — set budgets below, nothing emailed yet`,
          bad > 0
        )
        loadEventData(loadedEventId)
      },
      error: () => {
        setImporting(false)
        onToast('Could not read that file', true)
      },
    })
  }

  // ---------- Row actions ----------

  const copyPortalLink = async (g) => {
    try {
      await navigator.clipboard.writeText(rsvpUrl(g.rsvp_token))
      onToast('Portal link copied')
    } catch {
      onToast(rsvpUrl(g.rsvp_token))
    }
  }

  const emailPortalLink = async (g) => {
    setBusyId(g.id)
    try {
      await api.sendGuestInvite(loadedEventId, g.id)
      onToast(`Portal link emailed to ${g.name}`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const toggleCohort = async (g) => {
    setBusyId(g.id)
    try {
      await api.updateGuest(loadedEventId, g.id, {
        ...buildGridPayload(g),
        cohort_together: !(g.cohort_together !== false),
      })
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const toggleRecipientTicketsSent = async (g) => {
    setBusyId(g.id)
    try {
      await api.setGuestSentStatus(loadedEventId, g.id, !g.tickets_sent_at, 'tickets')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const removeRecipient = async (g) => {
    if (g.allocation_status === 'confirmed') {
      onToast(`${g.name} is confirmed — remove them from the Guest list page, which cancels their tickets and emails them.`, true)
      return
    }
    if (!window.confirm(`Remove ${g.name}? Their budget goes back to the allotment.`)) return
    setBusyId(g.id)
    try {
      await api.deleteGuest(loadedEventId, g.id)
      onToast(`${g.name} removed — budget freed`)
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const deleteAllotment = async (g) => {
    const kids = recipientsOf(g.id)
    if (kids.length > 0) {
      onToast(`"${g.name}" has ${kids.length} recipient${kids.length === 1 ? '' : 's'} — remove them first.`, true)
      return
    }
    if (!window.confirm(`Delete the "${g.name}" allotment?`)) return
    setBusyId(g.id)
    try {
      await api.deleteGuest(loadedEventId, g.id)
      onToast('Allotment deleted')
      loadEventData(loadedEventId)
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  if (!loadedEventId || guests === null) return null

  // Two-row blocks: thead holds the OFFER (Allotment name spans both
  // rows, then day budgets, Total, Given out); the lifecycle strip below
  // each row carries Type / Recipients' seating / Pull / actions.
  const colCount = 3 + budgetCols.length

  return (
    <>
      <div className="page-title">Allotments</div>
      <p className="page-subtitle">
        Ticket budgets that belong to an entity — sponsors, agencies, coordinators — who hand them out
        through their portal link; recipients appear nested under each row as they&apos;re entered.
        Add the entity above, set the budget in the grid, then <strong>Save &amp; send portal links</strong> —
        nothing is emailed until you do.
        {externalTicketing &&
          ' This event sells externally: order the real tickets on your platform and mark each recipient once sent.'}
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
        <button
          className={`btn ${view === 'tosend' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('tosend')}
          title="Add entities and set budgets — no portal links emailed yet"
        >
          Set up &amp; send{unsentCount ? ` (${unsentCount})` : ''}
        </button>
        <button
          className={`btn ${view === 'sent' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('sent')}
          title="Live portals — track budgets given out and recipients as they come in"
        >
          Track sent{sentCount ? ` (${sentCount})` : ''}
        </button>
      </div>

      {view === 'tosend' && (
      <div className="panel">
        <div className="panel-title">Add allotments</div>
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="al-name">Entity / contact name</label>
            <input id="al-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="al-email">Email (gets the portal link)</label>
            <input id="al-email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="al-type">Guest type</label>
            <select id="al-type" value={form.guest_type_id} onChange={(e) => setForm({ ...form, guest_type_id: e.target.value })}>
              <option value="">Choose…</option>
              {guestTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" type="submit" disabled={creating || guestTypes.length === 0}>
            Add allotment
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportFile} style={{ display: 'none' }} />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={importing || guestTypes.length === 0}
            onClick={() => fileInputRef.current?.click()}
            title="CSV with name, email, and (optionally) guest type columns — budgets set in the grid after"
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
          Budgets, totals, and placement are set in the grid below — the type&apos;s defaults apply until
          you change them. People who RSVP for themselves belong on the Invites page.
        </p>
      </div>

      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {viewDistributors.length} {view === 'tosend' ? 'not-yet-sent' : 'live'} allotment{viewDistributors.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="btn btn-secondary"
          disabled={savingGrid || committing || dirtyIds.length === 0}
          onClick={async () => {
            const n = await saveGrid()
            if (n) onToast(`${n} change${n === 1 ? '' : 's'} saved — nothing emailed yet`)
          }}
          title="Save budget edits without emailing anyone"
        >
          {savingGrid && !committing ? 'Saving…' : `Save changes${dirtyIds.length ? ` (${dirtyIds.length})` : ''}`}
        </button>
        {view === 'tosend' && (
          <button
            className="btn btn-primary"
            disabled={committing || savingGrid}
            onClick={saveAndSendPortalLinks}
            title="Save every edit, then email every allotment that hasn't received its portal link"
          >
            {committing ? 'Sending…' : 'Save & send portal links'}
          </button>
        )}
      </div>

      <div className="table-scroll" style={{ marginBottom: 28 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Allotment</th>
            {budgetCols.map((d) => (
              <th key={d || 'any'} style={{ textAlign: 'center' }}>
                {d ? (
                  <>
                    <div>{new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short' })}</div>
                    <div style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                    </div>
                  </>
                ) : (
                  'Budget'
                )}
              </th>
            ))}
            <th title="Set LOWER than the day budgets to cap the whole allotment — e.g. 25 across 10/10/10. The portal enforces it.">
              Total
            </th>
            <th className="col-flex">Given out</th>
          </tr>
        </thead>
        <tbody>
          {viewDistributors.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="empty-state">
                {view === 'tosend'
                  ? sentCount > 0
                    ? 'Every allotment has its portal link — they live on Track sent now.'
                    : 'No allotments yet — add one above. You set the budget; they choose who gets the tickets.'
                  : 'No portal links sent yet — set budgets and hit Save & send on the Set up & send view.'}
              </td>
            </tr>
          ) : (
            viewDistributors.map((g) => {
              const kids = recipientsOf(g.id)
              const summary = seatingSummary(g)
              return (
                <Fragment key={g.id}>
                  <tr className="invite-main">
                    <td rowSpan={2}>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {g.email}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => copyPortalLink(g)}>
                          Copy link
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === g.id}
                          onClick={() => emailPortalLink(g)}
                          title="Email the portal link now"
                          style={g.link_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                        >
                          {g.link_sent_at ? '✓ Email again' : 'Email link'}
                        </button>
                      </div>
                    </td>
                    {budgetCols.map((d) => (
                      <td key={d || 'any'} style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          placeholder={typeDayGhost(g, d) ? String(typeDayGhost(g, d)) : '—'}
                          title="Tickets they can hand out for this day"
                          style={{ ...selectStyle, width: 52, textAlign: 'center' }}
                          value={gridVal(g, `day:${d}`)}
                          onChange={(e) => setGridVal(g, `day:${d}`, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        type="number"
                        min={1}
                        placeholder={typeTotalGhost(g) ? String(typeTotalGhost(g)) : 'all'}
                        title="Blank = the day budgets stand alone. A number lower than their sum caps the whole allotment."
                        style={{ ...selectStyle, width: 56, textAlign: 'center' }}
                        value={gridVal(g, 'spend_total')}
                        onChange={(e) => setGridVal(g, 'spend_total', e.target.value)}
                      />
                    </td>
                    <td className="mono">
                      {g.allotment_distributed} /{' '}
                      {g.spend_total && g.spend_total < g.allotment_total ? g.spend_total : g.allotment_total}
                    </td>
                  </tr>
                  <tr className="invite-meta">
                    <td colSpan={colCount - 1}>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                      <span className="meta-label">Type</span>
                      <select
                        style={selectStyle}
                        value={gridVal(g, 'guest_type_id')}
                        onChange={(e) => setGridVal(g, 'guest_type_id', e.target.value)}
                      >
                        {guestTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="meta-label">Recipients&apos; seating</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          style={selectStyle}
                          title="Where this allotment's recipients are placed — Auto follows the type's priorities; a choice here wins while it has room, day-mapped per recipient"
                          value={familyRepId(gridVal(g, 'recipient_seating_category_id'))}
                          onChange={(e) => {
                            setGridVal(g, 'recipient_seating_category_id', e.target.value)
                            setGridVal(g, 'recipient_section_label', '')
                          }}
                        >
                          <option value="">{summary ? `Auto — via ${summary}` : 'Auto (no priorities set)'}</option>
                          {seatingFamilies.map((f) => (
                            <option key={f.rep.id} value={f.rep.id}>
                              {f.base}
                            </option>
                          ))}
                        </select>
                        {gridVal(g, 'recipient_seating_category_id') &&
                          sectionLabelsOf(familyRepId(gridVal(g, 'recipient_seating_category_id'))).length > 0 && (
                            <select
                              style={selectStyle}
                              title="A specific section, or anywhere in the area"
                              value={gridVal(g, 'recipient_section_label')}
                              onChange={(e) => setGridVal(g, 'recipient_section_label', e.target.value)}
                            >
                              <option value="">Anywhere</option>
                              {sectionLabelsOf(familyRepId(gridVal(g, 'recipient_seating_category_id'))).map((s) => (
                                <option key={s} value={s}>
                                  Sec {s}
                                </option>
                              ))}
                            </select>
                          )}
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === g.id}
                          title="Same-day recipients from this allotment: one section side by side, or spread individually"
                          onClick={() => toggleCohort(g)}
                        >
                          {g.cohort_together !== false ? 'Together' : 'Spread'}
                        </button>
                      </div>
                    </div>
                    {!externalTicketing && (
                      <div>
                        <span className="meta-label">Pull</span>
                        <select
                          style={selectStyle}
                          title="When recipients' tickets are pulled from sellable inventory"
                          value={gridVal(g, 'hold_timing')}
                          onChange={(e) => setGridVal(g, 'hold_timing', e.target.value)}
                        >
                          <option value="now">Now</option>
                          <option value="on_confirm">On yes</option>
                          <option value="later">Later</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <span className="meta-label">&nbsp;</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}>
                          {expandedId === g.id ? 'Hide' : `Recipients (${kids.length})`}
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === g.id} onClick={() => deleteAllotment(g)}>
                          Delete
                        </button>
                      </div>
                    </div>
                    </div>
                    </td>
                  </tr>
                  {expandedId === g.id && (
                    <tr>
                      <td colSpan={colCount} style={{ background: 'var(--surface-alt)' }}>
                        {kids.length === 0 ? (
                          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0' }}>
                            No recipients yet — they appear here the moment {g.name} enters them in the
                            portal, and each is emailed their own confirm link automatically.
                          </p>
                        ) : (
                          <table className="data-table" style={{ margin: '6px 0' }}>
                            <thead>
                              <tr>
                                <th>Recipient</th>
                                <th>Day</th>
                                <th>Tickets</th>
                                <th>Answer</th>
                                {externalTicketing && <th>Tickets sent</th>}
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {kids.map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    {r.name}
                                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                      {r.email}
                                    </div>
                                  </td>
                                  <td>{r.visit_date ? fmtDay(r.visit_date) : 'Any day'}</td>
                                  <td className="mono">
                                    {r.party_size}
                                    {r.ticket_count > 0 && (
                                      <span style={{ color: 'var(--text-muted)' }}> · {r.ticket_count} minted</span>
                                    )}
                                  </td>
                                  <td>
                                    <span
                                      className={`pill pill-${
                                        r.rsvp_confirmed === 'yes' ? 'confirmed' : r.rsvp_confirmed === 'no' ? 'declined' : 'pending'
                                      }`}
                                    >
                                      {r.rsvp_confirmed || 'no answer yet'}
                                    </span>
                                  </td>
                                  {externalTicketing && (
                                    <td>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        disabled={busyId === r.id}
                                        onClick={() => toggleRecipientTicketsSent(r)}
                                        style={r.tickets_sent_at ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
                                      >
                                        {r.tickets_sent_at ? '✓ Sent' : 'Not sent'}
                                      </button>
                                    </td>
                                  )}
                                  <td className="actions-cell">
                                    {r.rsvp_confirmed !== 'yes' ? (
                                      <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => removeRecipient(r)}>
                                        Remove
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        confirmed — manage on Guest list
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
      </div>
    </>
  )
}