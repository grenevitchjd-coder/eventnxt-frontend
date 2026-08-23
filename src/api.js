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

async function request(path, options = {}) {
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

  // Guest types (org-level)
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
}