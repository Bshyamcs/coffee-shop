'use strict';
/* Admin dashboard. Every request is re-checked on the server; hiding this UI is only cosmetic. */
(function () {
  const { S, api, esc, money, lakh, ic, toast, busy, formData, openModal, closeModal, actions, forms, pill, fmtDate, fmtDateTime, lbl, googleButton, renderAccountSlot } = window.CFC;
  const root = () => document.getElementById('view-admin');

  const TABS = [
    ['overview', 'Overview'], ['applications', 'Franchise Applications'], ['plans', 'Franchise Plans'], ['orders', 'Shop Orders'],
    ['products', 'Products'], ['coupons', 'Coupons'], ['messages', 'Messages'], ['settings', 'Site Settings'],
  ];
  const A = { tab: 'overview', apps: [], filter: { status: '', q: '' }, plans: [], products: [] };

  /* ------------------------------------------------ small builders */
  const input = (name, label, value = '', o = {}) => `<div class="${o.span ? 'sm:col-span-2' : ''}">${lbl(label + (o.required ? ' *' : ''), 'f-' + name)}
      ${o.rows ? `<textarea id="f-${name}" name="${name}" rows="${o.rows}" class="field" ${o.required ? 'required' : ''} ${o.max ? `maxlength="${o.max}"` : ''}>${esc(value)}</textarea>`
        : `<input id="f-${name}" name="${name}" type="${o.type || 'text'}" value="${esc(value)}" class="field" ${o.required ? 'required' : ''} ${o.step ? `step="${o.step}"` : ''} ${o.min !== undefined ? `min="${o.min}"` : ''}>`}
      ${o.help ? `<p class="mt-1 text-[10px] text-charcoal/50">${esc(o.help)}</p>` : ''}</div>`;
  const check = (name, label, on) => `<label class="flex items-center gap-2 text-xs"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} class="accent-[#6B4935]"> ${esc(label)}</label>`;
  const btn = (label, action, data = {}, cls = 'border border-black/15 hover:border-coffee') =>
    `<button data-action="${action}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} class="${cls} px-3 py-1.5 text-[10px] uppercase tracking-widest transition-colors">${label}</button>`;
  const primaryBtn = (label, action, data) => btn(label, action, data, 'bg-charcoal text-white hover:bg-coffee');
  const table = (heads, rows, empty) => rows.length
    ? `<div class="overflow-x-auto border border-black/10 bg-white"><table class="w-full text-left text-xs"><thead class="bg-surface text-[10px] uppercase tracking-widest text-charcoal/60"><tr>${heads.map((h) => `<th class="p-3 font-semibold whitespace-nowrap">${h}</th>`).join('')}</tr></thead><tbody class="divide-y divide-black/5">${rows.join('')}</tbody></table></div>`
    : `<p class="text-sm font-light text-charcoal/50 py-10 text-center border border-dashed border-black/15">${empty}</p>`;
  const selectOpts = (list, sel) => list.map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const miniSelect = (change, id, list, sel) => `<select data-change="${change}" data-id="${esc(id)}" class="bg-surface border border-black/10 text-[11px] p-1.5">${selectOpts(list, sel)}</select>`;
  const waPhone = (p) => { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

  /* ------------------------------------------------ shell + login */
  function renderLogin() {
    root().innerHTML = `<section class="py-16 md:py-24 bg-surface min-h-[70vh]"><div class="max-w-md mx-auto px-4">
      <div class="bg-offwhite border border-black/5 p-8 md:p-10 shadow-sm">
        <span class="text-[11px] tracking-widest uppercase text-coffee font-semibold">Restricted</span>
        <h1 class="font-serif-heading text-4xl uppercase mt-1 mb-6">Admin sign in</h1>
        ${S.user ? `<p class="mb-5 text-xs bg-red-50 text-red-800 px-3 py-2">You are signed in as ${esc(S.user.email)}, which does not have admin access.</p>` : ''}
        ${googleButton('/#/admin', 'Admin sign-in with Google')}
        <div class="flex items-center gap-3 my-5 text-[10px] uppercase tracking-widest text-charcoal/40"><span class="flex-grow h-px bg-black/10"></span>or<span class="flex-grow h-px bg-black/10"></span></div>
        <form data-form="admin-login" class="space-y-4" novalidate>
          <div>${lbl('Admin email', 'ad-email')}<input id="ad-email" name="email" type="email" class="field" required autocomplete="username"></div>
          <div>${lbl('Password', 'ad-pass')}<input id="ad-pass" name="password" type="password" class="field" required autocomplete="current-password"></div>
          <button class="w-full bg-charcoal text-white hover:bg-coffee py-3.5 text-xs tracking-widest uppercase font-medium transition-colors">Sign in</button>
        </form></div></div></section>`;
  }
  forms['admin-login'] = (f) => busy(f, async () => {
    const res = await api('/api/auth/admin-login', { method: 'POST', body: formData(f) });
    S.user = res.user; renderAccountSlot(); toast('Admin signed in'); render(A.tab);
  });

  function renderShell() {
    root().innerHTML = `<section class="py-8 md:py-10 bg-surface min-h-[80vh]"><div class="max-w-7xl mx-auto px-4 md:px-8">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 class="font-serif-heading text-3xl md:text-4xl uppercase">Admin Dashboard</h1>
        <div class="flex items-center gap-3 text-xs text-charcoal/60"><span>${esc(S.user.email)}</span><button data-action="logout" class="border border-black/15 hover:border-coffee px-3 py-1.5 text-[10px] uppercase tracking-widest">Sign out</button></div>
      </div>
      <nav class="flex gap-2 overflow-x-auto pb-3 mb-6" aria-label="Admin sections">${TABS.map(([id, label]) =>
        `<a href="#/admin/${id}" class="whitespace-nowrap px-4 py-2 text-[11px] uppercase tracking-widest border ${A.tab === id ? 'bg-charcoal text-white border-charcoal' : 'bg-white border-black/10 hover:border-coffee'}">${label}</a>`).join('')}</nav>
      <div id="admin-body"><p class="text-sm text-charcoal/50">Loading...</p></div></div></section>`;
  }

  function render(sub) {
    if (!S.user || !S.user.isAdmin) return renderLogin();
    A.tab = TABS.some((t) => t[0] === sub) ? sub : 'overview';
    renderShell(); loadTab();
  }

  async function loadTab() {
    const box = document.getElementById('admin-body'); if (!box) return;
    try {
      switch (A.tab) {
        case 'overview': return renderOverview(box, await api('/api/admin/overview'));
        case 'applications': A.apps = (await api('/api/admin/applications')).applications; return renderApps(box);
        case 'plans': A.plans = (await api('/api/admin/plans')).plans; return renderPlans(box);
        case 'orders': return renderOrders(box, (await api('/api/admin/orders')).orders);
        case 'products': A.products = (await api('/api/admin/products')).products; return renderProducts(box);
        case 'coupons': return renderCoupons(box, (await api('/api/admin/coupons')).coupons);
        case 'messages': return renderMessages(box, (await api('/api/admin/messages')).messages);
        case 'settings': return renderSettings(box);
        default: return undefined;
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) { S.user = null; renderAccountSlot(); location.hash = '#/admin'; return; }
      box.innerHTML = `<p class="text-sm text-red-700">${esc(e.message)}</p>`;
    }
    return undefined;
  }

  /* ------------------------------------------------ overview */
  function barChart(rows, key, fmt) {
    const max = Math.max(1, ...rows.map((r) => r[key]));
    const w = 300, h = 130, bw = 30, gap = (w - bw * rows.length) / (rows.length + 1);
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" role="img" aria-label="${esc(key)} by month">${rows.map((r, i) => {
      const bh = Math.round((r[key] / max) * 78); const x = Math.round(gap + i * (bw + gap));
      return `<rect x="${x}" y="${100 - bh}" width="${bw}" height="${bh}" fill="#6B4935" opacity="${r[key] ? 1 : 0.15}"/>
        <text x="${x + bw / 2}" y="${95 - bh}" text-anchor="middle" font-size="9" fill="#151515">${esc(fmt(r[key]))}</text>
        <text x="${x + bw / 2}" y="118" text-anchor="middle" font-size="10" fill="#757575">${esc(r.label)}</text>`;
    }).join('')}<line x1="0" y1="100" x2="${w}" y2="100" stroke="#00000022"/></svg>`;
  }
  function renderOverview(box, d) {
    const c = d.counts; const sys = d.system;
    const warn = [];
    if (sys.samplePlans) warn.push(['Your franchise plans still show <b>sample investment figures</b>. Review and save your real terms under <a class="underline" href="#/admin/plans">Franchise Plans</a> before going live.']);
    if (sys.devAdminDefaults) warn.push(['You are using the <b>development admin login</b>. Set ADMIN_EMAIL and ADMIN_PASSWORD (or ADMIN_EMAILS for Google) in your environment.']);
    if (sys.storage === 'local-file' || sys.storage === 'memory') warn.push([`Data is stored in <b>${esc(sys.storage)}</b> (development only). Connect Redis before deploying.`]);
    if (!sys.googleEnabled) warn.push(['Google sign-in is <b>not configured</b>. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.']);
    const card = (label, val, sub, accent) => `<div class="bg-white border ${accent ? 'border-coffee' : 'border-black/10'} p-5"><div class="text-[10px] uppercase tracking-widest text-charcoal/50">${label}</div><div class="font-serif-heading text-4xl mt-1 ${accent ? 'text-coffee' : ''}">${val}</div>${sub ? `<div class="text-[11px] text-charcoal/50 mt-1">${sub}</div>` : ''}</div>`;
    const maxS = Math.max(1, ...Object.values(d.statusCounts));
    box.innerHTML = `
      ${warn.map((w) => `<div class="mb-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3">${w[0]}</div>`).join('')}
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        ${card('New applications', c.newApplications, 'awaiting first contact', true)}
        ${card('All applications', c.applications, `${c.approved} approved`)}
        ${card('Shop orders', c.orders, money(c.revenue) + ' revenue')}
        ${card('Unread messages', c.unreadMessages, `${c.messages} total &middot; ${c.users} users`)}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="bg-white border border-black/10 p-5"><h3 class="text-[11px] uppercase tracking-widest font-semibold mb-3">Applications per month</h3>${barChart(d.monthly, 'applications', String)}</div>
        <div class="bg-white border border-black/10 p-5"><h3 class="text-[11px] uppercase tracking-widest font-semibold mb-3">Shop revenue per month</h3>${barChart(d.monthly, 'revenue', (v) => (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : String(v)))}</div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white border border-black/10 p-5"><h3 class="text-[11px] uppercase tracking-widest font-semibold mb-4">Pipeline</h3>
          <div class="space-y-2.5">${Object.entries(d.statusCounts).map(([s, n]) => `<div class="flex items-center gap-3 text-xs"><span class="w-32 shrink-0">${esc(s)}</span>
            <svg class="flex-grow h-2.5" preserveAspectRatio="none" viewBox="0 0 100 10"><rect width="100" height="10" fill="#F1ECE4"/><rect width="${(n / maxS) * 100}" height="10" fill="#6B4935"/></svg><span class="w-6 text-right font-semibold">${n}</span></div>`).join('')}</div></div>
        <div class="bg-white border border-black/10 p-5"><div class="flex justify-between items-center mb-4"><h3 class="text-[11px] uppercase tracking-widest font-semibold">Latest applications</h3><a href="#/admin/applications" class="text-[10px] uppercase tracking-widest underline">View all</a></div>
          ${d.recentApplications.length ? `<ul class="divide-y divide-black/5">${d.recentApplications.map((a) => `<li class="py-2.5 flex justify-between items-center gap-3 text-xs"><div><b>${esc(a.name)}</b> <span class="text-charcoal/50">${esc(a.city)} &middot; ${esc(a.planName)}</span><div class="text-[10px] text-charcoal/40">${esc(a.id)} &middot; ${fmtDate(a.createdAt)}</div></div>${pill(a.status)}</li>`).join('')}</ul>` : '<p class="text-xs text-charcoal/50">No applications yet.</p>'}</div>
      </div>
      <p class="mt-6 text-[11px] text-charcoal/40">Storage: ${esc(sys.storage)} &middot; Google sign-in: ${sys.googleEnabled ? 'on' : 'off'}</p>`;
  }

  /* ------------------------------------------------ applications */
  function filteredApps() {
    const { status, q } = A.filter; const s = q.trim().toLowerCase();
    return A.apps.filter((a) => (!status || a.status === status) && (!s || [a.id, a.name, a.email, a.phone, a.city, a.state, a.planName].join(' ').toLowerCase().includes(s)));
  }
  function appRows() {
    return filteredApps().map((a) => `<tr>
      <td class="p-3 font-medium whitespace-nowrap">${esc(a.id)}<div class="text-[10px] text-charcoal/40 font-normal">${fmtDate(a.createdAt)}</div></td>
      <td class="p-3"><b>${esc(a.name)}</b><div class="text-charcoal/60">${esc(a.email)}</div><div class="text-charcoal/60">${esc(a.phone)}</div></td>
      <td class="p-3">${esc(a.city)}, ${esc(a.state)}</td><td class="p-3">${esc(a.planName)}</td><td class="p-3 whitespace-nowrap">${esc(a.budget)}</td>
      <td class="p-3">${miniSelect('admin-app-status', a.id, S.options.appStatuses, a.status)}</td>
      <td class="p-3 text-right whitespace-nowrap">${btn('Open', 'admin-app-view', { id: a.id })}</td></tr>`);
  }
  function renderApps(box) {
    box.innerHTML = `<div class="flex flex-wrap items-center gap-3 mb-4">
        <input data-input="admin-app-filter" data-k="q" placeholder="Search name, email, phone, city..." value="${esc(A.filter.q)}" class="field !w-64" aria-label="Search applications">
        <select data-change="admin-app-filter" data-k="status" class="field !w-48" aria-label="Filter by status"><option value="">All statuses</option>${selectOpts(S.options.appStatuses, A.filter.status)}</select>
        <span class="text-xs text-charcoal/50" id="apps-count"></span>
        <a href="/api/admin/applications.csv" class="ml-auto inline-flex items-center gap-2 bg-charcoal text-white hover:bg-coffee px-4 py-2.5 text-[11px] uppercase tracking-widest">${ic('download', 'w-4 h-4')} Export CSV</a></div>
      <div id="apps-table"></div>`;
    paintApps();
  }
  function paintApps() {
    const rows = appRows();
    document.getElementById('apps-table').innerHTML = table(['ID', 'Applicant', 'Location', 'Model', 'Budget', 'Status', ''], rows, 'No applications match.');
    document.getElementById('apps-count').textContent = `${rows.length} of ${A.apps.length}`;
  }
  actions['admin-app-filter'] = (el) => { A.filter[el.dataset.k] = el.value; paintApps(); };
  actions['admin-app-status'] = async (el) => {
    try { await api('/api/admin/applications/' + el.dataset.id, { method: 'PUT', body: { status: el.value } }); const a = A.apps.find((x) => x.id === el.dataset.id); if (a) a.status = el.value; toast(`${el.dataset.id} set to ${el.value}`); }
    catch (e) { toast(e.message); loadTab(); }
  };
  actions['admin-app-view'] = (el) => {
    const a = A.apps.find((x) => x.id === el.dataset.id); if (!a) return;
    const row = (k, v) => `<div><dt class="text-[10px] uppercase tracking-widest text-charcoal/50">${k}</dt><dd class="text-sm mt-0.5">${esc(v) || '-'}</dd></div>`;
    const wa = `https://wa.me/${waPhone(a.phone)}?text=${encodeURIComponent(`Hello ${a.name}, this is Chikmagalur Filter Coffee regarding your franchise application ${a.id}.`)}`;
    openModal(`<div class="flex flex-wrap items-center gap-3 pr-8"><h2 class="font-serif-heading text-3xl uppercase">${esc(a.name)}</h2>${pill(a.status)}</div>
      <p class="text-xs text-charcoal/50 mt-1">${esc(a.id)} &middot; submitted ${fmtDateTime(a.createdAt)} ${a.userId ? '&middot; has account' : '&middot; guest'}</p>
      <dl class="grid grid-cols-2 gap-4 mt-6">${row('Email', a.email)}${row('Phone', a.phone)}${row('City', a.city + ', ' + a.state)}${row('Model', a.planName)}${row('Budget', a.budget)}${row('Property', a.property)}${row('Background', a.experience)}${row('Timeline', a.timeline)}</dl>
      ${a.message ? `<div class="mt-4"><div class="text-[10px] uppercase tracking-widest text-charcoal/50">Message</div><p class="text-sm font-light whitespace-pre-line mt-1 bg-surface p-3">${esc(a.message)}</p></div>` : ''}
      <div class="flex flex-wrap gap-2 mt-5"><a href="${esc(wa)}" target="_blank" rel="noopener noreferrer" class="bg-wagreen text-white px-4 py-2 text-[11px] uppercase tracking-widest">WhatsApp</a><a href="tel:${esc(a.phone)}" class="border border-black/15 px-4 py-2 text-[11px] uppercase tracking-widest">Call</a><a href="mailto:${esc(a.email)}" class="border border-black/15 px-4 py-2 text-[11px] uppercase tracking-widest">Email</a></div>
      <form data-form="admin-app-save" data-id="${esc(a.id)}" class="mt-6 pt-6 border-t border-black/10 space-y-4" novalidate>
        <div>${lbl('Status', 'as-status')}<select id="as-status" name="status" class="field">${selectOpts(S.options.appStatuses, a.status)}</select></div>
        ${input('note', 'Note visible to the applicant', a.note, { rows: 2, max: 600, help: 'Shown in their My Account page.' })}
        ${input('internalNote', 'Internal note (private)', a.internalNote, { rows: 3, max: 1500 })}
        ${(a.history || []).length ? `<div class="text-[11px] text-charcoal/50">History: ${a.history.map((h) => `${esc(h.status)} (${fmtDateTime(h.at)})`).join(' &rarr; ')}</div>` : ''}
        <div class="flex justify-between items-center"><button class="bg-charcoal text-white hover:bg-coffee px-6 py-3 text-xs uppercase tracking-widest">Save</button>
          <button type="button" data-action="admin-app-delete" data-id="${esc(a.id)}" class="text-[11px] uppercase tracking-widest text-red-700 hover:underline">Delete application</button></div></form>`, true);
  };
  forms['admin-app-save'] = (f) => busy(f, async () => {
    await api('/api/admin/applications/' + f.dataset.id, { method: 'PUT', body: formData(f) });
    toast('Application updated'); closeModal(); loadTab();
  });
  actions['admin-app-delete'] = async (el) => {
    if (!confirm(`Delete application ${el.dataset.id} permanently?`)) return;
    try { await api('/api/admin/applications/' + el.dataset.id, { method: 'DELETE' }); toast('Deleted'); closeModal(); loadTab(); } catch (e) { toast(e.message); }
  };

  /* ------------------------------------------------ plans */
  function renderPlans(box) {
    const sample = A.plans.some((p) => p.sample);
    box.innerHTML = `${sample ? '<div class="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3"><b>Sample figures.</b> These plans were pre-filled so the site is not empty. Edit each plan with your real investment ranges and features, then save.</div>' : ''}
      <div class="flex justify-between items-center mb-4"><p class="text-xs text-charcoal/60">These appear in the public "Franchise Models" section and in the application form.</p>${primaryBtn('+ Add plan', 'admin-plan-edit', { id: '' })}</div>
      ${table(['Order', 'Name', 'Investment', 'Format', 'Status', ''], A.plans.map((p) => `<tr>
        <td class="p-3">${p.order}</td><td class="p-3 font-medium">${esc(p.name)}${p.badge ? ` <span class="text-[10px] text-coffee">(${esc(p.badge)})</span>` : ''}${p.sample ? ' <span class="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5">SAMPLE</span>' : ''}</td>
        <td class="p-3 whitespace-nowrap">${lakh(p.investmentMin)} - ${lakh(p.investmentMax)}</td><td class="p-3">${esc(p.format)}${p.area ? ' &middot; ' + esc(p.area) : ''}</td>
        <td class="p-3">${p.active !== false ? pill('Approved').replace('Approved', 'Live') : '<span class="text-charcoal/40">Hidden</span>'}</td>
        <td class="p-3 text-right whitespace-nowrap space-x-1">${btn('Edit', 'admin-plan-edit', { id: p.id })}${btn('Delete', 'admin-plan-del', { id: p.id }, 'border border-red-200 text-red-700 hover:bg-red-50')}</td></tr>`), 'No plans yet.')}`;
  }
  actions['admin-plan-edit'] = (el) => {
    const p = A.plans.find((x) => x.id === el.dataset.id) || { order: A.plans.length + 1, active: true, features: [] };
    openModal(`<h2 class="font-serif-heading text-3xl uppercase mb-5 pr-8">${p.id ? 'Edit plan' : 'New plan'}</h2>
      <form data-form="admin-plan-save" data-id="${esc(p.id || '')}" class="grid grid-cols-1 sm:grid-cols-2 gap-4" novalidate>
        ${input('name', 'Name', p.name, { required: true })}${input('badge', 'Badge (optional)', p.badge, { help: 'e.g. Most popular' })}
        ${input('tagline', 'Tagline', p.tagline, { span: true })}
        ${input('format', 'Format', p.format)}${input('area', 'Area', p.area, { help: 'e.g. 300 - 600 sq ft' })}
        ${input('investmentMin', 'Min investment (Rs)', p.investmentMin, { type: 'number', required: true, min: 1 })}${input('investmentMax', 'Max investment (Rs)', p.investmentMax, { type: 'number', required: true, min: 1 })}
        ${input('features', 'Features (one per line)', (p.features || []).join('\n'), { rows: 5, span: true })}
        ${input('order', 'Display order', p.order, { type: 'number', min: 0 })}<div class="flex items-end pb-3">${check('active', 'Show on website', p.active !== false)}</div>
        <div class="sm:col-span-2"><button class="bg-charcoal text-white hover:bg-coffee px-8 py-3.5 text-xs uppercase tracking-widest">Save plan</button></div></form>`, true);
  };
  forms['admin-plan-save'] = (f) => busy(f, async () => {
    const id = f.dataset.id;
    await api(id ? '/api/admin/plans/' + id : '/api/admin/plans', { method: id ? 'PUT' : 'POST', body: formData(f) });
    await refreshPublic(); toast('Plan saved'); closeModal(); loadTab();
  });
  actions['admin-plan-del'] = async (el) => {
    if (!confirm('Delete this plan? Existing applications keep their plan name.')) return;
    try { await api('/api/admin/plans/' + el.dataset.id, { method: 'DELETE' }); await refreshPublic(); toast('Plan deleted'); loadTab(); } catch (e) { toast(e.message); }
  };

  /* keep the public pages in sync after admin edits */
  async function refreshPublic() {
    const d = await api('/api/bootstrap');
    Object.assign(S, { settings: d.settings, plans: d.plans, products: d.products });
    window.CFC.applySettings(); window.CFC.renderModels(); window.CFC.renderShop();
  }

  /* ------------------------------------------------ products */
  function renderProducts(box) {
    box.innerHTML = `<div class="flex justify-between items-center mb-4"><p class="text-xs text-charcoal/60">Products shown in the shop section.</p>${primaryBtn('+ Add product', 'admin-prod-edit', { id: '' })}</div>
      ${table(['Product', 'Category', 'Weight', 'Price', 'Status', ''], A.products.map((p) => `<tr>
        <td class="p-3 font-medium"><div class="flex items-center gap-3">${window.CFC.img(p.image, window.fbKind(p.category), p.name, 'w-10 h-10 object-cover')}<span>${esc(p.name)}</span></div></td>
        <td class="p-3">${esc(p.category)}</td><td class="p-3">${esc(p.weight)}</td><td class="p-3 font-semibold">${money(p.price)}</td>
        <td class="p-3">${p.active !== false ? 'Live' : '<span class="text-charcoal/40">Hidden</span>'}</td>
        <td class="p-3 text-right whitespace-nowrap space-x-1">${btn('Edit', 'admin-prod-edit', { id: p.id })}${btn('Delete', 'admin-prod-del', { id: p.id }, 'border border-red-200 text-red-700 hover:bg-red-50')}</td></tr>`), 'No products yet.')}`;
  }
  actions['admin-prod-edit'] = (el) => {
    const p = A.products.find((x) => x.id === el.dataset.id) || { category: 'Filter Coffee', active: true, weight: '500 g' };
    openModal(`<h2 class="font-serif-heading text-3xl uppercase mb-5 pr-8">${p.id ? 'Edit product' : 'New product'}</h2>
      <form data-form="admin-prod-save" data-id="${esc(p.id || '')}" class="grid grid-cols-1 sm:grid-cols-2 gap-4" novalidate>
        ${input('name', 'Name', p.name, { required: true, span: true })}
        ${input('price', 'Price (Rs)', p.price, { type: 'number', required: true, min: 1 })}${input('weight', 'Weight / size', p.weight)}
        <div>${lbl('Category', 'f-category')}<select id="f-category" name="category" class="field">${selectOpts(S.options.categories, p.category)}</select></div><div class="flex items-end pb-3">${check('active', 'Show in shop', p.active !== false)}</div>
        ${input('image', 'Image URL (https)', p.image, { span: true, help: 'Leave blank to use the built-in artwork.' })}
        ${input('desc', 'Description', p.desc, { rows: 3, span: true, max: 400 })}
        <div class="sm:col-span-2"><button class="bg-charcoal text-white hover:bg-coffee px-8 py-3.5 text-xs uppercase tracking-widest">Save product</button></div></form>`, true);
  };
  forms['admin-prod-save'] = (f) => busy(f, async () => {
    const id = f.dataset.id;
    await api(id ? '/api/admin/products/' + id : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: formData(f) });
    await refreshPublic(); toast('Product saved'); closeModal(); loadTab();
  });
  actions['admin-prod-del'] = async (el) => {
    if (!confirm('Delete this product?')) return;
    try { await api('/api/admin/products/' + el.dataset.id, { method: 'DELETE' }); await refreshPublic(); toast('Product deleted'); loadTab(); } catch (e) { toast(e.message); }
  };

  /* ------------------------------------------------ orders */
  function renderOrders(box, orders) {
    box.innerHTML = table(['Order', 'Customer', 'Items', 'Total', 'Status', 'Placed'], orders.map((o) => `<tr>
      <td class="p-3 font-medium whitespace-nowrap">${esc(o.id)}</td>
      <td class="p-3"><b>${esc(o.customer.name)}</b><div class="text-charcoal/60">${esc(o.customer.phone)}</div><div class="text-charcoal/60 max-w-[16rem]">${esc(o.customer.address)}</div></td>
      <td class="p-3">${o.items.map((i) => `${esc(i.name)} &times; ${i.qty}`).join('<br>')}${o.coupon ? `<div class="text-[10px] text-coffee mt-1">Coupon ${esc(o.coupon)}</div>` : ''}</td>
      <td class="p-3 font-semibold whitespace-nowrap">${money(o.total)}</td>
      <td class="p-3">${miniSelect('admin-order-status', o.id, S.options.orderStatuses, o.status)}</td><td class="p-3 whitespace-nowrap text-charcoal/60">${fmtDateTime(o.createdAt)}</td></tr>`), 'No shop orders yet.');
  }
  actions['admin-order-status'] = async (el) => {
    try { await api('/api/admin/orders/' + el.dataset.id, { method: 'PUT', body: { status: el.value } }); toast(`${el.dataset.id} marked ${el.value}`); } catch (e) { toast(e.message); loadTab(); }
  };

  /* ------------------------------------------------ coupons */
  function renderCoupons(box, coupons) {
    box.innerHTML = `<div class="flex justify-between items-center mb-4"><p class="text-xs text-charcoal/60">Discount codes for the shop basket.</p>${primaryBtn('+ New coupon', 'admin-coupon-new')}</div>
      ${table(['Code', 'Discount', 'Min. order', ''], coupons.map((c) => `<tr><td class="p-3 font-medium text-coffee">${esc(c.code)}</td><td class="p-3">${c.discountPercent}% off</td><td class="p-3">${money(c.minSpend)}</td>
        <td class="p-3 text-right">${btn('Remove', 'admin-coupon-del', { code: c.code }, 'border border-red-200 text-red-700 hover:bg-red-50')}</td></tr>`), 'No coupons.')}`;
  }
  actions['admin-coupon-new'] = () => openModal(`<h2 class="font-serif-heading text-3xl uppercase mb-5 pr-8">New coupon</h2>
    <form data-form="admin-coupon-save" class="space-y-4" novalidate>${input('code', 'Code', '', { required: true, help: '3-20 letters or numbers, e.g. SPECIAL20' })}
      ${input('discountPercent', 'Discount %', '', { type: 'number', required: true, min: 1 })}${input('minSpend', 'Minimum order (Rs)', 200, { type: 'number', min: 0 })}
      <button class="bg-charcoal text-white hover:bg-coffee px-8 py-3.5 text-xs uppercase tracking-widest">Create</button></form>`);
  forms['admin-coupon-save'] = (f) => busy(f, async () => { await api('/api/admin/coupons', { method: 'POST', body: formData(f) }); toast('Coupon created'); closeModal(); loadTab(); });
  actions['admin-coupon-del'] = async (el) => { try { await api('/api/admin/coupons/' + encodeURIComponent(el.dataset.code), { method: 'DELETE' }); toast('Coupon removed'); loadTab(); } catch (e) { toast(e.message); } };

  /* ------------------------------------------------ messages */
  function renderMessages(box, msgs) {
    box.innerHTML = msgs.length ? `<div class="space-y-3">${msgs.map((m) => `<article class="bg-white border ${m.read ? 'border-black/10' : 'border-coffee'} p-5">
      <div class="flex flex-wrap justify-between gap-2 text-xs"><div><b>${esc(m.name)}</b> &middot; <a class="underline" href="mailto:${esc(m.email)}">${esc(m.email)}</a></div><span class="text-charcoal/50">${fmtDateTime(m.createdAt)}</span></div>
      <p class="mt-3 text-sm font-light whitespace-pre-line">${esc(m.message)}</p>
      <div class="mt-4 flex gap-2">${btn(m.read ? 'Mark unread' : 'Mark read', 'admin-msg-read', { id: m.id, read: m.read ? '0' : '1' })}${btn('Delete', 'admin-msg-del', { id: m.id }, 'border border-red-200 text-red-700 hover:bg-red-50')}</div></article>`).join('')}</div>`
      : '<p class="text-sm font-light text-charcoal/50 py-10 text-center border border-dashed border-black/15">No messages yet.</p>';
  }
  actions['admin-msg-read'] = async (el) => { try { await api('/api/admin/messages/' + el.dataset.id, { method: 'PUT', body: { read: el.dataset.read === '1' } }); loadTab(); } catch (e) { toast(e.message); } };
  actions['admin-msg-del'] = async (el) => { if (!confirm('Delete this message?')) return; try { await api('/api/admin/messages/' + el.dataset.id, { method: 'DELETE' }); loadTab(); } catch (e) { toast(e.message); } };

  /* ------------------------------------------------ site settings */
  function renderSettings(box) {
    const s = S.settings;
    box.innerHTML = `<form data-form="admin-settings" class="bg-white border border-black/10 p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl" novalidate>
      <h2 class="sm:col-span-2 text-[11px] uppercase tracking-widest font-semibold">Homepage</h2>
      ${input('heroHeading', 'Hero heading', s.heroHeading, { rows: 2, span: true, max: 90, help: 'Use a new line for a line break.' })}
      ${input('heroSub', 'Hero sub-heading', s.heroSub, { rows: 2, span: true, max: 300 })}
      ${input('heroImage', 'Hero image URL (https)', s.heroImage, { span: true })}${input('storyImage', 'Story image URL (https)', s.storyImage, { span: true })}
      <h2 class="sm:col-span-2 text-[11px] uppercase tracking-widest font-semibold pt-2">Contact &amp; WhatsApp</h2>
      ${input('address', 'Address', s.address, { rows: 2, span: true, required: true })}
      ${input('phone', 'Phone', s.phone, { required: true })}${input('email', 'Email', s.email, { type: 'email', required: true })}
      ${input('whatsappNum', 'WhatsApp number', s.whatsappNum, { required: true, help: 'With country code, e.g. 919441222714' })}${input('whatsappMsg', 'WhatsApp default message', s.whatsappMsg)}
      <h2 class="sm:col-span-2 text-[11px] uppercase tracking-widest font-semibold pt-2">Shop delivery</h2>
      ${input('shippingFee', 'Shipping fee (Rs)', s.shippingFee, { type: 'number', min: 0 })}${input('freeShippingAbove', 'Free shipping above (Rs)', s.freeShippingAbove, { type: 'number', min: 0 })}
      <div class="sm:col-span-2"><button class="bg-charcoal text-white hover:bg-coffee px-8 py-3.5 text-xs uppercase tracking-widest">Save settings</button></div></form>`;
  }
  forms['admin-settings'] = (f) => busy(f, async () => {
    const res = await api('/api/admin/settings', { method: 'PUT', body: formData(f) });
    S.settings = res.settings; window.CFC.applySettings(); toast('Settings saved. The live site is updated.');
  });

  window.CFC_ADMIN = { render };
})();
