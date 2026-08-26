const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'
const EVENTS360_FRONTEND_URL = import.meta.env.VITE_EVENTS360_FRONTEND_URL || 'http://localhost:5173'
const TOKEN_KEY = 'eventnxt_token'

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}
export function isAuthenticated() {
  return !!getToken()
}

async function request(path, options = {}, { allow404 } = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (allow404 && res.status === 404) return null

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data.detail) detail = data.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}

async function uploadFile(path, file) {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`
    try {
      const data = await res.json()
      if (data.detail) detail = data.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  return res.json()
}

export function getLoginUrl() {
  return `${API_URL}/auth/login`
}

// Where "+ New Event" sends the organizer — Events360's own org dashboard,
// where events actually get created. EventNXT deliberately doesn't create
// events itself: that's tied to future per-event billing, which belongs
// wherever billing lives (Events360), same reasoning as the entitlements
// system. They're already logged in via SSO, so this is a straight
// redirect, not a second login.
export function getNewEventUrl() {
  return `${EVENTS360_FRONTEND_URL}/org`
}

export const api = {
  getMe: () => request('/me'),

  // Events (my org's)
  listEvents: () => request('/events'),

  // Guest types (per event)
  listGuestTypes: (eventId) => request(`/events/${eventId}/guest-types`),
  createGuestType: (eventId, payload) =>
    request(`/events/${eventId}/guest-types`, { method: 'POST', body: JSON.stringify(payload) }),

  // Seating categories (per event)
  listSeatingCategories: (eventId) => request(`/events/${eventId}/seating-categories`),
  createSeatingCategory: (eventId, payload) =>
    request(`/events/${eventId}/seating-categories`, { method: 'POST', body: JSON.stringify(payload) }),

  // Guests (per event)
  listGuests: (eventId) => request(`/events/${eventId}/guests`),
  createGuest: (eventId, payload) =>
    request(`/events/${eventId}/guests`, { method: 'POST', body: JSON.stringify(payload) }),

  // Event profile (public-facing content + shareable page)
  getEventProfile: (eventId) => request(`/events/${eventId}/profile`, {}, { allow404: true }),
  saveEventProfile: (eventId, payload) =>
    request(`/events/${eventId}/profile`, { method: 'PUT', body: JSON.stringify(payload) }),
  publishEventProfile: (eventId) => request(`/events/${eventId}/profile/publish`, { method: 'POST' }),
  unpublishEventProfile: (eventId) => request(`/events/${eventId}/profile/unpublish`, { method: 'POST' }),
  uploadBannerPhoto: (eventId, file) => uploadFile(`/events/${eventId}/profile/banner-photo`, file),
  uploadLogo: (eventId, file) => uploadFile(`/events/${eventId}/profile/logo`, file),

  // Contact / social links
  listProfileLinks: (eventId) => request(`/events/${eventId}/profile/links`),
  createProfileLink: (eventId, payload) =>
    request(`/events/${eventId}/profile/links`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteProfileLink: (eventId, linkId) =>
    request(`/events/${eventId}/profile/links/${linkId}`, { method: 'DELETE' }),

  // Custom public schedule
  listScheduleItems: (eventId) => request(`/events/${eventId}/profile/schedule`),
  createScheduleItem: (eventId, payload) =>
    request(`/events/${eventId}/profile/schedule`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteScheduleItem: (eventId, itemId) =>
    request(`/events/${eventId}/profile/schedule/${itemId}`, { method: 'DELETE' }),

  // Gallery photos (capped at 3 server-side)
  listGalleryPhotos: (eventId) => request(`/events/${eventId}/profile/photos`),
  uploadGalleryPhoto: (eventId, file) => uploadFile(`/events/${eventId}/profile/photos`, file),
  deleteGalleryPhoto: (eventId, photoId) =>
    request(`/events/${eventId}/profile/photos/${photoId}`, { method: 'DELETE' }),
}