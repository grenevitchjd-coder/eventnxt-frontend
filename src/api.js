const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:9000'
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

export function getLoginUrl() {
  return `${API_URL}/auth/login`
}

export const api = {
  getMe: () => request('/me'),

  // Events (my org's)
  listEvents: () => request('/events'),

  // Guest types (org-level)
  listGuestTypes: () => request('/guest-types'),
  createGuestType: (payload) => request('/guest-types', { method: 'POST', body: JSON.stringify(payload) }),

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
  uploadBannerPhoto: async (eventId, file) => {
    const token = getToken()
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_URL}/events/${eventId}/profile/banner-photo`, {
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
  },
}