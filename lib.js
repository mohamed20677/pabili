import 'react-native-url-polyfill/auto';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export const C = { green: '#0E7C5B', sun: '#F2B531', ink: '#17231E', paper: '#F6F8F5', card: '#FFFFFF', line: '#DCE5DF', mute: '#6B7A72', bad: '#C0392B' };

// ---- language: the English text is the key; Tagalog where translated, English otherwise ----
const TL = {
  Home: 'Home', Orders: 'Mga Order', Profile: 'Profile', Jobs: 'Mga trabaho', Wallet: 'Wallet', Promos: 'Mga promo', Store: 'Store',
  'Order anything': 'Mag-order ng kahit ano', 'Send anything': 'Magpadala ng kahit ano', 'Close to you': "Malapit sa'yo",
  'Sari-sari stores': 'Sari-sari store', Grocery: 'Grocery', Restaurants: 'Restawran', 'Place order': 'I-place ang order',
  'Approve and continue': 'Aprubahan at ituloy', 'Pay now': 'Magbayad ngayon', Accept: 'Tanggapin', Refuse: 'Tanggihan',
  Counter: 'Mag-counter', 'Log out': 'Mag-log out', 'Confirm delivery': 'Kumpirmahin ang delivery', 'Cancel order': 'Kanselahin ang order',
  'Delivery fee': 'Bayad sa delivery', Send: 'Ipadala', Reorder: 'Mag-order ulit', Language: 'Wika', Total: 'Kabuuan', Items: 'Mga item',
  'Finding a shopper…': 'Humahanap ng shopper…', 'Waiting for the store to confirm stock and price': 'Naghihintay sa store na kumpirmahin ang stock at presyo',
  'Rate your driver': 'I-rate ang iyong driver', Delivered: 'Na-deliver na',
};
export const LangCtx = createContext({ lang: 'en', setLang: () => {} });
export const useT = () => { const { lang } = useContext(LangCtx); return (s) => (lang === 'tl' && TL[s]) || s; };

export const STATUS = {
  pending_vendor: 'Waiting for the store', quoted: 'Review the store quote', finding_driver: 'Finding a shopper',
  awaiting_payment: 'Awaiting payment', paid: 'Paid - heading to the store', picked_up: 'On the way',
  delivered: 'Delivered - please confirm', completed: 'Completed', cancelled: 'Cancelled',
};

// ---- helpers ----
export const peso = (n) => '₱' + Number(n || 0).toFixed(2).replace(/\.00$/, '');
const rad = (d) => (d * Math.PI) / 180;
export function kmBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export const fmtKm = (k) => (k == null ? '' : k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1)} km`);

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function run(fn, setBusy) {
  try { if (setBusy) setBusy(true); return await fn(); }
  catch (e) { Alert.alert('Something went wrong', (e && e.message) || String(e)); }
  finally { if (setBusy) setBusy(false); }
}

export async function getPos() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission is needed.');
  const p = await Location.getCurrentPositionAsync({});
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}
export async function geocode(text) {
  const r = await Location.geocodeAsync(text || '');
  if (!r.length) throw new Error('Address not found. Add the barangay and town.');
  return { lat: r[0].latitude, lng: r[0].longitude };
}

// Take/pick a photo and upload it. 'photos' bucket returns a public URL; 'kyc' returns the private path.
export async function pickPhoto(bucket, camera) {
  const { data: { user } } = await supabase.auth.getUser();
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Permission is needed to continue.');
  const opts = { quality: 0.6, mediaTypes: ['images'] };
  const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled) return null;
  const buf = await (await fetch(r.assets[0].uri)).arrayBuffer();
  const path = `${user.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: 'image/jpeg' });
  if (error) throw error;
  return bucket === 'photos' ? supabase.storage.from('photos').getPublicUrl(path).data.publicUrl : path;
}

// load() runs now and again whenever any of the listed tables change (Realtime respects RLS).
export function useLive(load, tables, deps) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => { try { setData(await load()); } catch (e) { console.warn(e.message); } }, deps);
  useEffect(() => {
    reload();
    const ch = supabase.channel('live-' + Math.random().toString(36).slice(2));
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, reload));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);
  return [data, reload];
}
export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setN(Date.now()), ms); return () => clearInterval(h); }, [ms]);
  return n;
}

// ---- small UI kit ----
export const Txt = ({ s, b, c, style, ...p }) => <Text {...p} style={[{ fontSize: s || 15, color: c || C.ink, fontWeight: b ? '700' : '400' }, style]} />;
export const Card = ({ style, ...p }) => <View {...p} style={[st.card, style]} />;
export const Field = ({ style, ...p }) => <TextInput placeholderTextColor={C.mute} {...p} style={[st.field, style]} />;
export const Btn = ({ title, onPress, kind, busy, disabled, style }) => (
  <Pressable onPress={onPress} disabled={busy || disabled} style={[st.btn, kind === 'ghost' && st.ghost, kind === 'danger' && st.danger, (busy || disabled) && { opacity: 0.5 }, style]}>
    {busy ? <ActivityIndicator color={kind === 'ghost' ? C.green : '#fff'} /> : <Txt b c={kind === 'ghost' ? C.green : '#fff'}>{title}</Txt>}
  </Pressable>
);
export const Chip = ({ label, on, onPress }) => (
  <Pressable onPress={onPress} style={[st.chip, on && { backgroundColor: C.green, borderColor: C.green }]}><Txt s={13} c={on ? '#fff' : C.ink}>{label}</Txt></Pressable>
);
export const Screen = ({ title, onBack, children }) => (
  <View style={{ flex: 1 }}>
    <View style={st.head}>
      {onBack ? <Pressable onPress={onBack} hitSlop={12}><Txt s={22}>‹</Txt></Pressable> : null}
      <Txt s={18} b style={{ marginLeft: onBack ? 10 : 0 }}>{title}</Txt>
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </View>
);
export const TabBar = ({ tabs, tab, onTab }) => (
  <View style={st.tabs}>
    {tabs.map(([k, label]) => (
      <Pressable key={k} onPress={() => onTab(k)} style={st.tab}>
        <Txt s={13} b={tab === k} c={tab === k ? C.green : C.mute}>{label}</Txt>
        {tab === k ? <View style={st.dot} /> : null}
      </Pressable>
    ))}
  </View>
);
export const Stars = ({ value, onChange }) => (
  <View style={{ flexDirection: 'row' }}>
    {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => onChange(n)}><Txt s={30} c={n <= value ? C.sun : C.line}>★</Txt></Pressable>)}
  </View>
);

// Language + sign out (shared by every role)
export function Me({ profile, onSignOut, children }) {
  const t = useT();
  const { lang, setLang } = useContext(LangCtx);
  return (
    <Screen title={t('Profile')}>
      <Card>
        <Txt b>{profile.full_name}</Txt>
        <Txt c={C.mute}>{profile.phone}</Txt>
      </Card>
      {children}
      <Card>
        <Txt b style={{ marginBottom: 8 }}>{t('Language')}</Txt>
        <View style={{ flexDirection: 'row' }}>
          <Chip label="English" on={lang === 'en'} onPress={() => setLang('en')} />
          <Chip label="Tagalog" on={lang === 'tl'} onPress={() => setLang('tl')} />
        </View>
      </Card>
      <Btn kind="ghost" title={t('Log out')} onPress={onSignOut} />
    </Screen>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  field: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink, marginBottom: 10 },
  btn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.green },
  danger: { backgroundColor: C.bad },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#fff' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.green, marginTop: 4 },
});
