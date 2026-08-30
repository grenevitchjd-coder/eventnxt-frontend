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
  code: 'AVA10',
  referrer_guest_id: 'g-1',
  reward_type: 'points',
  points_per_ticket: 10,
  points_per_dollar: null,
  flat_per_ticket_cents: null,
  percent_of_sale: null,
  buyer_discount_percent: null,
  buyer_discount_cents: null,
  link_clicks: 3,
  is_active: true,
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
  ['/seating-categories/summary', [
    { category_id: 'cat-1', category_name: 'VIP Front', capacity: 40, box_office: 5, allotted: 10, committed: 8, confirmed_avail: 27, estimated_avail: 25 },
  ]],
  ['/seating-categories', [CAT]],
  ['/guest-types/gt-1/seating-priorities', [{ id: 'sp-1', seating_category_id: 'cat-1', priority: 1 }]],
  ['/guest-types/gt-1/ticket-allotments', [{ date: '2026-09-12', quantity: 2 }]],
  ['/guest-types', [GT]],
  ['/guests', [GUEST, { ...GUEST, id: 'g-2', name: 'Bex Sponsor', email: 'bex@example.com', rsvp_token: 'tok-2', allotment_total: 2, allotment_distributed: 1 }]],
  ['/profile/links', [{ id: 'l-1', kind: 'social', label: 'Instagram', value: 'https://instagram.com/x' }]],
  ['/profile/schedule', []],
  ['/profile/photos', []],
  ['/profile', PROFILE],
  ['/sales-config', { platform: 'eventbrite' }],
  ['/promo-codes/pc-1/redemption-options', []],
  ['/promo-codes/pc-1/bonus-tiers', { tiers: [], inherited: true }],
  ['/promo-codes', [CODE]],
  ['/redemption-tiers', []],
  ['/bonus-tiers', []],
  ['/sales', [{ id: 's-1', promo_code_id: 'pc-1', buyer_name: 'Sam', amount_cents: 5500, quantity: 1, created_at: '2026-08-20T12:00:00Z', source: 'native' }]],
  ['/reward-redemptions', []],
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

  // 4. Click through every tab.
  const TAB_CHECKS = [
    ['Event page', 'Public event page'],
    ['Ticket types', 'General Admission'],
    ['Seating & capacity', 'VIP Front'],
    ['Promos & referrals', 'AVA10'],
    ['Orders', 'Sam Lee'],
    ['Guest list', 'Ava Chen'],
    ['RSVPs', 'Bex Sponsor'],
  ]
  for (const [label, needle] of TAB_CHECKS) {
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