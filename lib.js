// Pabili PH — theme, i18n, constants, shared rules + V9 payout providers
//
// V9 — Withdrawal rules (PH market): the minimum payout amount, the
// flat fee per channel, the daily cap per user, and the saga
// (pending → approved/rejected → paid-stub). Real disbursement requires
// the provider's API; the UI marks every live call as a stub that
// refuses to pretend the money moved.
import { createContext, useContext } from 'react';

export const C = {
  green: '#0E7C5B', greenDk: '#0A5C44', gold: '#F2A900', ink: '#17231E',
  mute: '#6B7A72', line: '#DCE5DF', paper: '#F6F8F5', card: '#FFFFFF',
  bad: '#C0392B', pinkBg: '#FDECEC', amber: '#B7791F',
};
export const peso = (n) => '₱' + Number(n || 0).toFixed(2).replace(/\.00$/, '');
export const now = () => Date.now();
export const OFFER_SECS_DEFAULT = 30;
export const VENDOR_SECS_DEFAULT = 60;
export const MAX_DRIVERS_DEFAULT = 3;

// ---------- i18n ----------
const STR = {
  en: {
    login: 'Log in', phonePh: '0XXX XXX XXXX', sendCode: 'Send code',
    social: 'Or log in with social media', termsNote: 'Using this app means you agree to the Terms of Use.',
    otpTitle: 'Verification code', otpSub: 'Enter the code sent to', resendIn: 'Resend in',
    resend: 'Resend code', safeNote: 'Your data is safe! We never share it with anyone.',
    verify: 'Verify', testHint: 'Testing codes: users 2067 — admin 1785',
    tTitle: 'Accept Privacy Policy and Terms',
    tBody: 'By tapping "I agree", I confirm that I have read and accept the Privacy Policy and Terms, and I agree to enable personalized marketing content and ads.',
    tC1: 'I agree to the Privacy Policy and Terms', tC2: 'Enable personalized marketing content and ads', agree: 'I agree',
    home: 'Home', orders: 'Orders', alerts: 'Alerts', myPage: 'My Page',
    howHelp: 'How can we help you today?', orderAny: 'Order anything', sendAny: 'Send anything',
    orderAnySub: 'Order anything you can think of', sendAnySub: 'Have something to deliver? We pick it up and drop it off',
    mostReq: 'Most requested', nearYou: 'We are with you, near you', needHelp: 'Need help?',
    helpSub: 'From LPG tanks to furniture moving — leave the heavy lifting to us',
    orderDetails: 'Order details', pickCat: 'Pick a category and describe your order in detail.',
    describe: 'Describe what you need...', deliveryDetails: 'Add delivery details',
    pickupFrom: 'Pickup from', chooseStore: 'Choose the store or pin the location',
    deliverTo: 'Deliver to', home2: 'Home', payMethod: 'Payment method', change: 'Change',
    wallet: 'Wallet', deliveryCredit: 'Delivery credit', ordersCount: 'Orders', savedAddr: 'Saved addresses',
    userMode: 'User mode', ratings: 'Service ratings', notes: 'User notes', coupons: 'Coupons',
    addCoupon: 'Add coupon', support: 'Customer support', offers: 'Partner offers', settings: 'Settings',
    payMethods: 'Payment methods', unverified: 'Unverified', verified: 'Verified',
    switchTitle: 'Switch to courier mode?', switchBody: 'Courier mode makes delivering orders easier. To enable it, complete verification and wait for admin approval.',
    switchDo: 'Switch', back: 'Back', placeOrder: 'Place order', feeOffer: 'Your delivery fee offer',
    cancel: 'Cancel order', reorder: 'Reorder', recentOrders: 'Your recent orders', cancelled: 'Cancelled',
    accept: 'Accept', counter: 'Counter', refuse: 'Refuse', send: 'Send', negotiating: 'Negotiating',
    confirm: 'Confirm', approve: 'Approve', reject: 'Reject', logout: 'Log out',
    kycDriver: 'Driver verification', kycVendor: 'Store verification', pending: 'Pending admin review',
    takePhoto: 'Take photo', photoRequired: 'Photo is required to continue',
    waitingStore: 'Waiting for the store to confirm stock and price', waitingDriver: 'Finding a courier',
    onTheWay: 'On the way', deliveredC: 'Delivered — please confirm', completed: 'Completed',
    lang: 'Language', newOrder: 'New order',
    // V9 strings
    withdraw: 'Withdraw', addToCart: 'Add to cart', cart: 'Cart', multiStore: 'Order from many stores',
    withdrawMin: 'Min ₱100 · fees apply', featured: 'Featured',
  },
  tl: {
    login: 'Mag-log in', sendCode: 'Ipadala ang code', verify: 'I-verify', agree: 'Sumang-ayon ako',
    home: 'Home', orders: 'Mga Order', alerts: 'Alerts', myPage: 'Akin', howHelp: 'Paano ka namin matutulungan?',
    orderAny: 'Umorder ng kahit ano', sendAny: 'Magpadala ng kahit ano', accept: 'Tanggapin',
    counter: 'Mag-counter', refuse: 'Tanggihan', cancel: 'Kanselahin', reorder: 'I-order ulit',
    confirm: 'Kumpirmahin', approve: 'Aprubahan', reject: 'Tanggihan', logout: 'Mag-log out',
    completed: 'Tapos na', back: 'Bumalik', lang: 'Wika', newOrder: 'Bagong order',
    withdraw: 'Mag-withdraw', addToCart: 'Idagdag', cart: 'Cart', multiStore: 'Order mula sa maraming store',
    withdrawMin: 'Min ₱100 · may bayad', featured: 'Itinampok',
  },
};
export const LangCtx = createContext({ lang: 'en', setLang: () => {} });
export const useT = () => { const { lang } = useContext(LangCtx); return (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k; };

// ---------- auth constants ----------
export const ADMIN_PHONE = '562989152';
export const ADMIN_CODE = '1785';
export const USER_TEST_CODE = '2067';
// V14 FIX: digits-only, PRESERVES zeros — typing '0' must never vanish.
// (the old version stripped leading zeros here, which wiped '0' in OTP boxes)
export const normalizePhone = (s) => String(s ?? '').replace(/\D/g, '');
// canonical PH digits for validation/storage: 0917… → 917…, 0562989152 → 562989152
export const toPHDigits = (s) => normalizePhone(s).replace(/^0+/, '');
export const isAdminPhone = (d) => d === ADMIN_PHONE;
export const validPhone = (d) => d === ADMIN_PHONE || d.length === 10;

// ---------- domain constants ----------
export const CATEGORIES = ['Food', 'Coffee', 'Supermarket', 'Pharmacy', 'Sari-sari', 'Gas / LPG', 'Flowers', 'Parcel'];
export const CATEGORY_ICONS = {
  'Food': '🍽️', 'Coffee': '☕', 'Supermarket': '🛒', 'Pharmacy': '💊',
  'Sari-sari': '🛖', 'Gas / LPG': '🔥', 'Flowers': '💐', 'Parcel': '📦',
};
export const ORDER_STATUS = {
  vendor_quote: 'Waiting for the store', quote_review: 'Review the store quote',
  finding_driver: 'Finding a courier', driver_talk: 'Negotiating with courier',
  accepted: 'Courier accepted — store is preparing', ready_pickup: 'Ready for pickup',
  picked_up: 'On the way', delivered: 'Delivered — please confirm',
  completed: 'Completed', cancelled: 'Cancelled', disputed: 'Under admin review',
  driver_offer: 'Courier offer', vendor_talk: 'Negotiating price', quote_sent: 'Quote sent — waiting for customer',
  awaiting_pack: 'Quote agreed — pack the order', handover_done: 'Handed to courier',
};
export const PHOTO_STEPS = [
  { key: 'product', by: 'vendor', label: 'Actual product photo' },
  { key: 'packed', by: 'vendor', label: 'Packed order photo' },
  { key: 'pickup', by: 'driver', label: 'Pickup proof photo' },
  { key: 'delivery', by: 'driver', label: 'Delivery proof photo' },
];
export const uid = () => 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const fmtTime = (ts) => new Date(ts).toLocaleString();

// ---------- V9 payout (PH) ----------
// Each provider config carries: minimum payout, flat fee in PHP, daily cap, kind.
// `kind` is the rails we route on: GCash e-wallet, Maya e-wallet, InstaPay (real-time)
// or PESONet (next-day batch). The UI surfaces these honestly — no fake "Sent!" prompts.
export const WITHDRAWAL_PROVIDERS = {
  GCash:    { kind: 'ewallet',    label: 'GCash (wallet)',    icon: '💚', min: 100, fee: 15, daily_cap: 50000 },
  Maya:     { kind: 'ewallet',    label: 'Maya (wallet)',     icon: '🟢', min: 100, fee: 15, daily_cap: 50000 },
  InstaPay: { kind: 'instapay',   label: 'InstaPay (bank)',   icon: '🏦', min: 500, fee: 25, daily_cap: 200000 },
  PESONet:  { kind: 'pesonet',    label: 'PESONet (bank)',    icon: '🛡️', min: 200, fee: 50, daily_cap: 500000 },
};
export const MIN_WITHDRAWAL = Math.min(...Object.values(WITHDRAWAL_PROVIDERS).map((p) => p.min));
export const WITHDRAWAL_STATUS = {
  pending:  'pending request — admin review',
  approved: 'approved by admin — waiting for rails',
  paid:     'paid (stub — provider keys not yet configured)',
  paid_stub:'paid (stub — provider keys not yet configured)',
  rejected: 'rejected — funds returned',
};
// Limits enforced in V9 (safe defaults inside the JS store):
export const WITHDRAWAL_DAILY_CAP_GLOBAL = 1000000;
export const WITHDRAWAL_LIMITS = { max_per_request: 50000, max_concurrent_pending: 3 };

export const RIDE_STATUS = {
  finding_driver: 'Finding a driver near you', driver_offer: 'Offer sent to a driver', driver_talk: 'Driver suggested another fare',
  accepted: 'Driver is on the way to you', ready_pickup: 'Your driver has arrived', picked_up: 'Trip in progress',
  delivered: 'Arrived — please confirm', completed: 'Trip completed', cancelled: 'Cancelled', disputed: 'Under admin review',
};
export const ERRAND_STATUS = {
  finding_driver: 'Finding a courier', driver_offer: 'Offer sent to a courier', driver_talk: 'Courier suggested another fee',
  accepted: 'Courier is going to the shop', quote_review: 'Review the price & photo', vendor_talk: 'Negotiating the item price',
  ready_pickup: 'Approved — courier is buying it', picked_up: 'On the way to you', delivered: 'Delivered — please confirm',
  completed: 'Completed', cancelled: 'Cancelled', disputed: 'Under admin review',
};
export const statusText = (o) => ((o.kind === 'ride' ? RIDE_STATUS : o.kind === 'errand' ? ERRAND_STATUS : ORDER_STATUS)[o.status] || o.status);
// Google Maps link: exact point when we have coordinates, otherwise a text search of the address.
export const mapsUrl = (lat, lng, text) => (lat != null && lng != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text || '')}`);

// Background tracking (V16): real on the Android APK via a foreground service (expo-task-manager).
export const BG_GEO = {
  info: 'While you are online, a notification keeps location sharing alive even with the screen locked.',
  needAlways: 'Location must be set to "Allow all the time" (Android) or "Always" (iPhone) for tracking with the screen locked.',
};

// Straight-line distance in km (haversine). Returns null if any coordinate is missing.
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (k) => (k == null ? '—' : k < 1 ? Math.round(k * 1000) + ' m' : k.toFixed(1) + ' km');
// Opens Google Maps turn-by-turn (no API key / native map module needed).
export const navUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
