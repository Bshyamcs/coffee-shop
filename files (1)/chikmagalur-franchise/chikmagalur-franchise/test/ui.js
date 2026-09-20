'use strict';
/** Loads the real page (real app.js/admin.js) in jsdom against the real server and drives the UI. */
const { spawn } = require('child_process');
const path = require('path');
const { JSDOM } = require('jsdom');

const PORT = 3700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(hash = '') {
  const html = (await (await fetch(BASE + '/')).text()).replace(/<link[^>]*fonts[^>]*>/g, '');
  const jar = {};
  const errors = [];
  const dom = new JSDOM(html, {
    url: BASE + '/' + hash, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async (url, init = {}) => {
        const headers = { ...(init.headers || {}) };
        if (Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(new URL(url, BASE), { ...init, headers, redirect: 'manual' });
        (res.headers.getSetCookie?.() || []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0/i.test(c) || !v) delete jar[k]; else jar[k] = v; });
        return res;
      };
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.confirm = () => true; w.prompt = () => null;
      w.addEventListener('error', (e) => errors.push(e.message));
    },
  });
  const w = dom.window, d = w.document;
  await new Promise((r) => (d.readyState === 'complete' ? r() : w.addEventListener('load', r)));
  const until = async (fn, label, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch { /* keep waiting */ } await sleep(40); } throw new Error('timeout waiting for: ' + label); };
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
  const go = async (h) => { w.location.hash = h; await sleep(60); };
  const submit = (f) => f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const fill = (form, vals) => Object.entries(vals).forEach(([k, v]) => { const el = form.elements[k]; if (el.type === 'checkbox') el.checked = v; else el.value = v; });
  return { w, d, $, $$, go, submit, change, type, fill, until, errors, jar };
}

(async () => {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DB_FILE: ':memory:', GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 's' };
  delete env.VERCEL;
  const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/health'); break; } catch { await sleep(100); } }
  try {
    /* ------------------------------------------------ home page */
    const p = await openPage();
    await p.until(() => p.$('#plans-grid article'), 'plans rendered');
    ok(p.$$('#plans-grid article').length === 3, 'home: 3 franchise model cards rendered from the API');
    ok(/OWN A CHIKMAGALUR/.test(p.$('#hero-heading').textContent) && p.$('#hero-heading br'), 'home: hero heading is franchise-first (with line break)');
    ok(/Apply for a Franchise/i.test(p.$('#sec-top').textContent), 'home: hero has "Apply for a Franchise" call-to-action');
    ok(/Lakh/.test(p.$('#plans-grid').textContent), 'home: investment ranges shown in Lakh');
    ok(p.$$('#product-grid > div').length === 4 && /Classic Filter Coffee/.test(p.$('#product-grid').textContent), 'home: shop grid shows 4 products, Classic first');
    ok(p.$('#wa-btn').href.startsWith('https://wa.me/919441222714'), 'home: WhatsApp link built from settings');
    ok(p.$('#hero-phone').href === 'tel:+919441222714' || p.$('#hero-phone').href.startsWith('tel:'), 'home: phone is a tel: link');
    ok(p.$$('svg').length > 8, 'home: icons hydrated');
    ok(p.$('[data-action=filter-cat][data-cat=Beans]'), 'shop: category filters rendered');
    p.$('[data-action=filter-cat][data-cat=Beans]').click();
    ok(p.$$('#product-grid > div').length === 1, 'shop: filtering by Beans works');
    p.$('[data-action=filter-cat][data-cat=All]').click();

    /* ------------------------------------------------ guest franchise application + XSS */
    await p.go('#/apply?plan=plan_cafe');
    const af = await p.until(() => p.$('form[data-form=apply]'), 'apply form');
    ok(p.$('#a-plan').value === 'plan_cafe', 'apply: model preselected from ?plan=');
    ok(/Continue with Google/.test(p.$('#view-apply').textContent) && p.$('a[href^="/api/auth/google"]'), 'apply: Google sign-in offered');
    p.fill(af, { name: '<img src=x onerror="window.__xss=1">Ravi', email: 'ravi@example.com', phone: '+91 98765 43210', city: 'Hyderabad', state: 'Telangana', budget: '₹10 - 25 Lakh', property: 'I own a property', experience: 'No experience', timeline: 'Immediately', message: 'Hello', consent: false });
    p.submit(af);
    await sleep(300);
    ok(!p.$('#view-apply').textContent.includes('Application received'), 'apply: blocked until consent is ticked');
    p.fill(af, { consent: true }); p.submit(af);
    await p.until(() => /Application received/.test(p.$('#view-apply').textContent), 'application success');
    ok(/FR-1001/.test(p.$('#view-apply').textContent), 'apply: success screen shows reference FR-1001');

    /* ------------------------------------------------ sign up, track */
    await p.go('#/signup');
    const sf = await p.until(() => p.$('form[data-form=signup]'), 'signup form');
    p.fill(sf, { name: 'Sita Devi', email: 'sita@example.com', phone: '9876500000', password: 'longenough1' }); p.submit(sf);
    await p.until(() => /Sita/.test(p.$('#account-slot').textContent), 'header shows user');
    ok(p.w.location.hash === '#/account', 'signup: redirected to My Account');
    await p.go('#/apply');
    const af2 = await p.until(() => p.$('form[data-form=apply]'), 'apply form 2');
    ok(p.$('#a-email').value === 'sita@example.com' && p.$('#a-name').value === 'Sita Devi', 'apply: signed-in user is prefilled');
    p.fill(af2, { city: 'Pune', state: 'Maharashtra', budget: 'Above ₹50 Lakh', property: 'I am still looking', experience: 'Own a business already', timeline: 'Within 3 - 6 months', consent: true, planId: 'plan_flagship' });
    p.submit(af2);
    await p.until(() => /Track my application/.test(p.$('#view-apply').textContent), 'signed-in apply success');
    await p.go('#/account');
    await p.until(() => /Flagship Store/.test(p.$('#acct-body').textContent), 'account lists application');
    ok(/FR-1002/.test(p.$('#acct-body').textContent) && p.$$('#acct-body ol li').length === 6, 'account: application with 6-step progress tracker');
    p.$('[data-action=acct-tab][data-tab=profile]').click();
    const pf = await p.until(() => p.$('form[data-form=profile]'), 'profile form');
    p.fill(pf, { name: 'Sita D', phone: '9876500001', address: '12 MG Road, Pune 411001' }); p.submit(pf);
    await p.until(() => /Profile saved/.test(p.$('#toast').textContent), 'profile saved');
    ok(true, 'account: profile saved');

    /* ------------------------------------------------ cart + checkout (signed in: address prefilled) */
    p.$('#product-grid [data-action=add-cart]').click();
    p.$('#product-grid [data-action=add-cart]').click();
    ok(p.$('#cart-badge').textContent === '2' && !p.$('#cart-badge').classList.contains('hidden'), 'cart: badge counts 2 items');
    p.$('[data-action=open-cart]').click();
    await p.until(() => /Total/.test(p.$('#cart-body').textContent) && /Free/.test(p.$('#cart-body').textContent), 'cart quote');
    ok(/₹798/.test(p.$('#cart-body').textContent), 'cart: server-priced total shown (2 x 399, free shipping)');
    const cf = p.$('form[data-form=coupon]'); cf.elements.code.value = 'coffee10'; p.submit(cf);
    await p.until(() => /COFFEE10/.test(p.$('#cart-body').textContent) && /-₹80/.test(p.$('#cart-body').textContent), 'coupon applied');
    ok(/₹718/.test(p.$('#cart-body').textContent), 'cart: coupon discount applied (798 - 10% = 718)');
    p.$('[data-action=checkout]').click();
    const kf = await p.until(() => p.$('form[data-form=checkout]'), 'checkout form');
    ok(kf.elements.address.value.includes('MG Road'), 'checkout: address prefilled from profile');
    p.submit(kf);
    await p.until(() => /Order placed/.test(p.$('#modal').textContent), 'order placed');
    ok(/ORD-10001/.test(p.$('#modal').textContent), 'checkout: order ORD-10001 confirmed');
    ok(p.$('#cart-badge').classList.contains('hidden'), 'checkout: basket cleared');
    p.$('#modal [data-action=close-modal]').click();
    ok(!p.$('#modal'), 'modal closes');
    await p.go('#/account'); p.$('[data-action=acct-tab][data-tab=orders]').click();
    await p.until(() => /ORD-10001/.test(p.$('#acct-body').textContent), 'orders tab');
    ok(true, 'account: order visible under My Orders');

    /* ------------------------------------------------ contact form */
    await p.go('#/contact');
    const cform = p.$('form[data-form=contact]');
    p.fill(cform, { name: 'Anil', email: 'anil@example.com', message: 'Please share franchise brochure.' }); p.submit(cform);
    await p.until(() => /Message sent/.test(p.$('#toast').textContent), 'contact toast');
    ok(true, 'contact: message submitted');

    /* ------------------------------------------------ route guards */
    const g = await openPage('#/account');
    await sleep(500);
    ok(g.w.location.hash.startsWith('#/login'), 'guard: /account redirects anonymous users to login');
    await g.go('#/admin');
    await g.until(() => g.$('form[data-form=admin-login]'), 'admin login form');
    ok(!/Overview|Franchise Applications/.test(g.$('#view-admin').textContent), 'guard: admin area shows only a login form to anonymous users');
    const bad = g.$('form[data-form=admin-login]'); g.fill(bad, { email: 'admin@example.com', password: 'nope' }); g.submit(bad);
    await g.until(() => /credentials/i.test(g.$('#toast').textContent), 'bad admin toast');
    ok(g.$('form[data-form=admin-login]'), 'guard: wrong admin password keeps the login form');

    /* ------------------------------------------------ admin journey */
    const af3 = g.$('form[data-form=admin-login]'); g.fill(af3, { email: 'admin@example.com', password: 'admin123' }); g.submit(af3);
    await g.until(() => /Admin Dashboard/.test(g.$('#view-admin').textContent) && /New applications/.test(g.$('#admin-body').textContent), 'admin overview');
    ok(/sample investment figures/.test(g.$('#admin-body').textContent), 'admin: warns that plans still use sample figures');
    ok(/development admin login/.test(g.$('#admin-body').textContent), 'admin: warns about dev admin credentials');
    ok(g.$$('#admin-body svg rect').length > 6, 'admin: charts rendered');

    await g.go('#/admin/applications');
    await g.until(() => g.$$('#apps-table tbody tr').length === 2, 'apps table');
    ok(!g.$('#apps-table img') && g.$('#apps-table').textContent.includes('<img src=x'), 'admin: malicious name shown as TEXT, not executed (XSS-safe)');
    ok(g.w.__xss === undefined, 'admin: injected onerror never ran');
    g.type(g.$('[data-input=admin-app-filter]'), 'sita');
    ok(g.$$('#apps-table tbody tr').length === 1, 'admin: search filters the list');
    g.type(g.$('[data-input=admin-app-filter]'), '');
    const sel = g.$('#apps-table tbody tr select[data-change=admin-app-status]');
    g.change(sel, 'Contacted');
    await g.until(() => /set to Contacted/.test(g.$('#toast').textContent), 'status toast');
    ok(true, 'admin: status changed from the table');
    g.$('[data-action=admin-app-view][data-id=FR-1002]').click();
    const sv = await g.until(() => g.$('form[data-form=admin-app-save]'), 'application modal');
    g.fill(sv, { status: 'Meeting Scheduled', note: 'We will call you Monday.', internalNote: 'hot lead' }); g.submit(sv);
    await g.until(() => !g.$('#modal'), 'modal closed after save');
    ok(true, 'admin: application status + notes saved');
    ok(g.$('a[href="/api/admin/applications.csv"]'), 'admin: CSV export link present');

    // applicant (other window) now sees the update
    await p.go('#/account'); p.$('[data-action=acct-tab][data-tab=applications]').click();
    await p.until(() => /Monday/.test(p.$('#acct-body').textContent), 'applicant sees note');
    ok(/Meeting Scheduled/.test(p.$('#acct-body').textContent) && !/hot lead/.test(p.$('#acct-body').textContent), 'applicant sees new status + public note, NOT the internal note');

    // plans: edit + public site refreshes without reload
    await g.go('#/admin/plans');
    await g.until(() => g.$$('#admin-body tbody tr').length === 3, 'plans table');
    g.$('[data-action=admin-plan-edit][data-id=plan_kiosk]').click();
    const pl = await g.until(() => g.$('form[data-form=admin-plan-save]'), 'plan form');
    g.fill(pl, { name: 'Coffee Kiosk PLUS', investmentMin: '700000', investmentMax: '1000000' }); g.submit(pl);
    await g.until(() => /Coffee Kiosk PLUS/.test(g.$('#admin-body').textContent), 'plan saved');
    ok(/Coffee Kiosk PLUS/.test(g.$('#plans-grid').textContent) && /₹7 Lakh - ₹10 Lakh/.test(g.$('#plans-grid').textContent), 'admin: edited plan appears on the public page instantly');
    await g.go('#/admin/settings');
    const st = await g.until(() => g.$('form[data-form=admin-settings]'), 'settings form');
    g.fill(st, { heroHeading: 'JOIN THE\nCOFFEE FAMILY', whatsappNum: '+91 90000 00000' }); g.submit(st);
    await g.until(() => /Settings saved/.test(g.$('#toast').textContent), 'settings saved');
    ok(/JOIN THE/.test(g.$('#hero-heading').textContent) && g.$('#hero-heading br') && g.$('#wa-btn').href.includes('919000000000'), 'admin: hero heading + WhatsApp update live');
    await g.go('#/admin/orders');
    await g.until(() => /ORD-10001/.test(g.$('#admin-body').textContent), 'orders tab');
    ok(true, 'admin: shop order visible');
    await g.go('#/admin/messages');
    await g.until(() => /franchise brochure/.test(g.$('#admin-body').textContent), 'messages tab');
    ok(true, 'admin: contact message visible');

    ok(p.errors.length === 0 && g.errors.length === 0, 'no uncaught JS errors in either window ' + [...p.errors, ...g.errors].join('|'));
  } catch (e) {
    fail++; console.log('FAIL  UI test crashed:', e.message);
  } finally {
    srv.kill();
    console.log(`\nui: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
