import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'

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

  return (
    <div className="public-event-page">
      {profile.banner_photo_url && (
        <div className="public-event-hero" style={{ backgroundImage: `url(${profile.banner_photo_url})` }} />
      )}
      <div className="public-event-content">
        <h1 className="public-event-title">{profile.title}</h1>
        {profile.address && <p className="public-event-address">{profile.address}</p>}
        {profile.description && <p className="public-event-description">{profile.description}</p>}
        {profile.external_ticket_url && (
          <a className="btn btn-primary public-event-cta" href={profile.external_ticket_url} target="_blank" rel="noreferrer">
            Get Tickets
          </a>
        )}
      </div>
    </div>
  )
}