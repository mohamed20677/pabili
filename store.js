// Pabili PH — V17 store. Orders, rides, stores, approvals and wallet now live in Supabase and are
// shared between phones (polled every 4 s + realtime hint). Local state keeps only what is personal
// to this phone: session, language, saved addresses, cart draft, coupons, vendor catalog.
// The old bot/timer simulator was removed on purpose — nothing in here is simulated any more.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { stopBgTracking } from './tracking';
import { notify } from './notifications';
import { purgeMyFiles } from './media';
import { supabase } from './supabase';
import * as C from './cloud';
import { uid, now, CATEGORIES } from './lib';

const KEY = 'pabili.ph.v17';
const POLL_MS = 4000;

const DEFAULTS = () => ({
  auth: null, terms: false,
  roles: { driver: { status: 'none', data: null }, vendor: { status: 'none', data: null } },
  activeRole: 'customer',
  profile: { name: 'Pabili User', rating: 5.0, coupons: [], avatar: null },
  addresses: [],
  wallet: { balance: 0, credit: 0, tx: [], withdrawals: [] },
  cart: { items: [], shipping_fee: 25 },
  catalog: [],
  orders: [], alerts: [], audit: [], users: [], stores: [], kyc: [], myStore: null, frozen: false, net: 'ok',
  driverLocations: {}, driverOnline: false,
  settings: {
    commissions: { customerPct: 3, vendorPct: 8, driverPct: 10 },
    offerSecs: 30, vendorSecs: 60, customerSecs: 60, maxDrivers: 3,
    categories: CATEGORIES.slice(),
    banner: { title: 'Your favorite store has no delivery?', cta: 'Order it from here' },
    ride: { enabled: true, minFare: 20, base: 25, perKm: 10 },
  },
});

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);
const errMsg = (e) => String((e && e.message) || e || 'Something went wrong');

// What should this phone hear about when an order it is part of changes?
function alertFor(o, prev) {
  const ride = o.kind === 'ride';
  const errand = o.kind === 'errand';
  const changed = prev !== o.status;
  if (o.myRole === 'vendor') {
    if (!prev && o.status === 'vendor_quote') return '🛍 New order for your store';
    if (changed && o.status === 'vendor_talk') return '💬 The customer countered your price';
    if (changed && o.status === 'accepted') return '🛵 Courier accepted — pack the order';
    if (changed && o.status === 'completed') return '✅ Order completed — check your wallet';
  }
  if (o.myRole === 'driver') {
    if (o.status === 'driver_offer' && o.neg && o.neg.turn === 'me' && prev !== 'driver_offer') return ride ? '🚕 New ride request' : '🛵 New delivery offer';
    if (changed && prev === 'driver_talk' && o.status === 'accepted') return '✅ The customer accepted your fare';
    if (changed && o.status === 'vendor_talk' && errand) return '💬 The customer countered your item price';
    if (changed && o.status === 'ready_pickup' && errand) return '✅ Approved — go ahead and buy it';
    if (changed && o.status === 'ready_pickup' && !ride) return '📦 The store packed the order — go pick it up';
    if (changed && o.status === 'completed') return '✅ Paid — check your wallet';
    if (changed && o.status === 'cancelled') return 'Order cancelled by the customer';
  }
  if (o.myRole === 'customer' && changed) {
    if (o.status === 'quote_review') return errand ? '🧾 Your courier found it — check the price and photo' : '🧾 The store sent its price and photo';
    if (o.status === 'finding_driver' && (prev === 'quote_review' || prev === 'vendor_talk')) return '👍 Price agreed — finding a courier';
    if (o.status === 'driver_talk' && o.neg) return `🛵 The ${ride ? 'driver' : 'courier'} asks ₱${o.neg.amount}`;
    if (o.status === 'accepted') return ride ? '🚕 A driver accepted — on the way to you' : '🛵 A courier accepted your order';
    if (o.status === 'ready_pickup') return ride ? '📍 Your driver has arrived' : errand ? null : '📦 The store packed your order';
    if (o.status === 'picked_up') return ride ? '🚕 Trip started' : '🛵 Your order is on the way';
    if (o.status === 'delivered') return ride ? '🏁 You have arrived — please confirm' : '📬 Delivered — please confirm';
    if (o.status === 'cancelled') return 'Order cancelled';
  }
  return null;
}

export function StoreProvider({ children }) {
  const [s, setS] = useState(null);
  const sRef = useRef(s); sRef.current = s;
  const prevRef = useRef(null);   // orderId -> last status seen (for alerts)
  const busyRef = useRef(false);
  const againRef = useRef(false);
  const pollN = useRef(0);

  // ---- load / persist ----
  useEffect(() => {
    AsyncStorage.removeItem('pabili.ph.v1').catch(() => {});
    AsyncStorage.getItem(KEY).then((v) => {
      const base = DEFAULTS();
      if (!v) { setS(base); return; }
      const l = JSON.parse(v);
      // cloud-backed slices always start empty and are refilled from Supabase
      setS({ ...base, auth: l.auth || null, terms: !!l.terms, activeRole: l.activeRole || 'customer', profile: { ...base.profile, ...(l.profile || {}) },
             addresses: l.addresses || [], cart: l.cart || base.cart, catalog: l.catalog || [], driverOnline: !!l.driverOnline });
    });
  }, []);
  useEffect(() => {
    if (!s) return undefined;
    const t = setTimeout(() => {
      const { auth, terms, activeRole, profile, addresses, cart, catalog, driverOnline } = s;
      AsyncStorage.setItem(KEY, JSON.stringify({ auth, terms, activeRole, profile, addresses, cart, catalog, driverOnline })).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [s && s.auth, s && s.terms, s && s.activeRole, s && s.profile, s && s.addresses, s && s.cart, s && s.catalog, s && s.driverOnline]);

  // ---- sync ----
  async function refreshCore(n) {
    const cur = sRef.current;
    if (!cur || !cur.auth || !cur.auth.phone) return;
    const me = cur.auth.phone, admin = cur.auth.role === 'admin';
    const patch = {};
    let settings = cur.settings;
    if (n % 10 === 0) { const st = await C.fetchSettings(); settings = { ...cur.settings, ...st, ride: { ...cur.settings.ride, ...(st.ride || {}) } }; patch.settings = settings; }
    if (admin) {
      patch.orders = await C.fetchAllOrders(me);
      if (n % 2 === 0) { patch.kyc = await C.fetchKycAll(); patch.stores = await C.fetchStores(); patch.users = await C.fetchUsers(); patch.audit = await C.fetchAudit(); }
    } else {
      patch.orders = await C.fetchMyOrders(me);
      if (n % 3 === 0) {
        const [p, stores, tx] = await Promise.all([C.fetchProfileFull(me), C.fetchStores(), C.fetchWalletTx(me)]);
        patch.stores = stores; patch.myStore = stores.find((x) => x.ownerPhone === me) || null;
        patch.wallet = { ...cur.wallet, tx, balance: p ? Number(p.wallet_balance || 0) : cur.wallet.balance };
        if (p) {
          patch.roles = { driver: { status: p.driver_status || 'none', data: null }, vendor: { status: p.vendor_status || 'none', data: null } };
          patch.frozen = !!p.is_frozen; patch.myVehicle = C.vehicleLabel(p);
        }
      }
      const searching = patch.orders.some((o) => o.mine && C.SEARCHING.includes(o.status));
      if ((cur.driverOnline || searching) && (await C.dispatchTick(settings)) > 0) patch.orders = await C.fetchMyOrders(me);
    }
    // alerts from order changes (skip the very first load so old orders don't flood)
    const newAlerts = [];
    if (prevRef.current) {
      patch.orders.forEach((o) => {
        if (o.myRole === 'observer') return;
        const text = alertFor(o, prevRef.current[o.id]);
        if (text) newAlerts.push({ id: uid(), text, ts: now(), read: false });
      });
    }
    prevRef.current = Object.fromEntries(patch.orders.map((o) => [o.id, o.status]));
    let bc = [];
    if (n % 3 === 0) bc = await C.fetchBroadcasts();
    setS((c) => {
      if (!c || !c.auth) return c;
      const known = new Set((c.alerts || []).map((a) => a.id));
      const role = c.activeRole;
      const fresh = bc.filter((b) => !known.has(b.id) && (b.target === 'all' || b.target === role));
      const next = { ...c, ...patch, net: 'ok' };
      if (patch.wallet) next.wallet = { ...c.wallet, ...patch.wallet };
      if (newAlerts.length || fresh.length) next.alerts = [...newAlerts, ...fresh, ...(c.alerts || [])].slice(0, 60);
      const r = next.roles || c.roles;
      if ((next.activeRole === 'driver' && r.driver.status !== 'approved') || (next.activeRole === 'vendor' && r.vendor.status !== 'approved')) next.activeRole = 'customer';
      return next;
    });
    newAlerts.slice(0, 3).forEach((a) => notify('Pabili', a.text));
  }
  async function refresh(force) {
    if (busyRef.current) { if (force) againRef.current = true; return; }
    busyRef.current = true;
    try { await refreshCore(force ? 0 : pollN.current++); }
    catch (e) { setS((c) => (c && c.net !== 'offline' ? { ...c, net: 'offline' } : c)); }
    finally { busyRef.current = false; if (againRef.current) { againRef.current = false; refresh(true); } }
  }
  const phone = s && s.auth && s.auth.phone;
  useEffect(() => {
    if (!phone) return undefined;
    pollN.current = 0; prevRef.current = null;
    refresh(false);
    const id = setInterval(() => refresh(false), POLL_MS);
    // realtime is only an accelerator (needs the orders table in the realtime publication; harmless if not)
    let ch = null;
    try { ch = supabase.channel('orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refresh(true)).subscribe(); } catch (e) { /* polling continues */ }
    return () => { clearInterval(id); if (ch) supabase.removeChannel(ch); };
  }, [phone]);

  // run an action, report failures honestly, then sync at once
  async function run(label, fn) {
    try { const r = await fn(); await refresh(true); return r === undefined ? true : r; }
    catch (e) { Alert.alert(label, errMsg(e)); refresh(true); return null; }
  }
  const ord = (x) => (typeof x === 'string' ? (sRef.current.orders || []).find((o) => o.id === x) : x);
  const me = () => sRef.current.auth.phone;
  const guardFrozen = () => { if (sRef.current.frozen) throw new Error('Your account is frozen. Please contact support.'); };
  const needWallet = (payVia, amount) => {
    const bal = sRef.current.wallet.balance;
    if (payVia === 'wallet' && bal < amount) throw new Error(`Wallet balance ₱${bal} is not enough (about ₱${Math.ceil(amount)} needed). Pay by cash, or ask admin to top up.`);
  };

  const api = {
    // ---- session / profile (local) ----
    signIn: (session) => { prevRef.current = null; setS((c) => ({ ...c, auth: session, activeRole: session.role === 'admin' ? 'admin' : 'customer' })); },
    signOut: () => { stopBgTracking(); prevRef.current = null; setS((c) => ({ ...DEFAULTS(), profile: c.profile, addresses: c.addresses, catalog: c.catalog })); },
    agreeTerms: () => setS((c) => ({ ...c, terms: true })),
    setName: (name) => setS((c) => ({ ...c, profile: { ...c.profile, name } })),
    setProfile: (patch) => setS((c) => ({ ...c, profile: { ...c.profile, ...(patch || {}) } })),
    addCoupon: (code) => setS((c) => ({ ...c, profile: { ...c.profile, coupons: [...c.profile.coupons, code] } })),
    switchRole: (role) => setS((c) => ((role === 'customer' || (c.roles[role] && c.roles[role].status === 'approved')) ? { ...c, activeRole: role } : c)),
    refresh: () => refresh(true),
    // Apple requires in-app account deletion. Cloud data first (it refuses while orders/wallet are open), then files, then this phone.
    deleteAccount: async () => {
      try {
        const phone2 = me();
        await C.deleteAccountCloud(phone2);
        await purgeMyFiles(phone2);
        stopBgTracking(); prevRef.current = null;
        AsyncStorage.removeItem(KEY).catch(() => {});
        setS(DEFAULTS());
        return true;
      } catch (e) { Alert.alert('Delete account', errMsg(e)); return false; }
    },

    // ---- addresses (local) ----
    addAddress: (a) => setS((c) => {
      const list = c.addresses || [];
      return { ...c, addresses: [...list, { id: a.id || uid(), label: a.label || 'Saved', addr: a.addr || '', lat: a.lat || null, lng: a.lng || null, default: !list.some((x) => x.default) }] };
    }),
    removeAddress: (id) => setS((c) => {
      let list = (c.addresses || []).filter((x) => x.id !== id);
      if (list.length && !list.some((x) => x.default)) list = list.map((x, i) => (i === 0 ? { ...x, default: true } : x));
      return { ...c, addresses: list };
    }),
    setDefaultAddress: (id) => setS((c) => ({ ...c, addresses: (c.addresses || []).map((x) => ({ ...x, default: x.id === id })) })),
    updateAddress: (id, patch) => setS((c) => ({ ...c, addresses: (c.addresses || []).map((x) => (x.id !== id ? x : { ...x, ...(patch || {}) })) })),
    getDefaultAddress: () => { const cur = sRef.current; return cur ? ((cur.addresses || []).find((a) => a.default) || (cur.addresses || [])[0] || null) : null; },

    // ---- cart draft (local) — placing it creates one order per store ----
    addToCart: (e) => setS((c) => ({ ...c, cart: { ...c.cart, items: [...(c.cart.items || []).filter((x) => x.storeId !== e.storeId), { storeId: e.storeId, storeName: e.storeName, description: e.description || '', fees: e.fees || 0 }] } })),
    removeFromCart: (id) => setS((c) => ({ ...c, cart: { ...c.cart, items: (c.cart.items || []).filter((x) => x.storeId !== id) } })),
    clearCart: () => setS((c) => ({ ...c, cart: { items: [], shipping_fee: 25 } })),
    cartTotals: () => {
      const items = (sRef.current && sRef.current.cart && sRef.current.cart.items) || [];
      const itemsFee = items.reduce((a, x) => a + (x.fees || 0), 0);
      const shipping = items.length ? 25 + (items.length - 1) * 8 : 25;
      return { items: items.length, itemsFee, shipping, total: itemsFee + shipping };
    },
    placeCartOrder: (_u, payVia) => run('Cart', async () => {
      const cur = sRef.current; const items = cur.cart.items || []; if (!items.length) return null;
      const addr = (cur.addresses || []).find((a) => a.default) || (cur.addresses || [])[0];
      if (!addr) throw new Error('Add a delivery address first.');
      guardFrozen();
      const fee = Math.max(10, Math.round(api.cartTotals().shipping / items.length));
      for (const it of items) {
        const store = cur.stores.find((x) => x.id === it.storeId); if (!store) continue;
        await C.placeOrderCloud({ me: me(), myName: cur.profile.name, store, text: it.description || 'Order from ' + it.storeName, fee, payVia: payVia || 'cash', dropoff: addr });
      }
      setS((c) => ({ ...c, cart: { items: [], shipping_fee: 25 } }));
    }),

    // ---- stores ----
    listStoresByCategory: (category) => {
      const want = String(category || '').trim().toLowerCase();
      return ((sRef.current && sRef.current.stores) || []).filter((x) => x.active && x.open && String(x.category).trim().toLowerCase() === want);
    },
    listStoresAll: () => ((sRef.current && sRef.current.stores) || []).filter((x) => x.active && x.open),
    toggleOnline: (kind, v) => {
      if (kind === 'driver') { setS((c) => ({ ...c, driverOnline: v })); return Promise.resolve(); }
      return run('Store', () => C.setStoreOpen(me(), v));
    },
    updateDriverLocation: (id, lat, lng, accuracy, source) => setS((c) => ({ ...c, driverLocations: { ...(c.driverLocations || {}), [id]: { lat, lng, ts: now(), accuracy: accuracy || null, source: source || 'fg' } } })),
    listDriverLocations: () => (sRef.current ? (sRef.current.driverLocations || {}) : {}),
    catalogAdd: (name, price) => setS((c) => ({ ...c, catalog: [...(c.catalog || []), { id: uid(), name, price }] })),
    catalogDel: (id) => setS((c) => ({ ...c, catalog: (c.catalog || []).filter((x) => x.id !== id) })),

    // ---- customer: orders and rides ----
    placeOrder: (d) => run('Order', async () => {
      guardFrozen();
      const cur = sRef.current;
      const store = cur.stores.find((x) => x.id === d.storeId);
      if (!store) throw new Error('Choose a store first.');
      return C.placeOrderCloud({ me: me(), myName: cur.profile.name, store, text: d.text, fee: d.fee, payVia: d.payVia || 'cash', dropoff: d.dropoff });
    }),
    placeErrand: (d) => run('Errand', async () => {
      guardFrozen();
      const cur = sRef.current;
      return C.placeErrandCloud({ me: me(), myName: cur.profile.name, text: d.text, hint: d.hint, budget: d.budget, fee: d.fee, payVia: d.payVia || 'cash', dropoff: d.dropoff });
    }),
    shopperQuote: (o0, price, photo) => run('Price', () => C.shopperQuote(ord(o0), me(), price, photo)),
    shopperRespond: (o0, action, amount) => run('Price', () => C.shopperRespond(ord(o0), me(), action, amount)),
    placeRide: (d) => run('Ride request', async () => {
      guardFrozen();
      const cur = sRef.current, r = cur.settings.ride;
      if (!r.enabled) throw new Error('Rides are paused right now.');
      if (d.fee < r.minFare) throw new Error(`The minimum fare is ₱${r.minFare}.`);
      needWallet(d.payVia, d.fee);
      return C.placeRideCloud({ me: me(), myName: cur.profile.name, pickup: d.pickup, dest: d.dest, fee: d.fee, note: d.note, payVia: d.payVia || 'cash' });
    }),
    quoteAnswer: (o0, action, amount) => run('Quote', async () => {
      const o = ord(o0);
      if (action === 'accept') needWallet(o.payVia, o.neg.amount + o.fee);
      return C.customerQuote(o, action, amount);
    }),
    driverAnswer: (o0, action, amount) => run('Courier offer', async () => C.customerDriverAnswer(ord(o0), action, amount, sRef.current.settings)),
    cancelOrder: (o0) => run('Cancel', () => C.cancelOrderCloud(ord(o0))),
    dispute: (o0) => run('Report', () => C.disputeOrder(ord(o0))),
    customerConfirm: (o0) => run('Confirm', () => C.confirmOrder(ord(o0))),

    // ---- vendor ----
    vendorQuote: (o0, price, photo) => run('Quote', () => C.vendorQuote(ord(o0), price, photo)),
    vendorRespond: (o0, action, amount) => run('Price', () => C.vendorRespond(ord(o0), action, amount)),
    vendorDecline: (o0) => run('Order', () => C.vendorDecline(ord(o0))),
    vendorPacked: (o0, photo) => run('Packed', () => C.vendorPacked(ord(o0), photo)),

    // ---- courier (orders AND rides) ----
    driverOfferAnswer: (o0, action, amount) => run('Offer', () => C.driverRespond(ord(o0), me(), { name: sRef.current.profile.name, vehicle: sRef.current.myVehicle || '' }, action, amount, sRef.current.settings)),
    driverPickup: (o0, photo) => run('Pickup', () => C.driverPickup(ord(o0), me(), photo)),
    driverDeliver: (o0, photo) => run('Delivery', () => C.driverDeliver(ord(o0), me(), photo)),
    rideStep: (o0, step) => run('Ride', () => (step === 'arrived' ? C.rideArrived : step === 'start' ? C.rideStart : C.rideEnd)(ord(o0), me())),
    driverCancel: (o0) => run('Cancel', () => C.driverCancel(ord(o0), me())),

    // ---- roles / KYC ----
    submitKyc: (role, data) => run('Verification', () => C.submitKycCloud(me(), sRef.current.profile.name, role, data)),

    // ---- wallet ----
    requestWithdrawal: () => Alert.alert('Payouts', 'Withdrawals connect to GCash / Maya in the next update. Your balance is safe in the wallet until then.'),

    // ---- admin ----
    adminDecideKyc: (k, ok) => run('KYC', () => C.adminDecideKycCloud(typeof k === 'string' ? sRef.current.kyc.find((x) => x.id === k) : k, ok, me())),
    adminToggleStoreActive: (id) => run('Store', () => { const x = sRef.current.stores.find((y) => y.id === id); return C.adminStoreUpdate(id, { active: !x.active, open: !x.active }, me(), x.active ? 'Store paused' : 'Store activated'); }),
    adminSetStoreFeatured: (id, v) => run('Store', () => C.adminStoreUpdate(id, { featured: v }, me(), v ? 'Store featured' : 'Store un-featured')),
    adminFreeze: (phone2, v) => run('User', () => C.adminFreezeCloud(phone2, v, me())),
    adminAdjustWallet: (phone2, delta, reason) => run('Wallet', () => C.adjustWalletCloud(phone2, delta, reason || 'admin adjustment', me())),
    adminCancelRefund: (o0) => run('Order', () => C.adminOrderUpdate(ord(o0), 'cancelled', me(), 'Order cancelled by admin')),
    adminReassign: (o0) => run('Order', () => C.adminOrderUpdate(ord(o0), 'finding_driver', me(), 'Order reassigned')),
    adminForceComplete: (o0) => run('Order', async () => { const o = ord(o0); if (o.status !== 'delivered') await C.adminOrderUpdate(o, 'delivered', me(), 'Order force-completed'); return C.confirmOrder(o); }),
    adminSetCommissions: (cm) => run('Settings', () => C.saveSetting('commissions', { customer_pct: cm.customerPct, vendor_pct: cm.vendorPct, driver_pct: cm.driverPct })),
    adminSetSettings: (patch) => run('Settings', async () => {
      const map = { offerSecs: 'offer_secs', vendorSecs: 'vendor_secs', customerSecs: 'customer_secs', maxDrivers: 'max_drivers' };
      for (const [k, v] of Object.entries(patch)) if (map[k]) await C.saveSetting(map[k], v);
      if (patch.ride) { const r = patch.ride; await C.saveSetting('ride_enabled', !!r.enabled); await C.saveSetting('ride_min_fare', r.minFare); await C.saveSetting('ride_base', r.base); await C.saveSetting('ride_per_km', r.perKm); }
    }),
    adminSetCategories: (cats) => run('Settings', () => C.saveSetting('categories', cats)),
    adminSetBanner: (b) => run('Settings', () => C.saveSetting('banner', b)),
    adminBroadcast: (text, target) => run('Broadcast', () => C.broadcastCloud(text, target, me())),

    resetAll: () => { AsyncStorage.removeItem(KEY); setS(DEFAULTS()); },
  };

  if (!s) return null;
  return <Ctx.Provider value={{ s, ...api }}>{children}</Ctx.Provider>;
}
