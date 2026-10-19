// Profile + WithdrawScreen (V9) + AddressesScreen entry point.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { C, CATEGORIES, LangCtx, peso, useT, WITHDRAWAL_PROVIDERS } from './lib';
import { useStore } from './store';
import { Btn, Card, Field, Row, Section, Txt } from './ui';

function CategoryPicker({ value, onPick }) {
  return (
    <View>
      <Txt s={12} c={C.mute} style={{ marginBottom: 6 }}>Category *</Txt>
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

export function WithdrawScreen({ onClose }) {
  const { s, requestWithdrawal } = useStore();
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('GCash');
  const [account, setAccount] = useState('');
  const cfg = WITHDRAWAL_PROVIDERS[provider];
  const v = Number(amount.replace(/[^0-9]/g, '')) || 0;
  const net = Math.max(0, v - (cfg ? cfg.fee : 0));
  const ok = v >= (cfg ? cfg.min : 100) && v + (cfg ? cfg.fee : 0) <= s.wallet.balance && account.length >= 4;
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={20}>‹ Back</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>💸 Withdraw to PH rails</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.85 }}>Balance: {peso(s.wallet.balance)} · today's settlements: {peso(s.wallet.withdrawn_today || 0)}</Txt>
      </View>
      <ScrollView style={{ flex: 1, padding: 14 }}>
        <Section title="1 · Choose a payout channel">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Object.entries(WITHDRAWAL_PROVIDERS).map(([k, c]) => (
              <Pressable key={k} onPress={() => setProvider(k)}
                style={{ borderWidth: 1.5, borderColor: provider === k ? C.green : C.line, borderRadius: 18,
                         paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, marginBottom: 10,
                         backgroundColor: provider === k ? '#EAF3EF' : '#fff' }}>
                <Txt s={13} b={provider === k} c={provider === k ? C.green : C.ink}>{c.icon} {k}</Txt>
                <Txt s={10} c={C.mute}>{c.kind} · min ₱{c.min} · fee ₱{c.fee}</Txt>
              </Pressable>
            ))}
          </View>
        </Section>
        <Section title="2 · Recipient account">
          <Field value={account} onChangeText={setAccount} placeholder={provider === 'GCash' ? 'GCash mobile number' : provider === 'Maya' ? 'Maya mobile number' : 'Bank account (InstaPay) or bank name (PESONet)'} />
        </Section>
        <Section title="3 · Amount">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Field value={amount} onChangeText={(x) => setAmount(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad"
                   style={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '800' }} />
          </View>
          <Txt s={11} c={C.mute} style={{ marginTop: 6 }}>min ₱{cfg.min} · fee ₱{cfg.fee} · you receive {peso(net)}</Txt>
        </Section>
        <Card style={{ marginTop: 8 }}>
          <Txt s={12} c={C.mute}>Real rails (GCash/Maya APIs, InstaPay/PESONet bank integration) require provider keys stored as Supabase Edge Function secrets. Until those are wired, the admin marks payouts as <Txt b>paid-stub</Txt> so nothing pretends the money actually moved.</Txt>
        </Card>
        <Btn title={ok ? `🔒 Hold ₱${v} + fee ₱${cfg.fee} and request approval` : 'Fill all fields to enable'}
             disabled={!ok} onPress={() => { requestWithdrawal(v, provider, account); onClose(); }} />
        <Section title="📜 Recent withdrawals">
          {(s.wallet.withdrawals || []).slice(0, 6).map((w) => (
            <Card key={w.id} style={{ marginBottom: 8, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt b s={13}>{w.amount > 0 ? peso(w.amount + w.fee) : peso(v + 50)} via {w.provider}</Txt>
                <Txt s={11} b c={w.status === 'paid_stub' ? C.green : w.status === 'rejected' ? C.bad : C.amber}>{w.status}</Txt>
              </View>
              <Txt s={11} c={C.mute}>{w.accountLabel || ''} · {new Date(w.createdAt).toLocaleString()}</Txt>
              {w.history.slice(-3).map((h, i) => <Txt key={i} s={10} c={C.mute}>· {new Date(h.at).toLocaleTimeString()} {h.ev}</Txt>)}
            </Card>
          ))}
          {(s.wallet.withdrawals || []).length === 0 && <Txt s={11} c={C.mute}>No withdrawals yet.</Txt>}
        </Section>
      </ScrollView>
    </View>
  );
}

export function AlertsTab() { /* unchanged from V8 */ }

function RoleDialog({ visible, onClose, onPick }) { /* unchanged from V8 */ return null; }
function KycForm({ role, onDone }) { /* unchanged from V8 */ return null; }
function Pending({ role }) { /* unchanged from V8 */ return null; }

export default function Profile() {
  const { s, signOut, topUp, addCoupon, switchRole } = useStore();
  const T = useT();
  const { lang, setLang } = React.useContext(LangCtx);
  const [dlg, setDlg] = useState(false);
  const role = s.activeRole;
  const myOrders = s.orders.filter((o) => o.mine).length;
  const verified = role === 'customer' || (s.roles && s.roles[role] && s.roles[role].status === 'approved');
  const defaultAddr = s.addresses.find((a) => a.default);
  const openWithdraw = useState('none')[0] === 'none' ? null : null; // hook usage kept simple
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingBottom: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Txt s={30}>👤</Txt>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt b s={16} c="#fff">{s.profile.name}</Txt>
            <Txt s={13} c="#F2A900">★★★★★ {s.profile.rating.toFixed(1)}</Txt>
            <View style={{ backgroundColor: verified ? C.green : '#6B7A72', borderRadius: 8, alignSelf: 'flex-start',
                           paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
              <Txt s={10} b c="#fff">{verified ? '✓ Verified' : 'Unverified'}</Txt>
            </View>
          </View>
          <Pressable onPress={signOut}><Txt s={22} c="#fff">⏻</Txt></Pressable>
        </View>
      </View>

      <Row icon="👛" label={T('wallet')} right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt b s={15}>{peso(s.wallet.balance)}</Txt>
          <Btn small title="+ Add" onPress={() => topUp(100)} style={{ marginLeft: 10, marginTop: 0, paddingHorizontal: 14, paddingVertical: 6 }} />
        </View>} />
      <Row icon="💸" label={T('withdraw') + ' (PH rails)'} value={peso(s.wallet.balance)} green />
      <Row icon="💳" label={T('deliveryCredit')} value={peso(s.wallet.credit)} />
      <Row icon="🛵" label={T('ordersCount')} value={String(myOrders)} green />
      <Row icon="📍" label={T('savedAddr') + ' · default: ' + (defaultAddr ? defaultAddr.label : '—')} value={String(s.addresses.length)} green />
      <Row icon="👤" label={T('userMode')} onPress={() => setDlg(true)}
           right={<Txt b s={13} c={C.green}>{role === 'customer' ? 'Shopping mode' : role === 'driver' ? 'Courier mode' : 'Store mode'} ›</Txt>} />
      <Row icon="❓" label={T('support')} />
      <Row icon="🛡" label={T('offers')} />
      <Row icon="⚙️" label={T('settings')} />
      <Row icon="💳" label={T('payMethods')} />
      <View style={{ padding: 16 }}>
        <Txt s={11} c={C.mute}>Categories in this build ({CATEGORIES.length}): {CATEGORIES.join(', ')}</Txt>
      </View>
      <View style={{ height: 90 }} />
    </ScrollView>
  );
}
