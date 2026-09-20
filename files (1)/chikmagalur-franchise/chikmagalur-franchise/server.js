'use strict';
/**
 * Local development server:  npm run dev  ->  http://localhost:3000
 * Serves /public and routes /api/* to the SAME handler Vercel runs, so what you test locally is what you deploy.
 * Reads .env.local / .env (same file `vercel env pull` writes). Sends the same security headers as vercel.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---- tiny .env loader (does not override variables already set) */
for (const f of ['.env.local', '.env']) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = (m[2] || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const { handle } = require('./lib/app');
const { getDb } = require('./lib/db');
const A = require('./lib/auth');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

// mirror vercel.json headers locally (except HSTS, which only makes sense on https)
let SECURITY_HEADERS = [];
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  SECURITY_HEADERS = ((cfg.headers || [])[0]?.headers || []).filter((h) => h.key !== 'Strict-Transport-Security');
} catch { /* optional */ }

const server = http.createServer((req, res) => {
  SECURITY_HEADERS.forEach((h) => res.setHeader(h.key, h.value));
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);

  if (pathname.startsWith('/api/')) return handle(req, res);

  let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end('Forbidden'); }   // path traversal guard
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(buf);
  });
});

server.listen(PORT, async () => {
  console.log(`\n  Chikmagalur Franchise site  ->  http://localhost:${PORT}\n`);
  try {
    const db = getDb();
    const ok = await db.ping();
    console.log(`  Storage : ${db.kind}${ok ? ' (connected)' : ' (ping failed!)'}`);
  } catch (e) { console.log('  Storage : ERROR -', e.message); }
  const g = A.googleConfig();
  console.log(`  Google  : ${g.enabled ? 'enabled  (redirect URI: ' + `http://localhost:${PORT}/api/auth/google/callback` + ')' : 'not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)'}`);
  const adm = A.adminPasswordConfig();
  console.log(`  Admin   : ${adm ? (adm.isDevDefault ? 'DEV default ' + adm.email + ' / ' + adm.password + '  (set ADMIN_EMAIL + ADMIN_PASSWORD in .env.local)' : 'password login for ' + adm.email) : 'password login off'}${A.adminEmails().length ? '; Google admins: ' + A.adminEmails().join(', ') : ''}\n`);
});
