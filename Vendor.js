// Vendor dashboard (V16): real product / packed photos uploaded to Supabase Storage,
// quote → customer counter → agree → pack (photo) → hand over → sale credited to the wallet.
import React, { useState } from 'react';
import { Image, ScrollView, Switch, View } from 'react-native';
import { C, ORDER_STATUS, peso, distanceKm, fmtKm } from './lib';
import { useStore } from './store';
import { takeProofPhoto } from './media';
import { Btn, Card, Field, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble } from './Customer';

export default function Vendor() {
  const { s, vendorQuote, vendorPacked, vendorHandover, toggleOnline, catalogAdd, catalogDel, offerAnswer } = useStore();
  const [price, setPrice] = useState({});
  const [counter, setCounter] = useState({});
  const [shots, setShots] = useState({}); // orderId -> uploaded product photo
  const [busy, setBusy] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const owner = s.auth && s.auth.phone;

  const snap = async (key, kind, then) => {
    setBusy(key);
    try { const p = await takeProofPhoto({ kind, owner }); if (p) then(p); } finally { setBusy(null); }
  };

  const incoming = s.orders.filter((o) => !o.mine && o.myRole === 'vendor' && !o.expired && o.status !== 'completed' && o.status !== 'cancelled');
  const earnings = s.wallet.tx.filter((t) => t.kind === 'sale').reduce((a, t) => a + t.amount, 0);
  const pct = s.settings.commissions.vendorPct;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt b s={20}>🏪 Store board</Txt>
          <Txt s={12} c={C.mute}>{incoming.length} live · earned {peso(earnings)} (after {pct}% fee)</Txt>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Txt s={11} c={C.mute}>Open</Txt>
          <Switch value={!!s.storeOpen} onValueChange={(v) => toggleOnline('vendor', v)} trackColor={{ true: C.green }} />
        </View>
      </View>
      {!s.storeOpen && <Card><Txt s={13} c={C.mute}>Your store is closed — open it to receive orders.</Txt></Card>}
      {s.storeOpen && incoming.length === 0 && <Card><Txt s={13} c={C.mute}>Waiting for orders… (demo: a simulated order arrives within ~45s)</Txt></Card>}

      {incoming.map((o) => {
        const shot = shots[o.id];
        const km = distanceKm({ lat: o.pickupLat, lng: o.pickupLng }, { lat: o.dropLat, lng: o.dropLng });
        return (
          <Card key={o.id} style={{ marginBottom: 12 }}>
            <Txt b s={15}>{o.items}</Txt>
            <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>
              👤 {o.customer} · {ORDER_STATUS[o.status] || o.status} · fee {peso(o.fee)}{km != null ? ' · delivery ' + fmtKm(km) : ''}
            </Txt>
            {o.price > 0 && <Txt s={12} b c={C.green} style={{ marginTop: 2 }}>Agreed price {peso(o.price)}</Txt>}
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
                  <Btn small title="Send quote" disabled={!shot || !price[o.id]}
                       onPress={() => vendorQuote(o.id, Number(price[o.id]), shot)}
                       style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
                </View>
              </View>
            )}

            {o.status === 'quote_sent' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Quote of {peso(o.neg ? o.neg.amount : o.price)} sent — waiting for the customer…</Txt>}

            {o.neg && o.neg.turn === 'me' && o.status === 'vendor_talk' && (
              <View style={{ marginTop: 8 }}>
                <Txt s={12} c={C.amber}>💬 Customer countered: {peso(o.neg.amount)}</Txt>
                <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
                  <Btn small title={'Accept ' + peso(o.neg.amount)} onPress={() => offerAnswer(o.id, 'accept')} style={{ flex: 1, marginRight: 6 }} />
                  <Btn small kind="bad" title="Refuse" onPress={() => offerAnswer(o.id, 'refuse')} style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
                  <Field value={counter[o.id] || ''} onChangeText={(v) => setCounter({ ...counter, [o.id]: v.replace(/[^0-9]/g, '') })}
                         keyboardType="number-pad" placeholder="Your counter ₱" style={{ flex: 1, padding: 10 }} />
                  <Btn small kind="ghost" title="Counter" disabled={!counter[o.id]}
                       onPress={() => { offerAnswer(o.id, 'counter', Number(counter[o.id])); setCounter({ ...counter, [o.id]: '' }); }}
                       style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
                </View>
              </View>
            )}

            {o.status === 'awaiting_pack' && (
              <Btn small busy={busy === 'p' + o.id} title="📷 Order packed — take photo"
                   onPress={() => snap('p' + o.id, 'packed', (p) => vendorPacked(o.id, p))} />
            )}
            {o.status === 'ready_pickup' && <Btn small title="🤝 Hand over to courier" onPress={() => vendorHandover(o.id)} />}
            {o.status === 'handover_done' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>✅ Handed over — payment is released when the customer confirms.</Txt>}
            {['product', 'packed'].map((k) => (o.photos && o.photos[k]) ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
          </Card>
        );
      })}

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
          <Field value={newPrice} onChangeText={(v) => setNewPrice(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad"
                 placeholder="₱" style={{ flex: 1, marginLeft: 8, padding: 10 }} />
          <Btn small title="Add" disabled={!newName || !newPrice}
               onPress={() => { catalogAdd(newName, Number(newPrice)); setNewName(''); setNewPrice(''); }}
               style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 16 }} />
        </View>
      </Section>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
