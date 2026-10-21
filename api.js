// V9 high-level API: same Supabase-or-Local split; added withdrawal/cart helpers.
import { supabase, SUPABASE_ENABLED, SCHEMA_SQL } from './supabase';
import { registerPush, notify, PUSH_KEY_GUIDE } from './notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LS_KEY = 'pabili.ph.v1';

export async function sendOtp(phone) {
  if (SUPABASE_ENABLED) { const { error } = await supabase.auth.signInWithOtp({ phone }); if (error) throw error; return { ok: true, live: true }; }
  return { ok: true, live: false, devCodes: { user: '2067', admin: '1785' } };
}
export async function verifyOtp(phone, code) {
  if (SUPABASE_ENABLED) { const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' }); if (error) throw error; return { ok: true, profile: data?.user || null }; }
  return { ok: code === '2067' || code === '1785' };
}

async function loadLocal() { const raw = await AsyncStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
async function saveLocal(s) { await AsyncStorage.setItem(LS_KEY, JSON.stringify(s)); }

export async function fetchOrders(phone) {
  if (SUPABASE_ENABLED) { const { data, error } = await supabase.from('orders').select('*').or(`customer_phone.eq.${phone},vendor_phone.eq.${phone},driver_phone.eq.${phone}`); if (error) throw error; return data || []; }
  const s = await loadLocal(); return s?.orders || [];
}
export async function createOrder(payload) {
  if (SUPABASE_ENABLED) { const { data, error } = await supabase.from('orders').insert(payload).select().single(); if (error) throw error; return data; }
  return null;
}
export async function updateOrder(id, patch) {
  if (SUPABASE_ENABLED) { const { error } = await supabase.from('orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); if (error) throw error; return { ok: true }; }
  return null;
}

// V9: withdrawal live wiring (server-side).
export async function submitWithdrawal({ amount, provider, accountLabel, kind }) {
  if (SUPABASE_ENABLED) {
    const session = (await supabase.auth.getSession()).data.session;
    const phone = session?.user?.phone || 'anon';
    const { error } = await supabase.from('withdrawals').insert({ user_phone: phone, amount, provider, account_label: accountLabel, status: 'pending', kind });
    if (error) throw error;
    // server-side hold runs in the Edge Function fired by the trigger.
    return { ok: true };
  }
  return { ok: false };
}
export async function approveWithdrawal(id) {
  if (SUPABASE_ENABLED) {
    const { error } = await supabase.from('withdrawals').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id); if (error) throw error;
    await supabase.from('audit_log').insert({ action: 'WITHDRAWAL_APPROVED', detail: id });
    return { ok: true };
  }
  return null;
}
export async function payWithdrawal(id) {
  if (SUPABASE_ENABLED) {
    // Edge Function "payWithdrawal" actually calls the rails.
    // Until provider keys are loaded, this updates status to paid_stub.
    const { error } = await supabase.functions.invoke('payWithdrawal', { body: { id } });
    if (error) throw error;
    return { ok: true };
  }
  return null;
}

// V9: push helpers
export async function initPush() { return await registerPush(); }
export async function inAppNotify(t, b) { return await notify(t, b); }

export async function adminAdjustWallet(targetPhone, amount, reason, byPhone) {
  if (SUPABASE_ENABLED) {
    await supabase.from('wallet_tx').insert({ user_phone: targetPhone, amount, kind: 'admin_adjust', reason, created_by: byPhone });
    await supabase.from('profiles').update({ wallet_balance: amount }).eq('phone', targetPhone);
    await supabase.from('audit_log').insert({ action: 'WALLET_ADJUST', detail: `${amount} PHP (${reason})`, by_phone: byPhone });
    return { ok: true };
  }
  return { ok: false };
}

// V16: profile sync (name + avatar) and making sure a profiles row exists (driver_locations,
// kyc_requests, orders all reference profiles(phone)).
export async function ensureProfile(phone) {
  if (!SUPABASE_ENABLED || !phone) return;
  try { await supabase.from('profiles').upsert({ phone }, { onConflict: 'phone', ignoreDuplicates: true }); } catch (e) { /* offline */ }
}
export async function loadProfileRemote(phone) {
  if (!SUPABASE_ENABLED || !phone) return null;
  try {
    const { data } = await supabase.from('profiles').select('name,avatar_url').eq('phone', phone).maybeSingle();
    return data || null;
  } catch (e) { return null; }
}
export async function saveProfileRemote(phone, patch) {
  if (!SUPABASE_ENABLED || !phone) return { ok: false, error: 'offline' };
  const { error } = await supabase.from('profiles').upsert({ phone, ...patch }, { onConflict: 'phone' });
  if (error) {
    const m = String(error.message || error);
    throw new Error(/avatar_url/.test(m) ? 'Column avatar_url is missing — run pabili-sql/setup-04-v16.sql in Supabase.' : m);
  }
  return { ok: true };
}

export const backend = {
  enabled: SUPABASE_ENABLED,
  schemaSql: SCHEMA_SQL,
  pushKeyGuide: PUSH_KEY_GUIDE,
};
