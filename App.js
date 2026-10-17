// Pabili v5 — Mrsool-style redesign.
// Single-file Expo Snack build. English + Tagalog only.
// Logic preserved: Supabase auth, KYC upload, live admin queue, gated roles.
import React, { useState, useEffect, useCallback, useRef,
  createContext, useContext } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, SafeAreaView,
  ScrollView, FlatList, Animated, Dimensions, Modal, StatusBar,
  Switch, ActivityIndicator, Platform, Alert, LogBox
} from 'react-native';
LogBox.ignoreLogs(['Warning: Failed prop type']); // suppress dev-only noise
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// SUPABASE CONFIG — GitHub Actions fills these two values
// automatically from repo Secrets (SUPABASE_URL, SUPABASE_ANON_KEY).
// Manual setup: paste your Project URL + anon public key ONLY.
// NEVER put the service_role key here — it bypasses all security.
// ============================================================
const SUPABASE_URL      = 'PASTE_YOUR_PROJECT_URL_HERE';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE';

const HAS_SB = !SUPABASE_URL.includes('PASTE') && SUPABASE_ANON_KEY.startsWith('eyJ');

// Safe client: in demo mode uses a harmless placeholder so
// createClient never crashes when keys are not configured yet.
const supabase = createClient(
  HAS_SB ? SUPABASE_URL : 'https://demo-not-configured.supabase.co',
  HAS_SB ? SUPABASE_ANON_KEY : 'demo-placeholder-not-a-real-jwt-token',
  {
    auth: { storage: AsyncStorage, autoRefreshToken: true,
            persistSession: true, detectSessionInUrl: false },
  }
);

const KYC_BUCKET = 'kyc-documents';

async function sbUserId() {
  if (!HAS_SB) return null;
  try { const { data } = await supabase.auth.getUser();
        return data && data.user ? data.user.id : null; } catch { return null; }
}
async function uploadDoc(uri, role, field, name) {
  if (!HAS_SB || !uri) return { demo: true, path: 'demo://'+role.toLowerCase()+'/'+field, url:'', name };
  const uid = await sbUserId();
  const path = (uid || 'anon') + '/' + role.toLowerCase() + '/' + field + '-' + Date.now();
  const blob = await (await fetch(uri)).blob();
  const { error } = await supabase.storage.from(KYC_BUCKET).upload(
    path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
  const { data } = supabase.storage.from(KYC_BUCKET).getPublicUrl(path);
  return { path, url:(data && data.publicUrl)||'', name };
}
async function pushKyc(role, status, data) {
  if (!HAS_SB) return { error: null };
  try {
    const uid = await sbUserId();
    const { error } = await supabase.from('kyc_requests').upsert(
      { user_id: uid, role: role.toLowerCase(), status, data },
      { onConflict: 'user_id,role' });
    return { error: error || null };
  } catch (e) { return { error: e }; }
}
async function fetchKycQueue() {
  if (!HAS_SB) return [];
  try { const { data, error } = await supabase.from('kyc_requests')
          .select('id, user_id, role, status, data, created_at')
          .eq('status', 'pending').order('created_at', { ascending: true });
        return error ? [] : (data || []); } catch { return []; }
}
async function syncKycFromDb(local) {
  if (!HAS_SB) return local || {};
  try { const uid = await sbUserId(); if (!uid) return local || {};
        const { data } = await supabase.from('kyc_requests')
                       .select('role, status').eq('user_id', uid);
        const merged = { ...(local || {}) };
        (data || []).forEach((row) => {
          const r = row.role === 'shopper' ? 'Shopper'
                  : row.role === 'vendor'  ? 'Vendor' : null;
          if (r && row.status === 'approved')
            merged[r] = { ...(merged[r] || { data: {} }), status: 'approved' };
        });
        return merged; } catch { return local || {}; }
}

// ============ i18n (en + tl only) ============
const LANGS = ['en', 'tl'];
const LANG_KEY = 'pabili.lang';
const STR = {
  brand:    { en: 'Any item, any store, any time.', tl: 'Kahit ano, saan man, anumang oras.' },
  login:    { en: 'Login', tl: 'Mag-login' },
  orSocial: { en: 'Or log in with social media', tl: 'O mag-login gamit ang social media' },
  termsOk:  { en: 'By using this app you agree to our Terms of Use.', tl: 'Sa paggamit ng app, sumasang-ayon ka sa Terms of Use.' },
  phonePh:  { en: 'Phone number', tl: 'Numero ng telepono' },
  sendOtp:  { en: 'Send code', tl: 'Ipadala ang code' },
  otpTitle: { en: 'Verification code', tl: 'Verification code' },
  otpSub:   { en: 'Enter the code sent to', tl: 'Ilagay ang code na ipinadala sa' },
  resendIn: { en: 'Resend in {t}', tl: 'Ipadala ulit sa {t}' },
  dataSafe: { en: 'Your data is safe. Never shared.', tl: 'Ligtas ang data mo. Hindi ibinabahagi.' },
  home:     { en: 'Home', tl: 'Tirahan' },
  work:     { en: 'Work', tl: 'Trabaho' },
  catPh:    { en: 'Pharmacy', tl: 'Botika' },
  catSup:   { en: 'Supermarket', tl: 'Supermarket' },
  catTax:   { en: 'Taxi', tl: 'Taxi' },
  catRes:   { en: 'Restaurants', tl: 'Restawran' },
  catCou:   { en: 'Your Courier', tl: 'Iyong Courier' },
  searchPh: { en: 'How can we help you today?', tl: 'Paano namin kayo matutulungan ngayon?' },
  closeTo:  { en: 'Close to you', tl: 'Malapit sa\'yo' },
  orderAny: { en: 'Order anything', tl: 'Mag-order ng kahit ano' },
  sendAny:  { en: 'Send anything', tl: 'Magpadala ng kahit ano' },
  mostOrd:  { en: 'Most ordered', tl: 'Pinaka-order' },
  needHelp: { en: 'Need help?', tl: 'Kailangan mo ng tulong?' },
  helpBody: { en: 'From gas cylinders to furniture and more.', tl: 'Mula sa tangke ng gas hanggang muwebles at marami pa.' },
  carTitle: { en: "Your favorite restaurant doesn't deliver?", tl: "Walang delivery ang paborito mong resto?" },
  carCta:   { en: 'Order from here', tl: 'Mag-order dito' },
  promoLn1: { en: 'Free delivery & more', tl: 'Libreng delivery at marami pa' },
  promoLn2: { en: 'for a whole month with Pabili Black', tl: 'sa buong isang buwan kasama ang Pabili Black' },
  joinNow:  { en: 'Join now', tl: 'Sumali na' },
  navHome:  { en: 'Home', tl: 'Home' },
  navOrders:{ en: 'Orders', tl: 'Mga Order' },
  navPick:  { en: 'Pick', tl: 'Pick' },
  navNotes: { en: 'Updates', tl: 'Mga Update' },
  navProfile:{en: 'Profile', tl: 'Profile' },
  wallet:   { en: 'Wallet', tl: 'Wallet' },
  addFunds: { en: 'Add funds', tl: 'Mag-add ng pondo' },
  delivBal: { en: 'Delivery balance', tl: 'Balance sa delivery' },
  orderCount:{en: 'Orders', tl: 'Mga order' },
  savedAdr: { en: 'Saved addresses', tl: 'Mga naka-save na address' },
  userMode: { en: 'Mode', tl: 'Mode' },
  ratings:  { en: 'Service ratings', tl: 'Mga rating' },
  reviews:  { en: 'Reviews', tl: 'Mga review' },
  coupons:  { en: 'Coupons', tl: 'Mga coupon' },
  addCoupon:{ en: 'Add coupon', tl: 'Mag-add ng coupon' },
  custCare: { en: 'Customer support', tl: 'Customer support' },
  forBiz:   { en: 'Business offers', tl: 'Mga promo sa negosyo' },
  settings: { en: 'Settings', tl: 'Settings' },
  payMethods:{en: 'Payment methods', tl: 'Paraan ng bayad' },
  setTitle: { en: 'Settings', tl: 'Settings' },
  setSub:   { en: 'Account, language, help', tl: 'Account, wika, tulong' },
  language: { en: 'Language', tl: 'Wika' },
  acctType: { en: 'Account type', tl: 'Uri ng account' },
  modeCustomer:{en: 'Customer - order anything', tl: 'Customer - mag-order ng kahit ano' },
  modeShopper: {en: 'Shopper - earn per delivery', tl: 'Shopper - kumita kada delivery' },
  modeVendor:  {en: 'Store - receive orders', tl: 'Store - tumanggap ng order' },
  logout:   { en: 'Log out', tl: 'Mag-log out' },
  admin:    { en: 'Admin review (live queue)', tl: 'Admin review (live queue)' },
  switchToSh:{en: 'Switch to Shopper mode?', tl: 'Lumipat sa Shopper mode?' },
  switchShB:{en: 'Shopper mode lets you accept nearby deliveries in one tap. Activate and verify first to avoid issues.',
              tl: 'Sa Shopper mode, isa pang tap mo lang para tumanggap ng delivery. I-activate at i-verify muna.' },
  switch:   { en: 'Switch', tl: 'Lumipat' },
  back:     { en: 'Back', tl: 'Bumalik' },
  recentOrd:{ en: 'Recent orders', tl: 'Mga nakaraang order' },
  cancelled:{ en: 'Cancelled', tl: 'Kanselado' },
  reorder:  { en: 'Reorder', tl: 'Mag-order ulit' },
  yearsAgo: { en: 'more than 8 years ago', tl: 'mahigit 8 taon na ang nakakaraan' },
  locTrack: { en: 'Activate location tracking', tl: 'I-activate ang location tracking' },
  newAdr:   { en: 'New address', tl: 'Bagong address' },
  waitingShop:{en: 'Waiting for the store', tl: 'Naghihintay sa store' },
  waitingB: { en: 'They will confirm stock, price and send a photo.',
              tl: 'Iko-confirm nila ang stock, presyo at magpapadala sila ng larawan.' },
  isRight:  { en: 'Is this the right item?', tl: 'Ito ba ang tamang item?' },
  photoStore:{en: 'Photo from the store', tl: 'Larawan mula sa store' },
  total:    { en: 'Total', tl: 'Total' },
  approvePay:{en: 'Approve and pay', tl: 'Aprubahan at magbayad' },
  notRight: { en: 'Not the right item', tl: 'Hindi tama ang item' },
  findShop: { en: 'Finding a shopper', tl: 'Humahanap ng shopper' },
  shopperAsk:{en: 'The shopper asks', tl: 'Humihingi ang shopper ng' },
  youOffer: { en: 'You offered', tl: 'Ipinropose mo' },
  acceptM:  { en: 'Accept', tl: 'Tanggapin' },
  counter:  { en: 'Counter', tl: 'Mag-counter' },
  refuse:   { en: 'Refuse. Keep my offer.', tl: 'Tumanggi. Panindihin ko ang offer.' },
  shopperHere:{en:'The shopper is at the store', tl: 'Nasa store ang shopper' },
  onWay:    { en: 'On the way to you', tl: 'Papunta na sa\'yo' },
  delivered:{ en: 'Delivered', tl: 'Na-deliver na' },
  newOrder: { en: 'New order', tl: 'Bagong order' },
  locked:   { en: 'Features are locked for now', tl: 'Naka-lock muna ang mga feature' },
  lockedB:  { en: 'To unlock the {r} features, finish KYC and wait for platform approval.',
              tl: 'Para ma-unlock ang {r} features, tapusin ang KYC at hintaying ma-approve.' },
  doKycNow: { en: 'Complete verification now', tl: 'Tapusin ang verification ngayon' },
  whyKyc:   { en: 'Why verify?', tl: 'Bakit kailangan i-verify?' },
  whyKycB:  { en: 'We verify every shopper identity and every store license. No order goes live until approval.',
              tl: 'Vine-verify namin ang pagkakakilanlan ng shopper at license ng store.' },
  shKycTitle:{en: 'Enter your vehicle and license', tl: 'Ilagay ang iyong sasakyan at lisensya' },
  shKycSub: { en: 'Before receiving deliveries, we need your vehicle data + driver license photo + selfie.',
              tl: 'Bago tumanggap ng delivery, kailangan namin ang data ng sasakyan + lisensya + selfie.' },
  vehicle:  { en: 'Vehicle type', tl: 'Uri ng sasakyan' },
  vMotor:   { en: 'Motorcycle', tl: 'Motorsiklo' },
  vCar:     { en: 'Car', tl: 'Car' },
  vBike:    { en: 'Bicycle', tl: 'Bisikleta' },
  vWalk:    { en: 'Walking', tl: 'Lakad' },
  vModel:   { en: 'Vehicle model', tl: 'Modelo ng sasakyan' },
  vPlate:   { en: 'Plate number', tl: 'Numero ng plaka' },
  shDocs:   { en: 'Upload documents', tl: 'Mag-upload ng dokumento' },
  shLicense:{ en: "Driver's license (front)", tl: 'Lisensya (harap)' },
  shSelfie: { en: 'Clear selfie', tl: 'Malinaw na selfie' },
  sendReview:{en: 'Send for review', tl: 'Ipadala para ma-review' },
  reviewOk: { en: 'Encrypted and sent for review. Not shown to customers.',
              tl: 'I-e-encrypt at ipapadala sa review. Hindi makikita ng customer.' },
  pickTap:  { en: 'Tap to choose a file (image or PDF)', tl: 'I-tap para pumili ng file (larawan o PDF)' },
  uploading:{ en: 'Uploading to cloud...', tl: 'Ini-upload sa cloud...' },
  uploaded: { en: 'Uploaded to', tl: 'Na-upload sa' },
  veKycTitle:{en: 'Tell us about your store', tl: 'Ikwento mo ang iyong store' },
  veKycSub: { en: 'Before receiving orders, we need store details + business license + storefront photo.',
              tl: 'Bago tumanggap ng order, kailangan namin ang detalye ng store + business license + storefront.' },
  storeName:{ en: 'Store name', tl: 'Pangalan ng store' },
  storeType:{ en: 'Store type', tl: 'Uri ng store' },
  storeAdr: { en: 'Store address', tl: 'Address ng store' },
  storePhone:{en: 'Store phone', tl: 'Telepono ng store' },
  uploadLicense:{en: 'Valid business license', tl: 'Valid na business license' },
  uploadStorefront:{en: 'Storefront photo', tl: 'Larawan ng store' },
  pendingTitle:{en: 'Your account is under review', tl: 'Nasa review ang account mo' },
  pendingSub:{en: 'Usually reviewed within 24-48 hours. You will be notified on approval.',
               tl: 'Karaniwan 24-48 oras ang review. Notipikasyon agad after approval.' },
  pendingEdit:{en: 'Edit my data', tl: 'I-edit ang data' },
  previewMode:{en: 'Preview mode (simulation)', tl: 'Preview mode (simulation)' },
  previewB: { en: 'This build is not connected to a real admin panel yet. Tap to simulate approval instantly.',
              tl: 'Hindi pa nakakonekta sa totoong admin. I-tap para i-simulate ang approval.' },
  liveMode: { en: 'Live connection', tl: 'Live na koneksyon' },
  liveB:    { en: 'Your documents are in {b} and your request is in {t}. The team reviews them and your account unlocks instantly via Realtime.',
              tl: 'Nasa {b} ang dokumento mo at nasa {t} ang request. Mag-u-unlock ang account real-time.' },
  simApprove:{en: 'Simulate admin approval now', tl: 'I-simulate ang approval ng admin' },
  backToSet:{ en: 'Back to settings', tl: 'Bumalik sa Settings' },
  adminTitle:{en: 'Admin panel', tl: 'Admin panel' },
  adminLive:{ en: 'Connected to the database', tl: 'Nakakonekta sa database' },
  adminSim: { en: 'Simulation mode', tl: 'Simulation mode' },
  adminLiveB:{en: 'Reads pending requests from kyc_requests and documents from kyc-documents bucket.',
               tl: 'Nagbabasa ng pending sa kyc_requests at ng dokumento sa kyc-documents bucket.' },
  adminSimB:{en: 'Replaces the human review team. Approve/reject to unlock the user.',
              tl: 'Pinapalitan ang human review team. Approve/reject para ma-unlock ang user.' },
  noKycPending:{en:'No pending requests', tl: 'Walang pending na request' },
  noKycSub: { en: 'They show up here the moment any user submits documents.',
              tl: 'Lalabas sila dito sa sandaling mag-sumit ang user ng dokumento.' },
  approve:  { en: 'Approve', tl: 'Aprubahan' },
  reject:   { en: 'Reject', tl: 'Tanggihan' },
  saving:   { en: 'Saving...', tl: 'Ini-save...' },
  approved: { en: 'Approved', tl: 'Naaprubahan' },
  pending:  { en: 'Pending review', tl: 'Nasa review' },
  unverified:{en: 'Unverified', tl: 'Hindi pa na-verify' },
  dropACt:  { en: 'Active and verified - Ready to go', tl: 'Aktibo at na-verify - Ready na' },
  awaiting: { en: 'Awaiting verification', tl: 'Naghihintay ng verification' },
  ve:       { en: 'Verified', tl: 'Verified' },
  guest:    { en: 'Guest', tl: 'Bisita' },
  refilling:{ en: 'Loading...', tl: 'Naglo-load...' },
  shHeading:{ en: 'Live offers', tl: 'Mga offer' },
  shAccept: { en: 'Accept {n}', tl: 'Tanggapin {n}' },
  shCounter:{ en: 'Counter {n} (once only)', tl: 'Mag-counter ng {n} (isa lang)' },
  shDecline:{ en: 'Decline', tl: 'Tumanggi' },
  pickedUp: { en: 'Items match, picked up', tl: 'Tama ang items, na-pick up na' },
  deliver:  { en: 'Complete delivery', tl: 'I-deliver na' },
  youEarn:  { en: 'You earned {n}', tl: 'Kumita ka ng {n}' },
  veIdle:   { en: 'No orders yet', tl: 'Walang order' },
  pricedHint:{en:'Total price in pesos (include everything)', tl: 'Total na presyo sa piso (lahat kasama)' },
  sendQuote:{ en: 'Send quote to customer', tl: 'Ipadala ang quote sa customer' },
  requirePhoto:{en:'Required: add a photo of the item before approval',
                tl: 'Kailangan: maglagay ng larawan bago ma-approve' },
  waitingCust:{en:'Waiting for the customer', tl: 'Naghihintay ng customer' },
  youReceive:{en:'You receive {n} after 8% commission', tl: 'Makakatanggap ka ng {n} pagkatapos ng 8% commission' },
};

const T = (lang, key, vars) => {
  const item = STR[key] || { en: key, tl: key };
  let s = item[lang] || item.en;
  if (vars) Object.keys(vars).forEach(k => s = s.replace('{' + k + '}', vars[k]));
  return s;
};

const useLang = () => {
  const [lang, setLang] = useState('en');
  useEffect(() => { (async () => {
    const l = await AsyncStorage.getItem(LANG_KEY);
    if (l && LANGS.includes(l)) setLang(l);
  })(); }, []);
  const save = useCallback((l) => {
    setLang(l); AsyncStorage.setItem(LANG_KEY, l);
  }, []);
  return [lang, save];
};

// ============ theme ============
const C = {
  bg:       '#F5F2EA',
  card:     '#FFFFFF',
  cream:    '#FBF8F1',
  ink:      '#0F172A',
  inkSoft:  '#334155',
  mute:     '#6B7280',
  brand:    '#0E7C5B',
  brandDk:  '#08472F',
  gold:     '#F4B400',
  pink:     '#FCD9DC',
  bad:      '#C8402F',
  line:     '#E5E7EB',
  soft:     '#ECF7F2',
  catPh:    '#3DB871',
  catSup:   '#E8903C',
  catTax:   '#1E5BD6',
  catRes:   '#D94A38',
  catCou:   '#0E7C5B',
};
const P = n => 'P' + Math.round(n);

// ============ helpers ============
const Card = ({ children }) => (
  <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 16,
                 marginTop: 12, borderWidth: 1, borderColor: C.line }}>{children}</View>);
const H = ({ children }) => (
  <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 4 }}>{children}</Text>);
const M = ({ children }) => (
  <Text style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.6, marginTop: 4 }}>{children}</Text>);
const Btn = ({ label, onPress, kind='main', disabled }) => (
  <Pressable onPress={onPress} disabled={disabled}
    style={{ backgroundColor: kind==='ghost' ? 'transparent' : (kind==='bad' ? 'transparent' : C.brand),
             borderWidth: kind==='main' ? 0 : 1.5,
             borderColor: kind==='bad' ? C.bad : C.brand,
             borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10 }}>
    <Text style={{ color: kind==='main' ? '#fff' : (kind==='bad' ? C.bad : C.brand),
                   fontWeight: '800', fontSize: 15 }}>{label}</Text>
  </Pressable>);

// ============ animated side drawer ============
const Drawer = ({ open, onClose, children }) => {
  const slide = useRef(new Animated.Value(0)).current;
  const w = Math.min(Dimensions.get('window').width * 0.86, 380);
  useEffect(() => {
    Animated.timing(slide, { toValue: open ? 1 : 0, duration: 240, useNativeDriver: true }).start();
  }, [open, slide]);
  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [w, 0] });
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.55)' }]} />
      <Animated.View pointerEvents={open ? 'auto' : 'none'}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: w,
          backgroundColor: C.card, transform: [{ translateX: tx }],
          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18,
          shadowOffset: { width: -4, height: 0 }, elevation: 24,
        }}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </Modal>);
};

// ============ bottom nav with center FAB ============
const TABS = [
  { key: 'home', emoji: 'H' },
  { key: 'orders', emoji: 'O' },
  { key: 'pick', emoji: '+' },
  { key: 'notes', emoji: 'N' },
  { key: 'profile', emoji: 'P' },
];
const BottomNav = ({ tab, setTab, lang }) => (
  <View style={bn.wrap}>
    {TABS.map((t, i) => {
      const isCenter = i === 2;
      const isActive = tab === t.key;
      const labelKey = 'nav' + t.key[0].toUpperCase() + t.key.slice(1);
      return (
        <Pressable key={t.key} onPress={() => setTab(t.key)} style={[bn.cell, isCenter && bn.centerCell]}>
          {isCenter ? (
            <View style={bn.fab}><Text style={bn.fabTxt}>+</Text></View>
          ) : (
            <>
              <View style={[bn.iconBg, isActive && bn.iconBgActive]}>
                <Text style={{ fontSize: 18, fontWeight: '900',
                               color: isActive ? '#fff' : C.ink }}>{t.emoji}</Text>
              </View>
              <Text style={[bn.label, isActive && bn.labelActive]}>{T(lang, labelKey)}</Text>
            </>
          )}
        </Pressable>
      );
    })}
  </View>
);
const bn = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: C.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingTop: 8, paddingBottom: 16, paddingHorizontal: 8,
          shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 18,
          shadowOffset: { width: 0, height: -3 }, elevation: 10 },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerCell: { alignItems: 'center' },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.brandDk,
         alignItems: 'center', justifyContent: 'center',
         shadowColor: C.brandDk, shadowOpacity: 0.45, shadowRadius: 12,
         shadowOffset: { width: 0, height: 6 }, elevation: 12, marginTop: -28 },
  fabTxt: { color: '#fff', fontSize: 26, fontWeight: '800' },
  iconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2EDE2',
            alignItems: 'center', justifyContent: 'center' },
  iconBgActive: { backgroundColor: C.brand },
  label: { fontSize: 11, color: C.mute, marginTop: 4, fontWeight: '700' },
  labelActive: { color: C.ink },
});

// ============ top address card ============
const TopAddress = ({ lang, address }) => (
  <View style={ta.wrap}>
    <View style={ta.icon}><Text style={{ color:'#fff', fontWeight:'900' }}>L</Text></View>
    <View style={{ flex: 1, marginLeft: 10 }}>
      <Text style={ta.label}>{T(lang,'home')} - {address}</Text>
      <Text style={ta.sub}>SA - 3641 Al-Yarmouk St, Aqrabiyah, Khobar</Text>
    </View>
    <Pressable style={ta.refresh}><Text style={{ fontSize: 18, color: C.brand }}>R</Text></Pressable>
  </View>
);
const ta = StyleSheet.create({
  wrap: { backgroundColor: C.card, marginHorizontal: 12, marginTop: 8, marginBottom: 6,
          borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center',
          shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10,
          shadowOffset:{width:0,height:3}, elevation: 4 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.brand,
          alignItems:'center', justifyContent:'center' },
  label: { fontSize: 13.5, fontWeight: '800', color: C.ink },
  sub:   { fontSize: 11, color: C.mute, marginTop: 1 },
  refresh: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line,
             alignItems:'center', justifyContent:'center', backgroundColor: C.bg },
});

// ============ category grid ============
const CAT_COLORS = { ph: C.catPh, sup: C.catSup, tax: C.catTax, res: C.catRes, cou: C.catCou };
const CAT_LABEL = { ph: 'catPh', sup: 'catSup', tax: 'catTax', res: 'catRes', cou: 'catCou' };
const CatGrid = ({ lang, onPick }) => (
  <View style={cg.wrap}>
    {['ph','sup','tax','res','cou'].map((k) => (
      <Pressable key={k} onPress={() => onPick && onPick(k)} style={[cg.cell, k==='cou' && cg.cellHi]}>
        {k === 'cou' && <View style={cg.hiMark}><Text style={{ color:'#fff', fontSize: 14, fontWeight:'900' }}>v</Text></View>}
        <View style={[cg.icon, { backgroundColor: CAT_COLORS[k] + '22' }]}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: CAT_COLORS[k] }}>
            {k.toUpperCase()}
          </Text>
        </View>
        <Text style={[cg.label, k==='cou' && { color:'#fff' }]}>{T(lang, CAT_LABEL[k])}</Text>
      </Pressable>
    ))}
  </View>
);
const cg = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between',
          paddingHorizontal: 8, marginTop: 4 },
  cell: { width: '19%', aspectRatio: 1, borderRadius: 16,
          backgroundColor: C.card, alignItems: 'center', justifyContent:'center',
          paddingVertical: 4, shadowColor:'#000', shadowOpacity:0.04,
          shadowRadius:6, shadowOffset:{width:0,height:2}, elevation: 2 },
  cellHi: { backgroundColor: C.brand },
  icon: { width: '78%', aspectRatio: 1, borderRadius: 14, alignItems:'center', justifyContent:'center' },
  label: { fontSize: 10.5, color: C.ink, marginTop: 4, fontWeight: '700', textAlign:'center' },
  hiMark: { position: 'absolute', top: -5, right: -5, width: 22, height: 22,
            borderRadius: 11, backgroundColor: C.gold, alignItems:'center', justifyContent:'center' },
});

// ============ search, carousel, service cards ============
const SearchBar = ({ lang }) => (
  <View style={sb.wrap}>
    <Text style={sb.placeholder}>{T(lang, 'searchPh')}</Text>
    <View style={sb.ic}><Text style={{ fontSize: 16, color: C.brand, fontWeight:'900' }}>Q</Text></View>
  </View>
);
const sb = StyleSheet.create({
  wrap: { backgroundColor: C.bg, marginHorizontal: 12, marginVertical: 10,
          borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
          flexDirection: 'row', alignItems: 'center',
          borderWidth: 1, borderColor: C.line },
  placeholder: { flex: 1, fontSize: 13, color: C.mute },
  ic: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.soft,
        alignItems:'center', justifyContent:'center' },
});

const PromoCarousel = ({ lang }) => (
  <View style={pr.wrap}>
    <View style={pr.gradient}>
      <View style={{ flex: 1 }}>
        <Text style={pr.title}>{T(lang, 'carTitle')}</Text>
        <Pressable style={pr.cta}><Text style={pr.ctaTxt}>{T(lang, 'carCta')}</Text></Pressable>
      </View>
      <Text style={pr.illus}>F</Text>
    </View>
    <View style={pr.dots}>
      <View style={[pr.dot, pr.dotActive]} />
      <View style={pr.dot} /><View style={pr.dot} /><View style={pr.dot} />
    </View>
  </View>
);
const pr = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 4 },
  gradient: { backgroundColor: C.brandDk, borderRadius: 18, padding: 16,
              flexDirection: 'row', alignItems: 'center', overflow: 'hidden', minHeight: 130 },
  title: { color:'#fff', fontSize: 16.5, fontWeight: '900', maxWidth: '70%', lineHeight: 22 },
  cta: { marginTop: 10, backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 8,
         borderRadius: 12, alignSelf: 'flex-start' },
  ctaTxt: { color: C.brandDk, fontWeight: '900', fontSize: 13 },
  illus: { fontSize: 60, color: '#fff', marginLeft: 12, fontWeight: '900' },
  dots: { flexDirection:'row', justifyContent:'center', marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line, marginHorizontal: 3 },
  dotActive: { backgroundColor: C.brand, width: 18 },
});

const ServiceCards = ({ lang, onChoose }) => (
  <View style={sc.wrap}>
    <Text style={sc.section}>{T(lang, 'closeTo')}</Text>
    <View style={sc.row}>
      <Pressable onPress={() => onChoose('orderAny')} style={[sc.card, sc.cardL]}>
        <Text style={sc.tag}>{T(lang, 'mostOrd')}</Text>
        <Text style={sc.illus}>B</Text>
        <Text style={sc.t}>{T(lang, 'orderAny')}</Text>
        <Text style={sc.b}>Order anything from any nearby store.</Text>
      </Pressable>
      <Pressable onPress={() => onChoose('sendAny')} style={[sc.card, sc.cardR]}>
        <Text style={sc.illus}>S</Text>
        <Text style={sc.t}>{T(lang, 'sendAny')}</Text>
        <Text style={sc.b}>Send parcels to friends and family.</Text>
      </Pressable>
    </View>
  </View>
);
const sc = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 16 },
  section: { fontSize: 15, fontWeight: '900', color: C.ink, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 14, width: '48%',
          shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10,
          shadowOffset:{width:0,height:3}, elevation: 3 },
  cardL: { backgroundColor: C.soft },
  cardR: { backgroundColor: '#FFF7E1' },
  tag: { backgroundColor: C.brand, color:'#fff', fontWeight: '900', fontSize: 10,
         paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  illus: { fontSize: 44, color: C.brand, marginTop: 8, fontWeight: '900' },
  t: { fontSize: 14.5, fontWeight: '900', color: C.ink, marginTop: 6 },
  b: { fontSize: 11, color: C.mute, marginTop: 3, lineHeight: 1.6 },
});

const HelpBlock = ({ lang }) => (
  <View style={hb.wrap}>
    <View style={{ flex: 1, paddingRight: 12 }}>
      <Text style={hb.t}>{T(lang, 'needHelp')}</Text>
      <Text style={hb.b}>{T(lang, 'helpBody')}</Text>
    </View>
    <Text style={hb.illus}>V</Text>
  </View>
);
const hb = StyleSheet.create({
  wrap: { backgroundColor: '#E8F4EA', marginHorizontal: 12, marginTop: 14,
          borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center' },
  t: { fontSize: 16, color: C.brandDk, fontWeight: '900' },
  b: { fontSize: 12, color: C.inkSoft, marginTop: 3, lineHeight: 1.6 },
  illus: { fontSize: 50, color: C.brand, fontWeight: '900' },
});

const QuickIcons = () => (
  <View style={qi.wrap}>
    {[
      { e:'T', label:'Trucks' }, { e:'B', label:'Batteries' },
      { e:'G', label:'Gas' }, { e:'K', label:'Tools' },
    ].map((it, idx) => (
      <View key={idx} style={qi.cell}>
        <View style={qi.iconBox}><Text style={{ fontSize: 26, color: C.brand, fontWeight: '900' }}>{it.e}</Text></View>
        <Text style={qi.lbl}>{it.label}</Text>
      </View>))}
  </View>
);
const qi = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent:'space-between',
          marginHorizontal: 12, marginTop: 14 },
  cell: { width: '23%', alignItems: 'center' },
  iconBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.card,
             alignItems: 'center', justifyContent: 'center',
             shadowColor:'#000', shadowOpacity:0.04, shadowRadius:8, elevation: 2 },
  lbl: { fontSize: 11, color: C.mute, marginTop: 4, fontWeight:'700' },
});

const StickyPromo = ({ lang, visible, onDismiss }) => {
  if (!visible) return null;
  return (
    <View style={sp.wrap}>
      <Pressable onPress={onDismiss} style={sp.x}><Text style={sp.xTxt}>x</Text></Pressable>
      <View style={{ flex: 1, paddingHorizontal: 4 }}>
        <Text style={sp.t1}>{T(lang,'promoLn1')}</Text>
        <Text style={sp.t2}>{T(lang,'promoLn2')}</Text>
      </View>
      <Pressable style={sp.cta}><Text style={sp.ctaTxt}>{T(lang,'joinNow')}</Text></Pressable>
    </View>);
};
const sp = StyleSheet.create({
  wrap: { backgroundColor: C.ink, marginHorizontal: 12, marginTop: 12,
          borderRadius: 18, paddingVertical: 12, paddingLeft: 40, paddingRight: 8,
          flexDirection: 'row', alignItems: 'center' },
  x: { position:'absolute', top:6, left:8, width:22, height:22,
       borderRadius:11, backgroundColor: '#fff2', alignItems:'center', justifyContent:'center' },
  xTxt: { color:'#fff', fontSize: 13, fontWeight: '800' },
  t1: { color: C.gold, fontWeight:'900', fontSize: 13 },
  t2: { color: '#fff', fontSize: 11, marginTop: 2 },
  cta: { backgroundColor: C.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  ctaTxt: { color: C.ink, fontWeight: '900', fontSize: 12 },
});

const ProfileRow = ({ emoji, label, value, accent, onTap }) => (
  <Pressable onPress={onTap} style={pr2.row}>
    <View style={[pr2.box, accent && { backgroundColor: accent + '22' }]}>
      <Text style={{ fontSize: 18, fontWeight:'900', color: accent || C.brand }}>{emoji}</Text>
    </View>
    <Text style={pr2.label}>{label}</Text>
    <View style={pr2.right}>
      {value !== undefined && <Text style={pr2.value}>{value}</Text>}
      <Text style={pr2.chev}>{'>'}</Text>
    </View>
  </Pressable>
);
const pr2 = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
         paddingVertical: 14, backgroundColor: C.card,
         borderRadius: 14, marginBottom: 8 },
  box: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.soft,
         alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, fontWeight: '700', color: C.ink, marginLeft: 12 },
  value: { fontSize: 13, color: C.brand, fontWeight: '800', marginRight: 6 },
  right: { flexDirection: 'row', alignItems: 'center' },
  chev: { color: C.mute, fontSize: 22, fontWeight:'300' },
});

const LANG_PILLS = [
  { k: 'en', label: 'English' },
  { k: 'tl', label: 'Tagalog' },
];
const RoleSwitch = ({ role, setDrag, lang }) => {
  const roles = [
    { k: 'Customer', tag: 'modeCustomer' },
    { k: 'Shopper',  tag: 'modeShopper' },
    { k: 'Vendor',   tag: 'modeVendor' },
  ];
  return (
    <View>
      {roles.map((r) => (
        <Pressable key={r.k} onPress={() => setDrag(r.k)} style={rs.row}>
          <View style={[rs.box, role === r.k && { backgroundColor: C.brand }]}>
            <Text style={{ fontSize: 14, color: role === r.k ? '#fff' : C.brand, fontWeight:'900' }}>
              {r.k[0]}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={rs.label}>{r.k}</Text>
            <Text style={rs.sub}>{T(lang, r.tag)}</Text>
          </View>
          <View style={[rs.tick, role === r.k && { backgroundColor: C.brand }]} />
        </Pressable>))}
    </View>);
};
const rs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems:'center', paddingVertical: 10 },
  box: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.soft,
         alignItems:'center', justifyContent:'center' },
  label: { fontSize: 14, fontWeight: '800', color: C.ink },
  sub: { fontSize: 11, color: C.mute, marginTop: 1 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line },
});

const KycBadge = ({ status, small }) => {
  if (status === 'approved') return <Text style={{ color: C.brand, fontWeight:'800', fontSize: small ? 10 : 11.5 }}>{'v ' + T('en','approved')}</Text>;
  if (status === 'rejected') return <Text style={{ color: C.bad,   fontWeight:'800', fontSize: small ? 10 : 11.5 }}>{'x ' + T('en','reject')}</Text>;
  return <Text style={{ color: C.gold,  fontWeight:'800', fontSize: small ? 10 : 11.5 }}>{'... ' + T('en','pending')}</Text>;
};

// ============ Order engine ============
const ROLE_KEY = 'pabili.role';
const AUTH_KEY = 'pabili.auth';
const KYC_KEY  = 'pabili.kyc';

async function loadRole() { try { return (await AsyncStorage.getItem(ROLE_KEY)) || 'Customer'; } catch { return 'Customer'; } }
async function saveRole(r) { try { await AsyncStorage.setItem(ROLE_KEY, r); } catch {} }
async function loadAuth() { try { const v = await AsyncStorage.getItem(AUTH_KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
async function saveAuth(a) { try { await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(a||{})); } catch {} }
async function loadKyc()  { try { const v = await AsyncStorage.getItem(KYC_KEY); return v ? JSON.parse(v) : {}; } catch { return {}; } }
async function saveKyc(k) { try { await AsyncStorage.setItem(KYC_KEY, JSON.stringify(k||{})); } catch {} }

const Ctx = createContext(null);
const useOrder = () => useContext(Ctx);
const EMPTY = { step:'idle', text:'', price:0, fee:20, ask:0, countered:false, round:0, note:'' };
const ACTIONS = { quote:'quote', reject:'reject', pay:'pay', ask:'ask', accept:'accept', decline:'decline', acceptAsk:'accept_ask', offerBack:'offer_back', refuse:'refuse', pickedUp:'picked_up', delivered:'delivered' };

function OrderProvider({ children }) {
  const [order, setOrder] = useState(null);
  const [hidden, setHidden] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data, error:e } = await supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(1);
          if (e) { setError(e.message); setOrder(null); }
          else setOrder(data && data[0] ? data[0] : null); } catch { setOrder(null); }
  }, []);
  useEffect(() => {
    let ch;
    (async () => {
      try { const { data: { session } } = await supabase.auth.getSession();
            if (!session) { const { error: e } = await supabase.auth.signInAnonymously();
                            if (e && !String(SUPABASE_URL).includes('PASTE')) setError(e.message); }
            await load(); } catch {}
      setReady(true);
      try { ch = supabase.channel('orders-live').on('postgres_changes',
            { event:'*', schema:'public', table:'orders' }, load).subscribe(); } catch {}
    })();
    return () => { try { if (ch) supabase.removeChannel(ch); } catch {} };
  }, [load]);
  const live = order && order.id !== hidden && order.step !== 'cancelled';
  const s = live ? { ...EMPTY, step:order.step, text:order.text, price:+order.price, fee:+order.fee, ask:+order.ask, countered:order.countered, round:order.round, note:order.note } : EMPTY;
  const ledger = { vendor: s.price*0.92, platform: s.price*0.08, shopper: s.fee, total: s.price+s.fee };
  const d = async (a) => {
    setError('');
    if (a.type === 'reset') { setHidden(order && order.id); return; }
    try { const res = a.type === 'place'
      ? await supabase.rpc('place_order', { p_text: a.text, p_fee: a.fee })
      : await supabase.rpc('order_action', { p_order: order.id, p_action: ACTIONS[a.type], p_val: a.price ?? a.ask ?? a.fee ?? null });
      if (res.error) setError(res.error.message);
      if (a.type === 'place') setHidden(null);
      await load(); } catch (e) { setError(String(e.message || e)); }
  };
  const setRoleRpc = async (r) => {
    try { const { error:e } = await supabase.rpc('set_role', { p_role: r.toLowerCase() });
          if (e) setError(e.message); await load(); } catch {}
  };
  return <Ctx.Provider value={{ s, d, ledger, ready, error, setRole: setRoleRpc }}>{children}</Ctx.Provider>;
}

// ============ Customer flow ============
function Flow({ lang, onNew }) {
  const { s, d, ledger } = useOrder();
  const room = s.ask - s.fee >= 10;
  const [cc, setCc] = useState(0);
  const mid = Math.min(s.ask - 5, Math.max(s.fee + 5, Math.round((s.fee + s.ask)/10)*5));
  const offer = cc || mid;
  if (s.step === 'placed') return (
    <Card><H>{T(lang,'waitingShop')}</H><M>{T(lang,'waitingB')}</M></Card>);
  if (s.step === 'approve') return (
    <View>
      <H>{T(lang,'isRight')}</H>
      <Card>
        <View style={{ height: 150, borderRadius: 12, backgroundColor: '#E3ECE8',
                        alignItems:'center', justifyContent:'center' }}>
          <Text style={{ color: C.mute }}>{T(lang,'photoStore')}</Text>
        </View>
        <Text style={{ marginTop: 10, color: C.ink }}>{s.text}</Text>
        <M>{'Items ' + P(s.price) + ' + delivery ' + P(s.fee)}</M>
        <H>{P(ledger.total)}</H>
      </Card>
      <Btn label={T(lang,'approvePay') + ' ' + P(ledger.total)} onPress={() => d({ type:'pay' })} />
      <Btn kind="bad" label={T(lang,'notRight')} onPress={() => d({ type:'reject' })} />
    </View>);
  if (s.step === 'offer') return (
    <View>
      <Card><H>{T(lang,'findShop')}</H><M>{'Offered to nearby shoppers at ' + P(s.fee)}</M></Card>
      {s.countered && (
        <Card>
          <H>{T(lang,'shopperAsk') + ' ' + P(s.ask)}</H>
          <M>{T(lang,'youOffer') + ' ' + P(s.fee)}</M>
          <Btn label={T(lang,'acceptM') + ' ' + P(s.ask)} onPress={() => d({ type:'acceptAsk' })} />
          {room && <Btn kind="ghost" label={T(lang,'counter') + ' ' + P(offer)} onPress={() => d({ type:'offerBack', fee: offer })} />}
          <Btn kind="bad" label={T(lang,'refuse')} onPress={() => d({ type:'refuse' })} />
        </Card>)}
      <Card><H>{T(lang,'shopperHere')}</H></Card>
    </View>);
  if (s.step === 'pickup') return <Card><H>{T(lang,'shopperHere')}</H></Card>;
  if (s.step === 'deliver') return <Card><H>{T(lang,'onWay')}</H></Card>;
  return (
    <Card>
      <H>{T(lang,'delivered')}</H>
      <Btn label={T(lang,'newOrder')} onPress={() => { onNew && onNew(s.text); d({ type:'reset' }); }} />
    </Card>);
}

// ============ Tabs ============
function HomeTab({ lang }) {
  const [banner, setBanner] = useState(true);
  const { s } = useOrder();
  if (s.step !== 'idle') return <Flow lang={lang} onNew={()=>{}} />;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 200 }}>
      <TopAddress lang={lang} address="3641 Al-Yarmouk St" />
      <CatGrid lang={lang} onPick={() => {}} />
      <SearchBar lang={lang} />
      <PromoCarousel lang={lang} />
      <ServiceCards lang={lang} onChoose={() => {}} />
      <HelpBlock lang={lang} />
      <QuickIcons />
      <StickyPromo lang={lang} visible={banner} onDismiss={() => setBanner(false)} />
    </ScrollView>);
}

function OrdersTab({ lang }) {
  const orders = [
    { id:'1', ago: T(lang,'yearsAgo'), name:'Hamda Trading Co. - Maazda rear axle L', item:'L fully assembled rear axle L' },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink }}>{T(lang,'recentOrd')}</Text>
      </View>
      {orders.map((o) => (
        <View key={o.id} style={{ marginHorizontal: 12, marginBottom: 12, padding: 14,
          backgroundColor: C.card, borderRadius: 18,
          shadowColor:'#000', shadowOpacity:0.04, shadowRadius:8, elevation: 2 }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
            <Text style={{ color: C.bad, fontWeight: '900', fontSize: 12.5 }}>{'x ' + T(lang,'cancelled')}</Text>
            <Text style={{ color: C.mute, fontSize: 11.5 }}>{o.ago}</Text>
          </View>
          <Text style={{ marginTop: 8, fontWeight:'800', color: C.ink, fontSize: 13.5 }}>{o.name}</Text>
          <Text style={{ marginTop: 2, color: C.mute, fontSize: 12 }}>{o.item}</Text>
          <Pressable style={{ marginTop: 12, alignSelf:'flex-start',
            backgroundColor: C.brand, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 }}>
            <Text style={{ color:'#fff', fontWeight:'900', fontSize: 12.5 }}>{'o ' + T(lang,'reorder')}</Text>
          </Pressable>
        </View>))}
      <View style={{ marginHorizontal: 12, marginTop: 10, padding: 16, backgroundColor: C.pink,
                      borderRadius: 18 }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: '#882B40' }}>{'o ' + T(lang,'locTrack')}</Text>
        <M style={{}}>Allow live GPS to receive delivery offers nearby.</M>
      </View>
    </ScrollView>);
}

function UpdatesTab({ lang }) {
  const notes = [
    { emoji:'S', t:'Your previous delivery was completed.', when:'Today' },
    { emoji:'R', t:'You earned a 5-star rating from Sara.', when:'Yesterday' },
    { emoji:'G', t:'New promo: free delivery this week.', when:'2 days ago' },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 4 }}>{T(lang,'navNotes')}</Text>
      <Text style={{ color: C.mute, marginBottom: 12 }}>3 new updates</Text>
      {notes.map((n, idx) => (
        <View key={idx} style={{ padding: 14, backgroundColor: C.card, borderRadius: 16,
          marginBottom: 10, flexDirection:'row', alignItems:'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.soft,
            alignItems:'center', justifyContent:'center' }}>
            <Text style={{ fontSize: 18, color: C.brand, fontWeight: '900' }}>{n.emoji}</Text>
          </View>
          <View style={{ flex:1, marginLeft: 12 }}>
            <Text style={{ color: C.ink, fontWeight: '800', fontSize: 13.5 }}>{n.t}</Text>
            <Text style={{ color: C.mute, fontSize: 11.5, marginTop: 2 }}>{n.when}</Text>
          </View>
        </View>))}
    </ScrollView>);
}

function ProfileTab({ lang, onOpen }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={{ backgroundColor: C.brandDk, paddingTop: 18, paddingBottom: 80 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          <Pressable><Text style={{ color:'#fff', fontSize: 20 }}>P</Text></Pressable>
          <Pressable><Text style={{ color:'#fff', fontSize: 20 }}>B</Text></Pressable>
        </View>
      </View>
      <View style={{ marginHorizontal: 12, marginTop: -64, backgroundColor: C.card,
                      borderRadius: 22, paddingTop: 0, paddingBottom: 12 }}>
        <View style={{ alignItems:'center', marginTop: -42 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#cfe6d5',
            borderWidth: 4, borderColor: C.card, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ fontSize: 32, fontWeight: '900', color: C.brandDk }}>M</Text>
          </View>
          <Text style={{ marginTop: 8, fontWeight:'900', fontSize: 16, color: C.ink }}>
            Mohamed ali Mohamed Mahmou...
          </Text>
          <View style={{ flexDirection:'row', marginTop: 6 }}>
            {[0,1,2,3,4].map((i) => (<Text key={i} style={{ color: C.gold, fontSize: 15 }}>*</Text>))}
          </View>
          <View style={{ marginTop: 6, paddingHorizontal: 14, paddingVertical: 4,
            backgroundColor: C.pink, borderRadius: 20 }}>
            <Text style={{ color: '#B56366', fontWeight:'800', fontSize: 11 }}>{T(lang,'unverified')}</Text>
          </View>
        </View>
      </View>
      <View style={{ marginTop: 18, paddingHorizontal: 12 }}>
        <ProfileRow emoji="W" label={T(lang,'wallet')} value={'+ ' + T(lang,'addFunds')} accent={C.brand} />
        <ProfileRow emoji="$" label={T(lang,'delivBal')} value={'P 0.0'} />
        <ProfileRow emoji="A" label={T(lang,'orderCount')} value={'0 ' + T(lang,'navOrders')} />
        <ProfileRow emoji="L" label={T(lang,'savedAdr')} value={'2'} />
        <ProfileRow emoji="M" label={T(lang,'userMode')} value={T('en','Customer')} accent={C.brand} />
        <ProfileRow emoji="R" label={T(lang,'ratings')} value={'0'} />
        <ProfileRow emoji="N" label={T(lang,'reviews')} value={'0'} />
        <ProfileRow emoji="V" label={T(lang,'coupons')} value={'+ ' + T(lang,'addCoupon')} accent={C.catSup} />
        <ProfileRow emoji="C" label={T(lang,'custCare')} />
        <ProfileRow emoji="B" label={T(lang,'forBiz')} />
        <ProfileRow emoji="S" label={T(lang,'settings')} onTap={onOpen} />
        <ProfileRow emoji="P" label={T(lang,'payMethods')} />
      </View>
    </ScrollView>);
}

// ============ Login ============
// Self-contained: uses local state + ref to avoid stale closures that
// caused the parent-state-version race where the Continue button stayed disabled.
const normalizeDigits = (input) => {
  if (input == null) return '';
  const matches = String(input).match(/[\d\u0660-\u0669\u06F0-\u06F9]/g);
  if (!matches) return '';
  let ascii = '';
  for (const ch of matches) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) ascii += String(code - 0x0660);
    else if (code >= 0x06F0 && code <= 0x06F9) ascii += String(code - 0x06F0);
    else ascii += ch;
  }
  return ascii.replace(/^0+/, '');
};

function LoginScreen({ lang, mode, phone, setPhone, otp, setOtp, onPhoneSubmit, onOtpSubmit, onResendOtp, busy, loginError }) {
  const [localPhone, setLocalPhone] = useState(phone || '');
  const [localOtp, setLocalOtp] = useState(otp || '');
  const phoneRef = useRef(localPhone);
  const otpRef = useRef(localOtp);
  useEffect(() => { phoneRef.current = localPhone; }, [localPhone]);
  useEffect(() => { otpRef.current = localOtp; }, [localOtp]);
  useEffect(() => { if (phone) setLocalPhone(phone); }, [phone]);
  useEffect(() => { if (otp) setLocalOtp(otp); }, [otp]);

  if (mode === 'otp') {
    return (
      <View style={{ flex:1 }}>
        <View style={{ flex: 1.5, backgroundColor: C.brandDk, alignItems:'center', justifyContent:'center' }}>
          <Text style={{ fontSize: 64, color:'#ffffff', fontWeight:'900' }}>P</Text>
          <Text style={{ color: '#ffffff', opacity: 0.85, marginTop: 6, fontSize: 13 }}>{T(lang,'otpSub')}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: C.card, padding: 22, borderTopLeftRadius: 28,
                       borderTopRightRadius: 28, marginTop: -20 }}>
          <Text style={{ fontSize: 19, fontWeight:'900', color: C.ink }}>{T(lang,'enterOtp')}</Text>
          <Text style={{ marginTop: 4, color: C.mute, fontSize: 12 }}>{'+966 ' + (phone || '')}</Text>
          <TextInput
            value={localOtp}
            onChangeText={(v) => { const c = normalizeDigits(v).slice(0,4); setLocalOtp(c); otpRef.current = c; setOtp && setOtp(c); }}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="••••"
            placeholderTextColor={C.mute}
            style={{ marginTop: 14, borderWidth: 1, borderColor: C.line, borderRadius: 14,
                     padding: 14, color: C.ink, fontSize: 22, letterSpacing: 8, textAlign:'center' }} />
          {!!loginError && <Text style={{ marginTop: 10, color: C.bad, fontWeight:'800' }}>{loginError}</Text>}
          <Btn label={busy ? '…' : T(lang,'verify')} onPress={() => onOtpSubmit(otpRef.current)} />
          <Btn kind="ghost" label={T(lang,'resend')} onPress={onResendOtp} disabled={busy} />
        </View>
      </View>);
  }
  return (
    <View style={{ flex:1 }}>
      <View style={{ flex: 1.5, backgroundColor: C.brandDk, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize: 64, color:'#ffffff', fontWeight:'900' }}>P</Text>
        <Text style={{ color: '#ffffff', opacity: 0.85, marginTop: 6, fontSize: 13 }}>{T(lang,'anyItem')}</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: C.card, padding: 22, borderTopLeftRadius: 28,
                     borderTopRightRadius: 28, marginTop: -20 }}>
        <Text style={{ fontSize: 19, fontWeight:'900', color: C.ink }}>{T(lang,'login')}</Text>
        <View style={{ flexDirection:'row', alignItems:'center', marginTop: 14,
                        borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 16, fontWeight:'800', color: C.ink }}>+966</Text>
          <TextInput
            value={localPhone}
            onChangeText={(v) => { const c = normalizeDigits(v).slice(0, 12); setLocalPhone(c); phoneRef.current = c; setPhone && setPhone(c); }}
            keyboardType="number-pad"
            placeholder="5XXXXXXXX"
            placeholderTextColor={C.mute}
            maxLength={12}
            style={{ flex:1, paddingVertical: 12, color: C.ink, fontSize: 16, marginLeft: 8 }} />
        </View>
        {!!loginError && <Text style={{ marginTop: 10, color: C.bad, fontWeight:'800' }}>{loginError}</Text>}
        <Btn label={busy ? '…' : T(lang,'continue')} onPress={() => onPhoneSubmit(phoneRef.current)} disabled={busy} />
        <Text style={{ marginTop: 18, fontSize: 11, color: C.mute, lineHeight: 1.6 }}>{T(lang,'termsOk')}</Text>
      </View>
    </View>);
}

// ============ KYC forms ============
function ShopperKyc({ data, lang, onSubmit }) {
  const [vehicleType, setVehicleType] = useState(data.vehicleType || T(lang,'vMotor'));
  const [vehicleModel, setVehicleModel] = useState(data.vehicleModel || 'Honda Click 125');
  const [plate, setPlate] = useState(data.plate || 'ABC-1234');
  const [license, setLicense] = useState(data.license && data.license.path ? data.license : null);
  const [selfie, setSelfie] = useState(data.selfie && data.selfie.path ? data.selfie : null);
  const [busy, setBusy] = useState('');
  const pick = (field, setter) => async () => {
    setBusy(field);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type:['image/*','application/pdf'], copyToCacheDirectory:true });
      if (!r || r.canceled || r.type === 'cancel') return;
      const a = r.assets && r.assets[0] ? r.assets[0] : r;
      const up = await uploadDoc(a.uri || r.uri, 'Shopper', field, a.name || r.name || field);
      setter({ name: a.name || r.name || field, ...up });
    } catch (e) { Alert.alert('Upload failed', String((e && e.message) || e)); } setBusy('');
  };
  const opts = ['vMotor','vCar','vBike','vWalk'];
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 13.5, color: C.mute, letterSpacing: 1 }}>Step 1 of 1 - Shopper check</Text>
      <Text style={{ fontSize: 21, fontWeight: '900', color: C.ink, marginTop: 6 }}>{T(lang,'shKycTitle')}</Text>
      <Text style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.6 }}>{T(lang,'shKycSub')}</Text>
      <Card>
        <Text style={{ fontWeight: '800' }}>{T(lang,'vehicle')}</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', marginTop: 8 }}>
          {opts.map((k) => (
            <Pressable key={k} onPress={() => setVehicleType(T(lang,k))}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18,
                       borderWidth: 1, borderColor: vehicleType === T(lang,k) ? C.brand : C.line,
                       backgroundColor: vehicleType === T(lang,k) ? C.soft : '#fff',
                       marginRight: 8, marginBottom: 8 }}>
              <Text style={{ color: vehicleType === T(lang,k) ? C.brand : C.ink,
                             fontWeight: '700', fontSize: 12.5 }}>{T(lang,k)}</Text>
            </Pressable>))}
        </View>
        <Text style={{ fontWeight: '800', marginTop: 8 }}>{T(lang,'vModel')}</Text>
        <TextInput value={vehicleModel} onChangeText={setVehicleModel}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 6, color: C.ink }} />
        <Text style={{ fontWeight: '800', marginTop: 12 }}>{T(lang,'vPlate')}</Text>
        <TextInput value={plate} onChangeText={setPlate}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 6, color: C.ink }} />
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>{T(lang,'shDocs')}</Text>
        <M>{T(lang,'reviewOk')}</M>
        <UploadRow label={T(lang,'shLicense')} uploaded={!!license} busy={busy==='license'}
                   fileName={license && license.name} lang={lang}
                   onPick={pick('license', setLicense)} />
        <UploadRow label={T(lang,'shSelfie')} uploaded={!!selfie} busy={busy==='selfie'}
                   fileName={selfie && selfie.name} lang={lang}
                   onPick={pick('selfie', setSelfie)} />
      </Card>
      <Btn label={T(lang,'sendReview')}
        onPress={() => onSubmit({ vehicleType, vehicleModel, plate, license, selfie, submittedAt: Date.now() })}
        disabled={!vehicleType || !vehicleModel || !plate || !license || !selfie} />
    </ScrollView>);
}

function VendorKyc({ data, lang, onSubmit }) {
  const [storeName, setStoreName] = useState(data.storeName || 'Corner Sari-sari Store - Palm Branch');
  const [storeType, setStoreType] = useState(data.storeType || 'Sari-sari');
  const [storeAddress, setStoreAddress] = useState(data.storeAddress || 'Palm St., house 12, Salam district, Khobar');
  const [storePhone, setStorePhone] = useState(data.storePhone || '0771234567');
  const [license, setLicense] = useState(data.license && data.license.path ? data.license : null);
  const [storefront, setStorefront] = useState(data.storefront && data.storefront.path ? data.storefront : null);
  const [busy, setBusy] = useState('');
  const pick = (field, setter) => async () => {
    setBusy(field);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type:['image/*','application/pdf'], copyToCacheDirectory:true });
      if (!r || r.canceled || r.type === 'cancel') return;
      const a = r.assets && r.assets[0] ? r.assets[0] : r;
      const up = await uploadDoc(a.uri || r.uri, 'Vendor', field, a.name || r.name || field);
      setter({ name: a.name || r.name || field, ...up });
    } catch (e) { Alert.alert('Upload failed', String((e && e.message) || e)); } setBusy('');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 13.5, color: C.mute, letterSpacing: 1 }}>Step 1 of 1 - Store check</Text>
      <Text style={{ fontSize: 21, fontWeight: '900', color: C.ink, marginTop: 6 }}>{T(lang,'veKycTitle')}</Text>
      <Text style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.6 }}>{T(lang,'veKycSub')}</Text>
      <Card>
        <Text style={{ fontWeight: '800' }}>{T(lang,'storeName')}</Text>
        <TextInput value={storeName} onChangeText={setStoreName}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 6, color: C.ink }} />
        <Text style={{ fontWeight: '800', marginTop: 12 }}>{T(lang,'storeType')}</Text>
        <TextInput value={storeType} onChangeText={setStoreType}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 6, color: C.ink }} />
        <Text style={{ fontWeight: '800', marginTop: 12 }}>{T(lang,'storeAdr')}</Text>
        <TextInput value={storeAddress} onChangeText={setStoreAddress}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 6, color: C.ink }} />
        <Text style={{ fontWeight: '800', marginTop: 12 }}>{T(lang,'storePhone')}</Text>
        <TextInput value={storePhone} onChangeText={setStorePhone}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 6, color: C.ink }} />
      </Card>
      <Card>
        <Text style={{ fontWeight: '800' }}>{T(lang,'shDocs')}</Text>
        <M>{T(lang,'reviewOk')}</M>
        <UploadRow label={T(lang,'uploadLicense')} uploaded={!!license} busy={busy==='license'}
                   fileName={license && license.name} lang={lang}
                   onPick={pick('license', setLicense)} />
        <UploadRow label={T(lang,'uploadStorefront')} uploaded={!!storefront} busy={busy==='storefront'}
                   fileName={storefront && storefront.name} lang={lang}
                   onPick={pick('storefront', setStorefront)} />
      </Card>
      <Btn label={T(lang,'sendReview')}
        onPress={() => onSubmit({ storeName, storeType, storeAddress, storePhone, license, storefront, submittedAt: Date.now() })}
        disabled={!storeName || !storeType || !storeAddress || !storePhone || !license || !storefront} />
    </ScrollView>);
}

function UploadRow({ label, uploaded, onPick, busy, fileName, lang }) {
  return (
    <Pressable onPress={onPick} disabled={busy} style={{ flexDirection:'row', alignItems:'center',
      paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12,
      borderWidth: 1.5, borderStyle: uploaded ? 'solid' : 'dashed',
      borderColor: uploaded ? C.brand : C.line,
      backgroundColor: uploaded ? C.soft : '#fff', marginTop: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: uploaded ? C.brand : '#E3ECE8',
                     alignItems:'center', justifyContent:'center' }}>
        {busy ? <ActivityIndicator size="small" color={C.brand} /> : <Text style={{ fontSize: 19, color: uploaded ? '#fff' : C.ink, fontWeight:'900' }}>{uploaded ? 'v' : 'F'}</Text>}
      </View>
      <View style={{ flex: 1, marginLeft: 11 }}>
        <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13.5 }}>{label}</Text>
        <Text style={{ color: uploaded ? C.brand : C.mute, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
          {busy ? T(lang,'uploading')
           : uploaded ? T(lang,'uploaded') + ' ' + KYC_BUCKET + (fileName ? ' - ' + fileName : '')
           : T(lang,'pickTap')}
        </Text>
      </View>
    </Pressable>);
}

function LockedMessage({ lang, role, onKyc, onCancel }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ backgroundColor: '#FFF7E1', borderRadius: 16, padding: 18, borderWidth: 1,
                     borderColor: C.gold, marginTop: 6 }}>
        <Text style={{ fontSize: 22 }}>L</Text>
        <H>{T(lang,'locked')}</H>
        <M>{T(lang,'lockedB', { r: role === 'Shopper' ? 'Shopper' : 'Store' })}</M>
        <Btn label={T(lang,'doKycNow')} onPress={onKyc} />
        <Btn kind="ghost" label={T(lang,'backToSet')} onPress={onCancel} />
      </View>
      <View style={{ marginTop: 14 }}>
        <Card>
          <Text style={{ fontWeight: '800', color: C.ink }}>{T(lang,'whyKyc')}</Text>
          <M>{T(lang,'whyKycB')}</M>
        </Card>
      </View>
    </ScrollView>);
}

function PendingScreen({ lang, role, live, data, onSimulateAdmin, onBackToRole, onEdit }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ backgroundColor: '#FFF7E1', borderRadius: 18, padding: 18, alignItems:'center',
                     borderWidth:1, borderColor: C.gold }}>
        <Text style={{ fontSize: 32, fontWeight:'900' }}>P</Text>
        <H>{T(lang,'pendingTitle')}</H>
        <M style={{ textAlign:'center' }}>{T(lang,'pendingSub')}</M>
        <Pressable onPress={onEdit}
          style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
                   borderWidth: 1.5, borderColor: C.brand }}>
          <Text style={{ color: C.brand, fontWeight:'800' }}>{T(lang,'pendingEdit')}</Text>
        </Pressable>
      </View>
      {!live && (
        <View style={{ backgroundColor: '#EFEAF8', borderRadius: 18, padding: 18, marginTop: 14 }}>
          <Text style={{ fontWeight: '800', color: '#5b3aa8' }}>{T(lang,'previewMode')}</Text>
          <M>{T(lang,'previewB')}</M>
          <Btn label={T(lang,'simApprove')} onPress={onSimulateAdmin} kind="ghost" />
          <Btn kind="bad" label={T(lang,'backToSet')} onPress={onBackToRole} />
        </View>)}
      {live && (
        <View style={{ backgroundColor: '#EFEAF8', borderRadius: 18, padding: 18, marginTop: 14 }}>
          <Text style={{ fontWeight: '800', color: '#5b3aa8' }}>{T(lang,'liveMode')}</Text>
          <M>{T(lang,'liveB', { b: KYC_BUCKET, t: 'kyc_requests' })}</M>
        </View>)}
    </ScrollView>);
}

function AdminScreen({ lang, kyc, onApprove, onReject, onBack, live }) {
  const [queue, setQueue] = useState(null);
  useEffect(() => { if (live) fetchKycQueue().then(setQueue); }, [live]);
  const decideLive = async (row, ok) => {
    try {
      await supabase.from('kyc_requests')
        .update({ status: ok ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', row.id);
    } catch {}
    setQueue((q) => (q || []).filter((x) => x.id !== row.id));
  };
  const roleOf = (v) => (v === 'shopper' ? 'Shopper' : v === 'vendor' ? 'Vendor' : v);
  return (
    <View style={{ flex:1 }}>
      <View style={{ flexDirection:'row', padding: 16, paddingTop: 40, backgroundColor:'#5b3aa8',
                     alignItems:'center' }}>
        <Pressable onPress={onBack} style={{ paddingVertical: 4, paddingHorizontal: 6 }}>
          <Text style={{ color:'#fff', fontWeight:'800' }}>{'< ' + T(lang,'backToSet')}</Text>
        </Pressable>
        <Text style={{ flex:1, textAlign: 'center', color:'#fff', fontWeight:'900', fontSize: 17 }}>{'A ' + T(lang,'adminTitle')}</Text>
        <View style={{ width: 70 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: '#EFEAF8', borderRadius: 14, padding: 12, marginBottom: 14 }}>
          <Text style={{ color: '#5b3aa8', fontWeight: '800', fontSize: 13 }}>
            {live ? T(lang,'adminLive') : T(lang,'adminSim')}</Text>
          <Text style={{ color: '#473068', fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
            {live ? T(lang,'adminLiveB') : T(lang,'adminSimB')}</Text>
        </View>
        {live && queue === null && <Text style={{ color: C.mute, textAlign:'center', padding: 20 }}>{T(lang,'refilling')}</Text>}
        {live && queue && queue.length === 0 && (
          <Card><H>{T(lang,'noKycPending')}</H><M>{T(lang,'noKycSub')}</M></Card>)}
        {live && queue && queue.map((row) => {
          const r = roleOf(row.role); const d = row.data || {};
          return (
            <View key={row.id} style={{ marginTop: 8, backgroundColor: C.card, borderRadius: 18, padding: 14,
              shadowColor:'#000', shadowOpacity:0.04, shadowRadius:8, elevation:2 }}>
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: C.brand }}>{r[0]}</Text>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>{r}</Text>
              </View>
              <M>{d.vehicleType || d.storeName || 'Pending document check'}</M>
              <View style={{ flexDirection:'row', marginTop: 10 }}>
                <Pressable onPress={() => decideLive(row, true)}
                  style={{ flex:1, paddingVertical: 11, borderRadius: 12, backgroundColor: C.brand,
                           marginRight: 5, alignItems:'center' }}>
                  <Text style={{ color:'#fff', fontWeight: '800' }}>{T(lang,'approve')}</Text>
                </Pressable>
                <Pressable onPress={() => decideLive(row, false)}
                  style={{ flex:1, paddingVertical: 11, borderRadius: 12, borderWidth:1.5,
                           borderColor: C.bad, marginLeft: 5, alignItems:'center' }}>
                  <Text style={{ color: C.bad, fontWeight: '800' }}>{T(lang,'reject')}</Text>
                </Pressable>
              </View>
            </View>);
        })}
        {!live && ['Shopper','Vendor'].map((role) => {
          const rec = kyc[role]; const status = rec && rec.status;
          return (
            <View key={role} style={{ marginTop: 8, backgroundColor: C.card, borderRadius: 18, padding: 14 }}>
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight:'900', color: C.brand }}>{role[0]}</Text>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>{role}</Text>
              </View>
              <KycBadge status={status} />
              <View style={{ flexDirection:'row', marginTop: 10 }}>
                <Pressable onPress={() => onApprove(role)}
                  style={{ flex:1, paddingVertical: 11, borderRadius: 12, backgroundColor: C.brand,
                           marginRight: 5, alignItems:'center' }}>
                  <Text style={{ color:'#fff', fontWeight: '800' }}>{T(lang,'approve')}</Text>
                </Pressable>
                <Pressable onPress={() => onReject(role)}
                  style={{ flex:1, paddingVertical: 11, borderRadius: 12, borderWidth:1.5,
                           borderColor: C.bad, marginLeft: 5, alignItems:'center' }}>
                  <Text style={{ color: C.bad, fontWeight: '800' }}>{T(lang,'reject')}</Text>
                </Pressable>
              </View>
            </View>);
        })}
      </ScrollView>
    </View>);
}

function Shopper({ lang, name, onSettings, onKyc }) {
  const [showLocked, setShowLocked] = useState(true);
  const { s } = useOrder();
  if (showLocked) return <LockedMessage lang={lang} role="Shopper"
                                        onKyc={() => { setShowLocked(false); onKyc(); }}
                                        onCancel={onSettings} />;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal: 16, paddingVertical: 16 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor:'#E3ECE8',
                       alignItems:'center', justifyContent:'center' }}>
          <Text style={{ fontSize: 18, fontWeight:'900', color: C.brand }}>M</Text>
        </View>
        <View style={{ flex:1, marginHorizontal: 10 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight:'800', color: C.ink }}>{name}</Text>
          <Text style={{ fontSize: 11.5, color: C.brand, marginTop: 2 }}>{'S ' + T(lang,'dropACt')}</Text>
        </View>
        <Pressable onPress={onSettings} style={{ padding: 6 }}>
          <Text style={{ fontSize: 22, color: C.mute }}>g</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 22, fontWeight:'900', color: C.ink }}>{T(lang,'shHeading')}</Text>
        {(s.step === 'idle' || !s.step) && (
          <Card><H>-</H><M>No offers yet. New offers show up here.</M></Card>)}
        {s.step === 'offer' && (
          <View>
            <Card>
              <Text style={{ fontWeight:'900' }}>Corner store - Sari-sari</Text>
              <M>{s.text || '[Grocery] 2 kg rice, 1 bottle tomato, 3 eggs'}</M>
              <M>{P(s.price) + ' + fee ' + P(s.fee)}</M>
            </Card>
          </View>)}
      </View>
    </ScrollView>);
}

function Vendor({ lang, onSettings, onKyc }) {
  const [showLocked, setShowLocked] = useState(true);
  if (showLocked) return <LockedMessage lang={lang} role="Vendor"
                                        onKyc={() => { setShowLocked(false); onKyc(); }}
                                        onCancel={onSettings} />;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <Text style={{ fontSize: 20, fontWeight:'900' }}>Corner store - Sari-sari</Text>
        <Text style={{ color: C.brand, fontWeight:'900', marginTop: 4 }}>{'v ' + T(lang,'dropACt')}</Text>
        <Btn kind="ghost" label={T(lang,'settings')} onPress={onSettings} />
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
        <Card><H>{T(lang,'veIdle')}</H><M>Refresh the queue anytime.</M></Card>
      </View>
    </ScrollView>);
}

// ============ Shell ============
function Shell() {
  const [lang, setLang] = useLang();
  const { error, setRole: setRoleRpc } = useOrder();
  const [auth, setAuth] = useState(null);
  const [kyc, setKyc] = useState({});
  const [role, setLocal] = useState('Customer');
  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState('boot');
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingOtp, setPendingOtp] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    if (!HAS_SB) return;
    let ch;
    (async () => {
      const uid = await sbUserId(); if (!uid) return;
      ch = supabase.channel('kyc-live')
        .on('postgres_changes', { event:'*', schema:'public', table:'kyc_requests', filter:'user_id=eq.'+uid },
            (payload) => {
              const row = payload.new || {};
              const r = row.role === 'shopper' ? 'Shopper' : row.role === 'vendor' ? 'Vendor' : null;
              if (!r) return;
              setKyc((k) => ({ ...k, [r]: { status: row.status, data: (k[r] && k[r].data) || row.data || {} } }));
              if (row.status === 'approved') setScreen((sc) => (sc === 'pending' || sc === 'kyc' ? 'app' : sc));
            }).subscribe();
    })();
    return () => { try { if (ch) supabase.removeChannel(ch); } catch {} };
  }, []);

  useEffect(() => {
    if (!HAS_SB) {
      try { Alert.alert('Setup needed', 'Supabase keys are missing. Add them in App.js (SUPABASE_URL / SUPABASE_ANON_KEY) or via GitHub Secrets.'); } catch (e) {}
    }
    (async () => {
      try {
        const a = await loadAuth();
        const v = await syncKycFromDb(await loadKyc());
        const r = await loadRole();
        setAuth(a); setKyc(v || {}); setLocal(r);
        try { await setRoleRpc(r.toLowerCase()); } catch {}
        if (!a) { setScreen('phone'); return; }
        if (!a.verified) { setPendingPhone(a.phone || ''); setScreen('otp'); return; }
        routeAfterRole(r);
      } catch (e) {
        console.warn('Boot fall-through to phone:', e && e.message);
        setScreen('phone');
      }
    })();
  }, []);

  async function persistKyc(next) { await saveKyc(next); }
  async function routeAfterRole(r) {
    setLocal(r); await saveRole(r);
    try { await setRoleRpc(r.toLowerCase()); } catch {}
    if (r === 'Customer') {
      const k = { ...kyc, customer: { status: 'approved', data: { automatic: true } } };
      setKyc(k); await persistKyc(k); setScreen('app');
    } else if (kyc[r] && kyc[r].status === 'approved') setScreen('app');
    else if (kyc[r] && kyc[r].status === 'pending') setScreen('pending');
    else setScreen('kyc');
  }
  async function submitKyc(r, data) {
    const next = { ...kyc, [r]: { status: 'pending', data } };
    setKyc(next); await persistKyc(next);
    const res = await pushKyc(r, 'pending', data);
    setScreen('pending');
    if (res && res.error) {
      const m = (res.error && res.error.message) || String(res.error);
      Alert.alert('Sync failed', 'Saved on this device, but Supabase rejected it: ' + m + '\n\nFix: run supabase-fix.sql in the Supabase SQL Editor (profiles trigger + unique constraint), then resend.');
    }
  }
  async function adminApprove(r) {
    const next = { ...kyc, [r]: { status:'approved',
      data: { ...(kyc[r] && kyc[r].data || {}), approvedAt: Date.now() }, approvedBy: 'simulated_admin' } };
    setKyc(next); await persistKyc(next);
  }
  async function adminReject(r) {
    const next = { ...kyc, [r]: { status:'rejected', data: kyc[r] && kyc[r].data } };
    setKyc(next); await persistKyc(next);
  }

  if (screen === 'boot') {
    return <SafeAreaView style={{ flex:1, backgroundColor: C.bg }}>
      <View style={{ padding: 24, paddingTop: 80 }}>
        <Text style={{ fontSize: 32, fontWeight:'900', color: C.brand }}>{T(lang,'brand')} .</Text>
        <Text style={{ color: C.mute, marginTop: 8 }}>{T(lang,'refilling')}</Text>
        {!!error && <Text style={{ color: C.bad, marginTop: 12 }}>{error}</Text>}
      </View>
    </SafeAreaView>;
  }
  async function submitPhone(p) {
    setLoginError('');
    setLoginBusy(true);
    let cleaned = '';
    try {
      cleaned = normalizeDigits(p);
      if (!cleaned || cleaned.length < 9) {
        const msg = !cleaned
          ? 'Please enter a valid phone number.'
          : `Phone number too short — you entered ${cleaned.length} digits, need at least 9.`;
        setLoginError(msg);
        if (Alert && Alert.alert) Alert.alert('Phone number', msg);
        return;
      }
      // 1) ALWAYS transition to OTP first (UX never blocks on network).
      const saved = { phone: cleaned, verified: false };
      await saveAuth(saved);
      setAuth(saved);
      setPendingPhone(cleaned);
      setPendingOtp('');
      setScreen('otp');
      if (Alert && Alert.alert) Alert.alert('OTP sent', 'Use 1234 as the verification code.');

      // 2) Then attempt live Supabase auth in background (best-effort).
      if (!HAS_SB) return;
      try {
        const phone = '+966' + cleaned;
        const hasOtp = typeof supabase.auth.signInWithOtp === 'function';
        const call = hasOtp
          ? supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } })
          : supabase.auth.signInAnonymously();
        const res = await Promise.race([
          call,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
        if (res && res.error) {
          // Don't block the user — just note it for debugging.
          console.warn('[auth]', res.error.message);
        }
      } catch (innerErr) {
        // Graceful: phone provider not enabled → we already showed OTP screen.
        console.warn('[auth-background]', (innerErr && innerErr.message) || innerErr);
      }
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      setLoginError('Login error: ' + msg);
      if (Alert && Alert.alert) Alert.alert('Login error', msg);
    } finally {
      setLoginBusy(false);
    }
  }

  async function submitOtp(code) {
    setLoginError('');
    const entered = String(code || '').trim();
    if (entered !== '1234') {
      const msg = 'Wrong code — use 1234.';
      setLoginError(msg);
      Alert.alert('Wrong code', msg);
      return;
    }
    setLoginBusy(true);
    try {
      const saved = { phone: pendingPhone || (auth && auth.phone) || '', verified: true };
      await saveAuth(saved); setAuth(saved);
      routeAfterRole(role);
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      setLoginError('Network error: ' + msg);
      Alert.alert('Network error', msg);
    } finally {
      setLoginBusy(false);
    }
  }

  if (screen === 'phone') return (
    <LoginScreen lang={lang} mode="phone"
      phone={pendingPhone} setPhone={setPendingPhone}
      onPhoneSubmit={submitPhone}
      busy={loginBusy} loginError={loginError} />
  );
  if (screen === 'otp') return (
    <LoginScreen lang={lang} mode="otp"
      phone={pendingPhone}
      otp={pendingOtp} setOtp={setPendingOtp}
      onOtpSubmit={submitOtp}
      onResendOtp={async () => { setPendingOtp(''); setLoginError(''); }}
      busy={loginBusy} loginError={loginError} />
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: C.bg }}>
      {screen === 'admin' && (
        <AdminScreen lang={lang} kyc={kyc} live={HAS_SB}
          onApprove={async (r) => { await adminApprove(r); setScreen('app'); }}
          onReject={async (r) => { await adminReject(r); }}
          onBack={() => setScreen('app')} />)}

      {screen !== 'admin' && (
        <>
          {tab === 'home'  && <HomeTab lang={lang} />}
          {tab === 'orders' && <OrdersTab lang={lang} />}
          {tab === 'notes' && <UpdatesTab lang={lang} />}
          {tab === 'profile' && <ProfileTab lang={lang} onOpen={() => setDrawer(true)} />}
          <BottomNav tab={tab} setTab={setTab} lang={lang} />
        </>)}

      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>{T(lang,'setTitle')}</Text>
        <M>{T(lang,'setSub')}</M>
        <Card>
          <Text style={{ color: C.mute, fontSize: 12.5 }}>Phone</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, marginTop: 2 }}>
            +966 {(auth && auth.phone) || '—'}</Text>
        </Card>
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontWeight: '900', color: C.ink }}>{T(lang,'language')}</Text>
          <View style={{ flexDirection:'row', marginTop: 8 }}>
            {LANG_PILLS.map((p) => (
              <Pressable key={p.k} onPress={() => setLang(p.k)}
                style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18,
                         borderWidth: 1, borderColor: lang === p.k ? C.brand : C.line,
                         backgroundColor: lang === p.k ? C.soft : '#fff', marginRight: 8 }}>
                <Text style={{ color: lang === p.k ? C.brand : C.ink,
                               fontWeight: '800', fontSize: 12.5 }}>{p.label}</Text>
              </Pressable>))}
          </View>
        </View>
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontWeight: '900', color: C.ink }}>{T(lang,'acctType')}</Text>
          <View style={{ marginTop: 4 }}>
            <RoleSwitch role={role} setDrag={(r) => {
              if (r === role) return;
              setDrawer(false); routeAfterRole(r);
            }} lang={lang} />
          </View>
        </View>
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 8,
                        borderWidth:1, borderColor: C.line }}>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <Text style={{ fontWeight: '800', fontSize: 14.5 }}>Wallet</Text>
          </View>
          <Text style={{ fontSize: 16, color: C.ink, fontWeight: '800', marginTop: 6 }}>P 0.0</Text>
        </View>
        <Btn kind="ghost" label={T(lang,'logout')} onPress={async () => {
          await AsyncStorage.multiRemove([AUTH_KEY, KYC_KEY]);
          setAuth(null); setScreen('phone'); setDrawer(false);
        }} />
        <Btn kind="ghost" label={T(lang,'admin')} onPress={() => { setDrawer(false); setScreen('admin'); }} />
        <Text style={{ marginTop: 18, color: C.mute, fontSize: 11, textAlign:'center' }}>v5.0 - en / tl</Text>
      </Drawer>

      {!!error && <Text style={{ color: C.bad, padding: 14, textAlign:'center' }}>{error}</Text>}
    </SafeAreaView>);
}

export default function App() {
  return <OrderProvider><Shell /></OrderProvider>;
}
