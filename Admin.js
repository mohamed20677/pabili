// Admin console: KYC queue, live orders, users+wallets, settings, broadcast, audit log
import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { C, ORDER_STATUS, peso } from './lib';
import { useStore } from './store';
import { Btn, Card, Field, Row, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble } from './Customer';

export default function Admin() {
  const st = useStore();
  const { s } = st;
  const [tab, setTab] = useState('kyc');
  const [msg, setMsg] = useState('');
  const [adj, setAdj] = useState({});
  const [cm, setCm] = useState({ ...s.settings.commissions });
  const tabs = [['kyc', '🪪 KYC'], ['orders', '📦 Orders'], ['users', '👥 Users'], ['settings', '⚙️'], ['audit', '📜 Log']];
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 16 }}>
        <Txt b s={20} c="#fff">🛡 Pabili Admin</Txt>
        <Txt s={11} c="#fff" style={{ opacity: 0.8 }}>{s.auth.phone} · full access</Txt>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          {tabs.map(([k, l]) => (
            <Btn key={k} small kind={tab === k ? 'main' : 'ghost'} title={l} onPress={() => setTab(k)}
                 style={{ flex: 1, marginRight: 6, marginTop: 0, paddingVertical: 7 }} />
          ))}
        </View>
      </View>
      <ScrollView style={{ flex: 1, padding: 14 }}>

        {tab === 'kyc' && (
          <View>
            <Txt b s={16}>Pending verifications ({s.kyc.filter((k) => k.status === 'pending').length})</Txt>
            {s.kyc.map((k) => (
              <Card key={k.id} style={{ marginTop: 10, opacity: k.status === 'pending' ? 1 : 0.6 }}>
                <Txt b s={15}>{k.name} — {k.role}</Txt>
                <Txt s={11} c={C.mute}>{new Date(k.ts).toLocaleString()} · {k.status}</Txt>
                {Object.entries(k.data || {}).map(([kk, v]) => <Txt key={kk} s={12} style={{ marginTop: 3 }}>• {kk}: {String(v)}</Txt>)}
                {k.status === 'pending' && (
                  <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    <Btn small title="Approve ✓" onPress={() => st.adminDecideKyc(k.id, true)} style={{ flex: 1, marginRight: 8 }} />
                    <Btn small kind="bad" title="Reject" onPress={() => st.adminDecideKyc(k.id, false)} style={{ flex: 1 }} />
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}

        {tab === 'orders' && (
          <View>
            <Txt b s={16}>Live orders ({s.orders.length})</Txt>
            {s.orders.length === 0 && <Txt c={C.mute} style={{ marginTop: 20 }}>No orders yet.</Txt>}
            {s.orders.map((o) => (
              <Card key={o.id} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt b s={14} style={{ flex: 1 }}>{o.items}</Txt>
                  <Txt b s={12} c={o.status === 'disputed' ? C.bad : C.green}>{ORDER_STATUS[o.status] || o.status}</Txt>
                </View>
                <Txt s={11} c={C.mute}>fee {peso(o.fee)} · price {peso(o.price)} · {o.mine ? 'customer app' : o.myRole}</Txt>
                <PhotoTimeline o={o} />
                {['product', 'packed', 'pickup', 'delivery'].map((k) => o.photos && o.photos[k] ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
                {(o.neg ? (o.neg.history || []) : []).map((h, i) => (
                  <Txt key={i} s={10} c={C.mute}>  💬 {h.note}{h.amount ? ' — ' + peso(h.amount) : ''}</Txt>
                ))}
                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                  <Btn small kind="bad" title="Cancel + refund" onPress={() => st.adminCancelRefund(o.id)} style={{ flex: 1, marginRight: 6 }} />
                  <Btn small kind="ghost" title="Reassign courier" onPress={() => st.adminReassign(o.id)} style={{ flex: 1 }} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {tab === 'users' && (
          <View>
            <Txt b s={16}>Users ({s.users.length}) — wallet access</Txt>
            {s.users.map((u) => (
              <Card key={u.id} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Txt b s={14}>{u.name} {u.frozen ? '🔒' : ''}</Txt>
                    <Txt s={11} c={C.mute}>{u.role} · {u.phone} · {u.verified ? 'verified' : 'unverified'}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt b s={14} c={C.green}>{peso(u.wallet)}</Txt>
                    <Txt s={10} c={C.mute}>credit {peso(u.credit)}</Txt>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Field value={adj[u.id]?.a || ''} onChangeText={(v) => setAdj({ ...adj, [u.id]: { ...adj[u.id], a: v.replace(/[^0-9-]/g, '') } })}
                         placeholder="±₱" keyboardType="numbers-and-punctuation" style={{ width: 80, padding: 8 }} />
                  <Field value={adj[u.id]?.r || ''} onChangeText={(v) => setAdj({ ...adj, [u.id]: { ...adj[u.id], r: v } })}
                         placeholder="Reason (required)" style={{ flex: 1, marginLeft: 6, padding: 8 }} />
                  <Btn small title="Apply" disabled={!adj[u.id]?.a || !adj[u.id]?.r}
                       onPress={() => { st.adminAdjustWallet(u.id, Number(adj[u.id].a), adj[u.id].r); setAdj({ ...adj, [u.id]: {} }); }}
                       style={{ marginLeft: 6, marginTop: 0, paddingHorizontal: 12 }} />
                </View>
                <Btn small kind={u.frozen ? 'main' : 'bad'} title={u.frozen ? 'Unfreeze account' : 'Freeze account'}
                     onPress={() => st.adminFreeze(u.id, !u.frozen)} />
              </Card>
            ))}
            <Section title="📣 Broadcast">
              <Field value={msg} onChangeText={setMsg} placeholder="Message to all users…" />
              <Btn small title="Send broadcast" disabled={!msg} onPress={() => { st.adminBroadcast(msg, 'all'); setMsg(''); }} />
            </Section>
          </View>
        )}

        {tab === 'settings' && (
          <View>
            <Section title="💰 Commissions (%)">
              {['customerPct', 'vendorPct', 'driverPct'].map((k) => (
                <Row key={k} icon="％" label={k} right={
                  <Field value={String(cm[k])} onChangeText={(v) => setCm({ ...cm, [k]: Number(v.replace(/[^0-9]/g, '') || 0) })}
                         keyboardType="number-pad" style={{ width: 70, padding: 6, textAlign: 'center' }} />} />
              ))}
              <Btn small title="Save commissions" onPress={() => st.adminSetCommissions(cm)} />
            </Section>
            <Section title="⏱ Negotiation">
              <Row icon="⏱" label="Offer seconds (courier)" value={String(s.settings.offerSecs) + 's'} />
              <Row icon="⏱" label="Offer seconds (store)" value={String(s.settings.vendorSecs) + 's'} />
              <Row icon="🛵" label="Couriers before widening" value={String(s.settings.maxDrivers)} />
            </Section>
            <Section title="🏷 Categories (comma separated)">
              <Field value={s.settings.categories.join(', ')} multiline
                     onChangeText={(v) => st.adminSetCategories(v.split(',').map((x) => x.trim()).filter(Boolean))} />
            </Section>
            <Section title="🖼 Home banner">
              <Field value={s.settings.banner.title} onChangeText={(v) => st.adminSetBanner({ ...s.settings.banner, title: v })} />
              <Field value={s.settings.banner.cta} onChangeText={(v) => st.adminSetBanner({ ...s.settings.banner, cta: v })} style={{ marginTop: 8 }} />
            </Section>
            <Row icon="🌙" label="Floating promo bar" right={<Switch value={s.settings.promoBar} onValueChange={(v) => st.adminSetSettings({ promoBar: v })} trackColor={{ true: C.green }} />} />
          </View>
        )}

        {tab === 'audit' && (
          <View>
            <Txt b s={16}>Audit log ({s.audit.length})</Txt>
            {s.audit.map((a) => (
              <Card key={a.id} style={{ marginTop: 8, paddingVertical: 10 }}>
                <Txt b s={13}>{a.action}</Txt>
                <Txt s={11} c={C.mute}>{a.detail}</Txt>
                <Txt s={10} c={C.mute}>{a.by} · {new Date(a.ts).toLocaleString()}</Txt>
              </Card>
            ))}
          </View>
        )}

        <Btn kind="ghost" title="Log out" onPress={st.signOut} style={{ marginTop: 20 }} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
