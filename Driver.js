// Driver dashboard: offers with multi-round negotiation, photo-gated pickup/delivery, earnings
import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { C, ORDER_STATUS, peso } from './lib';
import { useStore } from './store';
import { Btn, Card, Txt } from './ui';
import { Negotiation, PhotoTimeline, photoBubble } from './Customer';

const mkPhoto = (kind) => ({ by: 'me', kind, ts: Date.now(), stamp: new Date().toLocaleString() + ' · GPS locked', simulated: true });

export default function Driver() {
  const { s, offerAnswer, driverPickup, driverDeliver, toggleOnline } = useStore();
  const offers = s.orders.filter((o) => !o.mine && o.myRole === 'driver' && !o.expired && o.status !== 'completed' && o.status !== 'cancelled');
  const done = s.orders.filter((o) => !o.mine && o.myRole === 'driver' && o.status === 'completed');
  const earnings = s.wallet.tx.filter((t) => t.kind === 'delivery').reduce((a, t) => a + t.amount, 0);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt b s={20}>🛵 Courier board</Txt>
          <Txt s={12} c={C.mute}>{offers.length} live · {done.length} completed · earned {peso(earnings)}</Txt>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Txt s={11} c={C.mute}>Online</Txt>
          <Switch value={!!s.driverOnline} onValueChange={(v) => toggleOnline('driver', v)} trackColor={{ true: C.green }} />
        </View>
      </View>
      {!s.driverOnline && <Card><Txt s={13} c={C.mute}>You are offline — go online to receive offers. New offers arrive here automatically.</Txt></Card>}
      {s.driverOnline && offers.length === 0 && <Card><Txt s={13} c={C.mute}>Listening for nearby orders… (a bot offer arrives within ~45s)</Txt></Card>}
      {offers.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12, borderColor: o.neg && o.neg.turn === 'me' ? C.gold : C.line, borderWidth: o.neg && o.neg.turn === 'me' ? 2 : 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt b s={15} style={{ flex: 1 }}>{o.items}</Txt>
            <Txt b s={15} c={C.green}>{peso(o.fee)}</Txt>
          </View>
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · {o.pickup} → {o.dropoff}</Txt>
          <Txt s={11} c={C.mute}>{ORDER_STATUS[o.status] || o.status}</Txt>
          <PhotoTimeline o={o} />
          {o.neg && <Negotiation o={o} onAnswer={offerAnswer} counterLabel="Ask more" />}
          {o.status === 'accepted' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Waiting for the store to pack…</Txt>}
          {o.status === 'ready_pickup' && (
            <View>
              {photoBubble(o.photos.packed)}
              <Btn small title="📷 Take pickup proof photo" onPress={() => driverPickup(o.id, mkPhoto('pickup'))} />
            </View>
          )}
          {o.status === 'picked_up' && <Btn small title="📷 Take delivery proof photo" onPress={() => driverDeliver(o.id, mkPhoto('delivery'))} />}
          {o.status === 'delivered' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Waiting for customer confirmation…</Txt>}
        </Card>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
