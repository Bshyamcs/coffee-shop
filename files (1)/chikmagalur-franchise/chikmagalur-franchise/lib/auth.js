'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'cfc_sid';
const OAUTH_COOKIE = 'cfc_oauth';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

/* ------------------------------------------------------------------ cookies */
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  });
  return out;
}

function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' || !!req.socket?.encrypted;
}

function setCookie(res, name, value, opts = {}) {
  const { maxAge, httpOnly = true, secure = false, sameSite = 'Lax', path = '/' } = opts;
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...list, c]);
}

/* ------------------------------------------------------------------ passwords */
const SCRYPT = { N: 16384, r: 8, p: 1 };

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [alg, s, k] = stored.split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const expected = Buffer.from(k, 'base64');
  const key = await scrypt(pw, Buffer.from(s, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, key);
}

/** constant-time string compare (hashes first so lengths never leak) */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const randomId = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/* ------------------------------------------------------------------ sessions */
async function createSession(db, res, req, data) {
  const sid = randomId(32);
  await db.setJSON(`sess:${sid}`, { ...data, createdAt: Date.now() }, SESSION_TTL);
  setCookie(res, SESSION_COOKIE, sid, { maxAge: SESSION_TTL, secure: isHttps(req) });
  return sid;
}

async function readSession(db, req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid || sid.length < 20 || sid.length > 100) return { sid: null, data: null };
  const data = await db.getJSON(`sess:${sid}`);
  return { sid, data: data && typeof data === 'object' ? data : null };
}

async function destroySession(db, req, res) {
  const { sid } = await readSession(db, req);
  if (sid) await db.del(`sess:${sid}`);
  setCookie(res, SESSION_COOKIE, '', { maxAge: 0, secure: isHttps(req) });
}

/* ------------------------------------------------------------------ admin rules */
function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Password admin login only exists if configured. Dev-only defaults (never on Vercel). */
function adminPasswordConfig() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password) return { email, password, isDevDefault: false };
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    return { email: 'admin@example.com', password: 'admin123', isDevDefault: true };
  }
  return null;
}

/** Admin status is re-evaluated on every request, so removing an email revokes access immediately. */
function sessionIsAdmin(s) {
  if (!s) return false;
  if (s.adminPassword === true) {
    const cfg = adminPasswordConfig();
    return !!cfg && cfg.email === s.email;
  }
  return s.googleVerified === true && adminEmails().includes(String(s.email || '').toLowerCase());
}

/* ------------------------------------------------------------------ Google OAuth (authorization-code flow) */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  const secret = process.env.GOOGLE_CLIENT_SECRET || '';
  return { id, secret, enabled: !!(id && secret) };
}

function getOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

function googleRedirectUri(req) { return `${getOrigin(req)}/api/auth/google/callback`; }

function googleAuthUrl(req, state) {
  const { id } = googleConfig();
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${q}`;
}

/** Exchange the code, then validate the ID token claims. The token comes straight from Google over TLS. */
async function googleExchange(req, code) {
  const { id, secret } = googleConfig();
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: id, client_secret: secret, redirect_uri: googleRedirectUri(req), grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) throw new Error('Google token exchange failed (' + resp.status + ')');
  const tok = await resp.json();
  if (!tok.id_token) throw new Error('Google returned no id_token');
  const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString('utf8'));
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('Bad token issuer');
  if (claims.aud !== id) throw new Error('Token audience mismatch');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('Token expired');
  if (!claims.email || claims.email_verified !== true) throw new Error('Google email not verified');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: claims.name || claims.email.split('@')[0], picture: claims.picture || '' };
}

module.exports = {
  SESSION_COOKIE, OAUTH_COOKIE,
  parseCookies, setCookie, isHttps,
  hashPassword, verifyPassword, safeEqual, randomId,
  createSession, readSession, destroySession,
  adminEmails, adminPasswordConfig, sessionIsAdmin,
  googleConfig, googleAuthUrl, googleExchange, getOrigin,
};
