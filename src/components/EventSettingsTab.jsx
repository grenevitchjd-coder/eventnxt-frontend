// eventnxt-frontend: src/components/EventSettingsTab.jsx
//
// "Event settings" — the event's declared OPERATING PROFILE, separate from
// page design. The three choices here (how tickets sell, where sales data
// comes from, how comp tickets deliver) are what the rest of the dashboard
// shapes itself around. Also home to refund policy and the venue map: event
// facts, not page decoration, and both work before the page editor has ever
// been saved (the backend get-or-creates a minimal profile).
//
// Event context (eventId) comes from the Dashboard shell; remounted via
// key={eventId} on switch.

import { useEffect, useState } from 'react'
import { api } from '../api'

const TICKETING_MODES = [
  {
    value: 'native',
    label: 'Sell on EventNXT',
    hint: 'Native checkout via Stripe — ticket types, orders, and refunds all live here.',
  },
  {
    value: 'external',
    label: 'External platform',
    hint: 'Selling on Eventbrite or similar — the public page links out, sales come in by import.',
  },
  {
    value: 'invite_only',
    label: 'Invite only',
    hint: 'No public sales at all — guest list and comps only.',
  },
]

const SALES_SOURCES = [
  { value: 'native', label: 'Native orders', hint: 'Automatic — every EventNXT sale counts itself.' },
  { value: 'csv', label: 'CSV import', hint: 'Import sales from your external platform (in Promos & referrals).' },
  { value: 'api', label: 'Partner API feed', hint: 'Coming soon.', disabled: true },
]

const COMP_DELIVERIES = [
  {
    value: 'rsvp_required',
    label: 'Require RSVP',
    hint: 'Guests confirm first; their ticket follows (capacity permitting).',
  },
  {
    value: 'auto_send',
    label: 'Auto-send',
    hint: 'Ticket goes out the moment a guest is added. (Automated ticket emails arrive with the guest-modes update — the choice is saved now.)',
  },
]

function ChoiceGroup({ title, subtitle, options, value, onChange, saving }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>{subtitle}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={saving || opt.disabled}
              onClick={() => !selected && onChange(opt.value)}
              style={{
                textAlign: 'left',
                background: selected ? 'var(--surface-alt)' : 'var(--bg)',
                border: selected ? '2px solid var(--accent-dark)' : '1px solid var(--border)',
                borderRadius: 10,
                padding: selected ? '10px 12px' : '11px 13px',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                opacity: opt.disabled ? 0.55 : 1,
                fontFamily: 'inherit',
                color: 'var(--text)',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {opt.label}
                {opt.disabled && (
                  <span className="pill pill-pending" style={{ marginLeft: 8, fontSize: 10.5 }}>
                    soon
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{opt.hint}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EventSettingsTab({ onToast, eventId }) {
  const [settings, setSettings] = useState(null)
  const [savingField, setSavingField] = useState(null)

  const [profile, setProfile] = useState(null) // may legitimately be null (no page saved yet)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [refundPolicy, setRefundPolicy] = useState('')
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [uploadingMap, setUploadingMap] = useState(false)

  useEffect(() => {
    api
      .getEventSettings(eventId)
      .then(setSettings)
      .catch((e) => onToast(e.message, true))
    api
      .getEventProfile(eventId)
      .then((p) => {
        setProfile(p)
        setRefundPolicy(p?.refund_policy || '')
        setProfileLoaded(true)
      })
      .catch((e) => onToast(e.message, true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeSetting = async (field, value) => {
    setSavingField(field)
    try {
      const updated = await api.updateEventSettings(eventId, { [field]: value })
      setSettings(updated)
      onToast('Saved')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingField(null)
    }
  }

  const savePolicy = async () => {
    setSavingPolicy(true)
    try {
      const updated = await api.setRefundPolicy(eventId, refundPolicy.trim() || null)
      setProfile(updated)
      onToast('Refund policy saved')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setSavingPolicy(false)
    }
  }

  const handleMapUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (!file) return
    setUploadingMap(true)
    try {
      const updated = await api.uploadVenueMap(eventId, file)
      setProfile(updated)
      onToast('Venue map uploaded')
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setUploadingMap(false)
    }
  }

  const handleMapRemove = async () => {
    if (!window.confirm('Remove the venue map from the public page?')) return
    try {
      const updated = await api.removeVenueMap(eventId)
      setProfile(updated)
      onToast('Venue map removed')
    } catch (err) {
      onToast(err.message, true)
    }
  }

  if (!settings || !profileLoaded) return null

  return (
    <>
      <div className="page-title">Event settings</div>
      <p className="page-subtitle">
        How this event operates. These choices shape the rest of the dashboard — pick what matches how
        you actually run this event, and the tools follow.
      </p>

      <ChoiceGroup
        title="Ticketing mode"
        subtitle="Decides which selling tools appear, and what the public page offers."
        options={TICKETING_MODES}
        value={settings.ticketing_mode}
        onChange={(v) => changeSetting('ticketing_mode', v)}
        saving={savingField === 'ticketing_mode'}
      />

      <ChoiceGroup
        title="Sales data"
        subtitle="Where attendance and sales numbers come from."
        options={SALES_SOURCES}
        value={settings.sales_source}
        onChange={(v) => changeSetting('sales_source', v)}
        saving={savingField === 'sales_source'}
      />

      <ChoiceGroup
        title="Comp ticket delivery"
        subtitle="How guests you add to the guest list receive their tickets."
        options={COMP_DELIVERIES}
        value={settings.comp_delivery}
        onChange={(v) => changeSetting('comp_delivery', v)}
        saving={savingField === 'comp_delivery'}
      />

      <div className="panel">
        <div className="panel-title">Venue map</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
          An image of the venue or seating layout, shown on your public page in every ticketing mode —
          even if tickets sell elsewhere, buyers still get to see the room. (JPG/PNG, roughly 1600px wide
          reads best.)
        </p>
        {profile?.venue_map_url && (
          <img
            src={profile.venue_map_url}
            alt="Venue map"
            style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 10 }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            {uploadingMap ? 'Uploading…' : profile?.venue_map_url ? 'Replace map' : 'Upload map'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleMapUpload} disabled={uploadingMap} />
          </label>
          {profile?.venue_map_url && (
            <button className="btn btn-danger btn-sm" onClick={handleMapRemove}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Refund policy</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
          Shown at checkout and on every buyer&apos;s order page, in your own words — what&apos;s displayed
          at purchase is what protects you in a dispute.
        </p>
        <textarea
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
            resize: 'vertical',
          }}
          placeholder="e.g. Full refunds up to 48 hours before doors. After that, tickets are transferable but non-refundable."
          value={refundPolicy}
          onChange={(e) => setRefundPolicy(e.target.value)}
        />
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={savePolicy} disabled={savingPolicy}>
            {savingPolicy ? 'Saving…' : 'Save policy'}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Team &amp; visibility</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4, marginBottom: 0 }}>
          Who&apos;s in your organization is managed in Events360 — roles set there will control what each
          person sees here (for example, keeping sales and referral data to owners and managers).
          Per-role visibility controls land in an upcoming update.
        </p>
      </div>
    </>
  )
}