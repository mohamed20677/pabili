// Vendor dashboard: incoming orders, quote with REQUIRED product photo, pack photo, handover, catalog, earnings
import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { C, ORDER_STATUS, peso } from './lib';
import { useStore } from './store';
import { Btn, Card, Field, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble } from './Customer';

const mkPhoto = (kind) => ({ by: 'me', kind, ts: Date.now(), stamp: new Date().toLocaleString() + ' · GPS locked', simulated: true });

export default function Vendor() {
  const { s, vendorQuote, vendorPacked, vendorHandover, toggleOnline, catalogAdd, catalogDel, offerAnswer } = useStore();
  const [price, setPrice] = useState({});
  const [photoDone, setPhotoDone] = useState({});
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const incoming = s.orders.filter((o) => !o.mine && o.myRole === 'vendor' && !o.expired && o.status !== 'completed' && o.status !== 'cancelled');
  const done = s.orders.filter((o) => !o.mine && o.myRole === 'vendor' && o.status === 'completed');
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
      {s.storeOpen && incoming.length === 0 && <Card><Txt s={13} c={C.mute}>Waiting for orders… (a bot order arrives within ~45s)</Txt></Card>}
      {incoming.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12 }}>
          <Txt b s={15}>{o.items}</Txt>
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · {ORDER_STATUS[o.status] || o.status} · fee {peso(o.fee)}</Txt>
          <PhotoTimeline o={o} />
          {o.status === 'vendor_quote' && (
            <View style={{ marginTop: 10 }}>
              <Btn small kind={photoDone[o.id] ? 'ghost' : 'main'}
                   title={photoDone[o.id] ? '✓ Product photo attached' : '📷 Photo of the actual product (required)'}
                   onPress={() => setPhotoDone({ ...photoDone, [o.id]: true })} />
              {photoDone[o.id] && photoBubble(mkPhoto('product'))}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <Field value={price[o.id] || ''} onChangeText={(v) => setPrice({ ...price, [o.id]: v.replace(/[^0-9]/g, '') })}
                       keyboardType="number-pad" placeholder="Your price ₱" style={{ flex: 1, padding: 10 }} />
                <Btn small title="Send quote" disabled={!photoDone[o.id] || !price[o.id]}
                     onPress={() => vendorQuote(o.id, Number(price[o.id]), mkPhoto('product'))}
                     style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
              </View>
            </View>
          )}
          {o.neg && o.neg.turn === 'me' && o.status !== 'vendor_quote' && (
            <View style={{ marginTop: 8 }}>
              <Txt s={12} c={C.amber}>💬 Customer countered: {peso(o.neg.amount)}</Txt>
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <Btn small title="Accept" onPress={() => offerAnswer(o.id, 'accept')} style={{ flex: 1, marginRight: 6 }} />
                <Btn small kind="ghost" title="Counter" onPress={() => offerAnswer(o.id, 'counter', Math.round(o.neg.amount * 1.1))} style={{ flex: 1, marginRight: 6 }} />
                <Btn small kind="bad" title="Refuse" onPress={() => offerAnswer(o.id, 'refuse')} style={{ flex: 1 }} />
              </View>
            </View>
          )}
          {o.status === 'awaiting_pack' && <Btn small title="📷 Order packed — take photo" onPress={() => vendorPacked(o.id, mkPhoto('packed'))} />}
          {o.status === 'ready_pickup' && <Btn small title="🤝 Hand over to courier" onPress={() => vendorHandover(o.id)} />}
          {(o.status === 'picked_up' || o.status === 'delivered' || o.status === 'handover_done') &&
            ['product', 'packed'].map((k) => o.photos[k] ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
        </Card>
      ))}

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
