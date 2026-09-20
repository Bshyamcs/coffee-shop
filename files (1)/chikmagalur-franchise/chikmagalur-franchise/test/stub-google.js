// Preloaded into the test server (node -r) so Google's token endpoint is faked. Never shipped in production paths.
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
    const code = new URLSearchParams(opts.body).get('code');
    const profiles = {
      'code-user':  { sub: 'g-111', email: 'Guest.User@Gmail.com', name: 'Guest User', picture: 'https://example.com/p.png', email_verified: true },
      'code-admin': { sub: 'g-999', email: 'boss@example.com', name: 'The Boss', picture: '', email_verified: true },
      'code-squat': { sub: 'g-222', email: 'squat@example.com', name: 'Real Owner', picture: '', email_verified: true },
      'code-unverified': { sub: 'g-333', email: 'nv@example.com', name: 'NV', picture: '', email_verified: false },
      'code-badaud': { sub: 'g-444', email: 'bad@example.com', name: 'Bad', picture: '', email_verified: true, aud: 'someone-else' },
    };
    const p = profiles[code];
    if (!p) return new Response('{"error":"invalid_grant"}', { status: 400 });
    const claims = { iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600, ...p };
    return new Response(JSON.stringify({ id_token: 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s' }), { status: 200 });
  }
  return realFetch(url, opts);
};
