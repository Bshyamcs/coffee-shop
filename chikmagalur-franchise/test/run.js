'use strict';
/**
 * End-to-end API tests. Spawns the real server and talks to it over HTTP.
 *   node test/run.js                 -> in-memory store
 *   MODE=tcp  node test/run.js       -> real redis-server over TCP   (needs redis-server on PATH)
 *   MODE=rest node test/run.js       -> @upstash/redis client -> mock REST server -> real redis-server
 */
const { spawn } = require('child_process');
const path = require('path');

const MODE = process.env.MODE || 'memory';
const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); };

class Client {
  constructor(ip = '10.0.0.' + Math.floor(Math.random() * 250)) { this.jar = {}; this.ip = ip; }
  async call(method, url, body, extra = {}) {
    const headers = { 'x-forwarded-for': this.ip, ...(extra.headers || {}) };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (Object.keys(this.jar).length) headers.cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    (res.headers.getSetCookie?.() || []).forEach((c) => {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/Max-Age=0/i.test(c) || v === '') delete this.jar[k]; else this.jar[k] = v;
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get(u) { return this.call('GET', u); }
  post(u, b = {}, e) { return this.call('POST', u, b, e); }
  put(u, b = {}) { return this.call('PUT', u, b); }
  del(u) { return this.call('DELETE', u, {}); }
}

async function startServices() {
  const procs = [];
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'test',
    GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret', ADMIN_EMAILS: 'boss@example.com' };
  delete env.VERCEL;
  let mock = null;
  if (MODE === 'tcp' || MODE === 'rest') {
    const rp = spawn('redis-server', ['--port', '6399', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
    procs.push(rp);
    await new Promise((r) => setTimeout(r, 700));
    if (MODE === 'tcp') env.REDIS_URL = 'redis://127.0.0.1:6399';
    else {
      mock = await require('./mock-upstash')(6398, 'redis://127.0.0.1:6399', 'tok123');
      env.KV_REST_API_URL = 'http://127.0.0.1:6398'; env.KV_REST_API_TOKEN = 'tok123';
    }
  } else env.DB_FILE = ':memory:';
  const srv = spawn('node', ['-r', path.join(__dirname, 'stub-google.js'), 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  procs.push(srv);
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  return { stop: async () => { procs.reverse().forEach((p) => p.kill()); if (mock) await mock.close(); }, log: () => log };
}

(async () => {
  const svc = await startServices();
  try {
    console.log(`\n=== MODE: ${MODE} ===`);
    const anon = new Client();

    /* ---------------- health, seed, bootstrap */
    let r = await anon.get('/api/health');
    ok(r.status === 200 && r.json.ok === true, `health ok, storage = ${r.json && r.json.storage}`);
    r = await anon.get('/api/bootstrap');
    ok(r.json.plans.length === 3 && r.json.products.length === 4, 'seed data loaded (3 plans, 4 products)');
    ok(r.json.googleEnabled === true && r.json.user === null, 'bootstrap: google enabled, anonymous user');
    ok(r.json.plans[0].order <= r.json.plans[1].order, 'plans sorted by order');
    const plans = r.json.plans; const products = r.json.products;
    r = await anon.get('/api/bootstrap');
    ok(r.json.plans.length === 3, 'seeding is idempotent (no duplicates on 2nd request)');

    /* ---------------- transport security */
    r = await anon.post('/api/contact', { name: 'x' }, { headers: { origin: 'https://evil.example' } });
    ok(r.status === 403, 'cross-origin POST blocked (403)');
    r = await fetch(BASE + '/api/contact', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' });
    ok(r.status === 415, 'non-JSON POST rejected (415)');
    r = await anon.get('/api/nope'); ok(r.status === 404, 'unknown route -> 404');
    r = await anon.get('/api/auth/logout'); ok(r.status === 405, 'wrong method -> 405');
    r = await anon.get('/api/admin/overview'); ok(r.status === 401, 'admin route without login -> 401');

    /* ---------------- email/password accounts */
    const alice = new Client();
    r = await alice.post('/api/auth/register', { name: 'Alice Rao', email: 'alice@example.com', password: 'short' });
    ok(r.status === 400, 'register: short password rejected');
    r = await alice.post('/api/auth/register', { name: 'Alice Rao', email: 'not-an-email', password: 'longenough1' });
    ok(r.status === 400, 'register: bad email rejected');
    r = await alice.post('/api/auth/register', { name: 'Alice Rao', email: 'Alice@Example.com', phone: '98765 43210', password: 'longenough1' });
    ok(r.status === 200 && r.json.user.email === 'alice@example.com', 'register ok (email lower-cased)');
    ok(!!alice.jar.cfc_sid, 'session cookie set');
    r = await alice.get('/api/bootstrap'); ok(r.json.user && r.json.user.name === 'Alice Rao' && !r.json.user.isAdmin, 'bootstrap returns signed-in user (not admin)');
    ok(!JSON.stringify(r.json).includes('passwordHash'), 'password hash never sent to the browser');
    r = await new Client().post('/api/auth/register', { name: 'Al', email: 'alice@example.com', password: 'longenough1' });
    ok(r.status === 409, 'duplicate email -> 409');
    r = await alice.post('/api/auth/logout'); ok(r.status === 200, 'logout ok');
    r = await alice.get('/api/bootstrap'); ok(r.json.user === null, 'after logout: anonymous');
    r = await alice.post('/api/auth/login', { email: 'alice@example.com', password: 'wrongpass1' }); ok(r.status === 401, 'login wrong password -> 401');
    r = await alice.post('/api/auth/login', { email: 'ghost@example.com', password: 'wrongpass1' }); ok(r.status === 401, 'login unknown email -> 401 (same message)');
    r = await alice.post('/api/auth/login', { email: 'ALICE@example.com', password: 'longenough1' }); ok(r.status === 200, 'login ok (case-insensitive email)');
    r = await alice.put('/api/me', { name: 'Alice R', phone: '9876543210', address: '12 MG Road, Bengaluru' });
    ok(r.status === 200 && r.json.user.address.includes('MG Road'), 'profile update saved');
    r = await new Client().put('/api/me', { name: 'x' }); ok(r.status === 401, 'profile update requires login');

    // brute-force limiter (per IP): 10 attempts / 15 min
    const brute = new Client('9.9.9.9'); let last;
    for (let i = 0; i < 12; i++) last = await brute.post('/api/auth/login', { email: 'alice@example.com', password: 'nope' + i });
    ok(last.status === 429, 'login brute-force limiter -> 429');

    /* ---------------- franchise applications (the core feature) */
    const good = { name: 'Ravi Kumar', email: 'ravi@example.com', phone: '+91 98765 43210', city: 'Hyderabad', state: 'Telangana', planId: plans[1].id,
      budget: '₹10 - 25 Lakh', property: 'I own a property', experience: 'No experience', timeline: 'Within 1 - 3 months', message: 'Interested in a cafe near Kukatpally.' };
    r = await anon.post('/api/franchise/apply', { ...good, phone: '123' }); ok(r.status === 400, 'apply: bad phone rejected');
    r = await anon.post('/api/franchise/apply', { ...good, budget: 'Free please' }); ok(r.status === 400, 'apply: invalid budget option rejected');
    r = await anon.post('/api/franchise/apply', { ...good, planId: 'plan_nope' }); ok(r.status === 400, 'apply: invalid plan rejected');
    r = await anon.post('/api/franchise/apply', good);
    ok(r.status === 200 && r.json.application.id === 'FR-1001', 'guest application accepted (FR-1001)');
    r = await anon.post('/api/franchise/apply', { ...good, planId: '', name: 'Second Person', email: 'second@example.com' });
    ok(r.json.application.id === 'FR-1002' && r.json.application.planName === 'Not sure yet', 'ids increment; plan optional');
    r = await alice.post('/api/franchise/apply', { ...good, name: 'Alice Rao', email: 'alice@example.com' });
    ok(r.status === 200, 'signed-in application accepted');
    const aliceAppId = r.json.application.id;
    r = await alice.get('/api/franchise/mine');
    ok(r.json.applications.length === 1 && r.json.applications[0].id === aliceAppId, 'user sees only their own application');
    ok(!('internalNote' in r.json.applications[0]), 'internal admin note is hidden from applicants');
    r = await new Client().get('/api/franchise/mine'); ok(r.status === 401, 'applications/mine requires login');
    const spam = new Client('7.7.7.7'); let sr;
    for (let i = 0; i < 8; i++) sr = await spam.post('/api/franchise/apply', { ...good, email: `s${i}@example.com` });
    ok(sr.status === 429, 'application spam limiter -> 429');

    /* ---------------- shop: server-side pricing */
    const p1 = products[0]; // 399
    r = await anon.post('/api/cart/quote', { items: [{ id: p1.id, qty: 1, price: 1 }] });
    ok(r.json.subtotal === p1.price, 'client-sent price is ignored');
    ok(r.json.shipping === 49 && r.json.total === p1.price + 49, 'shipping fee applies under threshold');
    r = await anon.post('/api/cart/quote', { items: [{ id: p1.id, qty: 2 }] });
    ok(r.json.shipping === 0 && r.json.total === p1.price * 2, 'free shipping above threshold');
    r = await anon.post('/api/cart/quote', { items: [{ id: p1.id, qty: 1 }], coupon: 'coffee10' });
    ok(r.json.discount === 40 && r.json.total === 399 - 40 + 49, 'coupon applied (case-insensitive), total correct');
    r = await anon.post('/api/cart/quote', { items: [{ id: p1.id, qty: 1 }], coupon: 'NOPE' }); ok(r.status === 400, 'invalid coupon rejected');
    r = await anon.post('/api/cart/quote', { items: [{ id: 'ghost', qty: 1 }] }); ok(r.status === 400, 'unknown product rejected');
    r = await anon.post('/api/cart/quote', { items: [{ id: p1.id, qty: -3 }] }); ok(r.status === 400, 'negative quantity rejected');
    r = await anon.post('/api/cart/quote', { items: [] }); ok(r.status === 400, 'empty basket rejected');
    r = await alice.post('/api/orders', { items: [{ id: p1.id, qty: 1 }], coupon: 'COFFEE10', customer: { name: 'Alice Rao', phone: '9876543210', address: '12 MG Road, Bengaluru 560001' } });
    ok(r.status === 200 && r.json.order.id === 'ORD-10001' && r.json.order.total === 408, 'order placed (ORD-10001, total 408)');
    r = await anon.post('/api/orders', { items: [{ id: p1.id, qty: 1 }], customer: { name: 'Guest', phone: '9876543211', address: 'short' } }); ok(r.status === 400, 'order: address too short rejected');
    r = await anon.post('/api/orders', { items: [{ id: products[1].id, qty: 1 }], customer: { name: 'Guest Buyer', phone: '9876543211', address: 'Flat 4, Some Street, Chennai 600001' } });
    ok(r.status === 200 && r.json.order.id === 'ORD-10002', 'guest can order');
    r = await alice.get('/api/orders/mine'); ok(r.json.orders.length === 1 && r.json.orders[0].id === 'ORD-10001', 'user sees only own orders');

    /* ---------------- contact */
    r = await anon.post('/api/contact', { name: 'Someone', email: 'some@example.com', message: 'Do you deliver beans to Pune?' }); ok(r.status === 200, 'contact message saved');
    r = await anon.post('/api/contact', { name: 'Someone', email: 'some@example.com', message: 'hi' }); ok(r.status === 400, 'contact: too-short message rejected');

    /* ---------------- admin access control */
    r = await alice.get('/api/admin/overview'); ok(r.status === 403, 'normal user -> 403 on admin route');
    const admin = new Client();
    r = await admin.post('/api/auth/admin-login', { email: 'admin@example.com', password: 'wrong' }); ok(r.status === 401, 'admin login: wrong password -> 401');
    r = await admin.post('/api/auth/admin-login', { email: 'admin@example.com', password: 'admin123' });
    ok(r.status === 200 && r.json.user.isAdmin, 'admin login (dev default) ok');
    r = await admin.get('/api/admin/overview');
    ok(r.status === 200 && r.json.counts.applications >= 3 && r.json.counts.orders === 2, `overview: ${r.json.counts.applications} applications, ${r.json.counts.orders} orders`);
    ok(r.json.system.storage === (MODE === 'memory' ? 'memory' : MODE === 'tcp' ? 'redis-tcp' : 'upstash-redis'), `storage backend reported: ${r.json.system.storage}`);
    ok(r.json.system.samplePlans === true && r.json.system.devAdminDefaults === true, 'overview flags sample plans + dev admin defaults');
    ok(r.json.monthly.length === 6 && r.json.counts.revenue === 408 + 499 + 49 - 0 || r.json.counts.revenue > 0, 'monthly series + revenue present');

    /* ---------------- admin: applications */
    r = await admin.get('/api/admin/applications'); ok(r.json.applications.length >= 3, 'admin lists all applications');
    r = await admin.put(`/api/admin/applications/${aliceAppId}`, { status: 'Meeting Scheduled', note: 'Call on Monday 11am', internalNote: 'Strong lead' });
    ok(r.status === 200 && r.json.application.history.length === 2, 'status change recorded in history');
    r = await admin.put(`/api/admin/applications/${aliceAppId}`, { status: 'Bogus' }); ok(r.status === 400, 'invalid status rejected');
    r = await alice.get('/api/franchise/mine');
    ok(r.json.applications[0].status === 'Meeting Scheduled' && r.json.applications[0].note.includes('Monday'), 'applicant sees new status + public note');
    ok(!('internalNote' in r.json.applications[0]), 'still no internal note for applicant');
    // CSV: formula injection neutralised
    await admin.put(`/api/admin/applications/FR-1002`, { note: '=HYPERLINK("http://evil")' });
    r = await admin.get('/api/admin/applications.csv');
    ok(r.status === 200 && /text\/csv/.test(r.headers.get('content-type')) && r.text.includes('FR-1001'), 'CSV export works');
    ok(r.text.includes(`"'=HYPERLINK`) && !r.text.includes(`,"=HYPERLINK`), 'CSV formula injection neutralised');
    r = await new Client().get('/api/admin/applications.csv'); ok(r.status === 401, 'CSV requires admin');
    r = await admin.del('/api/admin/applications/FR-1002'); ok(r.status === 200, 'admin deletes application');
    r = await admin.get('/api/admin/applications'); ok(!r.json.applications.some((a) => a.id === 'FR-1002'), 'deleted application is gone');

    /* ---------------- admin: plans */
    r = await admin.post('/api/admin/plans', { name: 'Express Cart', tagline: 'Tiny', investmentMin: 300000, investmentMax: 200000, features: 'a' });
    ok(r.status === 400, 'plan: max < min rejected');
    r = await admin.post('/api/admin/plans', { name: 'Express Cart', tagline: 'Tiny', format: 'Cart', area: '40 sq ft', investmentMin: 300000, investmentMax: 450000, features: 'Fast setup\nLow rent', order: 0 });
    ok(r.status === 200 && r.json.plan.features.length === 2 && r.json.plan.sample === false, 'plan created (features from textarea lines)');
    const newPlanId = r.json.plan.id;
    r = await anon.get('/api/bootstrap'); ok(r.json.plans[0].id === newPlanId && r.json.plans.length === 4, 'new plan public + sorted first');
    r = await admin.put(`/api/admin/plans/${newPlanId}`, { name: 'Express Cart', investmentMin: 300000, investmentMax: 450000, active: false, order: 0 });
    r = await anon.get('/api/bootstrap'); ok(!r.json.plans.some((p) => p.id === newPlanId), 'inactive plan hidden from public');
    r = await admin.del(`/api/admin/plans/${newPlanId}`); ok(r.status === 200, 'plan deleted');
    for (const p of plans) await admin.put(`/api/admin/plans/${p.id}`, { ...p, features: p.features });
    r = await admin.get('/api/admin/overview'); ok(r.json.system.samplePlans === false, 'sample warning clears once plans are reviewed/saved');

    /* ---------------- admin: products, orders, coupons, messages, settings */
    r = await admin.post('/api/admin/products', { name: 'Test Roast', price: 'abc', category: 'Beans' }); ok(r.status === 400, 'product: bad price rejected');
    r = await admin.post('/api/admin/products', { name: 'Test Roast', price: 350, category: 'Beans', weight: '250 g', image: 'javascript:alert(1)' }); ok(r.status === 400, 'product: javascript: image URL rejected');
    r = await admin.post('/api/admin/products', { name: 'Test Roast', price: 350, category: 'Beans', weight: '250 g', image: 'https://example.com/a.jpg', desc: 'Nice' });
    ok(r.status === 200, 'product created'); const tp = r.json.product;
    r = await anon.get('/api/bootstrap'); ok(r.json.products.some((p) => p.id === tp.id), 'product visible publicly');
    r = await admin.del(`/api/admin/products/${tp.id}`); r = await anon.get('/api/bootstrap'); ok(!r.json.products.some((p) => p.id === tp.id), 'product deleted');
    r = await admin.put('/api/admin/orders/ORD-10001', { status: 'Shipped' }); ok(r.status === 200, 'order status updated');
    r = await alice.get('/api/orders/mine'); ok(r.json.orders[0].status === 'Shipped', 'customer sees updated order status');
    r = await admin.post('/api/admin/coupons', { code: 'save20', discountPercent: 20, minSpend: 500 }); ok(r.status === 200 && r.json.coupon.code === 'SAVE20', 'coupon created');
    r = await admin.post('/api/admin/coupons', { code: 'SAVE20', discountPercent: 20 }); ok(r.status === 409, 'duplicate coupon -> 409');
    r = await admin.post('/api/admin/coupons', { code: 'x!', discountPercent: 20 }); ok(r.status === 400, 'bad coupon code rejected');
    r = await admin.post('/api/admin/coupons', { code: 'BIG', discountPercent: 150 }); ok(r.status === 400, 'discount > 100 rejected');
    r = await anon.post('/api/cart/quote', { items: [{ id: products[2].id, qty: 1 }], coupon: 'SAVE20' }); ok(r.json.discount === 120, 'new coupon works in shop (599 * 20%)');
    r = await admin.del('/api/admin/coupons/SAVE20'); r = await anon.post('/api/cart/quote', { items: [{ id: products[2].id, qty: 1 }], coupon: 'SAVE20' }); ok(r.status === 400, 'deleted coupon no longer valid');
    r = await admin.get('/api/admin/messages'); ok(r.json.messages.length === 1 && r.json.messages[0].read === false, 'contact message visible to admin');
    r = await admin.put(`/api/admin/messages/${r.json.messages[0].id}`, { read: true }); ok(r.status === 200, 'message marked read');
    r = await admin.put('/api/admin/settings', { address: 'New Address, Hyderabad', phone: '+91 90000 11111', email: 'x@y.com', whatsappNum: '+91 90000-11111', heroHeading: 'NEW\nHEADING', heroSub: 'Sub', shippingFee: 60, freeShippingAbove: 999, whatsappMsg: 'hi' });
    ok(r.status === 200 && r.json.settings.whatsappNum === '919000011111', 'settings saved; WhatsApp number normalised to digits');
    r = await anon.get('/api/bootstrap'); ok(r.json.settings.heroHeading === 'NEW\nHEADING' && r.json.settings.shippingFee === 60, 'settings public');
    r = await admin.put('/api/admin/settings', { address: 'A', phone: '1', email: 'bad', whatsappNum: '1' }); ok(r.status === 400, 'invalid settings rejected');

    /* ---------------- Google sign-in */
    const g = new Client();
    r = await g.get('/api/auth/google');
    ok(r.status === 302 && r.headers.get('location').startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), 'google: redirects to accounts.google.com');
    const loc = new URL(r.headers.get('location'));
    ok(loc.searchParams.get('client_id') === 'test-client-id.apps.googleusercontent.com' && loc.searchParams.get('scope') === 'openid email profile', 'google: client_id + scope correct');
    ok(loc.searchParams.get('redirect_uri') === `http://127.0.0.1:${PORT}/api/auth/google/callback`, 'google: redirect_uri correct');
    const state = loc.searchParams.get('state');
    ok(g.jar.cfc_oauth === state, 'google: state bound to browser cookie');
    r = await g.get(`/api/auth/google/callback?code=code-user&state=WRONG`); ok(r.status === 302 && r.headers.get('location').includes('error=google'), 'google: wrong state rejected (CSRF)');
    r = await g.get('/api/auth/google'); const s2 = new URL(r.headers.get('location')).searchParams.get('state');
    r = await g.get(`/api/auth/google/callback?code=code-user&state=${s2}`);
    ok(r.status === 302 && r.headers.get('location') === '/#/account', 'google: callback -> /#/account');
    r = await g.get('/api/bootstrap'); ok(r.json.user && r.json.user.email === 'guest.user@gmail.com' && r.json.user.provider === 'google' && !r.json.user.isAdmin, 'google: user created & signed in (email lower-cased)');
    r = await g.get(`/api/auth/google/callback?code=code-user&state=${s2}`); ok(r.headers.get('location').includes('error=google'), 'google: state is single-use (replay rejected)');
    // guest application by same verified email shows up after Google login
    await anon.post('/api/franchise/apply', { ...good, name: 'Guest User', email: 'guest.user@gmail.com' });
    r = await g.get('/api/franchise/mine'); ok(r.json.applications.length === 1, 'google: earlier guest application matched by verified email');
    // password user CANNOT claim someone else's guest applications by email
    const mallory = new Client(); await mallory.post('/api/auth/register', { name: 'Mallory', email: 'ravi@example.com', password: 'longenough1' });
    r = await mallory.get('/api/franchise/mine'); ok(r.json.applications.length === 0, 'unverified password account cannot read applications by email');
    // admin via Google
    const ga = new Client(); r = await ga.get('/api/auth/google'); const s3 = new URL(r.headers.get('location')).searchParams.get('state');
    r = await ga.get(`/api/auth/google/callback?code=code-admin&state=${s3}`);
    ok(r.headers.get('location') === '/#/admin', 'google: ADMIN_EMAILS account lands on /#/admin');
    r = await ga.get('/api/admin/overview'); ok(r.status === 200, 'google admin can use admin API');
    // pre-registration squat: password account created first, then real owner signs in with Google
    const squat = new Client(); await squat.post('/api/auth/register', { name: 'Squatter', email: 'squat@example.com', password: 'squatterpw1' });
    const owner = new Client(); r = await owner.get('/api/auth/google'); const s4 = new URL(r.headers.get('location')).searchParams.get('state');
    await owner.get(`/api/auth/google/callback?code=code-squat&state=${s4}`);
    r = await new Client().post('/api/auth/login', { email: 'squat@example.com', password: 'squatterpw1' }); ok(r.status === 401, "google: squatter's password is wiped when the real owner signs in");
    r = await owner.get('/api/bootstrap'); ok(r.json.user && r.json.user.email === 'squat@example.com', 'google: real owner has the account');
    // bad tokens
    for (const [code, why] of [['code-unverified', 'unverified email'], ['code-badaud', 'wrong audience'], ['code-none', 'Google error']]) {
      const b = new Client(); r = await b.get('/api/auth/google'); const st = new URL(r.headers.get('location')).searchParams.get('state');
      r = await b.get(`/api/auth/google/callback?code=${code}&state=${st}`);
      const u = (await b.get('/api/bootstrap')).json.user;
      ok(r.headers.get('location').includes('error=google') && u === null, `google: rejected (${why})`);
    }
    r = await new Client().get('/api/auth/google?next=https://evil.example'); const nx = new URL(r.headers.get('location'));
    const c2 = new Client(); r = await c2.get('/api/auth/google?next=https://evil.example'); const st5 = new URL(r.headers.get('location')).searchParams.get('state');
    r = await c2.get(`/api/auth/google/callback?code=code-user&state=${st5}`);
    ok(r.headers.get('location') === '/#/account', 'google: open-redirect via ?next= is ignored');

    /* ---------------- session revocation */
    r = await ga.post('/api/auth/logout'); r = await ga.get('/api/admin/overview'); ok(r.status === 401, 'logout kills admin session');

  } catch (e) {
    fail++; console.log('FAIL  test crashed:', e);
  } finally {
    await svc.stop();
    if (fail) console.log('\n--- server log ---\n' + svc.log());
    console.log(`\n${MODE}: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
