// Galabili PH — V38 order management board. A DEDICATED Orders screen (bottom
// nav → Orders) with three simple tabs — جديدة (needs my action) / قيد التنفيذ
// (in progress) / السجل (completed + cancelled, collapsed). Home screens keep
// only a count badge — orders are managed HERE, never on the home page.
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { C, peso, statusText } from './lib';
import { useStore } from './store';
import { takeProofPhoto } from './media';
import { Btn, Card, Field, Txt } from './ui';
import { OrderCard, PhotoTimeline, NegotiationBox } from './Customer';

const TERMINAL = ['completed', 'cancelled', 'disputed'];
const tabChip = (on) => ({ flex: 1, borderWidth: 1.5, borderColor: on ? C.green : C.line, borderRadius: 14, paddingVertical: 10, marginHorizontal: 4, backgroundColor: on ? C.green : '#fff', alignItems: 'center' });

export default function OrdersManage({ role }) {
  const { s, vendorQuote, vendorRespond, vendorDecline, vendorPacked, driverOfferAnswer, driverPickup, driverDeliver } = useStore();
  const [tab, setTab] = useState('new');
  const [busy, setBusy] = useState(null);
  const [qPrice, setQPrice] = useState({});
  const [counter, setCounter] = useState({});
  const phone = s.auth && s.auth.phone;

  const pool = role === 'vendor'
    ? s.orders.filter((o) => (o.myRoles || [o.myRole]).includes('vendor') || o.vendorPhone === phone)
    : role === 'driver'
      ? s.orders.filter((o) => (o.myRoles || [o.myRole]).includes('driver') || o.driverPhone === phone || o.offerTo === phone)
      : s.orders.filter((o) => o.mine);

  const turnMe = (o) => !!(o.neg && o.neg.turn === 'me');
  const isNewFn = {
    vendor: (o) => ['vendor_quote', 'vendor_talk'].includes(o.status),
    driver: (o) => ['driver_offer', 'driver_talk'].includes(o.status) && turnMe(o),
    customer: (o) => o.status === 'quote_review' || (['driver_offer', 'driver_talk'].includes(o.status) && turnMe(o)),
  }[role] || (() => false);
  const news = pool.filter((o) => !TERMINAL.includes(o.status) && isNewFn(o));
  const active = pool.filter((o) => !TERMINAL.includes(o.status) && !isNewFn(o));
  const history = pool.filter((o) => TERMINAL.includes(o.status));
  const shown = tab === 'new' ? news : tab === 'active' ? active : history;

  const snap = async (key, kind, then, o) => {
    setBusy(key);
    try { const p = await takeProofPhoto({ kind, owner: phone }); if (p) then(o, p); } finally { setBusy(null); }
  };
  const call = (p) => Linking.openURL('tel:' + p).catch(() => {});
  const nav = (lat, lng) => lat && Linking.openURL('https://www.google.com/maps?q=' + lat + ',' + lng).catch(() => {});

  const Head = ({ o, tone }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Txt b s={15} style={{ flex: 1 }}>{o.kind === 'ride' ? '🚕 مشوار' : o.kind === 'errand' ? '🧭 اشتريلي' : '🛍 ' + (o.storeName || o.items)}</Txt>
      <View style={{ backgroundColor: tone, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Txt s={11} b c={C.amber}>{statusText(o)}</Txt>
      </View>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }} keyboardShouldPersistTaps="handled">
      <Txt b s={20} style={{ marginBottom: 10 }}>{role === 'vendor' ? '🧾 إدارة طلبات المتجر' : role === 'driver' ? '🧾 طلباتي كمندوب' : '🧾 طلباتي'}</Txt>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        {[['new', '🔔 جديدة (' + news.length + ')'], ['active', '🛵 قيد التنفيذ (' + active.length + ')'], ['history', '🗂 السجل (' + history.length + ')']].map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={tabChip(tab === k)}>
            <Txt s={12} b={tab === k} c={tab === k ? '#fff' : C.ink}>{l}</Txt>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 && (
        <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Txt s={36}>{tab === 'history' ? '🗂' : '📭'}</Txt>
          <Txt s={13} c={C.mute} style={{ marginTop: 8, textAlign: 'center' }}>{tab === 'new' ? 'لا توجد طلبات تحتاج إجراء منك.' : tab === 'active' ? 'لا توجد طلبات قيد التنفيذ.' : 'السجل فاضي — الطلبات المكتملة والملغاة تظهر هنا فقط.'}</Txt>
        </Card>
      )}

      {/* ---------- جديدة: one-tap actions per role ---------- */}
      {tab === 'new' && role === 'vendor' && shown.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12, borderColor: C.gold, borderWidth: 1.5 }}>
          <Head o={o} tone="#FBF7EC" />
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · توصيل {peso(o.fee)}{o.price > 0 ? ' · السعر ' + peso(o.price) : ''} · {o.payVia === 'wallet' ? '👛 wallet' : '💵 cash'}</Txt>
          <PhotoTimeline o={o} />
          {o.status === 'vendor_quote' && (
            <View style={{ marginTop: 8 }}>
              <Field value={qPrice[o.id] != null ? String(qPrice[o.id]) : ''} onChangeText={(v) => setQPrice({ ...qPrice, [o.id]: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="سعر المنتج (₱)" />
              <Btn small busy={busy === 'q' + o.id} disabled={!qPrice[o.id]} title="📷 أرسل عرض السعر + صورة المنتج"
                   onPress={() => snap('q' + o.id, 'product', (oo, p) => vendorQuote(oo, Number(qPrice[oo.id]) || 0, p))} style={{ marginTop: 6 }} />
              <Btn small kind="bad" title="رفض الطلب" onPress={() => vendorDecline(o)} style={{ marginTop: 6 }} />
            </View>
          )}
          {o.status === 'vendor_talk' && o.neg && (
            <NegotiationBox title="العميل اعترض على السعر — رد بعرضك" amount={o.neg.amount}
              onAccept={() => vendorRespond(o, 'accept')}
              onCounter={(amt) => vendorRespond(o, 'counter', amt)}
              onRefuse={() => vendorRespond(o, 'refuse')} refuseLabel="ثبّت سعرنا (نهائي)" />
          )}
        </Card>
      ))}

      {tab === 'new' && role === 'driver' && shown.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12, borderColor: C.gold, borderWidth: 1.5 }}>
          <Head o={o} tone="#FBF7EC" />
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · العرض {peso(o.neg ? o.neg.amount : 0)} · {o.payVia === 'wallet' ? '👛 wallet' : '💵 cash'}</Txt>
          {o.offerDeadline ? <Txt s={11} c={Date.now() > o.offerDeadline ? C.amber : C.mute} style={{ marginTop: 2 }}>{Date.now() > o.offerDeadline ? '⏳ انتهت المهلة — اضغط قبول لإعادة تأكيد العرض' : '⏳ المهلة جارية'}</Txt> : null}
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Btn small busy={busy === 'a' + o.id} title={'✓ قبول ' + peso(o.neg ? o.neg.amount : 0)} onPress={async () => { setBusy('a' + o.id); await driverOfferAnswer(o, 'accept'); setBusy(null); }} style={{ flex: 1, marginRight: 6 }} />
            <Btn small kind="bad" title="رفض" onPress={() => driverOfferAnswer(o, 'refuse')} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Field value={counter[o.id] || ''} onChangeText={(v) => setCounter({ ...counter, [o.id]: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="عرضك ₱ (±10%)" style={{ flex: 1, padding: 10 }} />
            <Btn small kind="ghost" title="فاوض" disabled={!counter[o.id] || (o.neg && Number(counter[o.id]) === o.neg.amount)} onPress={() => { driverOfferAnswer(o, 'counter', Number(counter[o.id])); setCounter({ ...counter, [o.id]: '' }); }} style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
          </View>
        </Card>
      ))}

      {tab === 'new' && role === 'customer' && shown.map((o) => <OrderCard key={o.id} o={o} />)}

      {/* ---------- قيد التنفيذ ---------- */}
      {tab === 'active' && role === 'vendor' && shown.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12 }}>
          <Head o={o} tone="#EAF3EF" />
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · توصيل {peso(o.fee)}{o.price > 0 ? ' · السعر ' + peso(o.price) : ''}</Txt>
          {o.status === 'accepted' && <Btn small busy={busy === 'p' + o.id} title="📷 جهّزت الطلب — صورة التجهيز" onPress={() => snap('p' + o.id, 'packed', (oo, p) => vendorPacked(oo, p))} style={{ marginTop: 8 }} />}
          {o.status === 'ready_pickup' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>📦 متجهز — المندوب جاي ياخده.</Txt>}
          {['picked_up', 'delivered'].includes(o.status) && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🛵 مع المندوب — الفلوس تتحول لك لما العميل يأكد.</Txt>}
          <PhotoTimeline o={o} />
        </Card>
      ))}

      {tab === 'active' && role === 'driver' && shown.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12 }}>
          <Head o={o} tone="#EAF3EF" />
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>📍 {o.pickup}</Txt>
          <Txt s={11} c={C.mute}>🏠 {o.dropoff}</Txt>
          <Txt s={12} b c={C.green} style={{ marginTop: 4 }}>{o.payVia === 'wallet' ? '👛 مدفوع بالمحفظة — مفيش تحصيل.' : '💵 تحصّل ' + peso(o.fee + o.price) + ' كاش من العميل.'}</Txt>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Btn small kind="ghost" title="📞 اتصل بالعميل" onPress={() => call(o.customerPhone)} style={{ flex: 1, marginRight: 6 }} />
            <Btn small kind="ghost" title="🧭 وصل للمكان" onPress={() => nav(o.pickupLat, o.pickupLng)} style={{ flex: 1 }} />
          </View>
          {o.status === 'accepted' && <Btn small busy={busy === 'pu' + o.id} title="📷 استلمت الطلب — صورة الاستلام" onPress={() => snap('pu' + o.id, 'pickup', (oo, p) => driverPickup(oo, phone, p))} style={{ marginTop: 8 }} />}
          {o.status === 'picked_up' && <Btn small busy={busy === 'dl' + o.id} title="📷 سلّمت الطلب — صورة التسليم" onPress={() => snap('dl' + o.id, 'delivery', (oo, p) => driverDeliver(oo, phone, p))} style={{ marginTop: 8 }} />}
          <PhotoTimeline o={o} />
        </Card>
      ))}

      {tab === 'active' && role === 'customer' && shown.map((o) => <OrderCard key={o.id} o={o} />)}

      {/* ---------- السجل: collapsed rows (completed + cancelled only) ---------- */}
      {tab === 'history' && shown.map((o) => (
        <Card key={o.id} style={{ marginBottom: 8, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt s={13} style={{ flex: 1 }}>{o.kind === 'ride' ? '🚕 ' + (o.dropoff || '') : o.kind === 'errand' ? '🧭 ' + (o.items || '') : '🛍 ' + (o.storeName || o.items || '')}</Txt>
            <Txt s={12} b c={o.status === 'completed' ? C.green : C.bad}>{o.status === 'completed' ? '✅ مكتمل' : o.status === 'cancelled' ? '❌ ملغي' : '⚖️ مراجعة'}</Txt>
          </View>
          <Txt s={11} c={C.mute} style={{ marginTop: 2 }}>{peso(o.fee + o.price)} · {o.created ? new Date(o.created).toLocaleDateString() : ''}</Txt>
        </Card>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
