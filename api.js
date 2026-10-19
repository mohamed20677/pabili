// Pabili PH — high-level API: aggregates Supabase + local engine fallback.
// Single import for the rest of the app: `import { pabiliApi } from './api';`
import { supabase, SUPABASE_ENABLED, SCHEMA_SQL, uploadOrderPhoto } from './supabase';
import { registerPush, notify } from './notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LS_KEY = 'pabili.ph.v1';

// ---------- AUTH ----------
export async function sendOtp(phone) {
  if (SUPABASE_ENABLED) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
    return { ok: true, live: true };
  }
  // Mock: 2067 for users, 1785 for admin (V8: user code changed from 1234 to 2067)
  return { ok: true, live: false, devCodes: { user: '2067', admin: '1785' } };
}

export async function verifyOtp(phone, code) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error) throw error;
    return { ok: true, profile: data?.user || null };
  }
  // Dev fallback handled by Auth.js local logic
  return { ok: code === '2067' || code === '1785' };
}

// ---------- HYBRID ORDER STORE ----------
async function loadLocal() {
  const raw = await AsyncStorage.getItem(LS_KEY);
  return raw ? JSON.parse(raw) : null;
}
async function saveLocal(s) { await AsyncStorage.setItem(LS_KEY, JSON.stringify(s)); }

// Reads orders from Supabase if live, else from local AsyncStorage.
export async function fetchOrders(phone) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabase.from('orders').select('*').or(`customer_phone.eq.${phone},vendor_phone.eq.${phone},driver_phone.eq.${phone}`);
    if (error) throw error;
    return data || [];
  }
  const s = await loadLocal();
  return s?.orders || [];
}

export async function createOrder(payload) {
  if (SUPABASE_ENABLED) {
    const { data, error } = await supabase.from('orders').insert(payload).select().single();
    if (error) throw error;
    return data;
  }
  // Local: handled by store.js placeOrder action
  return null;
}

export async function updateOrder(id, patch) {
  if (SUPABASE_ENABLED) {
    const { error } = await supabase.from('orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { ok: true };
  }
  return null;
}

// ---------- REALTIME ----------
export function subscribeOrders(phone, onChange) {
  if (!SUPABASE_ENABLED) return () => {};
  const ch = supabase.channel('orders-' + phone)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      onChange && onChange(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ---------- KYC ----------
export async function submitKyc(phone, role, data) {
  if (SUPABASE_ENABLED) {
    const { error } = await supabase.from('kyc_requests').insert({ user_phone: phone, role, data, status: 'pending' });
    if (error) throw error;
    return { ok: true };
  }
  return { ok: false, live: false };
}

// ---------- PUSH ----------
export async function initPush() { return await registerPush(); }
export async function inAppNotify(t, b) { return await notify(t, b); }

// ---------- ADMIN (audit log + wallet adjust) ----------
export async function adminAdjustWallet(targetPhone, amount, reason, byPhone) {
  if (SUPABASE_ENABLED) {
    await supabase.from('wallet_tx').insert({ user_phone: targetPhone, amount, kind: 'admin_adjust', reason, created_by: byPhone });
    await supabase.from('profiles').update({ wallet_balance: amount }).eq('phone', targetPhone);
    await supabase.from('audit_log').insert({ action: 'WALLET_ADJUST', detail: `${amount} PHP (${reason})`, by_phone: byPhone });
    return { ok: true };
  }
  return { ok: false };
}

export const backend = {
  enabled: SUPABASE_ENABLED,
  schemaSql: SCHEMA_SQL,
  uploadOrderPhoto,
};
