// Minimal Upstash-REST-compatible server backed by a REAL redis-server, to exercise the @upstash/redis client path.
const http = require('http');
const { createClient } = require('redis');
// Real Upstash base64-encodes bulk-string replies when the client sends `Upstash-Encoding: base64`
const enc = (v) => (Array.isArray(v) ? v.map(enc) : typeof v === 'string' && v !== 'OK' ? Buffer.from(v).toString('base64') : v);
module.exports = async function startMock(port, redisUrl, token) {
  const c = createClient({ url: redisUrl }); await c.connect();
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer ' + token) { res.statusCode = 401; return res.end('{"error":"Unauthorized"}'); }
      const b64 = req.headers['upstash-encoding'] === 'base64';
      try {
        const cmds = req.url.startsWith('/pipeline') ? JSON.parse(body) : [JSON.parse(body)];
        const out = [];
        for (const cmd of cmds) {
          try { const v = await c.sendCommand(cmd.map(String)); out.push({ result: b64 ? enc(v) : v }); } catch (e) { out.push({ error: e.message }); }
        }
        res.end(JSON.stringify(req.url.startsWith('/pipeline') ? out : out[0]));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); }
    });
  });
  await new Promise((r) => srv.listen(port, r));
  return { close: async () => { srv.close(); await c.quit(); } };
};
