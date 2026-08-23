import { useEffect, useState } from 'react'
import { api } from '../api'

export default function GuestTypesTab({ onToast }) {
  const [types, setTypes] = useState(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => {
    api
      .listGuestTypes()
      .then(setTypes)
      .catch((e) => onToast(e.message, true))
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await api.createGuestType({ name })
      onToast(`"${name}" added`)
      setName('')
      load()
    } catch (err) {
      onToast(err.message, true)
    } finally {
      setCreating(false)
    }
  }

  if (types === null) return null

  return (
    <>
      <div className="page-title">Guest types</div>
      <p className="page-subtitle">
        Reusable labels across every event your org runs — Celebrity, Sponsor, Volunteer, Model, etc.
      </p>

      <div className="panel">
        <div className="panel-title">Add a guest type</div>
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="gt-name">Name</label>
            <input id="gt-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={creating}>
            Add
          </button>
        </form>
      </div>

      {types.length === 0 ? (
        <div className="data-table">
          <div className="empty-state">No guest types yet — add your first one above.</div>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}