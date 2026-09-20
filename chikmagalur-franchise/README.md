# Chikmagalur Filter Coffee: Franchise Website

A franchise-first website (the franchise is the main highlight; the coffee shop is secondary) with a real backend:

- **Franchise applications**: public application form, sign-in to track status, admin pipeline (New -> Contacted -> Meeting Scheduled -> Site Review -> Agreement -> Approved / Rejected), notes visible to the applicant, private internal notes, WhatsApp/call/email shortcuts, CSV export.
- **Google sign-in** (real OAuth) + email/password accounts.
- **Redis** (Vercel Marketplace / Upstash) for all data: applications, plans, users, sessions, orders, products, coupons, messages, settings.
- **Admin dashboard** at `/#/admin`: overview + charts, applications, franchise plans, shop orders, products, coupons, messages, site settings (hero text, contact details, WhatsApp, shipping).
- Shop with basket, coupons and checkout (**pay on delivery**; prices are always calculated on the server).

No framework or build step is needed to run it: plain Node + static files. Runs on Vercel or locally with the same code.

---

## 1. Run on localhost (2 minutes)

```bash
npm install
npm run dev          # http://localhost:3000
```

With **no configuration at all** it works: data is kept in a local file (`.data/db.json`, development only) and the admin login is `admin@example.com` / `admin123` (development only, disabled automatically on Vercel).

To use a real setup locally, copy the env template and fill it in:

```bash
cp .env.example .env.local
```

## 2. Connect Redis on Vercel

1. Push this project to GitHub and **import it in Vercel** (or run `vercel` from this folder).
2. In the Vercel dashboard open your project -> **Storage** -> **Create Database** -> **Upstash for Redis** -> connect it to the project (all environments).
   Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. (Vercel KV itself no longer exists; the Marketplace Upstash Redis replaces it.)
3. **Use the same database on localhost:**
   ```bash
   npm i -g vercel
   vercel link
   vercel env pull .env.local
   npm run dev
   ```
   The console must print `Storage : upstash-redis (connected)`.
4. Redeploy on Vercel so the deployment picks up the variables.

Any other Redis also works: set `REDIS_URL=redis://...` (or `rediss://...`) instead. The site seeds sample data the first time it connects to an empty database.

## 3. Google sign-in

1. Google Cloud Console -> **APIs & Services -> OAuth consent screen** (External), then **Credentials -> Create credentials -> OAuth client ID -> Web application**.
2. **Authorized redirect URIs** (exact match):
   - `http://localhost:3000/api/auth/google/callback`
   - `https://YOUR-DOMAIN/api/auth/google/callback`
3. Put the client ID and secret in `.env.local` **and** in Vercel -> Settings -> Environment Variables:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. Applicants who sign in with the **same email they applied with** automatically see their earlier applications.

## 4. Make yourself admin

Either (recommended) sign in with Google and list your address in `ADMIN_EMAILS=you@gmail.com,partner@gmail.com`,
or set a password login: `ADMIN_EMAIL` + `ADMIN_PASSWORD` (long and random!). Then open `/#/admin`.

## 5. Before you go live: checklist

- [ ] **Admin -> Franchise Plans: replace the SAMPLE investment figures with your real terms.** They are placeholders and are flagged "SAMPLE" until you save each plan.
- [ ] Set `ADMIN_EMAILS` (or `ADMIN_EMAIL` + `ADMIN_PASSWORD`) in Vercel. There is no default admin login on Vercel.
- [ ] Redis connected, Google credentials added, redirect URI registered for your real domain.
- [ ] Admin -> Site Settings: check address, phone, WhatsApp number and shipping (defaults: Rs 49 fee, free above Rs 499).
- [ ] Replace the hotlinked Unsplash photos with your own (Admin -> Site Settings / Products). If an image cannot load, built-in artwork is shown instead.
- [ ] Edit the copy in `public/index.html` (FAQ answers, "How it works", benefits). It is written to be generic; confirm it matches your actual franchise terms.

## 6. Deploy

Vercel picks up `vercel.json` automatically: static files come from `public/`, the API is `api/[...path].js`. Environment variables are listed in `.env.example`.

## Security notes

- Sessions: random 256-bit id in an `HttpOnly`, `SameSite=Lax` (`Secure` on https) cookie, stored in Redis for 7 days.
- Passwords: `scrypt` with per-user salt. Rate limits on login, admin login, registration, applications, contact and orders.
- CSRF: JSON-only API + same-origin check + SameSite cookies. Google OAuth uses a single-use `state` bound to the browser.
- Admin rights are re-checked on **every** request (removing an email from `ADMIN_EMAILS` revokes access immediately).
- Strict Content-Security-Policy (`script-src 'self'`, no inline scripts), HSTS and other headers via `vercel.json`. All user text is escaped before display; CSV export neutralises spreadsheet-formula injection.
- Order totals, shipping and discounts are computed on the server; the browser cannot set prices.

## What is intentionally NOT included

- **Email/SMS notifications**: new applications appear in the admin dashboard (and you can WhatsApp/call from there). Add a provider such as Resend if you want email alerts.
- **Password reset**: use "Continue with Google" or ask an admin. (Needs an email provider.)
- **Online payments**: checkout is pay-on-delivery. A gateway such as Razorpay can be added on top of `POST /api/orders`.
- Data is read with Redis hash scans, which is comfortable for thousands of records; for far larger volumes add pagination/indexes.

## Tests

```bash
npm run test:api                 # in-memory store
MODE=tcp  npm run test:api       # real Redis over TCP (needs redis-server installed)
MODE=rest npm run test:api       # Upstash REST client (via a mock REST server + real Redis)
npm run test:ui                  # drives the real pages in a headless DOM
```

## Editing the design

Styles are Tailwind, pre-compiled to `public/styles.css`. If you add new Tailwind classes to the HTML/JS, rebuild with `npm run build:css`.

## Project layout

```
api/[...path].js   Vercel serverless entry (all /api/* routes)
lib/app.js         routes, validation, business logic
lib/auth.js        sessions, password hashing, Google OAuth
lib/db.js          Redis (Upstash REST / TCP) or local-file store
lib/seed.js        first-run data
public/            index.html, app.js, admin.js, art.js, styles.css
server.js          local dev server (same handler + same security headers)
test/              API and UI tests
```
