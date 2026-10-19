// Pabili PH — V9 local engine.
// Builds on V8: same data shape, same field names; appends withdrawals, cart
// state, addresses-with-default, driver locations and admin actions. Save
// + query always round-trip the exact same key names — that is the lesson
// the previous bugs taught us, so this version is strict about it.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, now, WITHDRAWAL_PROVIDERS, WITHDRAWAL_LIMITS, WITHDRAWAL_DAILY_CAP_GLOBAL, MIN_WITHDRAWAL } from './lib';

const KEY = 'pabili.ph.v1';
const DRIVER_NAMES = ['Juan D.', 'Maria S.', 'Pedro R.', 'Ana L.'];
const BOT_CUSTOMERS = ['Ramon C.', 'Liza M.', 'Jose P.', 'Karen V.'];
const ITEMS = ['2kg rice, 1 tomato paste, 3 eggs', '1 LPG tank refill', 'Pain reliever + vitamins', 'Bread, milk, coffee', 'Phone load ₱100', 'Fried chicken bucket'];

const DEMO_USERS = [
  { id: 'u_c1', name: 'Ramon Cruz', role: 'customer', phone: '+63917111001', wallet: 350, credit: 40, frozen: false, verified: true },
  { id: 'u_c2', name: 'Liza Mercado', role: 'customer', phone: '+63917111002', wallet: 90, credit: 0, frozen: false, verified: true },
  { id: 'u_d1', name: 'Juan Dela Cruz', role: 'driver', phone: '+63917111003', wallet: 720, credit: 130, frozen: false, verified: true },
  { id: 'u_d2', name: 'Maria Santos', role: 'driver', phone: '+63917111004', wallet: 150, credit: 60, frozen: false, verified: true },
  { id: 'u_v1', name: 'Aling Nena Sari-sari', role: 'vendor', phone: '+63917111005', wallet: 2400, credit: 0, frozen: false, verified: true },
  { id: 'u_v2', name: 'Botika ni Jose', role: 'vendor', phone: '+63917111006', wallet: 980, credit: 0, frozen: false, verified: true },
];

const DEMO_STORES = [
  { id: 's_v1', name: 'Aling Nena Sari-sari', category: 'Sari-sari', area: 'Brgy. Sta. Rosa',
    address: '3641 Yarmouk St, Brgy. Sta. Rosa', lat: 14.5995, lng: 120.9842, rating: 4.9,
    ownerId: 'u_v1', active: true, featured: true, createdAt: now() - 86400000 * 14 },
  { id: 's_v2', name: 'Botika ni Jose', category: 'Pharmacy', area: 'Brgy. Malinis',
    address: 'Blk 4 Lot 12, Brgy. Malinis', lat: 14.6091, lng: 120.9814, rating: 4.7,
    ownerId: 'u_v2', active: true, featured: false, createdAt: now() - 86400000 * 7 },
];

const DEFAULTS = () => ({
  auth: null, terms: false,
  roles: { driver: { status: 'none', data: null }, vendor: { status: 'none', data: null } },
  activeRole: 'customer',
  profile: { name: 'Pabili User', rating: 5.0, coupons: [] },
  // V9: addresses have explicit `default` flag. Exactly one is default.
  addresses: [
    { id: uid(), label: 'Home', addr: '3641 Yarmouk St, Aqrabiyah, Brgy. Sta. Rosa', lat: 14.5995, lng: 120.9842, default: true },
    { id: uid(), label: 'Work', addr: '3918 Al Hasa St, Al Khaleej', lat: 14.6091, lng: 120.9814, default: false },
  ],
  // V9: wallet.tx distinguished by `kind` so admin can build reports.
  wallet: { balance: 350, credit: 0, tx: [],
            // V9: withdrawal ledger (full saga).
            withdrawals: [],
            // V9: per-day aggregate for the legal cap.
            withdrawn_today: 0, withdrawn_today_date: null },
  cart: { items: [], shipping_fee: 25 }, // V9: items are {storeId, storeName, items, fee}.
  catalog: [
    { id: 'c1', name: 'Rice 1kg', price: 58 },
    { id: 'c2', name: 'Softdrinks 1.5L', price: 75 },
    { id: 'c3', name: 'Instant noodles', price: 18 },
  ],
  orders: [], alerts: [], audit: [],
  users: DEMO_USERS,
  stores: DEMO_STORES,
  // V9: driver live points are keyed by driver id, latest sample only.
  driverLocations: {}, // { 'u_d1': { lat, lng, ts, accuracy, source: 'fg'|'bg' } }
  kyc: [
    { id: uid(), userId: 'u_v2', name: 'Botika ni Jose', role: 'vendor', status: 'approved', ts: now() - 86400000,
      data: { store: 'Botika ni Jose', type: 'Pharmacy', permit: 'permit-photo.jpg', front: 'storefront.jpg',
              address: 'Blk 4 Lot 12, Brgy. Malinis', area: 'Brgy. Malinis' } },
    { id: uid(), userId: 'u_d2', name: 'Maria Santos', role: 'driver', status: 'approved', ts: now() - 43200000,
      data: { vehicle: 'Motorbike', model: 'Honda Click 125', plate: 'RPC-2067', license: 'license.jpg', selfie: 'selfie-id.jpg' } },
  ],
  settings: {
    commissions: { customerPct: 3, vendorPct: 8, driverPct: 10 },
    offerSecs: 30, vendorSecs: 60, maxDrivers: 3,
    categories: CATEGORIES_FROM_LIB(),
    banner: { title: 'Your favorite store has no delivery?', cta: 'Order it from here' },
    promoBar: true,
  },
  botSeed: 0,
});

function CATEGORIES_FROM_LIB() {
  // placeholder — replaced below using lib import. Kept as string list to avoid circular init order.
  return ['Food', 'Coffee', 'Supermarket', 'Pharmacy', 'Sari-sari', 'Gas / LPG', 'Flowers', 'Parcel'];
}

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const normCat = (s) => String(s || '').trim();

export function StoreProvider({ children }) {
  const [s, setS] = useState(null);
  const [tick, setTick] = useState(0);
  const sRef = useRef(s); sRef.current = s;

  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => {
    if (v) {
      const loaded = JSON.parse(v);
      loaded.stores = loaded.stores || DEMO_STORES;
      loaded.addresses = loaded.addresses || DEFAULTS().addresses;
      loaded.wallet = loaded.wallet || DEFAULTS().wallet;
      loaded.cart = loaded.cart || DEFAULTS().cart;
      loaded.driverLocations = loaded.driverLocations || {};
      setS(loaded);
    } else setS(DEFAULTS());
  }); }, []);
  useEffect(() => { if (s) AsyncStorage.setItem(KEY, JSON.stringify(s)); }, [s]);

  useEffect(() => {
    const t = setInterval(() => { setTick((x) => x + 1); setS((cur) => engine(cur)); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Engine kept from V8 (delivery state machine unchanged).
  function engine(cur) {
    if (!cur) return cur;
    let changed = false;
    const orders = cur.orders.map((o) => {
      const n = { ...o };
      const age = (now() - n.updated) / 1000;
      if (n.mine && n.kind === 'order' && n.status === 'vendor_quote' && age > 4) {
        n.price = Math.round(80 + Math.random() * 220);
        n.photos = { ...n.photos, product: photo('vendor', 'product') };
        n.neg = { phase: 'vendor', turn: 'me', amount: n.price, deadline: now() + cur.settings.vendorSecs * 1000,
                  history: [{ by: 'vendor', amount: n.price, ts: now(), note: 'Store quote + product photo' }] };
        n.status = 'quote_review'; n.updated = now(); changed = true;
      }
      if (n.mine && n.status === 'driver_offer' && n.neg && n.neg.turn === 'them' && age > 2 && n.kind === 'order') {
        const ask = n.neg.amount;
        if (ask >= 40 || Math.random() > 0.35) {
          n.neg = null; n.status = 'accepted'; n.driver = n.driver || DRIVER_NAMES[(n.driverIdx || 0) % 4];
          n.updated = now(); pushAlert(cur, 'Courier accepted — store is preparing your order');
        }
        changed = true;
      }
      if (n.mine && n.status === 'accepted' && age > 5 && !n.photos?.packed) {
        n.photos = { ...n.photos, packed: photo('vendor', 'packed') };
        n.status = 'ready_pickup'; n.updated = now(); pushAlert(cur, 'Store packed your order (photo attached)'); changed = true;
      }
      if (n.mine && n.status === 'ready_pickup' && age > 6 && !n.photos?.pickup) {
        n.photos = { ...n.photos, pickup: photo('driver', 'pickup') };
        n.status = 'picked_up'; n.updated = now(); pushAlert(cur, 'Courier picked up your order (photo attached)'); changed = true;
      }
      if (n.mine && n.status === 'picked_up' && age > 8 && !n.photos?.delivery) {
        n.photos = { ...n.photos, delivery: photo('driver', 'delivery') };
        n.status = 'delivered'; n.updated = now(); pushAlert(cur, 'Courier delivered — please confirm receipt'); changed = true;
      }
      if (n.mine && n.status === 'finding_driver' && age > 2 && n.kind === 'order') {
        const idx = n.driverIdx || 0;
        if (idx >= cur.settings.maxDrivers) { n.widened = true; n.note = 'Widening search…'; n.updated = now(); changed = true; return n; }
        n.status = 'driver_offer';
        n.neg = { phase: 'driver', turn: 'them', amount: n.fee, deadline: now() + cur.settings.offerSecs * 1000,
                  driver: DRIVER_NAMES[idx % DRIVER_NAMES.length], history: [{ by: 'customer', amount: n.fee, ts: now(), note: 'Your fee offer' }] };
        n.updated = now(); changed = true;
      }
      if (!n.mine && n.myRole === 'driver' && n.status === 'accepted' && age > 6) {
        n.photos = { ...n.photos, packed: photo('vendor', 'packed') };
        n.status = 'ready_pickup'; n.updated = now(); changed = true;
      }
      if (!n.mine && n.myRole === 'driver' && n.status === 'delivered' && age > 5) {
        n.status = 'completed'; n.updated = now();
        const earn = Math.round(n.fee * (1 - cur.settings.commissions.driverPct / 100));
        const next = { ...cur };
        next.wallet = { ...next.wallet };
        next.wallet.credit = Math.round((next.wallet.credit + earn) * 100) / 100;
        next.wallet.tx = [{ id: uid(), amount: earn, kind: 'delivery', orderId: n.id, ts: now() }, ...next.wallet.tx];
        pushAlert(next, 'Delivered — earnings added to your wallet');
        return n;
      }
      return n;
    });

    let botSeed = cur.botSeed;
    const meDriverOn = cur.roles.driver.status === 'approved' && cur.driverOnline;
    const meVendorOn = cur.roles.vendor.status === 'approved' && cur.storeOpen;
    if ((meDriverOn || meVendorOn) && now() - (cur.lastBotAt || 0) > 45000) {
      const role = meVendorOn && (!meDriverOn || Math.random() > 0.5) ? 'vendor' : 'driver';
      const o = {
        id: uid(), mine: false, myRole: role, kind: 'order',
        customer: BOT_CUSTOMERS[Math.floor(Math.random() * BOT_CUSTOMERS.length)],
        items: ITEMS[Math.floor(Math.random() * ITEMS.length)],
        pickup: 'Aling Nena Sari-sari, Brgy. Sta. Rosa', dropoff: 'Blk 4 Lot 12, Brgy. Malinis',
        fee: 20 + Math.round(Math.random() * 40), price: 0, status: role === 'vendor' ? 'vendor_quote' : 'finding_driver',
        photos: {}, created: now(), updated: now(),
      };
      orders.unshift(o); cur.lastBotAt = now(); botSeed++;
      pushAlert(cur, role === 'vendor' ? 'New order for your store' : 'New delivery offer');
      changed = true;
    }
    return changed ? { ...cur, orders, botSeed } : cur;
  }

  function photo(by, kind) {
    return { by, kind, ts: now(), uri: null, stamp: new Date().toLocaleString() + ' · GPS locked', simulated: true };
  }
  function pushAlert(cur, text) {
    cur.alerts = [{ id: uid(), text, ts: now(), read: false }, ...(cur.alerts || [])].slice(0, 50);
  }
  function resetDailyIfNewDay(cur) {
    const today = new Date().toDateString();
    if (cur.wallet.withdrawn_today_date !== today) {
      cur.wallet.withdrawn_today = 0;
      cur.wallet.withdrawn_today_date = today;
    }
  }
  function totalPendingAmount(cur) {
    return (cur.wallet.withdrawals || []).filter((w) => w.status === 'pending' || w.status === 'approved')
            .reduce((a, w) => a + w.amount, 0);
  }
  function audit(cur, action, detail) {
    cur.audit = [{ id: uid(), action, detail, by: 'admin (0562989152)', ts: now() }, ...(cur.audit || [])].slice(0, 200);
  }

  // -------- API --------
  const api = {
    tick,
    // ---- addresses (V9 CRUD + default flag) ----
    addAddress: (a) => setS((c) => {
      const next = { ...c };
      const id = a.id || uid();
      const list = (next.addresses || []).map((x) => ({ ...x, default: !!a.default ? false : x.default }));
      const newAddr = { id, label: a.label || 'Saved', addr: a.addr || '', lat: a.lat || null, lng: a.lng || null,
                       default: !!list.filter((x) => x.default).length ? false : true }; // if none default yet, this one becomes it
      list.push(newAddr);
      next.addresses = list;
      return next;
    }),
    removeAddress: (id) => setS((c) => {
      const next = { ...c, addresses: (c.addresses || []).filter((x) => x.id !== id) };
      const hasDefault = next.addresses.some((x) => x.default);
      if (!hasDefault && next.addresses[0]) next.addresses = next.addresses.map((x, i) => i === 0 ? { ...x, default: true } : x);
      return next;
    }),
    setDefaultAddress: (id) => setS((c) => ({
      ...c, addresses: (c.addresses || []).map((x) => ({ ...x, default: x.id === id })),
    })),
    // V15 restore: editing an existing address (was missing since V9).
    updateAddress: (id, patch) => setS((c) => ({
      ...c, addresses: (c.addresses || []).map((x) => x.id !== id ? x : { ...x, ...(patch || {}) }),
    })),
    getDefaultAddress: () => {
      const cur = sRef.current; if (!cur) return null;
      return (cur.addresses || []).find((a) => a.default) || cur.addresses[0] || null;
    },

    // ---- withdrawals (V9 ledger + cap + stub API) ----
    requestWithdrawal: (amount, provider, accountLabel) => setS((c) => {
      const next = { ...c };
      resetDailyIfNewDay(next);
      const cfg = WITHDRAWAL_PROVIDERS[provider];
      if (!cfg) { pushAlert(next, '❌ Unknown provider: ' + provider); return next; }
      if (amount < cfg.min) { pushAlert(next, '❌ Min for ' + provider + ' is ₱' + cfg.min); return next; }
      if (amount + cfg.fee > next.wallet.balance) { pushAlert(next, '❌ Insufficient balance (amount + ₱' + cfg.fee + ' fee)'); return next; }
      if (amount > WITHDRAWAL_LIMITS.max_per_request) { pushAlert(next, '❌ Max per request is ₱' + WITHDRAWAL_LIMITS.max_per_request); return next; }
      const pending = totalPendingAmount(next);
      if (pending + amount > WITHDRAWAL_DAILY_CAP_GLOBAL) { pushAlert(next, '❌ Exceeds global daily cap'); return next; }
      const concur = (next.wallet.withdrawals || []).filter((w) => w.status === 'pending').length;
      if (concur >= WITHDRAWAL_LIMITS.max_concurrent_pending) { pushAlert(next, '❌ Too many pending requests — finish or reject first'); return next; }
      // Balance hold: deduct now, ledger tracks it.
      const w = { id: uid(), amount, fee: cfg.fee, net: amount - cfg.fee, provider, accountLabel: accountLabel || '',
                  kind: cfg.kind, status: 'pending', createdAt: now(), history: [{ at: now(), ev: 'created' }] };
      next.wallet = { ...next.wallet };
      next.wallet.balance = Math.round((next.wallet.balance - amount - cfg.fee) * 100) / 100;
      next.wallet.withdrawals = [w, ...(next.wallet.withdrawals || [])];
      next.wallet.tx = [{ id: uid(), amount: -(amount + cfg.fee), kind: 'withdrawal_hold', orderId: w.id, ts: now() }, ...next.wallet.tx];
      next.wallet.withdrawn_today = Math.round((next.wallet.withdrawn_today + amount) * 100) / 100;
      pushAlert(next, '🔒 Withdrawal ₱' + amount + ' via ' + provider + ' held — admin will review');
      return next;
    }),
    adminApproveWithdrawal: (id) => setS((c) => {
      const next = { ...c };
      next.wallet = { ...next.wallet };
      const w = (next.wallet.withdrawals || []).find((x) => x.id === id);
      if (!w || w.status !== 'pending') return next;
      next.wallet.withdrawals = next.wallet.withdrawals.map((x) => x.id !== id ? x : {
        ...x, status: 'approved', approvedAt: now(), history: [...x.history, { at: now(), ev: 'approved' }],
      });
      audit(next, 'Withdrawal approved', '₱' + w.amount + ' via ' + w.provider);
      pushAlert(next, '✅ Withdrawal approved · ready for rails');
      return next;
    }),
    adminRejectWithdrawal: (id, reason) => setS((c) => {
      const next = { ...c };
      next.wallet = { ...next.wallet };
      const w = (next.wallet.withdrawals || []).find((x) => x.id === id);
      if (!w || w.status === 'rejected' || w.status === 'paid') return next;
      // Refund the hold.
      next.wallet.balance = Math.round((next.wallet.balance + w.amount + w.fee) * 100) / 100;
      next.wallet.withdrawn_today = Math.max(0, Math.round((next.wallet.withdrawn_today - w.amount) * 100) / 100);
      next.wallet.withdrawals = next.wallet.withdrawals.map((x) => x.id !== id ? x : {
        ...x, status: 'rejected', rejectedAt: now(), reason: reason || 'no reason',
        history: [...x.history, { at: now(), ev: 'rejected: ' + (reason || '') }],
      });
      next.wallet.tx = [{ id: uid(), amount: (w.amount + w.fee), kind: 'withdrawal_refund', orderId: w.id, ts: now() }, ...next.wallet.tx];
      audit(next, 'Withdrawal rejected + refund', '₱' + w.amount + ' via ' + w.provider);
      pushAlert(next, '↩️ Withdrawal rejected — funds returned');
      return next;
    }),
    // Admin clicks "Mark paid". This is a *stub*: we mark status so the user
    // sees the move but we never claim the rails actually fired. Real rails
    // require Supabase Edge Function + provider API keys (out of repo).
    adminMarkWithdrawalPaidStub: (id) => setS((c) => {
      const next = { ...c };
      next.wallet = { ...next.wallet };
      const w = (next.wallet.withdrawals || []).find((x) => x.id === id);
      if (!w || w.status !== 'approved') return next;
      next.wallet.withdrawals = next.wallet.withdrawals.map((x) => x.id !== id ? x : {
        ...x, status: 'paid_stub', paidAt: now(),
        history: [...x.history, { at: now(), ev: 'paid_stub: requires provider API keys in Edge Function' }],
      });
      audit(next, 'Withdrawal paid (stub)', '₱' + w.net + ' net via ' + w.provider);
      pushAlert(next, '🟢 Withdrawal marked sent (stub — provider keys not configured)');
      return next;
    }),

    // ---- cart (V9 multi-store) ----
    addToCart: (entry) => setS((c) => {
      const items = (c.cart?.items || []).filter((x) => x.storeId !== entry.storeId);
      items.push({ storeId: entry.storeId, storeName: entry.storeName, description: entry.description || '',
                   fees: entry.fees || 0 });
      return { ...c, cart: { ...(c.cart || { items: [], shipping_fee: 25 }), items } };
    }),
    removeFromCart: (storeId) => setS((c) => {
      const items = (c.cart?.items || []).filter((x) => x.storeId !== storeId);
      return { ...c, cart: { ...(c.cart || { items: [], shipping_fee: 25 }), items } };
    }),
    clearCart: () => setS((c) => ({ ...c, cart: { items: [], shipping_fee: 25 } })),
    cartTotals: () => {
      const cur = sRef.current; if (!cur) return { items: 0, itemsFee: 0, shipping: 25, total: 25 };
      const items = cur.cart?.items || [];
      const itemsFee = items.reduce((a, x) => a + (x.fees || 0), 0);
      const shipping = items.length > 1 ? 25 + (items.length - 1) * 8 : 25;
      return { items: items.length, itemsFee, shipping, total: itemsFee + shipping };
    },
    // Place cart: 1 parent order + N sub-orders (one per store). Single shared courier
    // accepts the parent and moves all sub-orders through the same flow.
    placeCartOrder: (userId, payVia) => setS((c) => {
      const next = { ...c };
      const items = next.cart?.items || [];
      if (!items.length) return next;
      const totals = api.cartTotals();
      const parent = { id: uid(), kind: 'cart', mine: true, parent: true,
                       customerPhone: userId, subOrderIds: [], items: items.length + ' stores',
                       fee: totals.shipping, total: totals.total, payVia: payVia || 'wallet',
                       addressId: (next.addresses || []).find((a) => a.default)?.id || (next.addresses || [])[0]?.id || null,
                       status: 'finding_driver', photos: {}, neg: null, driverIdx: 0, created: now(), updated: now() };
      const subs = items.map((it) => ({
        id: uid(), parentId: parent.id, mine: true, storeId: it.storeId, storeName: it.storeName,
        kind: 'order', category: 'Food', items: it.description || 'Order from ' + it.storeName,
        fee: Math.round((it.fees / Math.max(1, totals.itemsFee)) * totals.total),
        pickup: it.storeName, dropoff: 'customer address', price: it.fees || 0,
        status: 'vendor_quote', photos: {}, neg: null, created: now(), updated: now(),
      }));
      parent.subOrderIds = subs.map((x) => x.id);
      next.orders = [parent, ...subs, ...next.orders];
      pushAlert(next, '🛒 Cart order placed (' + items.length + ' stores)');
      next.cart = { items: [], shipping_fee: 25 };
      return next;
    }),

    // ---- driver location (V9 foreground + Capacitor hint) ----
    updateDriverLocation: (driverId, lat, lng, accuracy, source) => setS((c) => ({
      ...c, driverLocations: { ...(c.driverLocations || {}), [driverId]: { lat, lng, ts: now(), accuracy: accuracy || null, source: source || 'fg' } },
    })),
    listDriverLocations: () => {
      const cur = sRef.current;
      return cur ? (cur.driverLocations || {}) : {};
    },

    // ---- admin extended (V9) ----
    adminToggleStoreActive: (storeId) => setS((c) => ({
      ...c, stores: (c.stores || []).map((s) => s.id !== storeId ? s : { ...s, active: !s.active }),
    })),
    adminSetStoreFeatured: (storeId, featured) => setS((c) => ({
      ...c, stores: (c.stores || []).map((s) => s.id !== storeId ? s : { ...s, featured }),
    })),
    adminListWithdrawals: () => {
      const cur = sRef.current; return cur ? (cur.wallet?.withdrawals || []) : [];
    },

    // ---- V8 carry-over actions, kept verbatim for compatibility ----
    listStoresByCategory: (category) => {
      const cur = sRef.current; if (!cur) return [];
      const want = normCat(category).toLowerCase();
      return (cur.stores || []).filter((s) => s.active !== false && normCat(s.category).toLowerCase() === want);
    },
    listStoresAll: () => {
      const cur = sRef.current; if (!cur) return [];
      return (cur.stores || []).filter((s) => s.active !== false);
    },
    signIn: (session) => setS((c) => ({ ...c, auth: session, activeRole: session.role === 'admin' ? 'admin' : 'customer' })),
    signOut: () => setS((c) => ({ ...c, auth: null, terms: false, activeRole: 'customer' })),
    agreeTerms: () => setS((c) => ({ ...c, terms: true })),
    topUp: (amount) => setS((c) => {
      const n = { ...c }; n.wallet = { ...n.wallet };
      n.wallet.balance = Math.round((n.wallet.balance + amount) * 100) / 100;
      n.wallet.tx = [{ id: uid(), amount, kind: 'topup', ts: now() }, ...n.wallet.tx]; return n;
    }),
    addCoupon: (code) => setS((c) => ({ ...c, profile: { ...c.profile, coupons: [...c.profile.coupons, code] } })),
    // V15 restore: vendor catalog actions (Vendor.js + Driver.js call these).
    catalogAdd: (name, price) => setS((c) => ({ ...c, catalog: [...(c.catalog || []), { id: uid(), name, price }] })),
    catalogDel: (id) => setS((c) => ({ ...c, catalog: (c.catalog || []).filter((x) => x.id !== id) })),
    placeOrder: (draft) => setS((c) => {
      const n = { ...c };
      const o = { id: uid(), mine: true, kind: draft.kind, category: draft.category, items: draft.text,
                  pickup: draft.pickup, dropoff: draft.dropoff, fee: draft.fee, price: 0, status: 'vendor_quote',
                  storeId: draft.storeId || null, photos: {}, neg: null, created: now(), updated: now(), payVia: draft.payVia };
      n.orders = [o, ...n.orders]; pushAlert(n, 'Order placed'); return n;
    }),
    // ---- V15 restore: full order lifecycle (V8 verbatim; these were dropped in
    // the V9 rewrite, which crashed every screen that called them) ----
    quoteAnswer: (orderId, action, amount) => setS((c) => ({
      ...c, orders: c.orders.map((o) => {
        if (o.id !== orderId) return o;
        const n = { ...o, updated: now() };
        if (action === 'accept') { n.neg = null; n.status = 'finding_driver'; n.paidHeld = true; pushAlert(c, 'Quote approved — payment held'); }
        if (action === 'counter') {
          n.neg = { ...n.neg, turn: 'them', amount, history: [...n.neg.history, { by: 'customer', amount, ts: now(), note: 'You countered' }] };
          n.status = 'vendor_talk';
        }
        if (action === 'cancel') { n.neg = null; n.status = 'cancelled'; }
        return n;
      }),
    })),
    driverAnswer: (orderId, action, amount) => setS((c) => ({
      ...c, orders: c.orders.map((o) => {
        if (o.id !== orderId) return o;
        const n = { ...o, updated: now() };
        if (action === 'accept') { n.fee = n.neg.amount; n.driver = n.neg.driver || DRIVER_NAMES[(n.driverIdx || 0) % 4]; n.neg = null; n.status = 'accepted'; pushAlert(c, 'Fare confirmed'); }
        if (action === 'counter') {
          n.neg = { ...n.neg, turn: 'them', amount, history: [...n.neg.history, { by: 'customer', amount, ts: now(), note: 'You countered' }] };
          n.status = 'driver_talk';
        }
        if (action === 'refuse') { n.neg = null; n.driverIdx = (n.driverIdx || 0) + 1; n.status = 'finding_driver'; pushAlert(c, 'Offer refused — next courier'); }
        return n;
      }),
    })),
    offerAnswer: (orderId, action, amount) => setS((c) => ({
      ...c, orders: c.orders.map((o) => {
        if (o.id !== orderId) return o;
        const n = { ...o, updated: now() };
        if (action === 'accept') { n.neg = null; n.status = 'accepted'; }
        if (action === 'refuse') { n.expired = true; n.neg = null; }
        if (action === 'counter') {
          n.neg = { ...n.neg, turn: 'them', amount,
                    history: [...n.neg.history, { by: n.myRole, amount, ts: now(), note: 'Your counter' }] };
        }
        return n;
      }),
    })),
    vendorQuote: (orderId, price, photoObj) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : {
        ...o, price, photos: { ...o.photos, product: photoObj }, updated: now(),
        neg: { phase: 'vendor', turn: 'them', amount: price,
               history: [...(o.neg ? o.neg.history : []), { by: 'vendor', amount: price, ts: now(), note: 'Your quote + product photo' }] },
      }),
    })),
    vendorPacked: (orderId, photoObj) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : { ...o, photos: { ...o.photos, packed: photoObj }, status: 'ready_pickup', updated: now() }),
    })),
    vendorHandover: (orderId) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : { ...o, status: 'handover_done', updated: now() }),
    })),
    driverPickup: (orderId, photoObj) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : { ...o, photos: { ...o.photos, pickup: photoObj }, status: 'picked_up', updated: now() }),
    })),
    driverDeliver: (orderId, photoObj) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : { ...o, photos: { ...o.photos, delivery: photoObj }, status: 'delivered', updated: now() }),
    })),
    customerConfirm: (orderId) => setS((c) => {
      const o = c.orders.find((x) => x.id === orderId);
      const next = { ...c, orders: c.orders.map((x) => x.id !== orderId ? x : { ...x, status: 'completed', updated: now() }) };
      if (o && o.paidHeld) { next.wallet = { ...next.wallet, tx: [{ id: uid(), amount: -(o.price + o.fee), kind: 'payment', orderId, ts: now() }, ...next.wallet.tx] }; }
      pushAlert(next, 'Delivery confirmed — funds released');
      return next;
    }),
    cancelOrder: (orderId) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : { ...o, status: 'cancelled', updated: now() }),
    })),
    dispute: (orderId) => setS((c) => ({
      ...c, orders: c.orders.map((o) => o.id !== orderId ? o : { ...o, status: 'disputed', updated: now() }),
    })),
    adminDecideKyc: (id, ok) => setS((c) => {
      const next = { ...c };
      const k = c.kyc.find((x) => x.id === id);
      if (!k) return next;
      next.kyc = c.kyc.map((x) => x.id !== id ? x : { ...x, status: ok ? 'approved' : 'rejected' });
      if (k.userId === 'me') next.roles = { ...c.roles, [k.role]: { status: ok ? 'approved' : 'rejected', data: k.data } };
      if (ok && k.role === 'vendor') {
        const cat = normCat((k.data && k.data.type) || 'Sari-sari');
        next.stores = (c.stores || []).map((s) => s.ownerId === 'me' ? {
          ...s, active: true, category: cat, name: (k.data && k.data.store) || s.name,
          address: (k.data && k.data.address) || s.address, area: (k.data && k.data.area) || s.area,
        } : s);
      }
      audit(next, ok ? 'KYC approved' : 'KYC rejected', (k.name + ' (' + k.role + ')'));
      return next;
    }),
    toggleOnline: (kind, v) => setS((c) => ({ ...c, [kind === 'driver' ? 'driverOnline' : 'storeOpen']: v })),
    adminAdjustWallet: (userId, amount, reason) => setS((c) => {
      const next = { ...c, users: c.users.map((u) => u.id !== userId ? u : { ...u, wallet: Math.round((u.wallet + amount) * 100) / 100 }) };
      audit(next, 'Wallet adjusted ' + (amount > 0 ? '+' : '') + amount, userId + ' — reason: ' + (reason || ''));
      return next;
    }),
    // ---- V15 restore: admin order/user controls (V8 verbatim) ----
    adminCancelRefund: (orderId) => setS((c) => {
      const o = c.orders.find((x) => x.id === orderId);
      const next = { ...c, orders: c.orders.map((x) => x.id !== orderId ? x : { ...x, status: 'cancelled', updated: now() }) };
      if (o && o.paidHeld) { next.wallet = { ...next.wallet, balance: next.wallet.balance + o.price + o.fee,
        tx: [{ id: uid(), amount: o.price + o.fee, kind: 'refund', orderId, ts: now() }, ...next.wallet.tx] }; }
      audit(next, 'Order cancelled + refunded', orderId);
      return next;
    }),
    adminReassign: (orderId) => setS((c) => {
      const next = { ...c, orders: c.orders.map((x) => x.id !== orderId ? x : { ...x, status: 'finding_driver', neg: null, driverIdx: 0, updated: now() }) };
      audit(next, 'Order reassigned', orderId); return next;
    }),
    adminFreeze: (userId, v) => setS((c) => {
      const next = { ...c, users: c.users.map((u) => u.id !== userId ? u : { ...u, frozen: v }) };
      audit(next, v ? 'User frozen' : 'User unfrozen', userId); return next;
    }),
    adminSetCommissions: (cm) => setS((c) => { const n = { ...c, settings: { ...c.settings, commissions: cm } };
      audit(n, 'Commissions updated', JSON.stringify(cm)); return n; }),
    adminSetSettings: (patch) => setS((c) => { const n = { ...c, settings: { ...c.settings, ...patch } };
      audit(n, 'Settings updated', Object.keys(patch).join(',')); return n; }),
    adminSetCategories: (cats) => setS((c) => { const n = { ...c, settings: { ...c.settings, categories: cats } };
      audit(n, 'Categories updated', cats.join(', ')); return n; }),
    adminSetBanner: (b) => setS((c) => { const n = { ...c, settings: { ...c.settings, banner: b } };
      audit(n, 'Banner updated', b.title); return n; }),
    adminBroadcast: (text, target) => setS((c) => { const n = { ...c };
      n.alerts = [{ id: uid(), text: '📣 ' + text, ts: now(), read: false }, ...(c.alerts || [])].slice(0, 50);
      return n; }),
    setName: (name) => setS((c) => ({ ...c, profile: { ...c.profile, name } })),
    switchRole: (role) => setS((c) => {
      const next = { ...c, activeRole: role };
      if (role === 'vendor') {
        const myApproved = (c.kyc || []).find((k) => k.userId === 'me' && k.role === 'vendor' && k.status === 'approved');
        if (myApproved) {
          const cat = normCat((myApproved.data && myApproved.data.type) || 'Sari-sari');
          next.stores = (c.stores || []).map((s) => s.ownerId === 'me' ? { ...s, active: true, category: cat } : s);
        }
      }
      return next;
    }),
    // V15 restore: store/driver registration — seeds a pending KYC entry and,
    // for vendors, a paused store that goes live when the admin approves.
    submitKyc: (role, data) => setS((c) => {
      const entry = { id: uid(), userId: 'me', name: c.profile.name, role, status: 'pending', ts: now(), data };
      const next = { ...c, roles: { ...c.roles, [role]: { status: 'pending', data } }, kyc: [entry, ...c.kyc] };
      if (role === 'vendor') {
        const cat = normCat(data.type || 'Sari-sari');
        next.stores = [
          { id: uid(), name: data.store || c.profile.name, category: cat,
            area: data.area || '', address: data.address || '',
            lat: null, lng: null, rating: 0, ownerId: 'me', active: false, createdAt: now() },
          ...(c.stores || []),
        ];
      }
      pushAlert(next, role === 'vendor' ? '🏪 Store submitted — pending admin review' : '🛵 Driver documents submitted — pending review');
      return next;
    }),
    resetAll: () => { AsyncStorage.removeItem(KEY); setS(DEFAULTS()); },
  };

  if (!s) return null;
  return <Ctx.Provider value={{ s, ...api }}>{children}</Ctx.Provider>;
}
