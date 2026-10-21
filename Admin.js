// Admin console — V9 adds Withdrawals, Stores, Drivers, plus the original tabs.
import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { fetchRecentDrivers } from './tracking';
import { C, ORDER_STATUS, peso, WITHDRAWAL_PROVIDERS } from './lib';
import { useStore } from './store';
import { Btn, Card, Field, Row, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble } from './Customer';

export default function Admin() {
  const st = useStore();
  const { s } = st;
  const [tab, setTab] = useState('withdrawals');
  const [liveDrivers, setLiveDrivers] = useState([]);
  React.useEffect(() => {
    if (tab !== 'drivers') return undefined;
    let alive = true;
    const load = async () => { const rows = await fetchRecentDrivers(10); if (alive) setLiveDrivers(rows); };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [tab]);
  const [rejectReason, setRejectReason] = useState({});
  // V9 tabs — withdrawals first because admin's #1 day-to-day action.
  const tabs = [
    ['withdrawals', '💸 W/Ds'],
    ['kyc', '🪪 KYC'],
    ['orders', '📦 Orders'],
    ['users', '👥 Users'],
    ['stores', '🏪 Stores'],
    ['drivers', '🛵 Drivers'],
    ['settings', '⚙️'],
    ['audit', '📜 Log'],
  ];
  const allW = (s.wallet?.withdrawals || []);
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 16 }}>
        <Txt b s={20} c="#fff">🛡 Pabili Admin</Txt>
        <Txt s={11} c="#fff" style={{ opacity: 0.8 }}>{s.auth?.phone} · full access</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {tabs.map(([k, l]) => (
            <Btn key={k} small kind={tab === k ? 'main' : 'ghost'} title={l} onPress={() => setTab(k)}
                 style={{ width: 'auto', marginRight: 6, marginBottom: 6, marginTop: 0, paddingVertical: 6, paddingHorizontal: 10, flexGrow: 0 }} />
          ))}
        </View>
      </View>
      <ScrollView style={{ flex: 1, padding: 14 }}>

        {tab === 'withdrawals' && (
          <View>
            <Txt b s={16}>Withdrawals ({allW.length})</Txt>
            <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>GCash / Maya / InstaPay / PESONet — admin approves; "Mark paid" is a stub until provider keys are loaded.</Txt>
            {allW.length === 0 && <Txt c={C.mute} style={{ marginTop: 12 }}>No withdrawal requests yet.</Txt>}
            {allW.map((w) => (
              <Card key={w.id} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt b s={14}>{peso(w.amount + w.fee)} → {w.provider} (fee ₱{w.fee})</Txt>
                  <View style={{ backgroundColor: w.status === 'paid_stub' ? '#EAF3EF' : w.status === 'rejected' ? '#FDECEC' : w.status === 'approved' ? '#FBF7EC' : '#F2EFE3',
                                 borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Txt s={11} b c={w.status === 'paid_stub' ? C.green : w.status === 'rejected' ? C.bad : w.status === 'approved' ? C.amber : C.ink}>{w.status}</Txt>
                  </View>
                </View>
                <Txt s={11} c={C.mute}>{w.accountLabel || '—'} · net {peso(w.net)} · {new Date(w.createdAt).toLocaleString()}</Txt>
                {w.history.slice(-3).map((h, i) => <Txt key={i} s={10} c={C.mute}>· {new Date(h.at).toLocaleTimeString()} {h.ev}</Txt>)}
                {w.status === 'pending' && (
                  <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    <Btn small title="Approve" onPress={() => st.adminApproveWithdrawal(w.id)} style={{ flex: 1, marginRight: 6 }} />
                    <Btn small kind="bad" title="Reject + refund" onPress={() => {
                      st.adminRejectWithdrawal(w.id, rejectReason[w.id] || 'admin');
                    }} style={{ flex: 1 }} />
                  </View>
                )}
                {w.status === 'approved' && (
                  <View style={{ marginTop: 6 }}>
                    <Txt s={10} c={C.amber}>Approved — needs provider keys before paying out.</Txt>
                    <Btn small kind="ghost" title="Mark paid (stub)" onPress={() => st.adminMarkWithdrawalPaidStub(w.id)} />
                  </View>
                )}
                {w.status === 'pending' && (
                  <Field value={rejectReason[w.id] || ''} onChangeText={(v) => setRejectReason({ ...rejectReason, [w.id]: v })}
                         placeholder="Reject reason" style={{ marginTop: 8 }} />
                )}
              </Card>
            ))}
          </View>
        )}

        {tab === 'kyc' && (
          <View>
            <Txt b s={16}>KYC Queue ({s.kyc.filter((k) => k.status === 'pending').length} pending)</Txt>
            {s.kyc.map((k) => (
              <Card key={k.id} style={{ marginTop: 10, opacity: k.status === 'pending' ? 1 : 0.6 }}>
                <Txt b s={15}>{k.name} — {k.role}</Txt>
                <Txt s={11} c={C.mute}>{new Date(k.ts).toLocaleString()} · {k.status}</Txt>
                {Object.entries(k.data || {}).map(([kk, v]) => (/^https?:\/\//.test(String(v))
                  ? <View key={kk}>{photoBubble({ uri: String(v), kind: kk, stamp: '' })}</View>
                  : <Txt key={kk} s={12} style={{ marginTop: 3 }}>• {kk}: {String(v)}</Txt>))}
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
                  <Txt b s={14} style={{ flex: 1 }}>{o.storeName ? '🏪 ' + o.storeName : (o.items || '')}</Txt>
                  <Txt b s={12} c={o.status === 'disputed' ? C.bad : C.green}>{ORDER_STATUS[o.status] || o.status}</Txt>
                </View>
                <Txt s={11} c={C.mute}>fee {peso(o.fee)} · price {peso(o.price || 0)} · kind {o.kind} {o.parentId ? '· child of ' + o.parentId : ''}</Txt>
                {o.kind !== 'cart' && <PhotoTimeline o={o} />}
                {['product', 'packed', 'pickup', 'delivery'].map((k) => o.photos && o.photos[k] ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
                {(o.neg ? (o.neg.history || []) : []).map((h, i) => <Txt key={i} s={10} c={C.mute}>  💬 {h.note}{h.amount ? ' — ' + peso(h.amount) : ''}</Txt>)}
              </Card>
            ))}
          </View>
        )}

        {tab === 'users' && (
          <View>
            <Txt b s={16}>Users ({s.users.length})</Txt>
            {s.users.map((u) => (
              <Card key={u.id} style={{ marginTop: 10 }}>
                <Txt b s={14}>{u.name} {u.frozen ? '🔒' : ''}</Txt>
                <Txt s={11} c={C.mute}>{u.role} · {u.phone} · wallet {peso(u.wallet)} · credit {peso(u.credit)}</Txt>
              </Card>
            ))}
          </View>
        )}

        {tab === 'stores' && (
          <View>
            <Txt b s={16}>Stores ({s.stores.length})</Txt>
            {s.stores.map((st0) => (
              <Card key={st0.id} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Txt b s={15}>{st0.name} {st0.featured ? '⭐' : ''}</Txt>
                    <Txt s={11} c={C.mute}>{st0.category} · {st0.area} · {st0.active ? 'active' : 'paused'}</Txt>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Btn small kind={st0.active ? 'bad' : 'main'} title={st0.active ? 'Pause' : 'Activate'} onPress={() => st.adminToggleStoreActive(st0.id)} style={{ flex: 1, marginRight: 6 }} />
                  <Btn small kind="ghost" title={st0.featured ? 'Unmark featured' : 'Mark featured'} onPress={() => st.adminSetStoreFeatured(st0.id, !st0.featured)} style={{ flex: 1 }} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {tab === 'drivers' && (
          <View>
            <Txt b s={16}>Drivers ({s.users.filter((u) => u.role === 'driver').length})</Txt>
            <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>Live points published by courier phones in the last 10 min (Supabase, refreshes every 10 s).</Txt>
            {liveDrivers.length === 0 && <Txt s={11} c={C.mute} style={{ marginTop: 6 }}>No courier is sharing a location right now.</Txt>}
            {liveDrivers.map((p) => (
              <Card key={p.driver_phone} style={{ marginTop: 10 }}>
                <Txt b s={13}>🚗 {p.driver_phone}</Txt>
                <Txt s={11} c={C.mute}>{Number(p.lat).toFixed(4)}, {Number(p.lng).toFixed(4)} · {p.source === 'bg' ? 'background' : 'foreground'} · {new Date(p.updated_at).toLocaleTimeString()}</Txt>
              </Card>
            ))}
          </View>
        )}

        {tab === 'settings' && (
          <View>
            <Section title="Payout providers (PH)">
              <Txt s={10} c={C.mute}>{Object.entries(WITHDRAWAL_PROVIDERS).map(([k, v2]) => `${k}=${v2.min}/${v2.fee}/${v2.daily_cap}`).join(' · ')}</Txt>
            </Section>
            <Field value={s.settings.banner.title} onChangeText={(v) => st.adminSetBanner ? st.adminSetBanner({ title: v, cta: s.settings.banner.cta }) : null} placeholder="Banner title" />
            <Btn kind="ghost" title="Log out" onPress={st.signOut} style={{ marginTop: 20 }} />
          </View>
        )}

        {tab === 'audit' && (
          <View>
            <Txt b s={16}>Audit log ({s.audit.length})</Txt>
            {s.audit.slice(0, 50).map((a) => (
              <Card key={a.id} style={{ marginTop: 8, paddingVertical: 10 }}>
                <Txt b s={13}>{a.action}</Txt>
                <Txt s={11} c={C.mute}>{a.detail}</Txt>
                <Txt s={10} c={C.mute}>{a.by} · {new Date(a.ts).toLocaleString()}</Txt>
              </Card>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
