// My Page (V15 = V8 full features restored + V9 grafts).
// Restored in V15: KycForm with CategoryPicker, RoleDialog, AlertsTab,
// Register-my-store / switch-mode buttons, language switcher, coupons —
// these were stubbed out in V9–V14 builds; that is the regression the user hit.
// V9 grafts kept: WithdrawScreen (PH rails), saved-addresses with default flag.
import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, View } from 'react-native';
import { C, CATEGORIES, LangCtx, peso, useT, WITHDRAWAL_PROVIDERS } from './lib';
import { useStore } from './store';
import { Btn, Card, Field, Row, Section, Txt } from './ui';
import { BUCKETS, takeDocPhoto } from './media';
import { saveProfileRemote } from './api';

// which Storage bucket each KYC document goes to
const DOC_BUCKET = { license: BUCKETS.license, selfie: BUCKETS.selfie, permit: BUCKETS.store, front: BUCKETS.store };

// -------- reusable category picker (same source as app service menus) --------
function CategoryPicker({ value, onPick }) {
  return (
    <View>
      <Txt s={12} c={C.mute} style={{ marginBottom: 6 }}>Category * <Txt s={10} c={C.mute}>(drives which customer list your store appears in)</Txt></Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {CATEGORIES.map((c2) => {
          const active = value === c2;
          return (
            <Pressable key={c2} onPress={() => onPick(c2)}
              style={{ borderWidth: 1.5, borderColor: active ? C.green : C.line, borderRadius: 18,
                       paddingVertical: 7, paddingHorizontal: 12, marginRight: 8, marginBottom: 8,
                       backgroundColor: active ? '#EAF3EF' : '#fff' }}>
              <Txt s={12} b={active} c={active ? C.green : C.ink}>{c2}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AlertsTab() {
  const { s } = useStore();
  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <Txt b s={20} style={{ marginBottom: 10 }}>🔔 Alerts</Txt>
      {s.alerts.length === 0 && <Txt c={C.mute} style={{ textAlign: 'center', marginTop: 60 }}>No alerts yet.</Txt>}
      {s.alerts.map((a) => (
        <Card key={a.id} style={{ marginBottom: 8, paddingVertical: 12 }}>
          <Txt s={13}>{a.text}</Txt>
          <Txt s={10} c={C.mute} style={{ marginTop: 3 }}>{new Date(a.ts).toLocaleString()}</Txt>
        </Card>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// V15: WithdrawScreen moved here as a local Modal — reachable from the wallet row.
export function WithdrawScreen({ onClose }) {
  const { s, requestWithdrawal } = useStore();
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('GCash');
  const [account, setAccount] = useState('');
  const cfg = WITHDRAWAL_PROVIDERS[provider];
  const v = Number(amount.replace(/[^0-9]/g, '')) || 0;
  const net = Math.max(0, v - (cfg ? cfg.fee : 0));
  const ok = false; // payouts connect to GCash / Maya in the next update — the wallet itself is already real
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={20}>‹ Back</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>💸 Withdraw to PH rails</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.85 }}>Balance: {peso(s.wallet.balance)}</Txt>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, padding: 14 }}>
        <Section title="1 · Choose a payout channel">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Object.entries(WITHDRAWAL_PROVIDERS).map(([k, c]) => (
              <Pressable key={k} onPress={() => setProvider(k)}
                style={{ borderWidth: 1.5, borderColor: provider === k ? C.green : C.line, borderRadius: 18,
                         paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, marginBottom: 10,
                         backgroundColor: provider === k ? '#EAF3EF' : '#fff' }}>
                <Txt s={13} b={provider === k} c={provider === k ? C.green : C.ink}>{k}</Txt>
                <Txt s={10} c={C.mute}>{c.kind} · min ₱{c.min} · fee ₱{c.fee}</Txt>
              </Pressable>
            ))}
          </View>
        </Section>
        <Section title="2 · Recipient account">
          <Field value={account} onChangeText={setAccount} placeholder={provider === 'GCash' ? 'GCash mobile number' : provider === 'Maya' ? 'Maya mobile number' : 'Bank account / bank name'} />
        </Section>
        <Section title="3 · Amount">
          <Field value={amount} onChangeText={(x) => setAmount(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad"
                 style={{ textAlign: 'center', fontSize: 22, fontWeight: '800' }} />
          <Txt s={11} c={C.mute} style={{ marginTop: 6 }}>min ₱{cfg.min} · fee ₱{cfg.fee} · you receive {peso(net)}</Txt>
        </Section>
        <Card style={{ marginTop: 8 }}>
          <Txt s={12} c={C.mute}>Real rails require provider keys in Supabase Edge Function secrets. Until then the admin marks payouts as <Txt b>paid-stub</Txt> — nothing pretends money moved.</Txt>
        </Card>
        <Card style={{ marginTop: 8, backgroundColor: '#FBF7EC' }}><Txt s={12}>Payouts are not connected yet. Your balance is real and safe in the wallet; withdrawals open in the next update.</Txt></Card>
        <Btn title={'🔒 Withdraw — coming next update'}
             disabled={!ok} onPress={() => { requestWithdrawal(v, provider, account); onClose(); }} />
        <Section title="📜 Recent withdrawals">
          {(s.wallet.withdrawals || []).slice(0, 6).map((w) => (
            <Card key={w.id} style={{ marginBottom: 8, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt b s={13}>{peso(w.amount + w.fee)} via {w.provider}</Txt>
                <Txt s={11} b c={w.status === 'paid_stub' ? C.green : w.status === 'rejected' ? C.bad : C.amber}>{w.status}</Txt>
              </View>
              <Txt s={11} c={C.mute}>{w.accountLabel || ''} · {new Date(w.createdAt).toLocaleString()}</Txt>
            </Card>
          ))}
          {(s.wallet.withdrawals || []).length === 0 && <Txt s={11} c={C.mute}>No withdrawals yet.</Txt>}
        </Section>
      </ScrollView>
    </View>
  );
}

function RoleDialog({ visible, onClose, onPick }) {
  const T = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <Card style={{ width: '100%', padding: 22 }}>
          <Txt b s={18}>{T('switchTitle')}</Txt>
          <Txt s={13} c={C.mute} style={{ marginTop: 10, lineHeight: 19 }}>{T('switchBody')}</Txt>
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <Btn title={T('switchDo')} onPress={onPick} style={{ flex: 1, marginRight: 8, marginTop: 0 }} />
            <Btn kind="ghost" title={T('back')} onPress={onClose} style={{ flex: 1, marginTop: 0 }} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

function KycForm({ role, onDone }) {
  const { submitKyc, s } = useStore();
  const [upl, setUpl] = useState(null);
  const isDriver = role === 'driver';
  const [d, setD] = useState(isDriver
    ? { vehicle: 'Motorbike', model: 'Honda Click 125', plate: '', license: null, selfie: null }
    : { store: '', type: CATEGORIES[0], area: '', address: '', permit: null, front: null });
  const set = (k, v) => setD((p) => ({ ...p, [k]: v })); // functional: typing during an upload must not be lost
  const need = isDriver ? ['plate', 'license', 'selfie'] : ['store', 'type', 'address', 'permit', 'front'];
  const ready = need.every((k) => d[k]);
  const snapDoc = async (k) => {
    setUpl(k);
    try {
      const url = await takeDocPhoto({ kind: k, owner: s.auth && s.auth.phone, bucket: DOC_BUCKET[k] });
      if (url) set(k, url);
    } finally { setUpl(null); }
  };
  const DocBtn = ({ k, label }) => (
    <View>
      <Btn small kind={d[k] ? 'ghost' : 'main'} busy={upl === k}
           title={d[k] ? '✓ Uploaded — tap to retake' : '📷 ' + label} onPress={() => snapDoc(k)} />
      {d[k] ? <Image source={{ uri: d[k] }} resizeMode="cover" style={{ width: '100%', height: 110, borderRadius: 10, marginTop: 6 }} /> : null}
    </View>
  );
  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.paper, padding: 16 }}>
      <Card style={{ borderTopWidth: 4, borderTopColor: C.green }}>
        <Txt b s={18}>{isDriver ? '🛵 Driver verification' : '🏪 Store verification'}</Txt>
        <Txt s={12} c={C.mute} style={{ marginTop: 4 }}>Step 1 of 1 — admin reviews before features unlock.</Txt>
        {isDriver ? (
          <View style={{ marginTop: 12 }}>
            <Txt b s={13}>Vehicle</Txt>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              {['Motorbike', 'Car', 'Bicycle'].map((v) => (
                <Pressable key={v} onPress={() => set('vehicle', v)}
                  style={{ borderWidth: 1.5, borderColor: d.vehicle === v ? C.green : C.line, borderRadius: 12,
                           paddingVertical: 8, paddingHorizontal: 12, marginRight: 8,
                           backgroundColor: d.vehicle === v ? '#EAF3EF' : '#fff' }}>
                  <Txt s={12} b={d.vehicle === v} c={d.vehicle === v ? C.green : C.ink}>{v}</Txt>
                </Pressable>
              ))}
            </View>
            <Field value={d.model} onChangeText={(v) => set('model', v)} placeholder="Model (e.g. Honda Click 125)" style={{ marginTop: 10 }} />
            <Field value={d.plate} onChangeText={(v) => set('plate', v)} placeholder="Plate number *" style={{ marginTop: 8 }} />
            <DocBtn k="license" label="Driving license photo *" />
            <DocBtn k="selfie" label="Selfie with ID *" />
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Field value={d.store} onChangeText={(v) => set('store', v)} placeholder="Store name *" />
            <View style={{ marginTop: 12 }}>
              <CategoryPicker value={d.type} onPick={(v) => set('type', v)} />
            </View>
            <Field value={d.area} onChangeText={(v) => set('area', v)} placeholder="Barangay / area *" style={{ marginTop: 8 }} />
            <Field value={d.address} onChangeText={(v) => set('address', v)} placeholder="Full store address *" style={{ marginTop: 8 }} />
            <DocBtn k="permit" label="Business permit photo *" />
            <DocBtn k="front" label="Storefront photo *" />
          </View>
        )}
        <Btn title="Submit for review" disabled={!ready} onPress={async () => { const ok = await submitKyc(role, d); if (ok) onDone(); }} />
        <Btn kind="ghost" title="Back" onPress={onDone} />
      </Card>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// V16: settings — the user edits name + photo after login. Photo is uploaded to Supabase Storage,
// name/photo are saved locally at once and synced to profiles(name, avatar_url).
function EditProfile({ visible, onClose }) {
  const { s, setProfile } = useStore();
  const phone = s.auth && s.auth.phone;
  const [name, setName] = useState(s.profile.name || '');
  const [avatar, setAvatar] = useState(s.profile.avatar || null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => { if (visible) { setName(s.profile.name || ''); setAvatar(s.profile.avatar || null); } }, [visible]);
  const clean = name.trim();
  const nameOk = clean.length >= 2 && clean.length <= 40;
  const pickAvatar = async () => {
    setBusy(true);
    try { const url = await takeDocPhoto({ kind: 'avatar', owner: phone, bucket: BUCKETS.avatar, square: true }); if (url) setAvatar(url); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setSaving(true);
    setProfile({ name: clean, avatar });
    try { await saveProfileRemote(phone, { name: clean, avatar_url: avatar }); }
    catch (e) { Alert.alert('Saved on this phone', 'Could not sync to the cloud yet: ' + String((e && e.message) || e)); }
    setSaving(false); onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
        <View style={{ backgroundColor: C.greenDk, padding: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
          <Pressable onPress={onClose}><Txt c="#fff" s={20}>‹ Back</Txt></Pressable>
          <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>⚙️ Settings — my profile</Txt>
        </View>
        <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, padding: 18 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Pressable onPress={pickAvatar} style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', borderWidth: 2,
                                                    borderColor: C.green, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {avatar ? <Image source={{ uri: avatar }} style={{ width: 120, height: 120 }} resizeMode="cover" /> : <Txt s={52}>👤</Txt>}
            </Pressable>
            <Btn small kind="ghost" busy={busy} title={avatar ? '📷 Change photo' : '📷 Add photo'} onPress={pickAvatar} style={{ paddingHorizontal: 22 }} />
          </View>
          <Txt b s={13} style={{ marginTop: 22, marginBottom: 6 }}>Your name</Txt>
          <Field value={name} onChangeText={setName} placeholder="Full name" maxLength={40} autoCapitalize="words" />
          {!nameOk && name.length > 0 && <Txt s={11} c={C.bad} style={{ marginTop: 4 }}>Name must be 2–40 characters.</Txt>}
          <Txt b s={13} style={{ marginTop: 16, marginBottom: 6 }}>Mobile number</Txt>
          <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, backgroundColor: '#EEF2EF' }}>
            <Txt s={16} c={C.mute}>{phone || '—'}</Txt>
          </View>
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>The number is your login and cannot be changed here.</Txt>
          <Btn title="Save" busy={saving || busy} disabled={!nameOk} onPress={save} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Pending({ role }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <Txt s={50}>⏳</Txt>
      <Txt b s={19} style={{ marginTop: 12 }}>Pending admin review</Txt>
      <Txt s={13} c={C.mute} style={{ textAlign: 'center', marginTop: 8 }}>
        Your {role} documents were submitted. Features unlock after the admin approves.</Txt>
    </View>
  );
}

export default function Profile({ onOpenAddresses }) {
  const { s, signOut, addCoupon, switchRole, deleteAccount } = useStore();
  const T = useT();
  const { lang, setLang } = React.useContext(LangCtx);
  const [dlg, setDlg] = useState(false);
  const [kyc, setKyc] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [wdOpen, setWdOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const role = s.activeRole;
  const myOrders = s.orders.filter((o) => o.mine).length;
  const verified = role === 'customer' || (s.roles && s.roles[role] && s.roles[role].status === 'approved');
  const defaultAddr = (s.addresses || []).find((a) => a.default) || s.addresses[0];

  if (kyc) return <KycForm role={kyc} onDone={() => setKyc(null)} />;
  if (wdOpen) return <WithdrawScreen onClose={() => setWdOpen(false)} />;
  if ((role === 'driver' || role === 'vendor') && s.roles[role] && s.roles[role].status === 'pending') return <Pending role={role} />;

  const pickRole = () => {
    setDlg(false);
    if (role === 'customer') {
      if (s.roles.driver.status === 'approved') switchRole('driver');
      else if (s.roles.driver.status === 'pending') Alert.alert('Driver application', 'Your driver documents are being reviewed by the admin. You will get an alert when approved.');
      else setKyc('driver');
    } else switchRole('customer');
  };

  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingBottom: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => setEditOpen(true)} style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff',
                                                                alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {s.profile.avatar ? <Image source={{ uri: s.profile.avatar }} style={{ width: 62, height: 62 }} resizeMode="cover" /> : <Txt s={30}>👤</Txt>}
          </Pressable>
          <Pressable onPress={() => setEditOpen(true)} style={{ flex: 1, marginLeft: 12 }}>
            <Txt b s={16} c="#fff">{s.profile.name} <Txt s={12} c="#CFE8DD">✏️</Txt></Txt>
            <Txt s={13} c="#F2A900">★★★★★ {s.profile.rating.toFixed(1)}</Txt>
            <View style={{ backgroundColor: verified ? C.green : '#6B7A72', borderRadius: 8, alignSelf: 'flex-start',
                           paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
              <Txt s={10} b c="#fff">{verified ? '✓ Verified' : 'Unverified'}</Txt>
            </View>
          </Pressable>
          <Pressable onPress={signOut}><Txt s={22} c="#fff">⏻</Txt></Pressable>
        </View>
      </View>

      <Row icon="👛" label={T('wallet')} right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt b s={15}>{peso(s.wallet.balance)}</Txt>
          <Txt s={10} c={C.mute} style={{ marginLeft: 8, maxWidth: 110 }}>Top-up: ask admin until online payment is connected</Txt>
        </View>} />
      <Row icon="💸" label={T('withdraw') + ' (PH rails)'} onPress={() => setWdOpen(true)}
           right={<Txt b s={13} c={C.green}>{peso(s.wallet.balance)} ›</Txt>} />
      <Row icon="💳" label={T('deliveryCredit')} value={peso(s.wallet.credit)} />
      <Row icon="🛵" label={T('ordersCount')} value={String(myOrders)} green />
      <Row icon="📍" label={T('savedAddr') + ' · default: ' + (defaultAddr ? defaultAddr.label : '—')} value={String((s.addresses || []).length)} green onPress={onOpenAddresses} />
      <Row icon="👤" label={T('userMode')} onPress={() => setDlg(true)}
           right={<Txt b s={13} c={C.green}>{role === 'customer' ? 'Shopping mode' : role === 'driver' ? 'Courier mode' : 'Store mode'} ›</Txt>} />
      <Row icon="％" label={T('coupons')} right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Field value={coupon} onChangeText={setCoupon} placeholder="Code" style={{ width: 90, padding: 6 }} />
          <Btn small kind="ghost" title="+ Add" disabled={!coupon} onPress={() => { addCoupon(coupon); setCoupon(''); }}
               style={{ marginLeft: 6, marginTop: 0 }} />
        </View>} />
      <Row icon="🌐" label={T('lang')} right={
        <View style={{ flexDirection: 'row' }}>
          {['en', 'tl'].map((l) => (
            <Pressable key={l} onPress={() => setLang(l)}
              style={{ borderWidth: 1.5, borderColor: lang === l ? C.green : C.line, borderRadius: 10,
                       paddingHorizontal: 12, paddingVertical: 5, marginLeft: 6,
                       backgroundColor: lang === l ? '#EAF3EF' : '#fff' }}>
              <Txt s={12} b={lang === l} c={lang === l ? C.green : C.ink}>{l === 'en' ? 'English' : 'Tagalog'}</Txt>
            </Pressable>
          ))}
        </View>} />
      <Row icon="❓" label={T('support')} />
      <Row icon="🛡" label={T('offers')} />
      <Row icon="⚙️" label={T('settings') + ' · name & photo'} value="Edit" onPress={() => setEditOpen(true)} />
      <Row icon="💳" label={T('payMethods')} />
      <View style={{ padding: 16 }}>
        {(role === 'customer' && s.roles.vendor.status !== 'approved' && s.roles.vendor.status !== 'pending') && (
          <Btn kind="ghost" title="🏪 Register my store" onPress={() => setKyc('vendor')} />
        )}
        {role === 'customer' && s.roles.vendor.status === 'approved' && (
          <Btn kind="ghost" title="🏪 Switch to store mode" onPress={() => switchRole('vendor')} />
        )}
        {role !== 'customer' && <Btn kind="ghost" title="🛒 Back to shopping mode" onPress={() => switchRole('customer')} />}
        <Btn kind="bad" title={T('logout')} onPress={signOut} />
        <Btn small kind="ghost" title="🗑 Delete my account"
             onPress={() => Alert.alert('Delete your account?', 'This removes your name, photo, verification documents and saved data. Order and wallet records are kept without your name. It cannot be undone, and it is refused while you have an order in progress or money in your wallet.',
               [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteAccount() }])} />
      </View>
      <View style={{ height: 90 }} />
      <RoleDialog visible={dlg} onClose={() => setDlg(false)} onPick={pickRole} />
      <EditProfile visible={editOpen} onClose={() => setEditOpen(false)} />
    </ScrollView>
  );
}
