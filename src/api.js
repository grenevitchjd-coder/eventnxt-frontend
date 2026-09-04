// eventnxt-frontend: src/api.js
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
  updateGuestType: (eventId, guestTypeId, payload) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGuestType: (eventId, guestTypeId) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}`, { method: 'DELETE' }),
  listSeatingPriorities: (eventId, guestTypeId) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}/seating-priorities`),
  addSeatingPriority: (eventId, guestTypeId, payload) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}/seating-priorities`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteSeatingPriority: (eventId, guestTypeId, priorityId) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}/seating-priorities/${priorityId}`, {
      method: 'DELETE',
    }),
  listTicketAllotments: (eventId, guestTypeId) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}/ticket-allotments`),
  upsertTicketAllotmentDay: (eventId, guestTypeId, date, quantity) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}/ticket-allotments/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }),
  deleteTicketAllotmentDay: (eventId, guestTypeId, date) =>
    request(`/events/${eventId}/guest-types/${guestTypeId}/ticket-allotments/${date}`, { method: 'DELETE' }),

  // Seating categories (per event)
  listSeatingCategories: (eventId) => request(`/events/${eventId}/seating-categories`),
  createSeatingCategory: (eventId, payload) =>
    request(`/events/${eventId}/seating-categories`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSeatingCategory: (eventId, categoryId, payload) =>
    request(`/events/${eventId}/seating-categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSeatingCategory: (eventId, categoryId) =>
    request(`/events/${eventId}/seating-categories/${categoryId}`, { method: 'DELETE' }),
  syncGuestTickets: (eventId, guestId, payload) =>
    request(`/events/${eventId}/guests/${guestId}/sync-tickets`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  convertTypeToPass: (eventId, ticketTypeId, templateTypeId) =>
    request(`/events/${eventId}/ticket-types/${ticketTypeId}/convert-to-pass`, {
      method: 'POST',
      body: JSON.stringify({ template_type_id: templateTypeId }),
    }),
  createPassFromType: (eventId, ticketTypeId, payload) =>
    request(`/events/${eventId}/ticket-types/${ticketTypeId}/pass`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  fanOutTicketType: (eventId, ticketTypeId) =>
    request(`/events/${eventId}/ticket-types/${ticketTypeId}/fan-out`, { method: 'POST' }),
  listPoolSeats: (eventId, categoryId) =>
    request(`/events/${eventId}/seating-categories/${categoryId}/seats`),
  setGuestSeats: (eventId, guestId, seatIds) =>
    request(`/events/${eventId}/guests/${guestId}/seats`, {
      method: 'PUT',
      body: JSON.stringify({ seat_ids: seatIds }),
    }),
  blockSeats: (eventId, categoryId, seatIds, label) =>
    request(`/events/${eventId}/seating-categories/${categoryId}/seats/block`, {
      method: 'POST',
      body: JSON.stringify({ seat_ids: seatIds, label: label || null }),
    }),
  unblockSeats: (eventId, categoryId, seatIds) =>
    request(`/events/${eventId}/seating-categories/${categoryId}/seats/unblock`, {
      method: 'POST',
      body: JSON.stringify({ seat_ids: seatIds }),
    }),
  replaceZoneSections: (eventId, categoryId, sections) =>
    request(`/events/${eventId}/seating-categories/${categoryId}/sections`, {
      method: 'PUT',
      body: JSON.stringify({ sections }),
    }),

  // Guests (per event)
  listGuests: (eventId) => request(`/events/${eventId}/guests`),
  createGuest: (eventId, payload) =>
    request(`/events/${eventId}/guests`, { method: 'POST', body: JSON.stringify(payload) }),
  updateGuest: (eventId, guestId, payload) =>
    request(`/events/${eventId}/guests/${guestId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  setGuestSentStatus: (eventId, guestId, sent, marker = 'link') =>
    request(`/events/${eventId}/guests/${guestId}/sent-status`, {
      method: 'PATCH',
      body: JSON.stringify({ sent, marker }),
    }),
  getDoorRoster: (eventId) => request(`/events/${eventId}/guests/roster/door`),
  deleteGuest: (eventId, guestId) => request(`/events/${eventId}/guests/${guestId}`, { method: 'DELETE' }),
  sendGuestInvite: (eventId, guestId) =>
    request(`/events/${eventId}/guests/${guestId}/send-invite`, {
      method: 'POST',
      body: JSON.stringify({ rsvp_base_url: window.location.origin }),
    }),
  sendPortalLinksBulk: (eventId) =>
    request(`/events/${eventId}/guests/send-portal-links`, {
      method: 'POST',
      body: JSON.stringify({ rsvp_base_url: window.location.origin }),
    }),
  sendGuestInvitesBulk: (eventId) =>
    request(`/events/${eventId}/guests/send-invites`, {
      method: 'POST',
      body: JSON.stringify({ rsvp_base_url: window.location.origin }),
    }),
  removeGuestWithNotice: (eventId, guestId, note) =>
    request(`/events/${eventId}/guests/${guestId}/remove`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    }),
  // Comp ticketing (guest modes)
  sendGuestTicket: (eventId, guestId) =>
    request(`/events/${eventId}/guests/${guestId}/send-ticket`, { method: 'POST' }),
  listTicketRequests: (eventId) => request(`/events/${eventId}/guests/ticket-requests/all`),
  approveTicketRequest: (eventId, requestId) =>
    request(`/events/${eventId}/guests/ticket-requests/${requestId}/approve`, { method: 'POST' }),
  denyTicketRequest: (eventId, requestId) =>
    request(`/events/${eventId}/guests/ticket-requests/${requestId}/deny`, { method: 'POST' }),
  // Door check-in
  checkInTicket: (eventId, code, day) =>
    request(
      `/events/${eventId}/check-in/${encodeURIComponent(code)}${day ? `?day=${encodeURIComponent(day)}` : ''}`,
      { method: 'POST' }
    ),
  checkInStats: (eventId) => request(`/events/${eventId}/check-in/stats`),

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

  // Seating summary reconciliation
  getSeatingSummary: (eventId) => request(`/events/${eventId}/seating-categories/summary`),

  // Event settings — the operating profile (ticketing mode / sales source /
  // comp delivery). GET infers for events that never chose.
  getEventSettings: (eventId) => request(`/events/${eventId}/settings`),
  updateEventSettings: (eventId, payload) =>
    request(`/events/${eventId}/settings`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Settings-adjacent profile fields (work before the page editor's first save)
  setRefundPolicy: (eventId, refund_policy) =>
    request(`/events/${eventId}/profile/refund-policy`, {
      method: 'PATCH',
      body: JSON.stringify({ refund_policy }),
    }),
  uploadVenueMap: (eventId, file) => uploadFile(`/events/${eventId}/profile/venue-map`, file),
  removeVenueMap: (eventId) => request(`/events/${eventId}/profile/venue-map`, { method: 'DELETE' }),

  // Sales platform config
  getSalesConfig: (eventId) => request(`/events/${eventId}/sales-config`),
  setSalesConfig: (eventId, platform) =>
    request(`/events/${eventId}/sales-config`, { method: 'PUT', body: JSON.stringify({ platform }) }),

  // Promo codes
  listPromoCodes: (eventId) => request(`/events/${eventId}/promo-codes`),
  createPromoCode: (eventId, payload) =>
    request(`/events/${eventId}/promo-codes`, { method: 'POST', body: JSON.stringify(payload) }),
  updatePromoCode: (eventId, codeId, payload) =>
    request(`/events/${eventId}/promo-codes/${codeId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePromoCode: (eventId, codeId) =>
    request(`/events/${eventId}/promo-codes/${codeId}`, { method: 'DELETE' }),

  // Redemption tiers (event-wide shared thresholds)
  listRedemptionTiers: (eventId) => request(`/events/${eventId}/redemption-tiers`),
  createRedemptionTier: (eventId, payload) =>
    request(`/events/${eventId}/redemption-tiers`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteRedemptionTier: (eventId, tierId) =>
    request(`/events/${eventId}/redemption-tiers/${tierId}`, { method: 'DELETE' }),

  // Per-code redemption options (what one code offers at a shared tier)
  listRedemptionOptions: (eventId, codeId) =>
    request(`/events/${eventId}/promo-codes/${codeId}/redemption-options`),
  upsertRedemptionOption: (eventId, codeId, tierId, payload) =>
    request(`/events/${eventId}/promo-codes/${codeId}/redemption-options/${tierId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteRedemptionOption: (eventId, codeId, tierId) =>
    request(`/events/${eventId}/promo-codes/${codeId}/redemption-options/${tierId}`, { method: 'DELETE' }),

  // Event-wide default bonus tiers
  listBonusTiers: (eventId) => request(`/events/${eventId}/bonus-tiers`),
  createBonusTier: (eventId, payload) =>
    request(`/events/${eventId}/bonus-tiers`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteBonusTier: (eventId, tierId) =>
    request(`/events/${eventId}/bonus-tiers/${tierId}`, { method: 'DELETE' }),

  // Per-code bonus tier override
  getPromoCodeBonusTiers: (eventId, codeId) =>
    request(`/events/${eventId}/promo-codes/${codeId}/bonus-tiers`),
  setPromoCodeBonusTiers: (eventId, codeId, tiers) =>
    request(`/events/${eventId}/promo-codes/${codeId}/bonus-tiers`, {
      method: 'PUT',
      body: JSON.stringify({ tiers }),
    }),
  clearPromoCodeBonusTiers: (eventId, codeId) =>
    request(`/events/${eventId}/promo-codes/${codeId}/bonus-tiers`, { method: 'DELETE' }),

  // Sales
  listSales: (eventId) => request(`/events/${eventId}/sales`),
  importSales: (eventId, rows) =>
    request(`/events/${eventId}/sales/import`, { method: 'POST', body: JSON.stringify({ rows }) }),

  // Organizer payout queue
  listRewardRedemptions: (eventId) => request(`/events/${eventId}/reward-redemptions`),
  markRedemptionPaid: (eventId, redemptionId) =>
    request(`/events/${eventId}/reward-redemptions/${redemptionId}/mark-paid`, { method: 'PATCH' }),
  // Native ticket sales — ticket types (organizer-facing; the PUBLIC
  // picker/checkout/order endpoints are unauthenticated and called with
  // plain fetch from the public pages, not through this client)
  listTicketTypes: (eventId) => request(`/events/${eventId}/ticket-types`),
  createTicketType: (eventId, payload) =>
    request(`/events/${eventId}/ticket-types`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTicketType: (eventId, ticketTypeId, payload) =>
    request(`/events/${eventId}/ticket-types/${ticketTypeId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTicketType: (eventId, ticketTypeId) =>
    request(`/events/${eventId}/ticket-types/${ticketTypeId}`, { method: 'DELETE' }),

  // Orders admin
  listOrders: (eventId, search = '') =>
    request(`/events/${eventId}/orders${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  refundOrder: (eventId, orderId) =>
    request(`/events/${eventId}/orders/${orderId}/refund`, { method: 'POST' }),

}