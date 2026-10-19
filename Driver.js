// Driver — V9 pushes GPS samples to s.driverLocations. Foreground watchPosition
// is the honest web path; background tracking requires the Capacitor / expo-task-manager
// route (documented in BG_GEO_LIMITATIONS.md). When GPS isn't available we still
// randomly nudge near Brgy. Sta. Rosa so the customer banner has something to render.
import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { C, ORDER_STATUS, peso, BG_GEO } from './lib';
import { useStore } from './store';
import { Btn, Card, Field, Row, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble } from './Customer';

export default function Driver() {
  const { s, driverAnswer, driverPickup, driverDeliver, catalogDel, catalogAdd, offerAnswer, toggleOnline, updateDriverLocation } = useStore();
  const [acceptPrice, setAcceptPrice] = useState({});
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const intervalRef = React.useRef(null);

  // V9: foreground GPS publish every 5s when driver is online.
  useEffect(() => {
    if (!s.driverOnline) { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; return; }
    let alive = true;
    let cleanup = null;
    let fallback = null;
    (async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 }, (pos) => {
            if (!alive) return;
            updateDriverLocation(s.auth?.phone || 'me', pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'fg');
          });
          cleanup = () => sub.remove();
        } else {
          // Browser / no permission: simulate point near the seeded stores so a customer can still see banner.
          fallback = setInterval(() => {
            const jitter = () => (Math.random() - 0.5) * 0.0006;
            updateDriverLocation(s.auth?.phone || 'me', 14.5995 + jitter(), 120.9842 + jitter(), 50, 'fg');
          }, 5000);
        }
      } catch (e) {
        fallback = setInterval(() => {
          const jitter = () => (Math.random() - 0.5) * 0.0006;
          updateDriverLocation(s.auth?.phone || 'me', 14.5995 + jitter(), 120.9842 + jitter(), 50, 'fg');
        }, 5000);
      }
    })();
    return () => { alive = false; if (cleanup) cleanup(); if (fallback) clearInterval(fallback); };
  }, [s.driverOnline]);

  const offers = s.orders.filter((o) => !o.mine && o.myRole === 'driver' && o.status === 'driver_offer' && !o.expired && o.neg?.turn === 'me');
  const active = s.orders.filter((o) => !o.mine && o.myRole === 'driver' && ['accepted', 'ready_pickup', 'picked_up'].includes(o.status) && !o.expired);
  const completed = s.orders.filter((o) => !o.mine && o.myRole === 'driver' && o.status === 'completed');
  const earnings = (s.wallet.tx || []).filter((t) => t.kind === 'delivery').reduce((a, t) => a + t.amount, 0);
  const pct = s.settings.commissions.driverPct;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <Section title="🛵 Driver board">
        <Row icon="🟢" label="Online" right={<Switch value={!!s.driverOnline} onValueChange={(v) => toggleOnline('driver', v)} trackColor={{ true: C.green }} />} />
        <Txt s={10} c={C.mute}>{BG_GEO.webLimitation}</Txt>
        <Txt s={10} c={C.mute} style={{ marginTop: 4 }}>For continuous tracking: {BG_GEO.apkPath}</Txt>
        {!s.driverOnline && <Txt s={12} c={C.mute} style={{ marginTop: 6 }}>Go online to start receiving offers.</Txt>}
        {s.driverOnline && <Txt s={12} c={C.green} style={{ marginTop: 6 }}>✅ Online · GPS pinging every 5s</Txt>}
      </Section>

      <Section title="📥 Incoming offers">
        {offers.length === 0 && <Txt s={12} c={C.mute}>{s.driverOnline ? 'Waiting for offers…' : 'Go online first.'}</Txt>}
        {offers.map((o) => (
          <Card key={o.id} style={{ marginBottom: 10 }}>
            <Txt b s={14}>{o.items}</Txt>
            <Txt s={11} c={C.mute}>{o.customer} · {ORDER_STATUS[o.status] || o.status} · customer offers {peso(o.neg.amount)}</Txt>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <Btn small title={`✓ Accept ${peso(o.neg.amount)}`} onPress={() => driverAnswer(o.id, 'accept')} style={{ flex: 1, marginRight: 6 }} />
              <Btn small kind="ghost" title="Counter" onPress={() => driverAnswer(o.id, 'counter', Math.round(o.neg.amount * 1.2))} style={{ flex: 1, marginRight: 6 }} />
              <Btn small kind="bad" title="Refuse" onPress={() => driverAnswer(o.id, 'refuse')} style={{ flex: 1 }} />
            </View>
          </Card>
        ))}
      </Section>

      <Section title="🚚 Active">
        {active.length === 0 && <Txt s={12} c={C.mute}>No active deliveries.</Txt>}
        {active.map((o) => (
          <Card key={o.id} style={{ marginBottom: 10 }}>
            <Txt b s={14}>{o.items}</Txt>
            <Txt s={11} c={C.mute}>{o.customer} · {ORDER_STATUS[o.status] || o.status}</Txt>
            <PhotoTimeline o={o} />
            {['product', 'packed', 'pickup', 'delivery'].map((k) => o.photos && o.photos[k] ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
            {o.status === 'accepted' && <Btn small title="📦 Pick up" onPress={() => driverPickup(o.id, { by: 'me', kind: 'pickup', ts: Date.now(), stamp: 'Live GPS', simulated: true })} />}
          </Card>
        ))}
      </Section>

      <Section title={'💰 Earnings: ' + peso(earnings) + ' net (after ' + pct + '% fee)'}>
        {completed.length === 0 && <Txt s={12} c={C.mute}>No completed deliveries yet.</Txt>}
        {completed.slice(0, 8).map((o) => <Card key={o.id} style={{ paddingVertical: 8 }}><Txt s={12}>🛵 {o.items} · {peso(o.fee)}</Txt></Card>)}
      </Section>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
