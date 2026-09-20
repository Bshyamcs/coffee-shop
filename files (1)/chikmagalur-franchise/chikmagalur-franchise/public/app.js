'use strict';
/* Chikmagalur Filter Coffee - franchise site frontend.
   No inline handlers anywhere (strict CSP): everything is wired through data-action / data-form delegation. */
(function () {
  /* ================================================================ utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const trimZeros = (x) => x.replace(/\.?0+$/, '');
  const lakh = (n) => (n >= 10000000 ? '₹' + trimZeros((n / 10000000).toFixed(2)) + ' Cr' : n >= 100000 ? '₹' + trimZeros((n / 100000).toFixed(2)) + ' Lakh' : money(n));
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };
  const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  const ICONS = {
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    store: '<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  };
  const ic = (name, cls = 'w-5 h-5') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const GOOGLE_G = '<svg class="w-4 h-4" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>';

  /* ================================================================ state + api */
  const S = {
    settings: {}, plans: [], products: [], user: null, googleEnabled: false, options: {},
    cart: [], coupon: '', quote: null, quoteSeq: 0, cat: 'All', acctTab: 'applications', ready: false,
  };
  const actions = {};  // data-action handlers (admin.js adds more)
  const forms = {};    // data-form handlers

  async function api(path, opts = {}) {
    const method = opts.method || 'GET';
    const init = { method, headers: {}, credentials: 'same-origin' };
    if (method !== 'GET') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body === undefined ? {} : opts.body); }
    let res;
    try { res = await fetch(path, init); } catch { throw new Error('Cannot reach the server. Please check your connection.'); }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const e = new Error((data && data.error) || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return data;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('opacity-0', 'translate-y-20');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('opacity-0', 'translate-y-20'), 3500);
  }

  /** disables the submit button while a request runs; shows errors as toasts */
  async function busy(form, fn) {
    const btn = form && form.querySelector('button:not([type=button])');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); btn.textContent = 'Please wait...'; }
    try { return await fn(); }
    catch (e) { toast(e.message); return undefined; }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('opacity-60'); btn.textContent = label; } }
  }
  const formData = (form) => {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = v; });
    $$('input[type=checkbox]', form).forEach((c) => { o[c.name] = c.checked; });
    return o;
  };

  /* ---- modal */
  function openModal(html, wide = false) {
    closeModal();
    const el = document.createElement('div');
    el.id = 'modal';
    el.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    el.innerHTML = `<div data-action="close-modal" class="absolute inset-0 bg-black/50"></div>
      <div role="dialog" aria-modal="true" class="relative bg-offwhite w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl border border-black/5">
        <button data-action="close-modal" class="absolute top-3 right-3 p-1.5 text-charcoal/60 hover:text-charcoal" aria-label="Close">${ic('x', 'w-5 h-5')}</button>${html}</div>`;
    $('#overlay-root').appendChild(el);
    const first = $('input, select, textarea', el);
    if (first) first.focus();
  }
  function closeModal() { const m = $('#modal'); if (m) m.remove(); }

  /* ---- images: data-fb marks which built-in artwork to fall back to */
  const img = (src, kind, alt, cls) => `<img src="${esc(src || window.fbSrc(kind))}" data-fb="${esc(kind)}" alt="${esc(alt)}" loading="lazy" class="${cls}">`;

  /* ================================================================ settings -> DOM */
  function setMultiline(el, text) {
    el.textContent = '';
    String(text).split(/\n|<br\s*\/?>/i).forEach((line, i) => { if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(line)); });
  }
  const waLink = () => `https://wa.me/${S.settings.whatsappNum}?text=${encodeURIComponent(S.settings.whatsappMsg || '')}`;
  const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');

  function applySettings() {
    const s = S.settings;
    $('#hero-img').src = s.heroImage || window.fbSrc('hero');
    $('#story-img').src = s.storyImage || window.fbSrc('cup');
    setMultiline($('#hero-heading'), s.heroHeading);
    $('#hero-sub').textContent = s.heroSub;
    $('#hero-address').textContent = s.address;
    const hp = $('#hero-phone'); hp.textContent = s.phone; hp.href = telHref(s.phone);
    $('#contact-address').textContent = s.address;
    const cp = $('#contact-phone'); cp.textContent = s.phone; cp.href = telHref(s.phone);
    const ce = $('#contact-email'); ce.textContent = s.email; ce.href = 'mailto:' + s.email;
    $('#wa-btn').href = waLink();
  }

  /* ================================================================ header */
  function renderAccountSlot() {
    const u = S.user;
    $('#account-slot').innerHTML = u
      ? `${u.isAdmin ? '<a href="#/admin" class="hidden md:inline-block text-[10px] uppercase tracking-widest border border-black/15 px-2 py-1 hover:border-coffee hover:text-coffee">Admin</a>' : ''}
         <a href="#/account" class="flex items-center space-x-1.5 text-charcoal hover:text-coffee" aria-label="My account">${ic('user', 'w-5 h-5')}<span class="hidden md:inline text-[11px] uppercase tracking-widest font-medium">${esc(u.name.split(' ')[0])}</span></a>`
      : `<a href="#/login" class="flex items-center space-x-1.5 text-charcoal hover:text-coffee" aria-label="Sign in">${ic('user', 'w-5 h-5')}<span class="hidden md:inline text-[11px] uppercase tracking-widest font-medium">Sign in</span></a>`;
  }
  function updateBadge() {
    const n = S.cart.reduce((s, i) => s + i.qty, 0);
    const b = $('#cart-badge');
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  }
  actions['toggle-menu'] = () => {
    const m = $('#mobile-menu'); m.classList.toggle('hidden');
    $('[data-action=toggle-menu]').setAttribute('aria-expanded', String(!m.classList.contains('hidden')));
  };
  actions['close-menu'] = () => $('#mobile-menu').classList.add('hidden');

  /* ================================================================ home: models, shop */
  function renderModels() {
    const box = $('#plans-grid');
    if (!S.plans.length) { box.innerHTML = '<p class="md:col-span-3 text-center text-sm font-light text-charcoal/60">Franchise models will be published soon. Please <a href="#/apply" class="underline">apply</a> and we will get in touch.</p>'; return; }
    box.innerHTML = S.plans.map((p) => `
      <article class="relative bg-white border ${p.badge ? 'border-coffee' : 'border-black/10'} p-8 flex flex-col">
        ${p.badge ? `<span class="absolute -top-3 left-8 bg-coffee text-white text-[10px] tracking-widest uppercase px-3 py-1">${esc(p.badge)}</span>` : ''}
        <h3 class="font-serif-heading text-3xl uppercase">${esc(p.name)}</h3>
        <p class="mt-2 text-xs font-light text-charcoal/70 leading-relaxed min-h-[2.5rem]">${esc(p.tagline)}</p>
        <div class="mt-6 pt-6 border-t border-black/10">
          <div class="text-[10px] uppercase tracking-widest text-charcoal/50">Indicative investment</div>
          <div class="font-serif-heading text-3xl text-coffee mt-1">${lakh(p.investmentMin)} - ${lakh(p.investmentMax)}</div>
          <div class="mt-3 text-xs font-light text-charcoal/70">${esc(p.format)}${p.area ? ' &middot; ' + esc(p.area) : ''}</div>
        </div>
        <ul class="mt-6 space-y-2.5 text-xs font-light text-charcoal/80 flex-grow">
          ${(p.features || []).map((f) => `<li class="flex gap-2.5">${ic('check', 'w-4 h-4 text-coffee shrink-0 mt-px')}<span>${esc(f)}</span></li>`).join('')}
        </ul>
        <a href="#/apply?plan=${encodeURIComponent(p.id)}" class="mt-8 block text-center bg-charcoal text-white hover:bg-coffee py-3.5 text-[11px] tracking-widest uppercase font-medium transition-colors">Apply for this model</a>
      </article>`).join('');
  }

  const CAT_LABEL = { All: 'All', 'Filter Coffee': 'Filter Coffee', Beans: 'Whole Beans', Combos: 'Combos & Gifts' };
  function renderShop() {
    const cats = ['All', ...(S.options.categories || [])];
    $('#cat-filters').innerHTML = cats.map((c) => `<button data-action="filter-cat" data-cat="${esc(c)}" class="px-4 py-2 text-[11px] tracking-widest uppercase border transition-colors ${c === S.cat ? 'bg-charcoal text-white border-charcoal' : 'border-black/10 text-charcoal/70 hover:border-coffee'}">${esc(CAT_LABEL[c] || c)}</button>`).join('');
    const list = S.cat === 'All' ? S.products : S.products.filter((p) => p.category === S.cat);
    $('#product-grid').innerHTML = list.length ? list.map((p) => `
      <div class="group flex flex-col">
        <button data-action="view-product" data-id="${esc(p.id)}" class="aspect-square bg-surface overflow-hidden mb-4 block w-full" aria-label="View ${esc(p.name)}">
          ${img(p.image, window.fbKind(p.category), p.name, 'w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500')}
        </button>
        <div class="flex justify-between items-baseline gap-3 mb-1">
          <h3 class="text-sm font-medium tracking-wide">${esc(p.name)}</h3>
          <span class="text-sm font-semibold">${money(p.price)}</span>
        </div>
        <div class="text-xs font-light text-charcoal/60 mb-3">${esc(p.weight)}</div>
        <button data-action="add-cart" data-id="${esc(p.id)}" class="mt-auto border border-charcoal/20 hover:border-coffee hover:bg-coffee hover:text-white text-[11px] font-medium uppercase tracking-widest py-2.5 transition-colors">+ Add to basket</button>
      </div>`).join('') : '<p class="col-span-full text-center text-sm font-light text-charcoal/60 py-8">No products in this category yet.</p>';
  }
  actions['filter-cat'] = (el) => { S.cat = el.dataset.cat; renderShop(); };
  actions['view-product'] = (el) => {
    const p = S.products.find((x) => x.id === el.dataset.id);
    if (!p) return;
    openModal(`<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center pt-4">
        ${img(p.image, window.fbKind(p.category), p.name, 'w-full aspect-square object-cover')}
        <div><span class="text-[10px] uppercase tracking-widest text-coffee font-semibold">${esc(p.category)}</span>
          <h3 class="font-serif-heading text-3xl uppercase mt-1 mb-2">${esc(p.name)}</h3>
          <div class="text-lg font-semibold mb-2">${money(p.price)} <span class="text-xs font-light text-charcoal/60">/ ${esc(p.weight)}</span></div>
          <p class="text-xs font-light text-charcoal/80 leading-relaxed mb-6">${esc(p.desc)}</p>
          <button data-action="add-cart" data-id="${esc(p.id)}" data-close="1" class="w-full bg-charcoal text-white hover:bg-coffee py-3 text-xs tracking-widest uppercase transition-colors">Add to basket</button></div></div>`, true);
  };

  /* ================================================================ cart + checkout */
  const CART_KEY = 'cfc_cart';
  function loadCart() {
    try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(c) ? c.filter((i) => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 20) : []; } catch { return []; }
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch { /* private mode */ } updateBadge(); }
  const productById = (id) => S.products.find((p) => p.id === id);

  actions['add-cart'] = (el) => {
    const id = el.dataset.id; const p = productById(id);
    if (!p) return toast('This product is no longer available');
    const line = S.cart.find((i) => i.id === id);
    if (line) line.qty = Math.min(20, line.qty + 1); else S.cart.push({ id, qty: 1 });
    saveCart(); toast(`${p.name} added to basket`);
    if (el.dataset.close) closeModal();
    if ($('#cart-drawer')) { renderCart(); refreshQuote(); }
  };
  actions['cart-qty'] = (el) => {
    const line = S.cart.find((i) => i.id === el.dataset.id); if (!line) return;
    line.qty += Number(el.dataset.d);
    if (line.qty <= 0) S.cart = S.cart.filter((i) => i !== line);
    if (line.qty > 20) line.qty = 20;
    saveCart(); renderCart(); refreshQuote();
  };

  async function refreshQuote() {
    const seq = ++S.quoteSeq;
    if (!S.cart.length) { S.quote = null; S.coupon = ''; renderCart(); return; }
    try {
      const q = await api('/api/cart/quote', { method: 'POST', body: { items: S.cart, coupon: S.coupon } });
      if (seq !== S.quoteSeq) return;
      S.quote = q;
    } catch (e) {
      if (seq !== S.quoteSeq) return;
      if (S.coupon) { toast(e.message); S.coupon = ''; return refreshQuote(); }   // drop a coupon that no longer applies
      S.quote = null; toast(e.message);
    }
    renderCart();
  }

  function renderCart() {
    const box = $('#cart-body'); if (!box) return;
    S.cart = S.cart.filter((i) => productById(i.id));
    const lines = S.cart.map((i) => ({ ...i, p: productById(i.id) }));
    const localSub = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
    const q = S.quote;
    box.innerHTML = !lines.length
      ? `<div class="flex-grow flex flex-col items-center justify-center text-center text-sm font-light text-charcoal/60 py-16">Your basket is empty.<a href="#/shop" data-action="close-cart" class="mt-4 underline hover:text-coffee">Browse our coffee</a></div>`
      : `<div class="flex-grow overflow-y-auto space-y-4 pr-1">${lines.map((l) => `
          <div class="flex items-center justify-between border-b border-black/5 pb-4 gap-3">
            <div class="flex items-center gap-3 min-w-0">
              ${img(l.p.image, window.fbKind(l.p.category), l.p.name, 'w-14 h-14 object-cover shrink-0')}
              <div class="min-w-0"><div class="text-xs font-medium truncate">${esc(l.p.name)}</div><div class="text-[11px] text-charcoal/60">${money(l.p.price)} &middot; ${esc(l.p.weight)}</div></div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button data-action="cart-qty" data-id="${esc(l.id)}" data-d="-1" class="w-7 h-7 border border-black/10 flex items-center justify-center" aria-label="Decrease">${ic('minus', 'w-3 h-3')}</button>
              <span class="text-xs w-5 text-center">${l.qty}</span>
              <button data-action="cart-qty" data-id="${esc(l.id)}" data-d="1" class="w-7 h-7 border border-black/10 flex items-center justify-center" aria-label="Increase">${ic('plus', 'w-3 h-3')}</button>
            </div>
          </div>`).join('')}</div>
        <div class="pt-4 mt-4 border-t border-black/10 space-y-3 text-xs">
          ${S.coupon && q && q.coupon
            ? `<div class="flex justify-between items-center bg-surface px-3 py-2"><span>Coupon <b>${esc(q.coupon.code)}</b> (${q.coupon.discountPercent}% off)</span><button data-action="remove-coupon" class="underline text-charcoal/60">Remove</button></div>`
            : `<form data-form="coupon" class="flex gap-2"><input name="code" placeholder="Coupon code" class="field uppercase !p-2 text-xs flex-grow" autocomplete="off"><button class="bg-charcoal text-white px-4 text-[11px] uppercase tracking-widest hover:bg-coffee">Apply</button></form>`}
          <div class="flex justify-between"><span class="text-charcoal/70">Subtotal</span><span>${money(q ? q.subtotal : localSub)}</span></div>
          ${q && q.discount ? `<div class="flex justify-between text-coffee"><span>Discount</span><span>-${money(q.discount)}</span></div>` : ''}
          <div class="flex justify-between"><span class="text-charcoal/70">Shipping</span><span>${q ? (q.shipping ? money(q.shipping) : 'Free') : '...'}</span></div>
          ${q && q.shipping ? `<div class="text-[11px] text-charcoal/50">Free shipping on orders above ${money(q.freeShippingAbove)}</div>` : ''}
          <div class="flex justify-between text-base font-semibold pt-3 border-t border-black/10"><span>Total</span><span>${q ? money(q.total) : money(localSub)}</span></div>
          <button data-action="checkout" class="w-full bg-charcoal text-white hover:bg-coffee py-3.5 text-xs tracking-widest uppercase font-medium transition-colors">Checkout</button>
        </div>`;
  }

  actions['open-cart'] = () => {
    if ($('#cart-drawer')) return;
    const el = document.createElement('div');
    el.id = 'cart-drawer';
    el.className = 'fixed inset-0 z-[55]';
    el.innerHTML = `<div data-action="close-cart" class="absolute inset-0 bg-black/40"></div>
      <aside class="absolute right-0 top-0 h-full w-full max-w-md bg-offwhite shadow-2xl p-6 flex flex-col" aria-label="Basket">
        <div class="flex justify-between items-center pb-4 border-b border-black/10 mb-4">
          <h2 class="font-serif-heading text-2xl uppercase">Your Basket</h2>
          <button data-action="close-cart" aria-label="Close basket" class="p-1">${ic('x', 'w-5 h-5')}</button>
        </div>
        <div id="cart-body" class="flex-grow flex flex-col min-h-0"></div>
      </aside>`;
    $('#overlay-root').appendChild(el);
    renderCart(); refreshQuote();
  };
  actions['close-cart'] = () => { const d = $('#cart-drawer'); if (d) d.remove(); };
  actions['remove-coupon'] = () => { S.coupon = ''; refreshQuote(); };
  forms.coupon = async (f) => {
    const code = f.elements.code.value.trim().toUpperCase(); if (!code) return;
    S.coupon = code;
    const before = S.quoteSeq;
    await refreshQuote();
    if (S.coupon && S.quote && S.quote.coupon) toast(`Coupon ${S.quote.coupon.code} applied`);
    return before;
  };

  actions.checkout = () => {
    if (!S.cart.length) return;
    const u = S.user || {};
    actions['close-cart']();
    openModal(`<h2 class="font-serif-heading text-3xl uppercase mb-1">Checkout</h2>
      <p class="text-xs font-light text-charcoal/60 mb-5">Total to pay: <b class="text-charcoal">${money(S.quote ? S.quote.total : 0)}</b> &middot; pay on delivery</p>
      <form data-form="checkout" class="space-y-3" novalidate>
        <div><label class="block text-[10px] uppercase tracking-widest text-charcoal/60 mb-1" for="k-name">Full name</label><input id="k-name" name="name" class="field" required value="${esc(u.name || '')}" autocomplete="name"></div>
        <div><label class="block text-[10px] uppercase tracking-widest text-charcoal/60 mb-1" for="k-phone">Phone number</label><input id="k-phone" name="phone" type="tel" class="field" required value="${esc(u.phone || '')}" autocomplete="tel"></div>
        <div><label class="block text-[10px] uppercase tracking-widest text-charcoal/60 mb-1" for="k-addr">Delivery address</label><textarea id="k-addr" name="address" rows="3" class="field" required placeholder="House no, street, city, PIN code" autocomplete="street-address">${esc(u.address || '')}</textarea></div>
        <p class="text-[11px] text-charcoal/50">We will confirm your order by phone or WhatsApp. Online payment is not enabled yet: you pay on delivery.</p>
        <button class="w-full bg-charcoal text-white hover:bg-coffee py-3.5 text-xs tracking-widest uppercase font-medium transition-colors">Place order</button>
      </form>`);
  };
  forms.checkout = (f) => busy(f, async () => {
    const d = formData(f);
    const res = await api('/api/orders', { method: 'POST', body: { items: S.cart, coupon: S.coupon, customer: { name: d.name, phone: d.phone, address: d.address } } });
    const o = res.order;
    S.cart = []; S.coupon = ''; S.quote = null; saveCart();
    openModal(`<div class="text-center pt-2">
        <div class="mx-auto w-12 h-12 rounded-full bg-coffee text-white flex items-center justify-center">${ic('check', 'w-6 h-6')}</div>
        <h2 class="font-serif-heading text-3xl uppercase mt-4">Order placed</h2>
        <p class="text-sm font-light mt-2">Reference <b>${esc(o.id)}</b> &middot; ${money(o.total)}</p>
        <p class="text-xs font-light text-charcoal/60 mt-3">We will confirm by phone or WhatsApp. ${S.user ? 'You can follow it under My Account.' : ''}</p>
        <button data-action="close-modal" class="mt-6 bg-charcoal text-white px-8 py-3 text-xs tracking-widest uppercase hover:bg-coffee">Continue</button></div>`);
  });

  /* ================================================================ forms: contact */
  forms.contact = (f) => busy(f, async () => {
    await api('/api/contact', { method: 'POST', body: formData(f) });
    f.reset(); toast('Message sent. We will get back to you soon.');
  });

  /* ================================================================ apply */
  const selectHtml = (name, id, options, selected, placeholder) => `<select name="${name}" id="${id}" class="field" required>
      ${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}
      ${options.map((o) => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}
    </select>`;
  const lbl = (text, id) => `<label class="block text-[10px] uppercase tracking-widest text-charcoal/60 mb-1.5" for="${id}">${text}</label>`;

  function googleButton(next, label = 'Continue with Google') {
    return S.googleEnabled
      ? `<a href="/api/auth/google?next=${encodeURIComponent(next)}" class="w-full flex items-center justify-center gap-2.5 bg-white border border-black/15 hover:bg-black/5 py-3 text-xs font-medium uppercase tracking-widest transition-colors">${GOOGLE_G}<span>${esc(label)}</span></a>`
      : `<div class="w-full flex items-center justify-center gap-2.5 border border-dashed border-black/15 py-3 text-[11px] uppercase tracking-widest text-charcoal/40" title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET">${GOOGLE_G}<span>Google sign-in not configured yet</span></div>`;
  }

  function renderApply(planId) {
    const u = S.user || {};
    const o = S.options;
    const planOpts = [{ value: '', label: 'Not sure yet - advise me' }, ...S.plans.map((p) => ({ value: p.id, label: `${p.name} (${lakh(p.investmentMin)} - ${lakh(p.investmentMax)})` }))];
    $('#view-apply').innerHTML = `
      <section class="py-14 md:py-20 bg-offwhite">
        <div class="max-w-3xl mx-auto px-4 md:px-8">
          <a href="#/models" class="text-[11px] uppercase tracking-widest text-charcoal/60 hover:text-coffee">&larr; Franchise models</a>
          <span class="block mt-6 text-[11px] tracking-widest uppercase text-coffee font-semibold">Franchise Application</span>
          <h1 class="font-serif-heading text-4xl md:text-6xl font-normal mt-2 uppercase leading-tight">Apply to partner with us</h1>
          <p class="mt-4 text-sm font-light text-charcoal/70">Tell us a little about you and your plans. Our team will review your application and contact you.</p>
          ${S.user ? `<p class="mt-4 text-xs bg-surface px-4 py-3">Signed in as <b>${esc(S.user.email)}</b>. You can follow this application under My Account.</p>` : `
          <div class="mt-6 bg-surface p-5 space-y-3">
            <p class="text-xs font-light">Sign in to prefill your details and <b>track your application status</b> online.</p>
            ${googleButton('/#/apply')}
            <p class="text-[11px] text-charcoal/60">or <a href="#/login?next=apply" class="underline">sign in with email</a>, or continue as a guest below.</p>
          </div>`}
          <form data-form="apply" class="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5" novalidate>
            <div>${lbl('Full name *', 'a-name')}<input id="a-name" name="name" class="field" required value="${esc(u.name || '')}" autocomplete="name"></div>
            <div>${lbl('Email *', 'a-email')}<input id="a-email" name="email" type="email" class="field" required value="${esc(u.email || '')}" autocomplete="email"></div>
            <div>${lbl('Phone / WhatsApp *', 'a-phone')}<input id="a-phone" name="phone" type="tel" class="field" required value="${esc(u.phone || '')}" autocomplete="tel"></div>
            <div>${lbl('City *', 'a-city')}<input id="a-city" name="city" class="field" required autocomplete="address-level2"></div>
            <div>${lbl('State *', 'a-state')}<input id="a-state" name="state" class="field" required autocomplete="address-level1"></div>
            <div>${lbl('Preferred model', 'a-plan')}${selectHtml('planId', 'a-plan', planOpts, planId || '')}</div>
            <div>${lbl('Investment budget *', 'a-budget')}${selectHtml('budget', 'a-budget', o.budgets || [], '', 'Select budget')}</div>
            <div>${lbl('Location / property *', 'a-prop')}${selectHtml('property', 'a-prop', o.property || [], '', 'Select option')}</div>
            <div>${lbl('Your background *', 'a-exp')}${selectHtml('experience', 'a-exp', o.experience || [], '', 'Select option')}</div>
            <div>${lbl('When do you want to start? *', 'a-time')}${selectHtml('timeline', 'a-time', o.timeline || [], '', 'Select timeline')}</div>
            <div class="sm:col-span-2">${lbl('Anything else we should know?', 'a-msg')}<textarea id="a-msg" name="message" rows="4" class="field" maxlength="1500" placeholder="Proposed location, questions, experience..."></textarea></div>
            <label class="sm:col-span-2 flex items-start gap-3 text-xs font-light text-charcoal/80"><input type="checkbox" name="consent" required class="mt-0.5 accent-[#6B4935]"><span>I agree to be contacted by Chikmagalur Filter Coffee about my franchise enquiry.</span></label>
            <div class="sm:col-span-2"><button class="w-full sm:w-auto bg-charcoal text-white hover:bg-coffee px-10 py-4 text-xs tracking-widest uppercase font-medium transition-colors">Submit application</button></div>
          </form>
        </div>
      </section>`;
  }
  forms.apply = (f) => busy(f, async () => {
    const d = formData(f);
    if (!d.consent) throw new Error('Please tick the consent box so we can contact you');
    const res = await api('/api/franchise/apply', { method: 'POST', body: d });
    const a = res.application;
    $('#view-apply').innerHTML = `<section class="py-20 md:py-28 bg-offwhite"><div class="max-w-xl mx-auto px-4 text-center">
        <div class="mx-auto w-14 h-14 rounded-full bg-coffee text-white flex items-center justify-center">${ic('check', 'w-7 h-7')}</div>
        <h1 class="font-serif-heading text-4xl md:text-5xl uppercase mt-6">Application received</h1>
        <p class="mt-4 text-sm font-light text-charcoal/70">Thank you. Your reference number is <b class="text-charcoal">${esc(a.id)}</b> for the <b class="text-charcoal">${esc(a.planName)}</b> model. Our team will contact you soon.</p>
        ${S.user ? `<a href="#/account" class="mt-8 inline-block bg-charcoal text-white hover:bg-coffee px-8 py-3.5 text-xs tracking-widest uppercase">Track my application</a>`
                 : `<div class="mt-8 bg-surface p-5 space-y-3 text-left"><p class="text-xs font-light">Want to track progress online? Sign in with the same email you used (${esc(d.email)}).</p>${googleButton('/#/account')}</div>`}
        <a href="#/" class="mt-6 inline-block text-[11px] uppercase tracking-widest text-charcoal/60 hover:text-coffee">Back to home</a></div></section>`;
    window.scrollTo({ top: 0 });
  });

  /* ================================================================ auth views */
  function authCard(title, sub, body) {
    return `<section class="py-16 md:py-24 bg-surface min-h-[70vh]"><div class="max-w-md mx-auto px-4">
      <div class="bg-offwhite border border-black/5 p-8 md:p-10 shadow-sm">
        <span class="text-[11px] tracking-widest uppercase text-coffee font-semibold">${esc(sub)}</span>
        <h1 class="font-serif-heading text-4xl uppercase mt-1 mb-6">${esc(title)}</h1>${body}</div></div></section>`;
  }
  const sepOr = '<div class="flex items-center gap-3 my-5 text-[10px] uppercase tracking-widest text-charcoal/40"><span class="flex-grow h-px bg-black/10"></span>or<span class="flex-grow h-px bg-black/10"></span></div>';

  function renderLogin(next) {
    $('#view-login').innerHTML = authCard('Sign in', 'Welcome back', `
      ${googleButton('/#/' + (next || 'account'))}${sepOr}
      <form data-form="login" data-next="${esc(next || 'account')}" class="space-y-4" novalidate>
        <div>${lbl('Email', 'l-email')}<input id="l-email" name="email" type="email" class="field" required autocomplete="email"></div>
        <div>${lbl('Password', 'l-pass')}<input id="l-pass" name="password" type="password" class="field" required autocomplete="current-password"></div>
        <button class="w-full bg-charcoal text-white hover:bg-coffee py-3.5 text-xs tracking-widest uppercase font-medium transition-colors">Sign in</button>
      </form>
      <p class="mt-6 text-xs font-light text-charcoal/70 text-center">New here? <a href="#/signup${next ? '?next=' + esc(next) : ''}" class="underline hover:text-coffee">Create an account</a></p>`);
  }
  function renderSignup(next) {
    $('#view-signup').innerHTML = authCard('Create account', 'Join us', `
      ${googleButton('/#/' + (next || 'account'), 'Sign up with Google')}${sepOr}
      <form data-form="signup" data-next="${esc(next || 'account')}" class="space-y-4" novalidate>
        <div>${lbl('Full name', 's-name')}<input id="s-name" name="name" class="field" required autocomplete="name"></div>
        <div>${lbl('Email', 's-email')}<input id="s-email" name="email" type="email" class="field" required autocomplete="email"></div>
        <div>${lbl('Phone (optional)', 's-phone')}<input id="s-phone" name="phone" type="tel" class="field" autocomplete="tel"></div>
        <div>${lbl('Password (min 8 characters)', 's-pass')}<input id="s-pass" name="password" type="password" minlength="8" class="field" required autocomplete="new-password"></div>
        <button class="w-full bg-charcoal text-white hover:bg-coffee py-3.5 text-xs tracking-widest uppercase font-medium transition-colors">Create account</button>
      </form>
      <p class="mt-6 text-xs font-light text-charcoal/70 text-center">Already registered? <a href="#/login${next ? '?next=' + esc(next) : ''}" class="underline hover:text-coffee">Sign in</a></p>`);
  }
  const safeNext = (n) => (/^[a-z-]{1,20}$/.test(n || '') ? n : 'account');
  forms.login = (f) => busy(f, async () => {
    const d = formData(f);
    const res = await api('/api/auth/login', { method: 'POST', body: d });
    S.user = res.user; renderAccountSlot(); toast('Welcome back, ' + res.user.name.split(' ')[0]);
    location.hash = '#/' + safeNext(f.dataset.next);
  });
  forms.signup = (f) => busy(f, async () => {
    const res = await api('/api/auth/register', { method: 'POST', body: formData(f) });
    S.user = res.user; renderAccountSlot(); toast('Account created. Welcome!');
    location.hash = '#/' + safeNext(f.dataset.next);
  });
  actions.logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    S.user = null; renderAccountSlot(); toast('Signed out'); location.hash = '#/';
  };

  /* ================================================================ account */
  const STATUS_STYLE = {
    New: 'bg-blue-50 text-blue-800', Contacted: 'bg-amber-50 text-amber-800', 'Meeting Scheduled': 'bg-purple-50 text-purple-800',
    'Site Review': 'bg-indigo-50 text-indigo-800', Agreement: 'bg-teal-50 text-teal-800', Approved: 'bg-green-50 text-green-800', Rejected: 'bg-red-50 text-red-800',
    Processing: 'bg-amber-50 text-amber-800', Shipped: 'bg-blue-50 text-blue-800', Delivered: 'bg-green-50 text-green-800', Cancelled: 'bg-red-50 text-red-800',
  };
  const pill = (s) => `<span class="inline-block px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[s] || 'bg-black/5 text-charcoal'}">${esc(s)}</span>`;
  const TRACK = ['New', 'Contacted', 'Meeting Scheduled', 'Site Review', 'Agreement', 'Approved'];

  function tracker(status) {
    if (status === 'Rejected') return '<p class="mt-4 text-xs text-red-800 bg-red-50 px-3 py-2">This application was not taken forward. Please contact us if you have questions.</p>';
    const cur = TRACK.indexOf(status);
    return `<ol class="mt-5 grid grid-cols-6 gap-1 text-center">${TRACK.map((s, i) => `
      <li class="flex flex-col items-center gap-1.5"><span class="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] ${i <= cur ? 'bg-coffee text-white border-coffee' : 'bg-white text-charcoal/30 border-black/15'}">${i <= cur ? ic('check', 'w-3 h-3') : i + 1}</span>
      <span class="text-[9px] leading-tight uppercase tracking-wide ${i === cur ? 'text-charcoal font-semibold' : 'text-charcoal/40'}">${esc(s)}</span></li>`).join('')}</ol>`;
  }

  function renderAccount() {
    const u = S.user;
    const tab = S.acctTab;
    const tabBtn = (id, label) => `<button data-action="acct-tab" data-tab="${id}" class="px-5 py-3 text-[11px] uppercase tracking-widest border-b-2 ${tab === id ? 'border-coffee text-charcoal font-semibold' : 'border-transparent text-charcoal/50 hover:text-charcoal'}">${label}</button>`;
    $('#view-account').innerHTML = `<section class="py-12 md:py-16 bg-offwhite min-h-[70vh]"><div class="max-w-4xl mx-auto px-4 md:px-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-black/10">
        <div class="flex items-center gap-4">
          ${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer" class="w-14 h-14 rounded-full object-cover">` : `<div class="w-14 h-14 rounded-full bg-coffee text-white flex items-center justify-center font-serif-heading text-2xl">${esc(u.name.charAt(0).toUpperCase())}</div>`}
          <div><h1 class="font-serif-heading text-3xl uppercase leading-none">${esc(u.name)}</h1><p class="text-xs font-light text-charcoal/60 mt-1">${esc(u.email)}${u.provider === 'google' ? ' &middot; Google account' : ''}</p></div>
        </div>
        <div class="flex gap-2"><a href="#/apply" class="bg-charcoal text-white hover:bg-coffee px-5 py-2.5 text-[11px] uppercase tracking-widest">New application</a>
          <button data-action="logout" class="border border-black/15 hover:border-coffee px-5 py-2.5 text-[11px] uppercase tracking-widest">Sign out</button></div>
      </div>
      <div class="flex border-b border-black/10 mt-2 overflow-x-auto">${tabBtn('applications', 'My Applications')}${tabBtn('orders', 'My Orders')}${tabBtn('profile', 'Profile')}</div>
      <div id="acct-body" class="py-8"><p class="text-sm font-light text-charcoal/50">Loading...</p></div></div></section>`;
    loadAccountTab();
  }

  async function loadAccountTab() {
    const box = $('#acct-body'); if (!box) return;
    const tab = S.acctTab;
    try {
      if (tab === 'applications') {
        const { applications } = await api('/api/franchise/mine');
        box.innerHTML = applications.length ? applications.map((a) => `
          <article class="border border-black/10 bg-white p-6 mb-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div><div class="text-[11px] uppercase tracking-widest text-charcoal/50">${esc(a.id)} &middot; ${fmtDate(a.createdAt)}</div>
                <h3 class="font-serif-heading text-2xl uppercase mt-1">${esc(a.planName)}</h3>
                <div class="text-xs font-light text-charcoal/70 mt-1">${esc(a.city)}, ${esc(a.state)} &middot; Budget ${esc(a.budget)}</div></div>${pill(a.status)}</div>
            ${tracker(a.status)}
            ${a.note ? `<div class="mt-5 bg-surface px-4 py-3"><div class="text-[10px] uppercase tracking-widest text-charcoal/50 mb-1">Note from our team</div><p class="text-sm font-light whitespace-pre-line">${esc(a.note)}</p></div>` : ''}
            <div class="mt-4 text-[11px] text-charcoal/40">Last updated ${fmtDateTime(a.updatedAt)}</div>
          </article>`).join('')
          : `<div class="text-center py-12 border border-dashed border-black/15"><p class="text-sm font-light text-charcoal/60">You have not submitted a franchise application yet.</p><a href="#/apply" class="mt-4 inline-block bg-charcoal text-white hover:bg-coffee px-6 py-3 text-[11px] uppercase tracking-widest">Apply now</a></div>`;
      } else if (tab === 'orders') {
        const { orders } = await api('/api/orders/mine');
        box.innerHTML = orders.length ? orders.map((o) => `
          <article class="border border-black/10 bg-white p-5 mb-4">
            <div class="flex flex-wrap justify-between items-center gap-2"><div><b class="text-sm">${esc(o.id)}</b> <span class="text-xs text-charcoal/50 ml-2">${fmtDate(o.createdAt)}</span></div>${pill(o.status)}</div>
            <ul class="mt-3 text-xs font-light text-charcoal/80 space-y-1">${o.items.map((i) => `<li>${esc(i.name)} &times; ${i.qty}</li>`).join('')}</ul>
            <div class="mt-3 pt-3 border-t border-black/5 text-sm font-semibold">${money(o.total)}</div>
          </article>`).join('') : '<p class="text-sm font-light text-charcoal/60">No orders yet. <a href="#/shop" class="underline hover:text-coffee">Browse our coffee</a>.</p>';
      } else {
        const u = S.user;
        box.innerHTML = `<form data-form="profile" class="max-w-lg space-y-4" novalidate>
          <div>${lbl('Full name', 'p-name')}<input id="p-name" name="name" class="field" required value="${esc(u.name)}"></div>
          <div>${lbl('Email', 'p-email')}<input id="p-email" class="field opacity-60" value="${esc(u.email)}" disabled></div>
          <div>${lbl('Phone', 'p-phone')}<input id="p-phone" name="phone" type="tel" class="field" value="${esc(u.phone)}"></div>
          <div>${lbl('Default delivery address', 'p-addr')}<textarea id="p-addr" name="address" rows="3" class="field">${esc(u.address)}</textarea></div>
          <button class="bg-charcoal text-white hover:bg-coffee px-8 py-3.5 text-xs tracking-widest uppercase font-medium transition-colors">Save changes</button></form>`;
      }
    } catch (e) {
      if (e.status === 401) { S.user = null; renderAccountSlot(); location.hash = '#/login?next=account'; return; }
      box.innerHTML = `<p class="text-sm text-red-700">${esc(e.message)}</p>`;
    }
  }
  actions['acct-tab'] = (el) => { S.acctTab = el.dataset.tab; renderAccount(); };
  forms.profile = (f) => busy(f, async () => {
    const res = await api('/api/me', { method: 'PUT', body: formData(f) });
    S.user = res.user; renderAccountSlot(); toast('Profile saved');
  });

  /* ================================================================ router */
  const SECTION = { '': 'sec-top', home: 'sec-top', models: 'sec-models', how: 'sec-how', faq: 'sec-faq', story: 'sec-story', shop: 'sec-shop', contact: 'sec-contact' };
  const VIEWS = ['home', 'apply', 'login', 'signup', 'account', 'admin'];
  const showView = (name) => VIEWS.forEach((v) => $('#view-' + v).classList.toggle('hidden', v !== name));
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { name: parts[0] || '', sub: parts[1] || '', params: new URLSearchParams(qs || '') };
  }

  async function onRoute() {
    const r = parseHash();
    actions['close-menu'](); closeModal();
    const err = r.params.get('error');
    if (err) { toast(err === 'google-not-configured' ? 'Google sign-in is not configured yet.' : 'Google sign-in did not complete. Please try again.'); history.replaceState(null, '', '#/' + r.name); }

    if (r.name in SECTION) {
      const wasHome = !$('#view-home').classList.contains('hidden');
      showView('home');
      if (r.name === '' || r.name === 'home') window.scrollTo({ top: 0, behavior: wasHome ? 'smooth' : 'auto' });
      else { const el = $('#' + SECTION[r.name]); if (el) el.scrollIntoView({ behavior: wasHome ? 'smooth' : 'auto', block: 'start' }); }
      return;
    }
    window.scrollTo({ top: 0 });
    switch (r.name) {
      case 'apply': showView('apply'); renderApply(r.params.get('plan')); break;
      case 'login': if (S.user) { location.hash = '#/account'; return; } showView('login'); renderLogin(r.params.get('next')); break;
      case 'signup': if (S.user) { location.hash = '#/account'; return; } showView('signup'); renderSignup(r.params.get('next')); break;
      case 'account':
        if (!S.user) { location.hash = '#/login?next=account'; return; }
        showView('account'); renderAccount(); break;
      case 'admin': showView('admin'); if (window.CFC_ADMIN) window.CFC_ADMIN.render(r.sub); break;
      default: location.hash = '#/';
    }
  }

  /* ================================================================ event delegation */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) { if (el.tagName === 'BUTTON' || el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const fn = forms[f.dataset.form];
    if (fn) fn(f, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && actions[el.dataset.change]) actions[el.dataset.change](el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (el && actions[el.dataset.input]) actions[el.dataset.input](el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#modal')) closeModal(); else if ($('#cart-drawer')) actions['close-cart']();
  });
  actions['close-modal'] = () => closeModal();

  /* ================================================================ boot */
  function hydrateIcons() { $$('[data-icon]').forEach((el) => { el.innerHTML = ic(el.dataset.icon, el.dataset.cls || 'w-5 h-5'); el.removeAttribute('data-icon'); }); }

  async function boot() {
    hydrateIcons();
    S.cart = loadCart(); updateBadge();
    try {
      const d = await api('/api/bootstrap');
      Object.assign(S, { settings: d.settings, plans: d.plans, products: d.products, user: d.user, googleEnabled: d.googleEnabled, options: d.options });
      S.cart = S.cart.filter((i) => productById(i.id)); saveCart();
      S.ready = true;
    } catch (e) {
      $('#hero-img').src = window.fbSrc('hero');   // avoid a bare alt-text line when the API is down
      $('#hero-heading').textContent = 'We will be right back';
      $('#hero-sub').textContent = e.message;
      toast(e.message);
    }
    if (S.ready) { applySettings(); renderModels(); renderShop(); }
    renderAccountSlot();
    window.addEventListener('hashchange', onRoute);
    onRoute();
  }

  // shared with admin.js
  window.CFC = { S, api, esc, money, lakh, ic, img, toast, busy, formData, openModal, closeModal, actions, forms, pill, fmtDate, fmtDateTime, lbl, waLink, applySettings, renderModels, renderShop, renderAccountSlot, googleButton, selectHtml };
  boot();
})();
