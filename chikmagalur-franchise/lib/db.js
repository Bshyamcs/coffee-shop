'use strict';
/**
 * Storage layer. One tiny interface, three backends:
 *
 *   1. Upstash Redis over REST  -> KV_REST_API_URL + KV_REST_API_TOKEN   (what Vercel's Marketplace injects)
 *                                  or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   2. Redis over TCP           -> REDIS_URL (redis:// or rediss://)     (any other Redis, Docker, Redis Cloud...)
 *   3. Local JSON file          -> used ONLY when nothing above is set and we are NOT on Vercel
 *                                  (so `npm run dev` works with zero setup)
 *
 * Everything is stored as JSON strings so all three backends behave identically.
 */
const fs = require('fs');
const path = require('path');

const env = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; return ''; };

/* ------------------------------------------------------------------ raw backends */
function upstashBackend(url, token) {
  const { Redis } = require('@upstash/redis');
  // automaticDeserialization:false -> we always get raw strings back, exactly like the other backends
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: 'upstash-redis',
    get: (k) => r.get(k),
    set: async (k, v, ttl) => (ttl ? r.set(k, v, { ex: ttl }) : r.set(k, v)),
    setnx: async (k, v, ttl) => (await (ttl ? r.set(k, v, { nx: true, ex: ttl }) : r.set(k, v, { nx: true }))) === 'OK',
    del: (k) => r.del(k),
    incr: (k) => r.incr(k),
    expire: (k, s) => r.expire(k, s),
    hset: (k, f, v) => r.hset(k, { [f]: v }),
    hget: (k, f) => r.hget(k, f),
    // With automaticDeserialization:false the SDK hands back HGETALL as a flat [field, value, ...] array; normalise to an object
    hgetall: async (k) => {
      const v = await r.hgetall(k);
      if (!v) return {};
      if (!Array.isArray(v)) return v;
      const o = {};
      for (let i = 0; i + 1 < v.length; i += 2) o[v[i]] = v[i + 1];
      return o;
    },
    hkeys: async (k) => (await r.hkeys(k)) || [],
    hdel: (k, f) => r.hdel(k, f),
  };
}

function tcpBackend(url) {
  const { createClient } = require('redis');
  let clientPromise = null;
  const client = () => {
    if (!clientPromise) {
      const c = createClient({ url, socket: { connectTimeout: 8000, reconnectStrategy: (n) => Math.min(n * 200, 2000) } });
      c.on('error', (e) => console.error('[redis]', e.message));
      clientPromise = c.connect().then(() => c).catch((e) => { clientPromise = null; throw e; });
    }
    return clientPromise;
  };
  return {
    kind: 'redis-tcp',
    get: async (k) => (await client()).get(k),
    set: async (k, v, ttl) => (await client()).set(k, v, ttl ? { EX: ttl } : undefined),
    setnx: async (k, v, ttl) => (await (await client()).set(k, v, ttl ? { NX: true, EX: ttl } : { NX: true })) === 'OK',
    del: async (k) => (await client()).del(k),
    incr: async (k) => (await client()).incr(k),
    expire: async (k, s) => (await client()).expire(k, s),
    hset: async (k, f, v) => (await client()).hSet(k, f, v),
    hget: async (k, f) => (await client()).hGet(k, f),
    hgetall: async (k) => ({ ...(await (await client()).hGetAll(k)) }),
    hkeys: async (k) => (await client()).hKeys(k),
    hdel: async (k, f) => (await client()).hDel(k, f),
  };
}

function fileBackend(file) {
  const persist = file !== ':memory:';
  let data = { kv: {}, h: {}, exp: {} };
  if (persist && fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.warn('[db] could not read', file, e.message); }
  }
  const save = () => {
    if (!persist) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  };
  const alive = (k) => {
    const e = data.exp[k];
    if (e && e < Date.now()) { delete data.kv[k]; delete data.exp[k]; return false; }
    return k in data.kv;
  };
  const hash = (k) => (data.h[k] = data.h[k] || {});
  return {
    kind: persist ? 'local-file' : 'memory',
    get: async (k) => (alive(k) ? data.kv[k] : null),
    set: async (k, v, ttl) => { data.kv[k] = String(v); if (ttl) data.exp[k] = Date.now() + ttl * 1000; else delete data.exp[k]; save(); return 'OK'; },
    setnx: async (k, v, ttl) => {
      if (alive(k)) return false;
      data.kv[k] = String(v); if (ttl) data.exp[k] = Date.now() + ttl * 1000; save(); return true;
    },
    del: async (k) => { const had = alive(k) || k in data.h; delete data.kv[k]; delete data.exp[k]; delete data.h[k]; save(); return had ? 1 : 0; },
    incr: async (k) => { const n = (alive(k) ? parseInt(data.kv[k], 10) || 0 : 0) + 1; data.kv[k] = String(n); save(); return n; },
    expire: async (k, s) => { if (!alive(k)) return 0; data.exp[k] = Date.now() + s * 1000; save(); return 1; },
    hset: async (k, f, v) => { hash(k)[f] = String(v); save(); return 1; },
    hget: async (k, f) => (data.h[k] && f in data.h[k] ? data.h[k][f] : null),
    hgetall: async (k) => ({ ...(data.h[k] || {}) }),
    hkeys: async (k) => Object.keys(data.h[k] || {}),
    hdel: async (k, f) => { if (data.h[k] && f in data.h[k]) { delete data.h[k][f]; save(); return 1; } return 0; },
  };
}

/* ------------------------------------------------------------------ JSON wrapper */
const parse = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch { return s; } };

function wrap(raw) {
  return {
    kind: raw.kind,
    getJSON: async (k) => parse(await raw.get(k)),
    setJSON: (k, v, ttl) => raw.set(k, JSON.stringify(v), ttl),
    setnx: (k, v, ttl) => raw.setnx(k, JSON.stringify(v), ttl),
    del: (k) => raw.del(k),
    incr: (k) => raw.incr(k),
    expire: (k, s) => raw.expire(k, s),
    hsetJSON: (k, f, v) => raw.hset(k, String(f), JSON.stringify(v)),
    hgetJSON: async (k, f) => parse(await raw.hget(k, String(f))),
    hlistJSON: async (k) => Object.values(await raw.hgetall(k)).map(parse),
    hkeys: (k) => raw.hkeys(k),
    hdel: (k, f) => raw.hdel(k, String(f)),
    async ping() {
      await raw.set('health:ping', 'pong', 30);
      return (await raw.get('health:ping')) === 'pong';
    },
  };
}

/* ------------------------------------------------------------------ factory */
let instance = null;

function getDb() {
  if (instance) return instance;
  const restUrl = env('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
  const restToken = env('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
  const tcpUrl = env('REDIS_URL');

  let raw;
  if (restUrl && restToken) raw = upstashBackend(restUrl, restToken);
  else if (tcpUrl) raw = tcpBackend(tcpUrl);
  else if (process.env.VERCEL) {
    const err = new Error('No Redis configured. In Vercel: Storage -> Create Database -> Upstash for Redis -> Connect to Project, then redeploy.');
    err.status = 500;
    throw err;
  } else {
    const file = process.env.DB_FILE || path.join(process.cwd(), '.data', 'db.json');
    if (file !== ':memory:') console.warn('[db] No Redis env vars found - using local file store at', file, '(development only)');
    raw = fileBackend(file);
  }
  instance = wrap(raw);
  return instance;
}

/** test helper */
function resetDb() { instance = null; }

module.exports = { getDb, resetDb };
