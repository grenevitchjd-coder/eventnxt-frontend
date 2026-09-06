// eventnxt-frontend: src/components/PromosTab.jsx
//
// "Promos" page (Promote group) — SELF promos only: marketing codes the
// org creates for itself (EARLYBIRD, WEEKEND20). No referrer, no reward
// machinery — that's Referral Setup's world. A self promo is a code +
// an optional buyer discount + a tracked share link; its performance
// lives one page over, on Promo tracking.
//
// The API serves both kinds of code from the same endpoint; this page
// filters to guest_id == null and always writes reward fields as null —
// the backend refuses reward terms on a self promo, so a bug here fails
// loudly instead of quietly creating a personless referral deal.
import { useEffect, useState } from 'react'
import { api } from '../api'

const EMPTY_FORM = { code: '', discount_type: '', discount_value: '' }

function discountLabel(code) {
  if (!code.discount_type) return 'None (tracking only)'
  if (code.discount_type === 'percentage') return `${Number(code.discount_value)}% off`
  return `$${Number(code.discount_value)} off`
}

export default function PromosTab({ onToast, eventId }) {
  const [codes, setCodes] = useState(null) // self promos only
  const [eventSlug, setEventSlug] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  const load = () => {
    api
      .listPromoCodes(eventId)
      .then((all) => setCodes(all.filter((c) => c.guest_id === null)))
      .catch((e) => onToast(e.message, true))
    api.getEventProfile(eventId).then((prof) => setEventSlug(prof?.slug || null)).catch(() => {})
  }

  // Dashboard remounts this component (key={eventId}) when the event
  // changes, so loading once on mount is all that's needed.
  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const payloadFrom = (f) => ({
    code: f.code.trim(),
    // A self promo NEVER carries reward terms — see file comment.
    reward_type: null,
    reward_value: null,
    points_rates: null,
    referral_message_draft: null,
    discount_type: f.discount_type || null,
    discount_value: f.discount_type ? Number(f.discount_value) : null,
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await api.createPromoCode(eventId, payloadFrom(form))
      onToast(`Promo "${form.code.trim()}" created`)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (code) => {
    setEditingId(code.id)
    setEditForm({
      code: code.code,
      discount_type: code.discount_type || '',
      discount_value: code.discount_value != null ? String(code.discount_value) : '',
    })
  }

  const handleSaveEdit = async (codeId) => {
    try {
      await api.updatePromoCode(eventId, codeId, payloadFrom(editForm))
      onToast(`"${editForm.code.trim()}" updated`)
      setEditingId(null)
      load()
    } catch (err) {
      onToast(err.message, true)
    }
  }

  const handleDelete = async (code) => {
    if (!window.confirm(`Delete promo "${code.code}"? Buyers will no longer be able to use it.`)) return
    try {
      await api.deletePromoCode(eventId, code.id)
      onToast(`"${code.code}" deleted`)
      load()
    } catch (err) {
      // Codes with attributed sales refuse deletion server-side — their
      // history is the Promo tracking page's whole point.
      onToast(err.message, true)
    }
  }

  const trackedLink = (code) =>
    eventSlug ? `${window.location.origin}/e/${eventSlug}?ref=${encodeURIComponent(code.code)}` : null

  return (
    <div>
      <h2 className="page-title">Promos</h2>
      <p className="page-subtitle">
        Your own marketing codes — early-bird specials, weekend discounts, campaign links. These belong
        to the event, not a person; codes that pay someone a reward live on Referral setup.
      </p>

      {codes !== null && (
        <>
          <div className="panel">
            <div className="panel-title">Add a promo</div>
            <form className="inline-form" onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="sp-code">Code</label>
                <input
                  id="sp-code"
                  required
                  placeholder="EARLYBIRD"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="sp-dtype">Buyer discount</label>
                <select
                  id="sp-dtype"
                  value={form.discount_type}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value, discount_value: '' })}
                >
                  <option value="">None — tracking only</option>
                  <option value="percentage">Percent off</option>
                  <option value="flat_amount">Dollars off</option>
                </select>
              </div>
              {form.discount_type && (
                <div className="field">
                  <label htmlFor="sp-dval">{form.discount_type === 'percentage' ? 'Percent' : 'Dollars'}</label>
                  <input
                    id="sp-dval"
                    required
                    type="number"
                    min={0}
                    max={form.discount_type === 'percentage' ? 100 : undefined}
                    step={form.discount_type === 'percentage' ? 1 : 0.01}
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  />
                </div>
              )}
              <button className="btn btn-secondary" type="submit" disabled={creating}>
                Add promo
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              A discount applies at native checkout. If you sell on an outside platform, set the matching
              discount there — here the code is what your imported sales get matched against.
            </p>
          </div>

          <table className="data-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Tracked link</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">
                    No promos yet.
                  </td>
                </tr>
              ) : (
                codes.map((code) =>
                  editingId === code.id ? (
                    <tr key={code.id}>
                      <td>
                        <input
                          style={{ width: '100%', minWidth: 0 }}
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            value={editForm.discount_type}
                            onChange={(e) =>
                              setEditForm({ ...editForm, discount_type: e.target.value, discount_value: '' })
                            }
                          >
                            <option value="">None</option>
                            <option value="percentage">% off</option>
                            <option value="flat_amount">$ off</option>
                          </select>
                          {editForm.discount_type && (
                            <input
                              type="number"
                              min={0}
                              max={editForm.discount_type === 'percentage' ? 100 : undefined}
                              step={editForm.discount_type === 'percentage' ? 1 : 0.01}
                              style={{ width: 80, minWidth: 0 }}
                              value={editForm.discount_value}
                              onChange={(e) => setEditForm({ ...editForm, discount_value: e.target.value })}
                            />
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Renaming keeps sales history; the old spelling stops working.
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-small" onClick={() => handleSaveEdit(code.id)}>
                          Save
                        </button>{' '}
                        <button className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={code.id}>
                      <td className="mono">{code.code}</td>
                      <td>{discountLabel(code)}</td>
                      <td>
                        {trackedLink(code) ? (
                          <button
                            className="btn btn-ghost btn-small"
                            onClick={() => {
                              navigator.clipboard.writeText(trackedLink(code))
                              onToast('Tracked link copied')
                            }}
                          >
                            Copy link
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Publish the event page first</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-small" onClick={() => startEdit(code)}>
                          Edit
                        </button>{' '}
                        <button className="btn btn-ghost btn-small" onClick={() => handleDelete(code)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}