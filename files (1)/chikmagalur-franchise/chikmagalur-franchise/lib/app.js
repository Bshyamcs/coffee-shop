'use strict';
const { getDb } = require('./db');
const { KEYS, DEFAULT_SETTINGS, ensureSeed } = require('./seed');
const A = require('./auth');

/* ================================================================== helpers */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => new HttpError(status, message);

const APP_STATUSES = ['New', 'Contacted', 'Meeting Scheduled', 'Site Review', 'Agreement', 'Approved', 'Rejected'];
const ORDER_STATUSES = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
const CATEGORIES = ['Filter Coffee', 'Beans', 'Combos'];
const BUDGETS = ['Below ₹10 Lakh', '₹10 - 25 Lakh', '₹25 - 50 Lakh', 'Above ₹50 Lakh'];
const PROPERTY = ['I own a property', 'I have found a location', 'I am still looking'];
const EXPERIENCE = ['No experience', 'Food & beverage / retail', 'Own a business already'];
const TIMELINE = ['Immediately', 'Within 1 - 3 months', 'Within 3 - 6 months', 'Just exploring'];

// strip control characters, collapse whitespace, cap length
const clean = (v, max = 200) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// multi-line free text: keep line breaks
const cleanMulti = (v, max = 1500) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

function needText(v, label, min, max) {
  const s = clean(v, max);
  if (s.length < min) throw fail(400, `${label} is required${min > 1 ? ` (at least ${min} characters)` : ''}`);
  return s;
}
function needEmail(v) {
  const s = clean(v, 254).toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s)) throw fail(400, 'Please enter a valid email address');
  return s;
}
function needPhone(v) {
  const raw = clean(v, 20);
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) throw fail(400, 'Please enter a valid phone number');
  return (raw.startsWith('+') ? '+' : '') + digits;
}
function needOneOf(v, list, label) {
  if (!list.includes(v)) throw fail(400, `Please choose a valid ${label}`);
  return v;
}
function needMoney(v, label, { min = 0, max = 100000000 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw fail(400, `${label} must be a number between ${min} and ${max}`);
  return Math.round(n);
}
function needUrl(v, label) {
  const s = clean(v, 500);
  if (!s) return '';
  if (!/^https:\/\/[^\s]+$/i.test(s) && !/^\/[^\s/][^\s]*$/.test(s)) throw fail(400, `${label} must be an https:// link`);
  return s;
}
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${A.randomId(5)}`;
const nowIso = () => new Date().toISOString();

/* ================================================================== router */
const routes = [];
function route(method, pattern, opts, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth: opts.auth || null, handler });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

async function readBody(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return null;
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw fail(415, 'Content-Type must be application/json');
  let pre;
  try { pre = req.body; } catch { throw fail(400, 'Invalid JSON'); }
  if (pre !== undefined) {
    if (Buffer.isBuffer(pre)) pre = pre.toString('utf8');
    if (typeof pre === 'string') { if (!pre.trim()) return {}; try { return JSON.parse(pre); } catch { throw fail(400, 'Invalid JSON'); } }
    return pre && typeof pre === 'object' ? pre : {};
  }
  if (req.readableEnded) return {};
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 200 * 1024) throw fail(413, 'Request too large');
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw fail(400, 'Invalid JSON'); }
}

function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients; browsers always send Origin on cross-site POSTs
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let oh = '';
  try { oh = new URL(origin).host; } catch { /* fallthrough */ }
  if (oh !== host) throw fail(403, 'Cross-origin request blocked');
}

async function limit(ctx, bucket, max, windowSec) {
  const key = `rl:${bucket}:${ctx.ip}`;
  const n = await ctx.db.incr(key);
  if (n === 1) await ctx.db.expire(key, windowSec);
  if (n > max) throw fail(429, 'Too many attempts. Please wait a while and try again.');
}

const publicUser = (u, isAdmin) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '', address: u.address || '', picture: u.picture || '',
  provider: u.googleId ? 'google' : 'password', isAdmin: !!isAdmin,
});

async function loadAuth(ctx) {
  const { data } = await A.readSession(ctx.db, ctx.req);
  if (!data) return;
  ctx.session = data;
  ctx.isAdmin = A.sessionIsAdmin(data);
  if (data.adminPassword) {
    ctx.user = ctx.isAdmin ? { id: 'admin', name: 'Administrator', email: data.email, phone: '', address: '', synthetic: true } : null;
  } else if (data.userId) {
    ctx.user = await ctx.db.hgetJSON(KEYS.users, data.userId);
  }
}

/* ================================================================== shared data access */
const getSettings = async (db) => ({ ...DEFAULT_SETTINGS, ...((await db.getJSON(KEYS.settings)) || {}) });
async function listPlans(db, activeOnly) {
  const all = await db.hlistJSON(KEYS.plans);
  return all.filter((p) => !activeOnly || p.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
}
async function listProducts(db, activeOnly) {
  const all = await db.hlistJSON(KEYS.products);
  return all.filter((p) => !activeOnly || p.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));
}
async function nextId(db, name, base, prefix) {
  const n = await db.incr('seq:' + name);
  return `${prefix}${base + n - 1}`;
}
const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

/* ---- basket pricing: ALWAYS computed on the server, never trusted from the browser */
async function quote(db, itemsIn, couponCode) {
  if (!Array.isArray(itemsIn) || itemsIn.length === 0) throw fail(400, 'Your basket is empty');
  if (itemsIn.length > 30) throw fail(400, 'Too many items in the basket');
  const products = new Map((await listProducts(db, true)).map((p) => [p.id, p]));
  const merged = new Map();
  for (const it of itemsIn) {
    const id = clean(it && it.id, 60);
    const qty = Math.floor(Number(it && it.qty));
    if (!products.has(id)) throw fail(400, 'A product in your basket is no longer available. Please refresh.');
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) throw fail(400, 'Quantity must be between 1 and 20');
    merged.set(id, Math.min(20, (merged.get(id) || 0) + qty));
  }
  const lines = [...merged].map(([id, qty]) => {
    const p = products.get(id);
    return { id, name: p.name, weight: p.weight, price: p.price, qty, image: p.image, category: p.category, lineTotal: p.price * qty };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let coupon = null; let discount = 0;
  const code = clean(couponCode, 30).toUpperCase();
  if (code) {
    const c = await db.hgetJSON(KEYS.coupons, code);
    if (!c) throw fail(400, 'Invalid coupon code');
    if (subtotal < c.minSpend) throw fail(400, `Coupon ${c.code} needs a minimum order of ₹${c.minSpend}`);
    coupon = { code: c.code, discountPercent: c.discountPercent };
    discount = Math.round((subtotal * c.discountPercent) / 100);
  }
  const s = await getSettings(db);
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= s.freeShippingAbove ? 0 : s.shippingFee;
  return { lines, subtotal, discount, shipping, total: afterDiscount + shipping, coupon, freeShippingAbove: s.freeShippingAbove };
}

/* ================================================================== PUBLIC ROUTES */
route('GET', '/api/health', {}, async (ctx) => {
  const ok = await ctx.db.ping();
  return { ok, storage: ctx.db.kind };
});

route('GET', '/api/bootstrap', {}, async (ctx) => {
  const [settings, plans, products] = await Promise.all([getSettings(ctx.db), listPlans(ctx.db, true), listProducts(ctx.db, true)]);
  return {
    settings, plans, products,
    googleEnabled: A.googleConfig().enabled,
    user: publicUser(ctx.user, ctx.isAdmin),
    options: { budgets: BUDGETS, property: PROPERTY, experience: EXPERIENCE, timeline: TIMELINE, categories: CATEGORIES, appStatuses: APP_STATUSES, orderStatuses: ORDER_STATUSES },
  };
});

route('POST', '/api/contact', {}, async (ctx) => {
  await limit(ctx, 'contact', 5, 3600);
  const b = ctx.body || {};
  const msg = {
    id: uid('m'), name: needText(b.name, 'Name', 2, 80), email: needEmail(b.email),
    message: (() => { const m = cleanMulti(b.message, 2000); if (m.length < 5) throw fail(400, 'Please write a short message'); return m; })(),
    read: false, createdAt: nowIso(),
  };
  await ctx.db.hsetJSON(KEYS.messages, msg.id, msg);
  return { ok: true };
});

route('POST', '/api/cart/quote', {}, async (ctx) => {
  const b = ctx.body || {};
  return quote(ctx.db, b.items, b.coupon);
});

route('POST', '/api/orders', {}, async (ctx) => {
  await limit(ctx, 'order', 10, 3600);
  const b = ctx.body || {};
  const c = b.customer || {};
  const customer = {
    name: needText(c.name, 'Name', 2, 80),
    phone: needPhone(c.phone),
    address: needText(c.address, 'Delivery address', 10, 300),
  };
  const q = await quote(ctx.db, b.items, b.coupon);
  const order = {
    id: await nextId(ctx.db, 'order', 10001, 'ORD-'),
    items: q.lines.map(({ id, name, weight, price, qty, lineTotal }) => ({ id, name, weight, price, qty, lineTotal })),
    subtotal: q.subtotal, discount: q.discount, shipping: q.shipping, total: q.total,
    coupon: q.coupon ? q.coupon.code : null,
    customer, userId: ctx.user && !ctx.user.synthetic ? ctx.user.id : null,
    email: ctx.user && !ctx.user.synthetic ? ctx.user.email : '',
    payment: 'Pay on delivery', status: 'Processing', createdAt: nowIso(),
  };
  await ctx.db.hsetJSON(KEYS.orders, order.id, order);
  if (order.userId) await ctx.db.hsetJSON('uorders:' + order.userId, order.id, 1);
  return { ok: true, order };
});

route('POST', '/api/franchise/apply', {}, async (ctx) => {
  await limit(ctx, 'apply', 6, 3600);
  const b = ctx.body || {};
  const plans = await listPlans(ctx.db, true);
  let plan = null;
  if (b.planId) {
    plan = plans.find((p) => p.id === b.planId);
    if (!plan) throw fail(400, 'Please choose a valid franchise model');
  }
  const app = {
    id: '',
    userId: ctx.user && !ctx.user.synthetic ? ctx.user.id : null,
    name: needText(b.name, 'Name', 2, 80),
    email: needEmail(b.email),
    phone: needPhone(b.phone),
    city: needText(b.city, 'City', 2, 60),
    state: needText(b.state, 'State', 2, 60),
    planId: plan ? plan.id : '',
    planName: plan ? plan.name : 'Not sure yet',
    budget: needOneOf(b.budget, BUDGETS, 'investment budget'),
    property: needOneOf(b.property, PROPERTY, 'property option'),
    experience: needOneOf(b.experience, EXPERIENCE, 'experience option'),
    timeline: needOneOf(b.timeline, TIMELINE, 'timeline'),
    message: cleanMulti(b.message, 1500),
    status: 'New', note: '', internalNote: '',
    history: [{ status: 'New', at: nowIso() }],
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  app.id = await nextId(ctx.db, 'app', 1001, 'FR-');   // only now: rejected submissions never burn a number
  await ctx.db.hsetJSON(KEYS.applications, app.id, app);
  if (app.userId) await ctx.db.hsetJSON('uapps:' + app.userId, app.id, 1);
  await ctx.db.hsetJSON('eapps:' + app.email, app.id, 1);
  return { ok: true, application: { id: app.id, status: app.status, planName: app.planName } };
});

/* ================================================================== AUTH ROUTES */
route('POST', '/api/auth/register', {}, async (ctx) => {
  await limit(ctx, 'register', 10, 3600);
  const b = ctx.body || {};
  const name = needText(b.name, 'Name', 2, 80);
  const email = needEmail(b.email);
  const phone = b.phone ? needPhone(b.phone) : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 8 || password.length > 128) throw fail(400, 'Password must be 8 - 128 characters');
  const id = uid('u');
  if (!(await ctx.db.setnx('email:' + email, id))) throw fail(409, 'An account with this email already exists. Please sign in.');
  const user = { id, name, email, phone, address: '', passwordHash: await A.hashPassword(password), googleId: null, emailVerified: false, picture: '', createdAt: nowIso() };
  await ctx.db.hsetJSON(KEYS.users, id, user);
  await A.createSession(ctx.db, ctx.res, ctx.req, { userId: id, email, googleVerified: false });
  return { ok: true, user: publicUser(user, false) };
});

route('POST', '/api/auth/login', {}, async (ctx) => {
  await limit(ctx, 'login', 10, 900);
  const b = ctx.body || {};
  const email = clean(b.email, 254).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const generic = fail(401, 'Incorrect email or password. If you signed up with Google, use "Continue with Google".');
  const id = await ctx.db.getJSON('email:' + email);
  const user = id ? await ctx.db.hgetJSON(KEYS.users, id) : null;
  if (!user || !user.passwordHash) { await A.hashPassword(password || 'x'); throw generic; } // equalise timing
  if (!(await A.verifyPassword(password, user.passwordHash))) throw generic;
  await A.createSession(ctx.db, ctx.res, ctx.req, { userId: user.id, email: user.email, googleVerified: false });
  return { ok: true, user: publicUser(user, false) };
});

route('POST', '/api/auth/admin-login', {}, async (ctx) => {
  await limit(ctx, 'admin-login', 6, 900);
  const cfg = A.adminPasswordConfig();
  if (!cfg) throw fail(403, 'Password admin login is not configured. Use Google sign-in with an ADMIN_EMAILS account.');
  const b = ctx.body || {};
  const okEmail = A.safeEqual(clean(b.email, 254).toLowerCase(), cfg.email);
  const okPass = A.safeEqual(typeof b.password === 'string' ? b.password : '', cfg.password);
  if (!(okEmail && okPass)) throw fail(401, 'Invalid admin credentials');
  await A.createSession(ctx.db, ctx.res, ctx.req, { adminPassword: true, email: cfg.email });
  return { ok: true, user: { id: 'admin', name: 'Administrator', email: cfg.email, isAdmin: true, provider: 'password' } };
});

route('POST', '/api/auth/logout', {}, async (ctx) => {
  await A.destroySession(ctx.db, ctx.req, ctx.res);
  return { ok: true };
});

route('GET', '/api/auth/google', {}, async (ctx) => {
  if (!A.googleConfig().enabled) return redirect(ctx.res, '/#/login?error=google-not-configured'), undefined;
  const state = A.randomId(24);
  const next = /^\/#\/[a-z0-9\-/]{0,40}$/.test(ctx.query.next || '') ? ctx.query.next : '';
  await ctx.db.setJSON('oauth:' + state, { next }, 600);
  A.setCookie(ctx.res, A.OAUTH_COOKIE, state, { maxAge: 600, secure: A.isHttps(ctx.req) });
  redirect(ctx.res, A.googleAuthUrl(ctx.req, state));
  return undefined;
});

route('GET', '/api/auth/google/callback', {}, async (ctx) => {
  const { code, state, error } = ctx.query;
  const cookieState = A.parseCookies(ctx.req)[A.OAUTH_COOKIE];
  A.setCookie(ctx.res, A.OAUTH_COOKIE, '', { maxAge: 0, secure: A.isHttps(ctx.req) });
  const back = (why) => { redirect(ctx.res, '/#/login?error=' + why); return undefined; };
  if (error || !code || !state || !cookieState || !A.safeEqual(state, cookieState)) return back('google');
  const saved = await ctx.db.getJSON('oauth:' + state);
  await ctx.db.del('oauth:' + state);
  if (!saved) return back('google');

  let profile;
  try { profile = await A.googleExchange(ctx.req, code); } catch (e) { console.error('[google]', e.message); return back('google'); }

  // find or create the user; link to an existing account with the same (Google-verified) email
  let user = null;
  const existingId = await ctx.db.getJSON('email:' + profile.email);
  if (existingId) user = await ctx.db.hgetJSON(KEYS.users, existingId);
  if (user) {
    if (!user.googleId) {
      user.googleId = profile.sub;
      if (!user.emailVerified) user.passwordHash = null; // an unverified password account could be a pre-registration squat
    }
    user.emailVerified = true;
    user.picture = user.picture || profile.picture;
  } else {
    user = { id: uid('u'), name: profile.name, email: profile.email, phone: '', address: '', passwordHash: null, googleId: profile.sub, emailVerified: true, picture: profile.picture, createdAt: nowIso() };
    await ctx.db.setJSON('email:' + profile.email, user.id);
  }
  await ctx.db.hsetJSON(KEYS.users, user.id, user);
  const sessionData = { userId: user.id, email: user.email, googleVerified: true };
  await A.createSession(ctx.db, ctx.res, ctx.req, sessionData);
  const dest = saved.next || (A.sessionIsAdmin(sessionData) ? '/#/admin' : '/#/account');
  redirect(ctx.res, dest);
  return undefined;
});

/* ================================================================== SIGNED-IN USER ROUTES */
route('PUT', '/api/me', { auth: 'user' }, async (ctx) => {
  if (ctx.user.synthetic) throw fail(400, 'The administrator profile cannot be edited here');
  const b = ctx.body || {};
  ctx.user.name = needText(b.name, 'Name', 2, 80);
  ctx.user.phone = b.phone ? needPhone(b.phone) : '';
  ctx.user.address = clean(b.address, 300);
  await ctx.db.hsetJSON(KEYS.users, ctx.user.id, ctx.user);
  return { ok: true, user: publicUser(ctx.user, ctx.isAdmin) };
});

route('GET', '/api/franchise/mine', { auth: 'user' }, async (ctx) => {
  if (ctx.user.synthetic) return { applications: [] };
  const ids = new Set(await ctx.db.hkeys('uapps:' + ctx.user.id));
  const verified = ctx.session && ctx.session.googleVerified === true;   // only trust email matching for Google-verified emails
  if (verified) (await ctx.db.hkeys('eapps:' + ctx.user.email)).forEach((i) => ids.add(i));
  const apps = (await Promise.all([...ids].map((i) => ctx.db.hgetJSON(KEYS.applications, i)))).filter(Boolean).sort(byNewest);
  // never expose the internal admin note
  return { applications: apps.map(({ internalNote, ...rest }) => rest) };
});

route('GET', '/api/orders/mine', { auth: 'user' }, async (ctx) => {
  if (ctx.user.synthetic) return { orders: [] };
  const ids = await ctx.db.hkeys('uorders:' + ctx.user.id);
  const orders = (await Promise.all(ids.map((i) => ctx.db.hgetJSON(KEYS.orders, i)))).filter(Boolean).sort(byNewest);
  return { orders };
});

/* ================================================================== ADMIN ROUTES */
route('GET', '/api/admin/overview', { auth: 'admin' }, async (ctx) => {
  const [apps, orders, users, messages, plans] = await Promise.all([
    ctx.db.hlistJSON(KEYS.applications), ctx.db.hlistJSON(KEYS.orders), ctx.db.hlistJSON(KEYS.users),
    ctx.db.hlistJSON(KEYS.messages), listPlans(ctx.db, false),
  ]);
  const statusCounts = Object.fromEntries(APP_STATUSES.map((s) => [s, 0]));
  apps.forEach((a) => { statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const valid = orders.filter((o) => o.status !== 'Cancelled');

  const months = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push({ key: m.toISOString().slice(0, 7), label: m.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), applications: 0, revenue: 0 });
  }
  apps.forEach((a) => { const m = months.find((x) => x.key === String(a.createdAt).slice(0, 7)); if (m) m.applications += 1; });
  valid.forEach((o) => { const m = months.find((x) => x.key === String(o.createdAt).slice(0, 7)); if (m) m.revenue += o.total; });

  const cfg = A.adminPasswordConfig();
  return {
    counts: {
      applications: apps.length, newApplications: statusCounts.New || 0, approved: statusCounts.Approved || 0,
      orders: orders.length, revenue: valid.reduce((s, o) => s + o.total, 0),
      users: users.length, messages: messages.length, unreadMessages: messages.filter((m) => !m.read).length,
    },
    statusCounts, monthly: months,
    recentApplications: apps.sort(byNewest).slice(0, 5).map((a) => ({ id: a.id, name: a.name, city: a.city, planName: a.planName, status: a.status, createdAt: a.createdAt })),
    system: {
      storage: ctx.db.kind, googleEnabled: A.googleConfig().enabled,
      devAdminDefaults: !!(cfg && cfg.isDevDefault), samplePlans: plans.some((p) => p.sample),
    },
  };
});

/* ---- franchise applications */
route('GET', '/api/admin/applications', { auth: 'admin' }, async (ctx) => {
  const apps = (await ctx.db.hlistJSON(KEYS.applications)).sort(byNewest);
  return { applications: apps };
});

route('PUT', '/api/admin/applications/:id', { auth: 'admin' }, async (ctx) => {
  const app = await ctx.db.hgetJSON(KEYS.applications, ctx.params.id);
  if (!app) throw fail(404, 'Application not found');
  const b = ctx.body || {};
  if (b.status !== undefined && b.status !== app.status) {
    app.status = needOneOf(b.status, APP_STATUSES, 'status');
    app.history = [...(app.history || []), { status: app.status, at: nowIso() }];
  }
  if (b.note !== undefined) app.note = cleanMulti(b.note, 600);
  if (b.internalNote !== undefined) app.internalNote = cleanMulti(b.internalNote, 1500);
  app.updatedAt = nowIso();
  await ctx.db.hsetJSON(KEYS.applications, app.id, app);
  return { ok: true, application: app };
});

route('DELETE', '/api/admin/applications/:id', { auth: 'admin' }, async (ctx) => {
  const app = await ctx.db.hgetJSON(KEYS.applications, ctx.params.id);
  if (!app) throw fail(404, 'Application not found');
  await ctx.db.hdel(KEYS.applications, app.id);
  if (app.userId) await ctx.db.hdel('uapps:' + app.userId, app.id);
  await ctx.db.hdel('eapps:' + app.email, app.id);
  return { ok: true };
});

route('GET', '/api/admin/applications.csv', { auth: 'admin', raw: true }, async (ctx) => {
  const apps = (await ctx.db.hlistJSON(KEYS.applications)).sort(byNewest);
  const cols = ['id', 'createdAt', 'status', 'name', 'email', 'phone', 'city', 'state', 'planName', 'budget', 'property', 'experience', 'timeline', 'message', 'note', 'internalNote'];
  // neutralise spreadsheet formula injection (=, +, -, @) and quote every cell
  const cell = (v) => { let s = String(v ?? '').replace(/\r?\n/g, ' '); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const csv = [cols.join(','), ...apps.map((a) => cols.map((c) => cell(a[c])).join(','))].join('\n');
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  ctx.res.setHeader('Content-Disposition', 'attachment; filename="franchise-applications.csv"');
  ctx.res.end('\ufeff' + csv);
});

/* ---- franchise plans */
function readPlan(b, existing) {
  const min = needMoney(b.investmentMin, 'Minimum investment', { min: 1 });
  const max = needMoney(b.investmentMax, 'Maximum investment', { min: 1 });
  if (max < min) throw fail(400, 'Maximum investment must be at least the minimum');
  const features = (Array.isArray(b.features) ? b.features : String(b.features || '').split('\n')).map((f) => clean(f, 120)).filter(Boolean).slice(0, 10);
  return {
    id: existing ? existing.id : uid('plan'),
    name: needText(b.name, 'Name', 2, 60), tagline: clean(b.tagline, 160), format: clean(b.format, 80), area: clean(b.area, 40),
    investmentMin: min, investmentMax: max, features, badge: clean(b.badge, 30),
    order: needMoney(b.order ?? 1, 'Order', { min: 0, max: 999 }),
    active: b.active !== false && b.active !== 'false',
    sample: false,
  };
}
route('GET', '/api/admin/plans', { auth: 'admin' }, async (ctx) => ({ plans: await listPlans(ctx.db, false) }));
route('POST', '/api/admin/plans', { auth: 'admin' }, async (ctx) => {
  const plan = readPlan(ctx.body || {}, null);
  await ctx.db.hsetJSON(KEYS.plans, plan.id, plan);
  return { ok: true, plan };
});
route('PUT', '/api/admin/plans/:id', { auth: 'admin' }, async (ctx) => {
  const existing = await ctx.db.hgetJSON(KEYS.plans, ctx.params.id);
  if (!existing) throw fail(404, 'Plan not found');
  const plan = readPlan(ctx.body || {}, existing);
  await ctx.db.hsetJSON(KEYS.plans, plan.id, plan);
  return { ok: true, plan };
});
route('DELETE', '/api/admin/plans/:id', { auth: 'admin' }, async (ctx) => {
  await ctx.db.hdel(KEYS.plans, ctx.params.id);
  return { ok: true };
});

/* ---- products */
function readProduct(b, existing) {
  return {
    id: existing ? existing.id : uid('p'),
    name: needText(b.name, 'Name', 2, 80),
    weight: clean(b.weight, 30) || '500 g',
    price: needMoney(b.price, 'Price', { min: 1, max: 1000000 }),
    category: needOneOf(b.category, CATEGORIES, 'category'),
    image: needUrl(b.image, 'Image'),
    desc: cleanMulti(b.desc, 400),
    active: b.active !== false && b.active !== 'false',
    order: existing ? existing.order : Date.now(),
  };
}
route('GET', '/api/admin/products', { auth: 'admin' }, async (ctx) => ({ products: await listProducts(ctx.db, false) }));
route('POST', '/api/admin/products', { auth: 'admin' }, async (ctx) => {
  const p = readProduct(ctx.body || {}, null);
  await ctx.db.hsetJSON(KEYS.products, p.id, p);
  return { ok: true, product: p };
});
route('PUT', '/api/admin/products/:id', { auth: 'admin' }, async (ctx) => {
  const existing = await ctx.db.hgetJSON(KEYS.products, ctx.params.id);
  if (!existing) throw fail(404, 'Product not found');
  const p = readProduct(ctx.body || {}, existing);
  await ctx.db.hsetJSON(KEYS.products, p.id, p);
  return { ok: true, product: p };
});
route('DELETE', '/api/admin/products/:id', { auth: 'admin' }, async (ctx) => {
  await ctx.db.hdel(KEYS.products, ctx.params.id);
  return { ok: true };
});

/* ---- orders */
route('GET', '/api/admin/orders', { auth: 'admin' }, async (ctx) => ({ orders: (await ctx.db.hlistJSON(KEYS.orders)).sort(byNewest) }));
route('PUT', '/api/admin/orders/:id', { auth: 'admin' }, async (ctx) => {
  const o = await ctx.db.hgetJSON(KEYS.orders, ctx.params.id);
  if (!o) throw fail(404, 'Order not found');
  o.status = needOneOf((ctx.body || {}).status, ORDER_STATUSES, 'status');
  await ctx.db.hsetJSON(KEYS.orders, o.id, o);
  return { ok: true, order: o };
});

/* ---- coupons */
route('GET', '/api/admin/coupons', { auth: 'admin' }, async (ctx) => ({ coupons: await ctx.db.hlistJSON(KEYS.coupons) }));
route('POST', '/api/admin/coupons', { auth: 'admin' }, async (ctx) => {
  const b = ctx.body || {};
  const code = clean(b.code, 20).toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw fail(400, 'Coupon code must be 3 - 20 letters or numbers');
  if (await ctx.db.hgetJSON(KEYS.coupons, code)) throw fail(409, 'That coupon code already exists');
  const c = { code, discountPercent: needMoney(b.discountPercent, 'Discount %', { min: 1, max: 100 }), minSpend: needMoney(b.minSpend ?? 0, 'Minimum spend', { min: 0 }) };
  await ctx.db.hsetJSON(KEYS.coupons, code, c);
  return { ok: true, coupon: c };
});
route('DELETE', '/api/admin/coupons/:code', { auth: 'admin' }, async (ctx) => {
  await ctx.db.hdel(KEYS.coupons, decodeURIComponent(ctx.params.code).toUpperCase());
  return { ok: true };
});

/* ---- contact messages */
route('GET', '/api/admin/messages', { auth: 'admin' }, async (ctx) => ({ messages: (await ctx.db.hlistJSON(KEYS.messages)).sort(byNewest) }));
route('PUT', '/api/admin/messages/:id', { auth: 'admin' }, async (ctx) => {
  const m = await ctx.db.hgetJSON(KEYS.messages, ctx.params.id);
  if (!m) throw fail(404, 'Message not found');
  m.read = (ctx.body || {}).read !== false;
  await ctx.db.hsetJSON(KEYS.messages, m.id, m);
  return { ok: true };
});
route('DELETE', '/api/admin/messages/:id', { auth: 'admin' }, async (ctx) => {
  await ctx.db.hdel(KEYS.messages, ctx.params.id);
  return { ok: true };
});

/* ---- site settings */
route('PUT', '/api/admin/settings', { auth: 'admin' }, async (ctx) => {
  const b = ctx.body || {};
  const waNum = clean(b.whatsappNum, 20).replace(/\D/g, '');
  if (waNum.length < 10) throw fail(400, 'WhatsApp number must include the country code (digits only)');
  const cur = await getSettings(ctx.db);
  const next = {
    ...cur,
    brandName: needText(b.brandName ?? cur.brandName, 'Brand name', 2, 80),
    address: needText(b.address, 'Address', 5, 250),
    phone: needText(b.phone, 'Phone', 5, 30),
    email: needEmail(b.email),
    whatsappNum: waNum,
    whatsappMsg: clean(b.whatsappMsg, 300),
    heroHeading: cleanMulti(b.heroHeading, 90) || cur.heroHeading,
    heroSub: clean(b.heroSub, 300),
    heroImage: needUrl(b.heroImage, 'Hero image') || cur.heroImage,
    storyImage: needUrl(b.storyImage, 'Story image') || cur.storyImage,
    shippingFee: needMoney(b.shippingFee, 'Shipping fee', { min: 0, max: 5000 }),
    freeShippingAbove: needMoney(b.freeShippingAbove, 'Free shipping threshold', { min: 0, max: 1000000 }),
  };
  await ctx.db.setJSON(KEYS.settings, next);
  return { ok: true, settings: next };
});

/* ================================================================== dispatcher */
async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://local');
    let pathname = url.pathname;
    if (url.searchParams.has('__path')) {            // set by the vercel.json rewrite: original /api/<path>
      pathname = '/api/' + url.searchParams.get('__path');
      url.searchParams.delete('__path');
    }
    pathname = pathname.replace(/\/+$/, '') || '/';
    const match = routes.map((r) => ({ r, m: r.method === req.method ? pathname.match(r.re) : null })).find((x) => x.m);
    if (!match) {
      const pathKnown = routes.some((r) => r.re.test(pathname));
      throw fail(pathKnown ? 405 : 404, pathKnown ? 'Method not allowed' : 'Not found');
    }
    const { r, m } = match;
    checkOrigin(req);

    const db = getDb();
    await ensureSeed(db);
    const ctx = {
      req, res, url, db, query: Object.fromEntries(url.searchParams),
      params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]])),
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown',
      body: null, session: null, user: null, isAdmin: false,
    };
    ctx.body = await readBody(req);
    await loadAuth(ctx);
    if (r.auth === 'admin' && !ctx.isAdmin) throw fail(ctx.user ? 403 : 401, ctx.user ? 'Admin access required' : 'Please sign in as administrator');
    if (r.auth === 'user' && !ctx.user) throw fail(401, 'Please sign in');

    const out = await r.handler(ctx);
    if (!res.writableEnded && !res.headersSent) send(res, 200, out === undefined ? { ok: true } : out);
  } catch (e) {
    if (res.headersSent || res.writableEnded) return;
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error('[api]', e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on our side. Please try again.' });
  }
}

module.exports = { handle, routes };
