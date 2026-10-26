// Galabili PH — cloud data layer (V17). Real multi-phone orders + rides on Supabase.
// Every status change is a CONDITIONAL update (status must still be what we expect), so two phones
// pressing buttons at the same moment can never corrupt an order: the loser gets a clear message.
import { supabase, SUPA_URL, SUPA_ANON } from './supabase';
import { distanceKm } from './lib';

const nowIso = () => new Date().toISOString();
const ms = (t) => (t ? new Date(t).getTime() : null);
const num = (x) => (x == null ? null : Number(x));
const plusSecs = (s) => new Date(Date.now() + s * 1000).toISOString();

// V31 ORDER SPEC — negotiation guardrail: every counter-offer is clamped to
// ±10% of the last agreed amount, so haggling stays a negotiation, not a reset.
export const NEG_PCT = 0.10;
export const clampNeg = (base, amount) => {
  const b = Math.max(0, Number(base) || 0);
  const lo = Math.round(b * (1 - NEG_PCT)), hi = Math.round(b * (1 + NEG_PCT));
  const a = Math.round(Number(amount) || 0);
  const v = Math.min(hi, Math.max(lo, a));
  return { value: v, clamped: v !== a, lo, hi };
};

export const SEARCHING = ['finding_driver', 'driver_offer', 'driver_talk'];
export const OPEN_FOR_CANCEL = ['vendor_quote', 'quote_review', 'vendor_talk', ...SEARCHING];

// ---------------------------------------------------------------- mapping (row → what the screens use)
export function mapOrder(r, me) {
  const mine = r.customer_phone === me;
  const asVendor = !mine && r.vendor_phone === me;
  const asDriver = !mine && !asVendor && (r.driver_phone === me || r.offer_to === me);
  // V24 ROLE-SET FIX: one phone can hold SEVERAL roles on the same order
  // (self-test: the same number is customer AND vendor). Collect every role,
  // so no board (store/driver/customer) ever hides an order it is part of.
  const myRoles = [];
  if (r.customer_phone === me) myRoles.push('customer');
  if (r.vendor_phone === me) myRoles.push('vendor');
  if (r.driver_phone === me || r.offer_to === me) myRoles.push('driver');
  const myRole = myRoles[0] || (mine ? 'customer' : asVendor ? 'vendor' : asDriver ? 'driver' : 'observer');
  const n = r.negotiation || null;
  // V21 LIVE-DB ADAPTER (proven live on mmhneaixcyvmciyioxeo 2026-10-25):
  // the live orders CHECK constraints only accept kind='buy' and a small
  // status set, so the app's true state rides in negotiation.ui and the app
  // kind is reconstructed from category (Ride / Errand / otherwise order).
  const ui = (n && n.ui) || r.status;
  const kind = r.category === 'Ride' ? 'ride' : r.category === 'Errand' ? 'errand' : 'order';
  const neg = n && n.amount != null ? {
    phase: n.phase, amount: Number(n.amount), by: n.by, final: !!n.final, awaiting: n.awaiting,
    turn: myRoles.includes(n.awaiting) ? 'me' : 'them',  // V24: any of my roles
    deadline: n.phase === 'driver' ? ms(r.offer_deadline) : null,
    history: n.history || [],
  } : null;
  return {
    id: r.id, kind, mine, myRole, myRoles, category: r.category, items: r.items,
    pickup: r.pickup_addr, dropoff: r.dropoff_addr,
    pickupLat: num(r.pickup_lat), pickupLng: num(r.pickup_lng), dropLat: num(r.dropoff_lat), dropLng: num(r.dropoff_lng),
    fee: Number(r.fee || 0), price: Number(r.price || 0), status: ui,
    storeId: r.store_id, storeName: r.store_name, photos: r.photos || {}, neg,
    customer: r.customer_name || r.customer_phone, customerPhone: r.customer_phone,
    vendorPhone: r.vendor_phone, driverPhone: r.driver_phone, driver: r.driver_name, driverVehicle: r.driver_vehicle,
    payVia: r.pay_via || 'cash', offerTo: r.offer_to, offerDeadline: ms(r.offer_deadline),
    budget: num(r.budget), declined: r.declined || [], settled: !!r.settled, created: ms(r.created_at), updated: ms(r.updated_at), expired: false,
  };
}
const mkNeg = (phase, awaiting, amount, by, note, prev, extra) => ({
  phase, awaiting, amount, by, ...(extra || {}),
  history: [...((prev && prev.history) || []), { by, amount, ts: Date.now(), note }],
});

// ---- V21 live-DB status/kind adapter --------------------------------------
// Proven live: orders_kind_check accepts ONLY 'buy'; orders_status_check
// accepts ONLY finding_driver, picked_up, delivered, cancelled, completed.
const toDbStatus = (ui) => ({
  vendor_quote: 'finding_driver', quote_review: 'finding_driver', vendor_talk: 'finding_driver',
  driver_offer: 'finding_driver', driver_talk: 'finding_driver', accepted: 'finding_driver',
  ready_pickup: 'picked_up', picked_up: 'picked_up', delivered: 'delivered',
  cancelled: 'cancelled', completed: 'completed', disputed: 'delivered',
  finding_driver: 'finding_driver',
}[ui] || 'finding_driver');

// Ensures a profiles row exists for this phone and returns ITS id (V23:
// SESSION FIRST — the phone lookup runs as an authenticated user, because a
// pre-session lookup can be hidden by RLS → treated as "no profile" →
// duplicate insert → 23505 profiles_phone_uidx). One row per phone: the
// existing id is always reused, so orders/kyc keep valid FKs.
async function ensureUid(me, name) {
  let uid = null;
  try { const g = await supabase.auth.getUser(); uid = (g && g.data && g.data.user && g.data.user.id) || null; } catch (e) { uid = null; }
  if (!uid) {
    try {
      if (typeof supabase.auth.signInAnonymously === 'function') {
        const a = await supabase.auth.signInAnonymously();
        uid = (a && a.data && a.data.user && a.data.user.id) || null;
      }
    } catch (e) { /* fall through to raw REST */ }
  }
  if (!uid) {
    try {
      const r = await fetch(SUPA_URL + '/auth/v1/signup', {
        method: 'POST', headers: { apikey: SUPA_ANON, 'Content-Type': 'application/json' }, body: '{}',
      });
      const j = await r.json();
      if (j && j.access_token && j.refresh_token && supabase.auth && supabase.auth.setSession) {
        await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
      }
      uid = (j && j.user && j.user.id) || null;
    } catch (e) { /* reported below */ }
  }
  let existing = null;
  try {
    const q = await supabase.from('profiles').select('id').eq('phone', me).maybeSingle();
    existing = (q && q.data && q.data.id) || null;
  } catch (e) { existing = null; }
  if (existing) {
    if (name) { try { await supabase.from('profiles').update({ name }).eq('id', existing); } catch (e) { /* cosmetic only */ } }
    return existing;
  }
  if (!uid) throw new Error('Sign-in failed — check internet and retry.');
  const p = await supabase.from('profiles').upsert({ id: uid, phone: me, name: name || null }, { onConflict: 'id' });
  if (p.error) {
    // Lost a race or a row for this phone appeared meanwhile → reuse its id.
    try {
      const q2 = await supabase.from('profiles').select('id').eq('phone', me).maybeSingle();
      const id2 = (q2 && q2.data && q2.data.id) || null;
      if (id2) return id2;
    } catch (e) { /* fall through */ }
    throw p.error;
  }
  return uid;
}

async function guarded(id, statuses, patch, match) {
  // V21: statuses are UI states; the DB stores toDbStatus(ui) and the precise
  // state rides in negotiation.ui (stamped on every write).
  const ui = patch.status || statuses[0];
  const negWrite = patch.negotiation ? { ...patch.negotiation, ui } : { ui };
  const dbPatch = { ...patch, status: toDbStatus(ui), negotiation: negWrite, updated_at: nowIso() };
  const dbStatuses = [...new Set(statuses.map(toDbStatus))];
  let q = supabase.from('orders').update(dbPatch).eq('id', id).in('status', dbStatuses);
  Object.entries(match || {}).forEach(([k, v]) => { q = q.eq(k, v); });
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('Someone just updated this order. It has been refreshed — please check and try again.');
  return data[0];
}

// ---------------------------------------------------------------- reads
export async function fetchMyOrders(me) {
  const { data, error } = await supabase.from('orders').select('*')
    .or(`customer_phone.eq.${me},vendor_phone.eq.${me},driver_phone.eq.${me},offer_to.eq.${me}`)
    .order('created_at', { ascending: false }).limit(150);
  if (error) throw error;
  return (data || []).map((r) => mapOrder(r, me));
}
export async function fetchAllOrders(me) {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map((r) => mapOrder(r, me));
}
export async function fetchProfileFull(me) {
  const { data } = await supabase.from('profiles')
    .select('name,avatar_url,wallet_balance,is_frozen,driver_status,vendor_status,vehicle,plate').eq('phone', me).maybeSingle();
  return data || null;
}
export async function fetchWalletTx(me) {
  const { data } = await supabase.from('wallet_tx').select('*').eq('user_phone', me).order('ts', { ascending: false }).limit(60);
  return (data || []).map((t) => ({ id: t.id, amount: Number(t.amount), kind: t.kind, orderId: t.order_id, reason: t.reason, ts: ms(t.ts) }));
}
const mapStore = (x) => ({ id: x.id, ownerPhone: x.owner_phone, name: x.name, category: x.category, area: x.area, address: x.address,
  lat: num(x.lat), lng: num(x.lng), rating: Number(x.rating || 0), active: !!x.active, open: !!x.open, featured: !!x.featured, createdAt: ms(x.created_at) });
export async function fetchStores() {
  const { data } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
  return (data || []).map(mapStore);
}
export async function fetchSettings() {
  const { data } = await supabase.from('settings').select('k,v');
  const m = {}; (data || []).forEach((r) => { m[r.k] = r.v; });
  const out = {};
  if (m.commissions) out.commissions = { customerPct: Number(m.commissions.customer_pct), vendorPct: Number(m.commissions.vendor_pct), driverPct: Number(m.commissions.driver_pct) };
  ['offer_secs:offerSecs', 'vendor_secs:vendorSecs', 'customer_secs:customerSecs', 'max_drivers:maxDrivers'].forEach((p) => {
    const [k, l] = p.split(':'); if (m[k] != null) out[l] = Number(m[k]);
  });
  if (Array.isArray(m.categories)) out.categories = m.categories;
  if (m.banner) out.banner = m.banner;
  out.ride = { enabled: m.ride_enabled !== false, minFare: Number(m.ride_min_fare || 20), base: Number(m.ride_base || 25), perKm: Number(m.ride_per_km || 10) };
  return out;
}
export async function saveSetting(k, v) {
  const { error } = await supabase.from('settings').upsert({ k, v, updated_at: nowIso() }, { onConflict: 'k' });
  if (error) throw error;
}
export async function fetchBroadcasts() {
  const { data } = await supabase.from('broadcast_alerts').select('*').order('ts', { ascending: false }).limit(15);
  return (data || []).map((b) => ({ id: 'b_' + b.id, text: '📣 ' + b.text, target: b.target, ts: ms(b.ts), read: false }));
}

// ---------------------------------------------------------------- store orders
export async function placeOrderCloud({ me, myName, store, text, fee, payVia, dropoff, settings }) {
  // V21 live-DB: kind must be 'buy', customer_id + request are NOT NULL,
  // initial UI state vendor_quote rides in negotiation.ui (status stays
  // finding_driver, which is the only allowed pre-pickup status).
  // V31 ORDER SPEC: the store quote window is a HARD deadline (vendorSecs).
  const uid = await ensureUid(me, myName);
  const vSecs = (settings && settings.vendorSecs) || 60;
  const { data, error } = await supabase.from('orders').insert({
    kind: 'buy', customer_id: uid, request: text,
    customer_phone: me, customer_name: myName, vendor_phone: store.ownerPhone, store_id: store.id,
    store_name: store.name, category: store.category, items: text,
    pickup_addr: store.address || store.name, pickup_lat: store.lat, pickup_lng: store.lng,
    dropoff_addr: dropoff.addr, dropoff_lat: dropoff.lat || null, dropoff_lng: dropoff.lng || null,
    fee, price: 0, status: 'finding_driver', awaiting: 'vendor', pay_via: payVia, photos: {}, declined: [],
    offer_deadline: plusSecs(vSecs),
    negotiation: { ui: 'vendor_quote' }, updated_at: nowIso(),  // V27: legacy table has no default
  }).select().single();
  if (error) throw error;
  return data;
}
export const vendorQuote = (o, price, photo) => guarded(o.id, ['vendor_quote'], {
  price, photos: { ...o.photos, product: photo }, status: 'quote_review', awaiting: 'customer',
  negotiation: mkNeg('vendor', 'customer', price, 'vendor', 'Store quote + product photo', null),
});
export const vendorDecline = (o) => guarded(o.id, ['vendor_quote', 'vendor_talk'], { status: 'cancelled', negotiation: null, awaiting: null });
export async function vendorRespond(o, action, amount, settings) {
  const last = [...((o.neg && o.neg.history) || [])].reverse().find((h) => h.by === 'vendor');
  const keep = last ? last.amount : o.price;
  if (action === 'accept') return guarded(o.id, ['vendor_talk'], { price: o.neg.amount, status: 'finding_driver', negotiation: null, awaiting: null, declined: [], offer_deadline: null });
  if (action === 'counter') {
    const c = clampNeg(keep, amount); // V31: ±10% of the store's own last price
    return guarded(o.id, ['vendor_talk'], { price: c.value, status: 'quote_review', awaiting: 'customer',
      negotiation: mkNeg('vendor', 'customer', c.value, 'vendor', 'Store counter (±10% rule)', o.neg) });
  }
  return guarded(o.id, ['vendor_talk'], { price: keep, status: 'quote_review', awaiting: 'customer',
    negotiation: mkNeg('vendor', 'customer', keep, 'vendor', 'Store keeps its price (final)', o.neg, { final: true }) });
}
export async function customerQuote(o, action, amount, settings) {
  const vSecs = (settings && settings.vendorSecs) || 60;
  if (o.kind === 'errand') { // the courier is the one who found the item: approving it = "go ahead and buy it"
    if (action === 'accept') return guarded(o.id, ['quote_review'], { price: o.neg.amount, status: 'ready_pickup', negotiation: null, awaiting: null, offer_deadline: null });
    if (action === 'counter') {
      const c = clampNeg(o.neg.amount, amount); // V31: ±10% rule
      return guarded(o.id, ['quote_review'], { status: 'vendor_talk', awaiting: 'driver', offer_deadline: plusSecs(vSecs),
        negotiation: mkNeg('shopper', 'driver', c.value, 'customer', 'Customer counter (±10% rule)', o.neg) });
    }
    return cancelOrderCloud(o);
  }
  if (action === 'accept') return guarded(o.id, ['quote_review'], { price: o.neg.amount, status: 'finding_driver', negotiation: null, awaiting: null, declined: [], offer_deadline: null });
  if (action === 'counter') {
    const c = clampNeg(o.neg.amount, amount); // V31: ±10% rule
    return guarded(o.id, ['quote_review'], { status: 'vendor_talk', awaiting: 'vendor', offer_deadline: plusSecs(vSecs),
      negotiation: mkNeg('vendor', 'vendor', c.value, 'customer', 'Customer counter (±10% rule)', o.neg) });
  }
  return cancelOrderCloud(o);
}
export const vendorPacked = (o, photo) => guarded(o.id, ['accepted'], { status: 'ready_pickup', photos: { ...o.photos, packed: photo } });
export const driverPickup = (o, me, photo) => guarded(o.id, ['ready_pickup'], { status: 'picked_up', photos: { ...o.photos, pickup: photo } }, { driver_phone: me });
export const driverDeliver = (o, me, photo) => guarded(o.id, ['picked_up'], { status: 'delivered', photos: { ...o.photos, delivery: photo } }, { driver_phone: me });

// ---------------------------------------------------------------- errands: a courier buys it at ANY shop
// customer asks → courier accepts the delivery fee → courier sends the item photo + price → customer approves
// (or counters) BEFORE anything is bought → courier buys, photographs, delivers.
export async function placeErrandCloud({ me, myName, text, hint, budget, fee, payVia, dropoff }) {
  // V21 live-DB: kind 'buy' + customer_id + request (NOT NULL), UI kind
  // reconstructed from category 'Errand'.
  const uid = await ensureUid(me, myName);
  const { data, error } = await supabase.from('orders').insert({
    kind: 'buy', customer_id: uid, request: text,
    category: 'Errand', customer_phone: me, customer_name: myName, items: text,
    pickup_addr: hint || 'Any shop near you — the courier chooses',
    pickup_lat: dropoff.lat || null, pickup_lng: dropoff.lng || null,   // ranks couriers by distance to the customer
    dropoff_addr: dropoff.addr, dropoff_lat: dropoff.lat || null, dropoff_lng: dropoff.lng || null,
    fee, price: 0, budget: budget || null, status: 'finding_driver', pay_via: payVia, photos: {}, declined: [],
    negotiation: { ui: 'finding_driver' }, updated_at: nowIso(),  // V27
  }).select().single();
  if (error) throw error;
  return data;
}
export const shopperQuote = (o, me, price, photo) => guarded(o.id, ['accepted'], {
  price, photos: { ...o.photos, product: photo }, status: 'quote_review', awaiting: 'customer',
  negotiation: mkNeg('shopper', 'customer', price, 'driver', 'Item price + photo from the shop', null),
}, { driver_phone: me });
export async function shopperRespond(o, me, action, amount) {
  const last = [...((o.neg && o.neg.history) || [])].reverse().find((h) => h.by === 'driver');
  const keep = last ? last.amount : o.price;
  if (action === 'accept') return guarded(o.id, ['vendor_talk'], { price: o.neg.amount, status: 'ready_pickup', negotiation: null, awaiting: null, offer_deadline: null }, { driver_phone: me });
  if (action === 'counter') {
    const c = clampNeg(keep, amount); // V31: ±10% rule
    return guarded(o.id, ['vendor_talk'], { price: c.value, status: 'quote_review', awaiting: 'customer',
      negotiation: mkNeg('shopper', 'customer', c.value, 'driver', 'Courier counter (±10% rule)', o.neg) }, { driver_phone: me });
  }
  return guarded(o.id, ['vendor_talk'], { price: keep, status: 'quote_review', awaiting: 'customer',
    negotiation: mkNeg('shopper', 'customer', keep, 'driver', 'Courier keeps the price (final)', o.neg, { final: true }) }, { driver_phone: me });
}

// ---------------------------------------------------------------- rides (no vendor, no photos)
export async function placeRideCloud({ me, myName, pickup, dest, fee, note, payVia }) {
  // V21 live-DB: kind 'buy' + customer_id + request; UI kind from category 'Ride'.
  const uid = await ensureUid(me, myName);
  const { data, error } = await supabase.from('orders').insert({
    kind: 'buy', customer_id: uid, request: note || 'Passenger ride',
    category: 'Ride', customer_phone: me, customer_name: myName, items: note || 'Passenger ride',
    pickup_addr: pickup.addr, pickup_lat: pickup.lat || null, pickup_lng: pickup.lng || null,
    dropoff_addr: dest.addr, dropoff_lat: dest.lat || null, dropoff_lng: dest.lng || null,
    fee, price: 0, status: 'finding_driver', pay_via: payVia, photos: {}, declined: [],
    negotiation: { ui: 'finding_driver' }, updated_at: nowIso(),  // V27
  }).select().single();
  if (error) throw error;
  return data;
}
export const rideArrived = (o, me) => guarded(o.id, ['accepted'], { status: 'ready_pickup' }, { driver_phone: me });
export const rideStart = (o, me) => guarded(o.id, ['ready_pickup'], { status: 'picked_up' }, { driver_phone: me });
export const rideEnd = (o, me) => guarded(o.id, ['picked_up'], { status: 'delivered' }, { driver_phone: me });

// ---------------------------------------------------------------- courier negotiation (orders AND rides)
async function claimForAction(o, me, feeAmount, prevNeg) {
  // V36 RACE-PROOF CLAIM (the real cause of "Someone just updated this order"):
  // the dispatch cycle withdraws and re-offers expired offers every few seconds,
  // so the offer card on screen is often STALE by the time the driver presses a
  // button — the old strict offer_to match then hit NOTHING and errored. The
  // claim re-asserts the offer atomically from the FRESH state: it works for an
  // intact offer AND one the cycle just withdrew (ui finding_driver), and
  // `driver_phone IS NULL` keeps two drivers from ever holding one order.
  const neg = { ui: 'driver_offer', phase: 'driver', amount: feeAmount, by: 'customer', awaiting: 'driver',
    history: [...((prevNeg && prevNeg.history) || []), { by: 'customer', amount: feeAmount, ts: Date.now(), note: 'Offer (re)claimed' }] };
  const q = await supabase.from('orders').update({
    status: 'finding_driver', awaiting: 'driver', offer_to: me, offer_deadline: plusSecs(60),
    negotiation: neg, updated_at: nowIso(),
  }).eq('id', o.id).eq('status', 'finding_driver').is('driver_phone', null).select();
  if (q.error) throw q.error;
  if (!q.data || !q.data.length) throw new Error('This order was just assigned to another driver or closed. Refreshed — please check.');
  return q.data[0];
}
export async function driverRespond(o, me, who, action, amount, settings) {
  // V36: every action reads the FRESH row first, then (re-)claims the offer
  // before acting — the claim is allowed by the server-side stage machine from
  // both 'driver_offer' and a withdrawn 'finding_driver' state, so a stale
  // card SUCCEEDS instead of erroring. Only a genuinely taken order says so.
  const g = await supabase.from('orders').select('*').eq('id', o.id).maybeSingle();
  const r = g && g.data;
  if (!r) throw new Error('This order no longer exists.');
  const rui = (r.negotiation && r.negotiation.ui) || r.status;
  if (r.driver_phone || ['cancelled', 'completed', 'disputed'].includes(rui)) {
    throw new Error('This order was just assigned to another driver or closed. Refreshed — please check.');
  }
  if (!['finding_driver', 'driver_offer', 'driver_talk'].includes(rui)) {
    throw new Error('The store is still finalizing this order. Refreshed — please check.');
  }
  const feeAmount = (o.neg && o.neg.amount != null) ? o.neg.amount : (Number(r.fee) || 0);
  const taken = 'This order was just cancelled or reassigned. Refreshed — please check.';
  if (action === 'accept') {
    await claimForAction(o, me, feeAmount, r.negotiation);
    const { data, error } = await supabase.from('orders').update({
      status: 'finding_driver', driver_phone: me, driver_name: who.name, driver_vehicle: who.vehicle, fee: feeAmount,
      negotiation: { ui: 'accepted' }, awaiting: null, offer_to: null, offer_deadline: null, updated_at: nowIso(),
    }).eq('id', o.id).eq('status', 'finding_driver').eq('offer_to', me).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error(taken);
    return data[0];
  }
  if (action === 'counter') {
    const c = clampNeg(feeAmount, amount); // V31: ±10% rule
    await claimForAction(o, me, feeAmount, r.negotiation);
    const { data, error } = await supabase.from('orders').update({
      status: 'finding_driver', awaiting: 'customer', offer_deadline: plusSecs(settings.customerSecs || 60),
      negotiation: mkNeg('driver', 'customer', c.value, 'driver', 'Courier counter (±10% rule)', r.negotiation), updated_at: nowIso(),
    }).eq('id', o.id).eq('status', 'finding_driver').eq('offer_to', me).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error(taken);
    return data[0];
  }
  const { data, error } = await supabase.from('orders').update({
    status: 'finding_driver', offer_to: null, offer_deadline: null, awaiting: null,
    declined: [...(r.declined || o.declined || []), me], negotiation: { ui: 'finding_driver' }, updated_at: nowIso(),
  }).eq('id', o.id).eq('status', 'finding_driver').is('driver_phone', null).select();
  if (error) throw error;
  if (!data || !data.length) throw new Error(taken);
  return data[0];
}
export async function customerDriverAnswer(o, action, amount, settings) {
  if (action === 'accept') {
    // V31 ORDER SPEC: the customer's answer window is a hard deadline too.
    if (o.offerDeadline && Date.now() > o.offerDeadline + 2000) throw new Error('This negotiation window has expired. The order was refreshed — please check its status.');
    const { data: p } = await supabase.from('profiles').select('name,vehicle,plate').eq('phone', o.offerTo).maybeSingle();
    return guarded(o.id, ['driver_talk'], { status: 'accepted', driver_phone: o.offerTo, driver_name: p && p.name,
      driver_vehicle: vehicleLabel(p), fee: o.neg.amount, negotiation: null, awaiting: null, offer_to: null, offer_deadline: null });
  }
  if (action === 'counter') {
    const c = clampNeg(o.neg.amount, amount); // V31: ±10% rule
    return guarded(o.id, ['driver_talk'], { status: 'driver_offer', awaiting: 'driver', fee: c.value,
      negotiation: mkNeg('driver', 'driver', c.value, 'customer', 'Customer counter (±10% rule)', o.neg), offer_deadline: plusSecs(settings.offerSecs || 30) });
  }
  return guarded(o.id, ['driver_talk'], { status: 'finding_driver', offer_to: null, offer_deadline: null,
    declined: [...o.declined, o.offerTo], negotiation: null, awaiting: null });
}
export const driverCancel = (o, me) => guarded(o.id, o.kind === 'ride' ? ['accepted', 'ready_pickup'] : o.kind === 'errand' ? ['accepted', 'quote_review', 'vendor_talk'] : ['accepted'], {
  ...(o.kind === 'errand' ? { price: 0 } : {}),
  status: 'finding_driver', driver_phone: null, driver_name: null, driver_vehicle: null, offer_to: null, offer_deadline: null,
  declined: [...o.declined, me], negotiation: null, awaiting: null }, { driver_phone: me });
export const cancelOrderCloud = (o) => guarded(o.id, o.kind === 'ride' ? [...OPEN_FOR_CANCEL, 'accepted', 'ready_pickup'] : o.kind === 'errand' ? [...OPEN_FOR_CANCEL, 'accepted'] : OPEN_FOR_CANCEL, { status: 'cancelled', negotiation: null, awaiting: null, offer_to: null, offer_deadline: null });
export const disputeOrder = (o) => guarded(o.id, ['picked_up', 'delivered'], { status: 'disputed' });
export async function confirmOrder(o) {
  // V21: settle_order may not exist on the live DB — fall back to a direct
  // completion so the customer is never stuck after delivery.
  try {
    const { data, error } = await supabase.rpc('settle_order', { p_order: o.id });
    if (!error && data && data.ok) return data;
    if (error) console.warn('settle_order rpc unavailable:', error.message);
  } catch (e) { console.warn('settle_order rpc unavailable:', e.message); }
  const r = await guarded(o.id, ['picked_up', 'delivered'], { status: 'completed', settled: true, negotiation: { ui: 'completed' } });
  return { ok: true, fallback: true, order: r };
}
export const vehicleLabel = (p) => (p ? [p.vehicle, p.plate].filter(Boolean).join(' · ') : '');

// ---------------------------------------------------------------- dispatch: offer open orders to the nearest courier, one at a time
// Any logged-in phone may run this tick; the optimistic lock (updated_at) makes concurrent runs safe.
async function onlineDrivers() {
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const { data: locs } = await supabase.from('driver_locations').select('driver_phone,lat,lng').eq('online', true).gte('updated_at', since);
  if (!locs || !locs.length) return [];
  const { data: profs } = await supabase.from('profiles').select('phone,is_frozen').in('phone', locs.map((l) => l.driver_phone)).eq('driver_status', 'approved');
  const ok = new Set((profs || []).filter((p) => !p.is_frozen).map((p) => p.phone));
  return locs.filter((l) => ok.has(l.driver_phone)).map((l) => ({ phone: l.driver_phone, lat: Number(l.lat), lng: Number(l.lng) }));
}
async function busyDrivers() {
  // V21: accepted/ready_pickup live as finding_driver(+driver_phone) or
  // picked_up in the DB, and offers ride in negotiation.ui — collect in JS.
  const busy = new Set();
  const { data: a } = await supabase.from('orders').select('driver_phone,offer_to,offer_deadline,negotiation')
    .in('status', ['finding_driver', 'picked_up']);
  (a || []).forEach((r) => {
    if (r.driver_phone) busy.add(r.driver_phone);
    const ui = r.negotiation && r.negotiation.ui;
    if ((ui === 'driver_offer' || ui === 'driver_talk') && r.offer_to
        && (!r.offer_deadline || ms(r.offer_deadline) > Date.now())) busy.add(r.offer_to);
  });
  return busy;
}
// V26: the DB online flag is driven by the APP's toggle (the old path left it
// stale-false while the driver was online — the live row for +639812345678
// sat at online:false, so dispatch's online=true filter found an empty pool
// and no offer was ever sent).
export async function setDriverOnlineFlag(me, v) {
  if (!SUPABASE_ENABLED || !supabase || !me) return;
  try {
    const { error } = await supabase.from('driver_locations')
      .update({ online: v, updated_at: new Date().toISOString() }).eq('driver_phone', me);
    if (error) {
      // first-ever session: no row yet — create it; real GPS overwrites coords in seconds
      const i = await supabase.from('driver_locations').upsert(
        { driver_phone: me, lat: 0, lng: 0, accuracy: null, source: 'fg', online: v, updated_at: new Date().toISOString() },
        { onConflict: 'driver_phone' });
      if (i.error) console.warn('online flag:', i.error.message);
    }
  } catch (e) { /* offline — next publish/heartbeat fixes it */ }
}

export async function dispatchTick(settings) {
  // V34 LEGACY-DB FIX (the real reason drivers never saw offers): the beta DB's
  // orders_status_check allowed ONLY finding_driver/picked_up/delivered/cancelled/
  // completed, so writing status='driver_offer' violated the check and EVERY
  // dispatch write failed silently. All pre-pickup stages now ride in
  // status='finding_driver' + negotiation.ui; migration 8 drops the stale check.
  const { data: rows } = await supabase.from('orders').select('*')
    .eq('status', 'finding_driver').limit(12);
  if (!rows || !rows.length) return 0;
  const cands = await onlineDrivers();
  const busy = await busyDrivers();
  let changed = 0;
  for (const r of rows) {
    // V21: only orders whose UI state is truly finding_driver are dispatched
    // (vendor-quote/negotiation/accepted orders are stored as finding_driver).
    const rui = (r.negotiation && r.negotiation.ui) || 'finding_driver';
    if (r.driver_phone) continue; // accepted/ready_pickup ride as finding_driver + driver_phone
      // V31 ORDER SPEC — hard negotiation windows, enforced by dispatch:
      // 1) the store never answered the quote in time → the order cancels itself.
      // 2) the store never answered the customer's counter in time → the store's
      //    last price stands (final) and the customer decides again.
      if (rui === 'vendor_quote') {
        const dl = ms(r.offer_deadline);
        if (dl && Date.now() > dl + 2000) {
          const { data } = await supabase.from('orders').update({ status: 'cancelled', awaiting: null, negotiation: { ui: 'cancelled' }, updated_at: nowIso() })
            .eq('id', r.id).eq('status', 'finding_driver').select();
          if (data && data.length) changed += 1;
        }
        continue;
      }
      if (rui === 'vendor_talk') {
        const dl = ms(r.offer_deadline);
        if (dl && Date.now() > dl + 2000) {
          const hist = (r.negotiation && r.negotiation.history) || [];
          const lastV = [...hist].reverse().find((h) => h.by === 'vendor' || h.by === 'driver' || h.by === 'shopper');
          const keep = lastV ? lastV.amount : Number(r.price) || 0;
          const neg = { ...mkNeg('vendor', 'customer', keep, 'vendor', 'Time is up — the store price stands (final)', r.negotiation), ui: 'quote_review', final: true };
          // status stays finding_driver (legacy-safe) — quote_review rides in negotiation.ui
          const { data } = await supabase.from('orders').update({ status: 'finding_driver', awaiting: 'customer', price: keep, offer_deadline: null, negotiation: neg, updated_at: nowIso() })
            .eq('id', r.id).eq('status', 'finding_driver').select();
          if (data && data.length) changed += 1;
        }
        continue;
      }
    // stage 2 settled: the customer is reviewing the final price — dispatch waits
    if (rui === 'quote_review') continue;
    // a LIVE (unexpired) driver offer keeps waiting until its deadline passes
    if ((rui === 'driver_offer' || rui === 'driver_talk') && r.offer_to && ms(r.offer_deadline) > Date.now()) continue;
    const declined = new Set(r.declined || []);
    const wasOffered = (rui === 'driver_offer' || rui === 'driver_talk') && r.offer_to;
    if (wasOffered) declined.add(r.offer_to); // an unanswered offer counts as a pass
    // V27 SELF-TEST DISPATCH: the old `c.phone !== r.customer_phone` excluded
    // the only online driver whenever the order came from the same phone
    // (the live proof: order 87750e1a, customer +639812345678 = the driver's
    // own number — pool was always empty). A courier may now serve their own
    // errand — exactly what a one-device beta needs.
    const pool = cands.filter((c) => !declined.has(c.phone) && !busy.has(c.phone));
    pool.sort((a, b) => {
      const da = distanceKm({ lat: num(r.pickup_lat), lng: num(r.pickup_lng) }, a), db = distanceKm({ lat: num(r.pickup_lat), lng: num(r.pickup_lng) }, b);
      return (da == null ? 1e9 : da) - (db == null ? 1e9 : db);
    });
    let patch = null;
    if (pool.length) {
      const pick = pool[0];
      busy.add(pick.phone);
      patch = { status: 'finding_driver', awaiting: 'driver', offer_to: pick.phone, offer_deadline: plusSecs(settings.offerSecs || 30),
        declined: [...declined], negotiation: { ...mkNeg('driver', 'driver', Number(r.fee), 'customer', 'Fee offer', null), ui: 'driver_offer' } };
    } else if (wasOffered) {
      patch = { status: 'finding_driver', offer_to: null, offer_deadline: null, awaiting: null, negotiation: { ui: 'finding_driver' }, declined: [...declined] };
    } else if (declined.size && cands.length) {
      patch = { declined: [], negotiation: { ui: 'finding_driver' } }; // everyone online passed once — start another round
    }
    if (!patch) continue;
    // V27: the legacy orders table has updated_at = NULL (no default on old
    // rows), so the old `.eq('updated_at', r.updated_at)` optimistic lock
    // matched NOTHING and dispatch silently never assigned. Match on id —
    // beta-safe; the status/offer flow keeps its own guards.
    const { data } = await supabase.from('orders').update({ ...patch, updated_at: nowIso() }).eq('id', r.id).select();
    if (data && data.length) changed += 1;
  }
  return changed;
}

// ---------------------------------------------------------------- intercity travel (V28)
// A passenger posts a from-city → to-city trip; registered drivers see it in a
// dedicated Driver-board tab and send their own offers (price + message). The
// customer picks one offer → contact opens (phone/WhatsApp) → other offers are
// declined automatically.
export function mapIntercity(r, me) {
  return {
    id: r.id, mine: r.customer_phone === me,
    fromCity: r.from_city, toCity: r.to_city, date: r.travel_date,
    passengers: Number(r.passengers || 1), note: r.note || '',
    customerName: r.customer_name || r.customer_phone,
    status: r.status || 'open', bookedOfferId: r.booked_offer_id,
    created: ms(r.created_at),
  };
}
const tableHint = (e, sqlFile) => {
  // V31: PGRST205 = the feature's tables were never created on this project —
  // say exactly which SQL file to run instead of a raw PostgREST code.
  const m = String((e && e.message) || e || '');
  return /PGRST205|Could not find the table/i.test(m)
    ? 'This feature is not set up on the server yet — run galabili-sql/migration-8-order-system.sql in the Supabase SQL editor first, then retry.'
    : m;
};
export async function fetchIntercityAll(me) {
  try {
    const { data: reqs, error } = await supabase.from('intercity_requests')
      .select('*').order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    const ids = (reqs || []).map((r) => r.id);
    let offers = [];
    if (ids.length) {
      const { data: ofs } = await supabase.from('intercity_offers').select('*').in('request_id', ids).order('price', { ascending: true });
      offers = ofs || [];
    }
    return (reqs || []).map((r) => {
      const t = mapIntercity(r, me);
      t.offers = offers.filter((o) => o.request_id === r.id).map((o) => ({
        id: o.id, driverPhone: o.driver_phone, driverName: o.driver_name, price: Number(o.price),
        message: o.message || '', status: o.status || 'sent', ts: ms(o.created_at),
      }));
      t.bookedOffer = (t.offers.find((o) => o.id === t.bookedOfferId)) || null;
      return t;
    });
  } catch (e) {
    if (/PGRST205|Could not find the table/i.test(String((e && e.message) || e))) return []; // tab shows empty; placing surfaces the setup hint
    throw e;
  }
}
export async function placeIntercityCloud({ me, myName, fromCity, toCity, date, passengers, note }) {
  try {
    const uid = await ensureUid(me, myName);
    const { data, error } = await supabase.from('intercity_requests').insert({
      customer_id: uid, customer_phone: me, customer_name: myName,
      from_city: fromCity, to_city: toCity, travel_date: date,
      passengers: passengers || 1, note: note || null, status: 'open',
    }).select().single();
    if (error) throw error;
    return data;
  } catch (e) { throw new Error(tableHint(e, 'migration-8-order-system.sql')); }
}
export async function cancelIntercityCloud(t) {
  // Conditional update: only an OPEN request can be cancelled.
  const { data, error } = await supabase.from('intercity_requests')
    .update({ status: 'cancelled', updated_at: nowIso() }).eq('id', t.id).eq('status', 'open').select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('This trip was just updated by someone else. Refreshed — please check.');
  return data[0];
}
export async function sendIntercityOfferCloud(t, me, driverName, price, message) {
  // One driver, one open offer per request: an earlier sent offer is replaced.
  const prev = await supabase.from('intercity_offers').select('id')
    .eq('request_id', t.id).eq('driver_phone', me).eq('status', 'sent').maybeSingle();
  if (prev && prev.data && prev.data.id) {
    const { error } = await supabase.from('intercity_offers')
      .update({ price, message: message || null, created_at: nowIso() }).eq('id', prev.data.id);
    if (error) throw error;
    return { replaced: true };
  }
  const { error } = await supabase.from('intercity_offers').insert({
    request_id: t.id, driver_phone: me, driver_name: driverName, price, message: message || null, status: 'sent',
  });
  if (error) throw error;
  return { replaced: false };
}
export async function acceptIntercityOfferCloud(t, of) {
  // Accept ONE offer: mark it accepted, decline all the others, book the trip.
  const { data, error } = await supabase.from('intercity_offers')
    .update({ status: 'accepted' }).eq('id', of.id).eq('status', 'sent').select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('This offer was just taken or cancelled. Refreshed — please check.');
  await supabase.from('intercity_offers').update({ status: 'declined' })
    .eq('request_id', t.id).neq('id', of.id).eq('status', 'sent');
  const r = await supabase.from('intercity_requests')
    .update({ status: 'booked', booked_offer_id: of.id, updated_at: nowIso() })
    .eq('id', t.id).eq('status', 'open').select();
  if (r.error) throw r.error;
  if (!r.data || !r.data.length) throw new Error('This trip is no longer open. Refreshed — please check.');
  return r.data[0];
}

// ---------------------------------------------------------------- stores, roles, KYC
export async function setStoreOpen(me, open) {
  const { error } = await supabase.from('stores').update({ open }).eq('owner_phone', me);
  if (error) throw error;
}
export async function submitKycCloud(me, name, role, data) {
  // V21: shared ensureUid (anonymous auth + profiles upsert, proven chain).
  const uid = await ensureUid(me, name);
  const { error } = await supabase.from('kyc_requests').insert({ user_id: uid, user_phone: me, user_name: name, role, status: 'pending', data });
  if (error) throw error;
  const patch = { id: uid, phone: me, [role + '_status']: 'pending' };
  if (role === 'driver') { patch.vehicle = [data.vehicle, data.model].filter(Boolean).join(' '); patch.plate = data.plate; }
  const r1 = await supabase.from('profiles').upsert(patch, { onConflict: 'id' });
  if (r1.error) throw r1.error;
  if (role === 'vendor') {
    const payload = { owner_phone: me, name: data.store, category: data.type, area: data.area || '',
      address: data.address || '', active: false, open: false };
    const r2 = await supabase.from('stores').upsert(payload, { onConflict: 'owner_phone' });
    if (r2.error) {
      const r3 = await supabase.from('stores').insert(payload);
      if (r3.error) console.warn('stores mirror skipped:', r3.error.message); // KYC row already landed
    }
  }
}
export async function fetchKycAll() {
  const { data } = await supabase.from('kyc_requests').select('*').order('ts', { ascending: false }).limit(100);
  return (data || []).map((k) => ({ id: k.id, userId: k.user_phone, name: k.user_name || k.user_phone, role: k.role, status: k.status, ts: ms(k.ts), data: k.data || {} }));
}
export async function adminDecideKycCloud(k, ok, admin) {
  const status = ok ? 'approved' : 'rejected';
  let r = await supabase.from('kyc_requests').update({ status, reviewer: admin }).eq('id', k.id);
  if (r.error) throw r.error;
  r = await supabase.from('profiles').update({ [k.role + '_status']: status }).eq('phone', k.userId);
  if (r.error) throw r.error;
  if (k.role === 'vendor') { r = await supabase.from('stores').update({ active: ok, open: ok }).eq('owner_phone', k.userId); if (r.error) throw r.error; }
  await auditCloud(ok ? 'KYC approved' : 'KYC rejected', `${k.name} (${k.role})`, k.userId, admin);
}
export async function fetchUsers() {
  const { data } = await supabase.from('profiles').select('phone,name,wallet_balance,is_frozen,driver_status,vendor_status,created_at').order('created_at', { ascending: false }).limit(100);
  return (data || []).map((u) => ({ id: u.phone, phone: u.phone, name: u.name || u.phone, wallet: Number(u.wallet_balance || 0), frozen: !!u.is_frozen,
    role: u.driver_status === 'approved' ? 'driver' : u.vendor_status === 'approved' ? 'vendor' : 'customer', credit: 0,
    driverStatus: u.driver_status, vendorStatus: u.vendor_status })); // V25: raw statuses for the admin Drivers tab
}
export async function adminFreezeCloud(phone, v, admin) {
  const { error } = await supabase.from('profiles').update({ is_frozen: v }).eq('phone', phone);
  if (error) throw error;
  await auditCloud(v ? 'User frozen' : 'User unfrozen', phone, phone, admin);
}
export async function adjustWalletCloud(phone, delta, reason, admin) {
  const { data, error } = await supabase.rpc('adjust_wallet', { p_phone: phone, p_delta: delta, p_reason: reason, p_by: admin });
  if (error) throw error;
  return data;
}
export async function adminStoreUpdate(id, patch, admin, label) {
  const { error } = await supabase.from('stores').update(patch).eq('id', id);
  if (error) throw error;
  await auditCloud(label, id, id, admin);
}
export async function adminOrderUpdate(o, status, admin, label) {
  const patch = { status, updated_at: nowIso() };
  if (status === 'finding_driver') Object.assign(patch, { driver_phone: null, driver_name: null, driver_vehicle: null, offer_to: null, offer_deadline: null, declined: [], negotiation: null, awaiting: null });
  const { error } = await supabase.from('orders').update(patch).eq('id', o.id);
  if (error) throw error;
  await auditCloud(label, o.id, o.id, admin);
}
export async function auditCloud(action, detail, target, by) {
  try { await supabase.from('audit_log').insert({ action, detail, target, by_phone: by }); } catch (e) { /* ignore */ }
}
export async function fetchAudit() {
  const { data } = await supabase.from('audit_log').select('*').order('ts', { ascending: false }).limit(60);
  return (data || []).map((a) => ({ id: a.id, action: a.action, detail: a.detail, by: a.by_phone, ts: ms(a.ts) }));
}
export async function broadcastCloud(text, target, by) {
  const { error } = await supabase.from('broadcast_alerts').insert({ text, target: target || 'all', sent_by: by });
  if (error) throw error;
}

// ---------------------------------------------------------------- hotel rooms (V29)
// A tourist or visitor picks an ACTIVE hotel listing and sends a booking request
// (check-in/out, guests, rooms, nationality, contact). The ADMIN confirms or
// rejects it from the Admin → Hotels tab; the guest tracks the status and can
// cancel while pending. A confirmed booking reveals the contact for call/WhatsApp.
export function mapHotel(h) {
  return {
    id: h.id, name: h.name, city: h.city, address: h.address || '',
    roomType: h.room_type || 'Standard', price: Number(h.price_per_night || 0),
    roomsAvailable: Number(h.rooms_available || 1), photo: h.photo_url || null,
    amenities: h.amenities || '', active: h.active !== false,
  };
}
export async function fetchHotels() {
  const { data, error } = await supabase.from('hotels').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return (data || []).map(mapHotel);
}
export function mapHotelBooking(b) {
  return {
    id: b.id, hotelId: b.hotel_id,
    guestPhone: b.guest_phone, guestName: b.guest_name || b.guest_phone,
    guestType: b.guest_type || 'tourist', nationality: b.nationality || '',
    checkIn: b.check_in, checkOut: b.check_out,
    guests: Number(b.guests || 1), rooms: Number(b.rooms || 1), nights: Number(b.nights || 1),
    roomType: b.room_type || 'Standard', total: Number(b.total_price || 0),
    contact: b.contact || '', note: b.note || '',
    status: b.status || 'pending', decidedBy: b.decided_by || null,
  };
}
export async function fetchHotelBookingsAll(me) {
  const { data: books, error } = await supabase.from('hotel_bookings')
    .select('*').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  const { data: hs } = await supabase.from('hotels').select('id,name');
  const nameOf = {};
  (hs || []).forEach((h) => { nameOf[h.id] = h.name; });
  return (books || []).map((b) => ({ ...mapHotelBooking(b), hotelName: nameOf[b.hotel_id] || 'Hotel', mine: b.guest_phone === me }));
}
export async function placeHotelBookingCloud({ me, myName, hotel, guestType, nationality, checkIn, checkOut, guests, rooms, contact, note }) {
  if (!hotel || !hotel.id) throw new Error('Choose a hotel first.');
  if (!contact || !String(contact).trim()) throw new Error('Add a contact number so the hotel can reach you.');
  const today = new Date().toISOString().slice(0, 10);
  if (String(checkIn) < today) throw new Error('Check-in cannot be in the past.');
  const nights = Math.round((new Date(checkOut + 'T00:00:00Z') - new Date(checkIn + 'T00:00:00Z')) / 86400000);
  if (!Number.isFinite(nights) || nights < 1) throw new Error('Check-out must be after check-in.');
  try {
    const uid = await ensureUid(me, myName);
    const total = Number(hotel.price || 0) * nights * Math.max(1, rooms || 1);
    const { data, error } = await supabase.from('hotel_bookings').insert({
      hotel_id: hotel.id, guest_id: uid, guest_phone: me, guest_name: myName,
      guest_type: guestType || 'tourist', nationality: nationality || null,
      check_in: checkIn, check_out: checkOut, guests: guests || 1, rooms: rooms || 1,
      nights, total_price: total, contact: contact || null, note: note || null, status: 'pending',
    }).select().single();
    if (error) throw error;
    return data;
  } catch (e) { throw new Error(tableHint(e, 'migration-8-order-system.sql')); }
}
export async function cancelHotelBookingCloud(b) {
  // Conditional update: only a PENDING booking can be cancelled by the guest.
  const { data, error } = await supabase.from('hotel_bookings')
    .update({ status: 'cancelled', updated_at: nowIso() }).eq('id', b.id).eq('status', 'pending').select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('This booking was just updated by the hotel. Refreshed — please check.');
  return data[0];
}
export async function decideHotelBookingCloud(b, ok, by) {
  // Admin decision: only a PENDING booking can be confirmed or rejected.
  const { data, error } = await supabase.from('hotel_bookings')
    .update({ status: ok ? 'confirmed' : 'rejected', decided_by: by || 'admin', decided_at: nowIso(), updated_at: nowIso() })
    .eq('id', b.id).eq('status', 'pending').select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('This booking was just decided. Refreshed — please check.');
  return data[0];
}
export async function addHotelCloud(h) {
  const { data, error } = await supabase.from('hotels').insert({
    name: h.name, city: h.city, address: h.address || null, room_type: h.roomType || 'Standard',
    price_per_night: Number(h.price) || 0, rooms_available: Number(h.roomsAvailable) || 1,
    photo_url: h.photo || null, amenities: h.amenities || null, active: true,
  }).select().single();
  if (error) throw error;
  return data;
}
export async function toggleHotelActiveCloud(h) {
  const { data, error } = await supabase.from('hotels').update({ active: !h.active, updated_at: nowIso() }).eq('id', h.id).select();
  if (error) throw error;
  if (!data || !data.length) throw new Error('Hotel not found.');
  return data[0];
}
