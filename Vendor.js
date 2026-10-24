// Vendor dashboard (V17): real orders from real customers. Quote with a real photo → customer accepts or
// counters → a courier is found → pack (photo) → courier collects → paid out when the customer confirms.
import React, { useState } from 'react';
import { Image, ScrollView, Switch, View } from 'react-native';
import { C, peso, statusText, distanceKm, fmtKm } from './lib';
import { useStore } from './store';
import { takeProofPhoto } from './media';
import { Btn, Card, Field, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble, NegotiationBox } from './Customer';

export default function Vendor() {
  const { s, vendorQuote, vendorRespond, vendorDecline, vendorPacked, toggleOnline, catalogAdd, catalogDel } = useStore();
  const [price, setPrice] = useState({});
  const [shots, setShots] = useState({}); // orderId -> uploaded product photo
  const [busy, setBusy] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const owner = s.auth && s.auth.phone;
  const store = s.myStore;

  const snap = async (key, kind, then) => {
    setBusy(key);
    try { const p = await takeProofPhoto({ kind, owner }); if (p) then(p); } finally { setBusy(null); }
  };

  const mine = s.orders.filter((o) => o.myRole === 'vendor');
  const live = mine.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const done = mine.filter((o) => o.status === 'completed');
  const earnings = (s.wallet.tx || []).filter((t) => t.kind === 'sale').reduce((a, t) => a + t.amount, 0);
  const pct = s.settings.commissions.vendorPct;

  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.paper, padding: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt b s={20}>🏪 {store ? store.name : 'Store board'}</Txt>
          <Txt s={12} c={C.mute}>{live.length} live · earned {peso(earnings)} (after {pct}% fee) · wallet {peso(s.wallet.balance)}</Txt>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Txt s={11} c={C.mute}>Open</Txt>
          <Switch value={!!(store && store.open)} onValueChange={(v) => toggleOnline('vendor', v)} trackColor={{ true: C.green }} />
        </View>
      </View>
      {!(store && store.open) && <Card><Txt s={13} c={C.mute}>Your store is closed — customers cannot see it. Switch it to Open to receive orders.</Txt></Card>}
      {store && store.open && live.length === 0 && <Card><Txt s={13} c={C.mute}>Waiting for orders…</Txt></Card>}

      {live.map((o) => {
        const shot = shots[o.id];
        const km = distanceKm({ lat: o.pickupLat, lng: o.pickupLng }, { lat: o.dropLat, lng: o.dropLng });
        return (
          <Card key={o.id} style={{ marginBottom: 12 }}>
            <Txt b s={15}>{o.items}</Txt>
            <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · {statusText(o)} · delivery {peso(o.fee)}{km != null ? ' · ' + fmtKm(km) : ''} · {o.payVia === 'wallet' ? '👛 wallet' : '💵 cash'}</Txt>
            {o.price > 0 && <Txt s={12} b c={C.green} style={{ marginTop: 2 }}>Price {peso(o.price)}</Txt>}
            <PhotoTimeline o={o} />

            {o.status === 'vendor_quote' && (
              <View style={{ marginTop: 10 }}>
                <Btn small kind={shot ? 'ghost' : 'main'} busy={busy === 'q' + o.id}
                     title={shot ? '✓ Product photo uploaded — tap to retake' : '📷 Photo of the actual product (required)'}
                     onPress={() => snap('q' + o.id, 'product', (p) => setShots({ ...shots, [o.id]: p }))} />
                {shot && <Image source={{ uri: shot.uri }} style={{ width: '100%', height: 150, borderRadius: 10, marginTop: 8 }} resizeMode="cover" />}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Field value={price[o.id] || ''} onChangeText={(v) => setPrice({ ...price, [o.id]: v.replace(/[^0-9]/g, '') })}
                         keyboardType="number-pad" placeholder="Your price ₱" style={{ flex: 1, padding: 10 }} />
                  <Btn small title="Send quote" disabled={!shot || !price[o.id]} onPress={() => vendorQuote(o, Number(price[o.id]), shot)}
                       style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
                </View>
                <Btn small kind="bad" title="Decline this order" onPress={() => vendorDecline(o)} />
              </View>
            )}

            {o.status === 'quote_review' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Quote of {peso(o.neg ? o.neg.amount : o.price)} sent — waiting for the customer…</Txt>}
            {o.status === 'vendor_talk' && o.neg && (
              <NegotiationBox title="💬 The customer counter-offered" amount={o.neg.amount} note={'Your price was ' + peso(o.price)}
                onAccept={() => vendorRespond(o, 'accept')} onCounter={(a) => vendorRespond(o, 'counter', a)}
                onRefuse={() => vendorRespond(o, 'refuse')} refuseLabel="Keep my price" />
            )}
            {['finding_driver', 'driver_offer', 'driver_talk'].includes(o.status) && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🔎 Price agreed — finding a courier…</Txt>}
            {o.status === 'accepted' && (
              <View style={{ marginTop: 8 }}>
                <Txt s={12} b c={C.green}>🛵 {o.driver || 'A courier'} accepted — pack the order now.</Txt>
                <Btn small busy={busy === 'p' + o.id} title="📷 Order packed — take photo" onPress={() => snap('p' + o.id, 'packed', (p) => vendorPacked(o, p))} />
              </View>
            )}
            {o.status === 'ready_pickup' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>📦 Packed — waiting for the courier to collect it.</Txt>}
            {['picked_up', 'delivered'].includes(o.status) && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🛵 With the courier. You are paid when the customer confirms.</Txt>}
            {['product', 'packed'].map((k) => (o.photos && o.photos[k]) ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
          </Card>
        );
      })}

      {done.length > 0 && <Section title={'✅ Completed (' + done.length + ')'}>
        {done.slice(0, 6).map((o) => <Card key={o.id} style={{ paddingVertical: 8, marginBottom: 6 }}><Txt s={12}>{o.items} · {peso(o.price)}</Txt></Card>)}
      </Section>}

      <Section title="📦 My products">
        {(s.catalog || []).map((p) => (
          <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingVertical: 10 }}>
            <Txt s={14} style={{ flex: 1 }}>{p.name}</Txt>
            <Txt b s={14} c={C.green}>{peso(p.price)}</Txt>
            <Btn small kind="bad" title="✕" onPress={() => catalogDel(p.id)} style={{ marginLeft: 10, marginTop: 0, paddingHorizontal: 10 }} />
          </Card>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Field value={newName} onChangeText={setNewName} placeholder="Product name" style={{ flex: 2, padding: 10 }} />
          <Field value={newPrice} onChangeText={(v) => setNewPrice(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="₱" style={{ flex: 1, marginLeft: 8, padding: 10 }} />
          <Btn small title="Add" disabled={!newName || !newPrice} onPress={() => { catalogAdd(newName, Number(newPrice)); setNewName(''); setNewPrice(''); }}
               style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 16 }} />
        </View>
        <Txt s={10} c={C.mute} style={{ marginTop: 4 }}>Your product list is private to this phone for now (customers don't see it yet).</Txt>
      </Section>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
