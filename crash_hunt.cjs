// eventnxt-frontend/crash_hunt.cjs
//
// Runtime crash harness (jsdom) — mounts the REAL Dashboard shell with
// realistic API fixtures and clicks through every tab, so Rules-of-Hooks
// violations, undefined-field access, and blank-page crashes surface here
// instead of in production. Run after any UI change to data-driven pages:
//
//   node crash_hunt.cjs
//
// Requires devDeps: jsdom, esbuild (esbuild ships inside vite already).
const path = require('path')
const { JSDOM } = require('jsdom')
const esbuild = require('esbuild')

// ---------- realistic API fixtures ----------
const EV1 = { id: 'ev-1', name: 'Spring Gala 2026', status: 'active' }
const EV2 = { id: 'ev-2', name: 'Fall Runway', status: 'draft' }
const CAT = { id: 'cat-1', name: 'VIP Front', capacity: 40, sales_grain: 'ga' }
const GT = {
  id: 'gt-1',
  name: 'Model',
  default_seating_category_id: 'cat-1',
  ticket_allotment: 2,
  perks: 'Gift bag',
  comments: null,
}
const GUEST = {
  id: 'g-1',
  is_referrer_only: false,
  name: 'Ava Chen',
  email: 'ava@example.com',
  guest_type_id: 'gt-1',
  seating_category_id: 'cat-1',
  allocation_status: 'confirmed',
  rsvp_confirmed: 'yes',
  rsvp_token: 'tok-1',
  party_size: 1,
  visit_date: '2026-09-12',
  ticket_allotment: null,
  ticket_allotment_overridden: false,
  invite_sent: true,
  perks: null,
  comments: null,
  distributed_by_guest_id: null,
  allotment_total: 0,
  allotment_distributed: 0,
}
const TT = {
  id: 'tt-1',
  name: 'General Admission',
  description: null,
  price_cents: 5500,
  quantity: 100,
  sold: 12,
  held: 2,
  available: 86,
  max_per_order: 10,
  seating_category_id: null,
  sales_start: null,
  sales_end: null,
  is_active: true,
  sort_order: 0,
}
const ORDER = {
  id: 'o-1',
  buyer_name: 'Sam Lee',
  buyer_email: 'sam@example.com',
  status: 'paid',
  total_cents: 5500,
  subtotal_cents: 5500,
  discount_cents: 0,
  created_at: '2026-08-20T12:00:00Z',
  order_token: 'ordtok-1',
  items: [{ id: 'oi-1', ticket_type_name: 'General Admission', quantity: 1, unit_price_cents: 5500 }],
}
const CODE = {
  id: 'pc-1',
  event_id: 'ev-1',
  guest_id: 'g-1',
  code: 'AVA10',
  reward_type: 'flat_amount',
  reward_value: 2,
  points_rates: [],
  referral_message_draft: null,
  discount_type: 'percentage',
  discount_value: 10,
  link_clicks: 3,
  created_at: '2026-08-20T12:00:00Z',
  sale_count: 1,
  total_reward: 2,
  points_available: null,
  bonus_awards: [],
  bonus_tiers_overridden: false,
}
// A SELF promo (0042): no referrer, no reward — the Promos and Promo
// tracking pages filter to exactly these.
const SELF_PROMO = {
  ...CODE,
  id: 'pc-2',
  guest_id: null,
  code: 'EARLYBIRD',
  reward_type: null,
  reward_value: null,
  discount_type: 'percentage',
  discount_value: 20,
  link_clicks: 7,
  sale_count: 2,
  total_reward: null,
}
const PROFILE = {
  id: 'p-1',
  title: 'Spring Gala 2026',
  description: 'A night of fashion.',
  address: '1 Main St',
  external_ticket_url: '',
  slug: 'spring-gala',
  font_family: '',
  about_us: '',
  logo_url: null,
  logo_position: 'hidden',
  banner_url: null,
  banner_focus: 'center',
  is_published: false,
  refund_policy: null,
  cached_start_date: '2026-09-12',
  cached_end_date: '2026-09-14',
}

// URL-suffix -> JSON. Order matters: first match wins.
const ROUTES = [
  ['/me', { id: 'u-1', name: 'Joshua', role: 'owner' }],
  ['/seating-categories/section-summary', [
    { category_id: 'cat-1', category_name: 'VIP Front', sales_grain: 'ga', capacity: 40,
      sections: [{ section_label: null, capacity: 40, bought: 5, given: 8, left: 27 }] },
  ]],
  ['/seating-categories/summary', [
    { category_id: 'cat-1', category_name: 'VIP Front', capacity: 40, box_office: 5, allotted: 10, committed: 8, confirmed_avail: 27, estimated_avail: 25 },
  ]],
  ['/seating-categories', [CAT]],
  ['/guest-types/gt-1/seating-priorities', [{ id: 'sp-1', seating_category_id: 'cat-1', priority: 1 }]],
  ['/guest-types/gt-1/ticket-allotments', [{ date: '2026-09-12', quantity: 2 }]],
  ['/guest-types', [GT]],
  ['/guests/roster/door', [
    { id: 'g-1', name: 'Ava Chen', email: 'ava@example.com', guest_type_id: 'gt-1',
      allocation_status: 'confirmed', rsvp_confirmed: 'yes', party_size: 1, visit_date: '2026-09-12',
      allocated_by_guest_id: null, checked_in_at: null, tickets_sent_at: null,
      tickets: [{ code: 'TKT-AVA-1', valid_date: '2026-09-12', status: 'issued', checked_in_at: null, seat_label: null }] },
  ]],
  ['/guests', [{ ...GUEST, id: 'g-3', name: 'Ivy Influencer', email: 'ivy@example.com', rsvp_token: 'tok-3', guest_type_id: null, is_referrer_only: true },
    GUEST, { ...GUEST, id: 'g-2', name: 'Bex Sponsor', email: 'bex@example.com', rsvp_token: 'tok-2', guest_mode: 'distribute', effective_mode: 'distribute', allotment_total: 2, allotment_distributed: 1 }]],
  ['/profile/links', [{ id: 'l-1', kind: 'social', label: 'Instagram', value: 'https://instagram.com/x' }]],
  ['/profile/schedule', []],
  ['/profile/photos', []],
  ['/profile', PROFILE],
  ['/settings', { event_id: 'ev-1', ticketing_mode: 'native', sales_source: 'native', comp_delivery: 'rsvp_required',
    ticket_span: 'single_day', pricing_mode: 'uniform', seating_mode: 'uniform',
    first_day: '2026-09-12', last_day: '2026-09-12', updated_at: null }],
  ['/sales-config', { platform: 'eventbrite', available_platforms: [
    { value: 'eventbrite', label: 'Eventbrite', has_live_api: false },
    { value: 'custom_csv', label: 'Custom CSV', has_live_api: false },
  ] }],
  ['/promo-codes/pc-1/redemption-options', []],
  ['/promo-codes/pc-1/bonus-tiers', { tiers: [], inherited: true }],
  ['/promo-stats', [
    { id: 'pc-2', code: 'EARLYBIRD', guest_id: null, referrer_name: null, discount_type: 'percentage',
      discount_value: 20, link_clicks: 7, sale_count: 2, tickets_sold: 5, amount_sold: 220, rows_missing_amount: 0 },
    { id: 'pc-1', code: 'AVA10', guest_id: 'g-1', referrer_name: 'Ava Chen', discount_type: 'percentage',
      discount_value: 10, link_clicks: 3, sale_count: 1, tickets_sold: 1, amount_sold: 55, rows_missing_amount: 0, last_sale_at: '2026-08-21T09:30:00Z' },
  ]],
  ['/promo-codes', [CODE, SELF_PROMO]],
  ['/redemption-tiers', [{ id: 'rt-1', points_required: 100, label: 'Bronze' }]],
  ['/bonus-tiers', []],
  ['/sales', [{ id: 's-1', event_id: 'ev-1', promo_code_id: 'pc-1', buyer_name: 'Sam Lee', buyer_email: 'sam@example.com', amount: 55, ticket_type: 'General Admission', quantity: 1, sale_date: '2026-08-20', external_transaction_id: null, source: 'native', computed_reward: 2, imported_at: '2026-08-20T12:00:00Z' },
    { id: 's-2', event_id: 'ev-1', promo_code_id: null, buyer_name: 'Organic Olive', buyer_email: 'olive@example.com', amount: 55, ticket_type: 'General Admission', quantity: 1, sale_date: '2026-08-22', external_transaction_id: null, source: 'native', computed_reward: null, imported_at: '2026-08-22T12:00:00Z' }]],
  ['/reward-redemptions', [{ id: 'rr-1', promo_code_id: 'pc-1', redemption_tier_id: 'rt-1', choice: 'cash',
    points_spent: 100, cash_value: 25, ticket_value: null, created_guest_id: null, payout_status: 'pending',
    redeemed_at: '2026-08-21T12:00:00Z', promo_code: 'AVA10', referrer_name: 'Ava Chen' }]],
  ['/ticket-types', [TT]],
  ['/orders', [ORDER]],
  ['/events', [EV1, EV2]],
]

function fixtureFor(url) {
  const clean = url.split('?')[0]
  for (const [suffix, data] of ROUTES) {
    if (clean.endsWith(suffix) || clean.includes(suffix + '/')) return data
  }
  return []
}

async function main() {
  // 1. Bundle the app for node with esbuild (define import.meta.env).
  const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/pages/Dashboard.jsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.css': 'empty' },
    define: {
      'import.meta.env.VITE_API_URL': '"http://test.local"',
      'import.meta.env.VITE_EVENTS360_FRONTEND_URL': '"http://test.local"',
      'process.env.NODE_ENV': '"development"',
    },
    external: ['react', 'react-dom', 'react-router-dom'],
  })
  const code = bundle.outputFiles[0].text

  // 2. jsdom world.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://test.local/',
    pretendToBeVisual: true,
  })
  global.window = dom.window
  global.document = dom.window.document
  global.navigator = dom.window.navigator
  global.sessionStorage = dom.window.sessionStorage
  global.localStorage = dom.window.localStorage
  global.HTMLElement = dom.window.HTMLElement
  global.Event = dom.window.Event
  global.CustomEvent = dom.window.CustomEvent
  dom.window.sessionStorage.setItem('eventnxt_token', 'test-token')

  const fetchCalls = []
  global.fetch = dom.window.fetch = async (url, opts = {}) => {
    fetchCalls.push(`${opts.method || 'GET'} ${url}`)
    const data = fixtureFor(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(data)),
      text: async () => JSON.stringify(data),
    }
  }

  const failures = []
  const realErr = console.error
  console.error = (...args) => {
    const msg = args.map(String).join(' ')
    // React warnings about act() are noise here; hooks/render errors are not.
    if (!/not wrapped in act|ReactDOMTestUtils/.test(msg)) failures.push(msg)
    realErr(...args)
  }
  dom.window.addEventListener('error', (e) => failures.push(`window.onerror: ${e.message}`))

  // 3. Evaluate the bundle and mount.
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', 'window', 'document', code)(
    mod,
    mod.exports,
    require,
    dom.window,
    dom.window.document
  )
  const Dashboard = mod.exports.default
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { MemoryRouter } = require('react-router-dom')

  global.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(dom.window.document.getElementById('root'))
  root.render(React.createElement(MemoryRouter, null, React.createElement(Dashboard)))

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  await sleep(150)

  const bodyText = () => dom.window.document.body.textContent || ''
  const expectText = (label, needle) => {
    if (!bodyText().includes(needle)) failures.push(`[${label}] expected to see "${needle}"`)
    else console.log(`  ok [${label}] shows "${needle}"`)
  }

  // Shell basics
  expectText('shell', 'Current event')
  expectText('shell', 'Spring Gala 2026')
  expectText('shell', 'Set up')
  expectText('shell', 'Promote')
  expectText('shell', 'Manage')

  // 4. Click through every tab. Groups are collapsed by default, so pop
  // every group toggle open first — a nav-item inside a closed group
  // isn't in the DOM at all.
  const openAllGroups = () => {
    for (const t of dom.window.document.querySelectorAll('button.nav-group-toggle')) {
      if (!t.className.includes('open')) t.click()
    }
  }
  openAllGroups()
  await sleep(100)

  const TAB_CHECKS = [
    ['Event settings', 'Ticketing mode'],
    ['Seats Setup', 'General Admission'],
    ['Event page', 'Public event page'],
    ['Promos', 'EARLYBIRD'],
    ['Promo tracking', 'No promo code'],
    ['Promo tracking', 'Switch your sales data source'],
    ['Referral setup', 'Ivy Influencer'],
    ['Referral payouts', 'AVA10'],
    ['Orders', 'Sam Lee'],
    ['Invites', 'Ava Chen'],
    ['Allotments', 'Bex Sponsor'],
    ['Guest list', '1 ticket'],
    ['Seating summary', 'VIP Front'],
    ['Seating summary', 'Switch your sales data source'],
  ]
  for (const [label, needle] of TAB_CHECKS) {
    openAllGroups()
    await sleep(50)
    const btn = [...dom.window.document.querySelectorAll('button.nav-item')].find(
      (b) => b.textContent.trim() === label
    )
    if (!btn) {
      failures.push(`nav button not found: ${label}`)
      continue
    }
    btn.click()
    await sleep(150)
    expectText(label, needle)
  }

  // 5. Switch events via the global picker — every tab must survive remount.
  const picker = dom.window.document.getElementById('global-event-picker')
  picker.value = 'ev-2'
  picker.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await sleep(150)
  if (dom.window.sessionStorage.getItem('eventnxt_last_event_id') !== 'ev-2')
    failures.push('event switch did not persist to sessionStorage')
  else console.log('  ok [switch] event switch persisted')

  console.error = realErr
  if (failures.length) {
    console.log('\nCRASH HUNT FAILURES:')
    for (const f of failures) console.log('  ✗', f)
    process.exit(1)
  }
  console.log('\ncrash hunt: all clear')
}

main().catch((e) => {
  console.error('harness crashed:', e)
  process.exit(1)
})