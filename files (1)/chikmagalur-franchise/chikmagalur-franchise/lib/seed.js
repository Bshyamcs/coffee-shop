'use strict';
/**
 * First-run data. Written to Redis once (guarded by a SET NX flag) and editable afterwards from /#/admin.
 *
 * IMPORTANT: the franchise plans below are SAMPLE figures so the site is not empty on day one.
 * They are flagged `sample: true`; the admin panel shows a warning until you replace them with your real terms.
 */
const KEYS = {
  seeded: 'meta:seeded',
  settings: 'settings',
  plans: 'plans',
  products: 'products',
  coupons: 'coupons',
  orders: 'orders',
  applications: 'applications',
  messages: 'messages',
  users: 'users',
};

const DEFAULT_SETTINGS = {
  brandName: 'Chikmagalur Filter Coffee',
  address: 'S No 5, Chikmagalur Filter Coffee, Badangpet Rd, Badangpet, Hyderabad, Telangana 500112',
  phone: '+91 94412 22714',
  email: 'hello@chikmagalurcoffee.com',
  whatsappNum: '919441222714',
  whatsappMsg: 'Hello Chikmagalur Filter Coffee, I am interested in a franchise. Please share the details.',
  heroHeading: 'OWN A CHIKMAGALUR\nFILTER COFFEE OUTLET',
  heroSub: "Partner with an authentic South Indian filter coffee brand. Complete store setup, barista training, supply chain and ongoing operational support.",
  heroImage: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=2000&auto=format&fit=crop',
  storyImage: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=1000&auto=format&fit=crop',
  shippingFee: 49,
  freeShippingAbove: 499,
};

const DEFAULT_PLANS = [
  {
    id: 'plan_kiosk', order: 1, active: true, sample: true, badge: '',
    name: 'Coffee Kiosk', tagline: 'A compact, low-footprint counter for high-footfall spots.',
    format: 'Kiosk / takeaway counter', area: '80 - 150 sq ft',
    investmentMin: 600000, investmentMax: 900000,
    features: ['Compact takeaway format', 'Ideal for malls, offices and transit hubs', 'Barista training included', 'Brand signage and menu design'],
  },
  {
    id: 'plan_cafe', order: 2, active: true, sample: true, badge: 'Most popular',
    name: 'Café Outlet', tagline: 'A full filter-coffee café with seating and a complete menu.',
    format: 'Café with seating', area: '300 - 600 sq ft',
    investmentMin: 1800000, investmentMax: 2800000,
    features: ['Dine-in and takeaway', 'Full menu with filter coffee specials', 'Store design and fit-out guidance', 'Staff training and launch support'],
  },
  {
    id: 'plan_flagship', order: 3, active: true, sample: true, badge: '',
    name: 'Flagship Store', tagline: 'Our premium destination format for prime high-street locations.',
    format: 'Flagship café + retail', area: '800 - 1,500 sq ft',
    investmentMin: 4000000, investmentMax: 6000000,
    features: ['Café plus retail shelf for beans and brass filters', 'Premium interiors', 'Priority marketing support', 'Dedicated area manager'],
  },
];

const DEFAULT_PRODUCTS = [
  { id: 'p_classic', order: 1, name: 'Classic Filter Coffee', weight: '500 g', price: 399, category: 'Filter Coffee', active: true,
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=800&auto=format&fit=crop',
    desc: 'Our signature 80:20 Arabica-Robusta blend infused with chicory for thick, dark decoction.' },
  { id: 'p_estate', order: 2, name: 'Estate Blend Coffee', weight: '500 g', price: 499, category: 'Filter Coffee', active: true,
    image: 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?q=80&w=800&auto=format&fit=crop',
    desc: '100% Single Estate Arabica roasted medium-dark with subtle cocoa notes.' },
  { id: 'p_darkroast', order: 3, name: 'Signature Dark Roast Beans', weight: '500 g', price: 599, category: 'Beans', active: true,
    image: 'https://images.unsplash.com/photo-1511537190424-bbbab87ac5eb?q=80&w=800&auto=format&fit=crop',
    desc: 'Whole roasted beans delivering a full-bodied cup with a lingering chocolate finish.' },
  { id: 'p_brassset', order: 4, name: 'Traditional Brass Filter Gift Set', weight: 'Set of 1', price: 899, category: 'Combos', active: true,
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=800&auto=format&fit=crop',
    desc: 'Heavy-gauge brass coffee filter complete with a 250g Classic Filter roast pack.' },
];

const DEFAULT_COUPONS = [{ code: 'COFFEE10', discountPercent: 10, minSpend: 300 }];

let seedPromise = null;

/** Idempotent: runs once per process, and once ever per database. */
function ensureSeed(db) {
  if (!seedPromise) {
    seedPromise = (async () => {
      const first = await db.setnx(KEYS.seeded, { at: Date.now() });
      if (!first) return false;
      await db.setJSON(KEYS.settings, DEFAULT_SETTINGS);
      for (const p of DEFAULT_PLANS) await db.hsetJSON(KEYS.plans, p.id, p);
      for (const p of DEFAULT_PRODUCTS) await db.hsetJSON(KEYS.products, p.id, p);
      for (const c of DEFAULT_COUPONS) await db.hsetJSON(KEYS.coupons, c.code, c);
      return true;
    })().catch((e) => { seedPromise = null; throw e; });
  }
  return seedPromise;
}

function resetSeedFlag() { seedPromise = null; }

module.exports = { KEYS, DEFAULT_SETTINGS, ensureSeed, resetSeedFlag };
