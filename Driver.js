// Driver board (V16): real background tracking (Android foreground service), real pickup /
// delivery photos, offers with a visible countdown + custom counter, distance and Google Maps nav.
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { C, ORDER_STATUS, peso, BG_GEO, distanceKm, fmtKm, navUrl } from './lib';
import { useStore } from './store';
import { startBgTracking, stopBgTracking, publishLocation } from './tracking';
import { takeProofPhoto } from './media';
import { Btn, Card, Countdown, Field, Row, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble } from './Customer';

export default function Driver() {
  const { s, driverPickup, driverDeliver, offerAnswer, toggleOnline, updateDriverLocation } = useStore();
  const [counter, setCounter] = useState({});
  const [busy, setBusy] = useState(null);
  const [trk, setTrk] = useState({ state: 'idle' }); // idle | starting | bg | fg | denied
  const phone = s.auth && s.auth.phone;

  // Online → start background tracking (foreground service) + a foreground watcher for the live UI.
  useEffect(() => {
    if (!s.driverOnline) { stopBgTracking(); setTrk({ state: 'idle' }); return undefined; }
    let alive = true, sub = null;
    (async () => {
      setTrk({ state: 'starting' });
      const r = await startBgTracking(phone || 'me');
      if (!alive) return;
      setTrk(r.ok ? { state: 'bg' } : { state: r.reason === 'foreground-denied' ? 'denied' : 'fg', reason: r.reason, message: r.message });
      try {
        const Location = require('expo-location');
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted || !alive) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 }, (pos) => {
          if (!alive) return;
          updateDriverLocation(phone || 'me', pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'fg');
          if (!r.ok) publishLocation(phone, pos.coords, 'fg'); // fg-only fallback publishes itself
        });
      } catch (e) { /* location module unavailable */ }
    })();
    // Leaving this screen must NOT stop the background service — only going offline / logging out does.
    return () => { alive = false; if (sub) sub.remove(); };
  }, [s.driverOnline]);

  const snap = async (key, kind, then) => {
    setBusy(key);
    try { const p = await takeProofPhoto({ kind, owner: phone }); if (p) then(p); } finally { setBusy(null); }
  };

  const mineOrders = s.orders.filter((o) => !o.mine && o.myRole === 'driver');
  const offers = mineOrders.filter((o) => o.status === 'driver_offer' && !o.expired && o.neg && o.neg.turn === 'me');
  const waiting = mineOrders.filter((o) => o.status === 'driver_offer' && !o.expired && o.neg && o.neg.turn === 'them');
  const active = mineOrders.filter((o) => ['accepted', 'ready_pickup', 'picked_up', 'delivered'].includes(o.status) && !o.expired);
  const completed = mineOrders.filter((o) => o.status === 'completed');
  const earnings = (s.wallet.tx || []).filter((t) => t.kind === 'delivery').reduce((a, t) => a + t.amount, 0);
  const pct = s.settings.commissions.driverPct;
  const me = (s.driverLocations || {})[phone || 'me'];
  const here = me ? { lat: me.lat, lng: me.lng } : null;
  const open = (lat, lng) => lat != null && Linking.openURL(navUrl(lat, lng)).catch(() => {});

  const statusLine = {
    idle: null,
    starting: { c: C.mute, t: '⏳ Starting location sharing…' },
    bg: { c: C.green, t: '✅ Online · live location active, works with the screen locked' },
    fg: { c: C.amber, t: '⚠️ Online, but only while the app is open. Set Location to "Allow all the time" to keep tracking with the screen locked.' },
    denied: { c: C.bad, t: '❌ Location permission denied — customers cannot see you. Enable it in Android settings.' },
  }[trk.state];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <Section title="🛵 Driver board">
        <Row icon="🟢" label="Online" right={<Switch value={!!s.driverOnline} onValueChange={(v) => toggleOnline('driver', v)} trackColor={{ true: C.green }} />} />
        {!s.driverOnline && <Txt s={12} c={C.mute} style={{ marginTop: 6 }}>Go online to start receiving offers. {BG_GEO.info}</Txt>}
        {statusLine && <Txt s={12} c={statusLine.c} style={{ marginTop: 6 }}>{statusLine.t}</Txt>}
        {s.driverOnline && trk.state !== 'bg' && trk.state !== 'starting' && trk.state !== 'idle' && (
          <Btn small kind="ghost" title="Open app settings" onPress={() => Linking.openSettings().catch(() => {})} />
        )}
        {trk.message ? <Txt s={10} c={C.mute} style={{ marginTop: 4 }}>{trk.message}</Txt> : null}
      </Section>

      <Section title="📥 Incoming offers">
        {offers.length === 0 && <Txt s={12} c={C.mute}>{s.driverOnline ? 'Waiting for offers… (demo: one arrives within ~45s)' : 'Go online first.'}</Txt>}
        {offers.map((o) => {
          const left = Math.max(0, (o.neg.deadline || 0) - Date.now());
          const total = (s.settings.offerSecs || 30) * 1000;
          const trip = distanceKm({ lat: o.pickupLat, lng: o.pickupLng }, { lat: o.dropLat, lng: o.dropLng });
          const toStore = distanceKm(here, { lat: o.pickupLat, lng: o.pickupLng });
          return (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <Txt b s={14}>{o.items}</Txt>
              <Txt s={11} c={C.mute}>{o.customer} · customer offers {peso(o.neg.amount)}{o.neg.history && o.neg.history.length > 1 ? ' (their counter was declined)' : ''}</Txt>
              <Txt s={11} c={C.mute} style={{ marginTop: 2 }}>🏪 {o.pickup}{toStore != null ? ' · ' + fmtKm(toStore) + ' from you' : ''}</Txt>
              <Txt s={11} c={C.mute}>🏠 {o.dropoff}{trip != null ? ' · trip ' + fmtKm(trip) : ''}</Txt>
              <Txt s={11} b c={left < 10000 ? C.bad : C.green} style={{ marginTop: 4 }}>⏱ {Math.ceil(left / 1000)}s to answer</Txt>
              <Countdown left={left} total={total} />
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <Btn small title={'✓ Accept ' + peso(o.neg.amount)} onPress={() => offerAnswer(o.id, 'accept')} style={{ flex: 1, marginRight: 6 }} />
                <Btn small kind="bad" title="Refuse" onPress={() => offerAnswer(o.id, 'refuse')} style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Field value={counter[o.id] || ''} onChangeText={(v) => setCounter({ ...counter, [o.id]: v.replace(/[^0-9]/g, '') })}
                       keyboardType="number-pad" placeholder="Your fare ₱" style={{ flex: 1, padding: 10 }} />
                <Btn small kind="ghost" title="Counter" disabled={!counter[o.id] || Number(counter[o.id]) <= o.neg.amount}
                     onPress={() => { offerAnswer(o.id, 'counter', Number(counter[o.id])); setCounter({ ...counter, [o.id]: '' }); }}
                     style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
              </View>
            </Card>
          );
        })}
        {waiting.map((o) => <Card key={o.id} style={{ marginBottom: 8, paddingVertical: 10 }}><Txt s={12} c={C.mute}>⏳ Waiting for {o.customer} to answer your fare of {peso(o.neg.amount)}…</Txt></Card>)}
      </Section>

      <Section title="🚚 Active">
        {active.length === 0 && <Txt s={12} c={C.mute}>No active deliveries.</Txt>}
        {active.map((o) => {
          const toStore = distanceKm(here, { lat: o.pickupLat, lng: o.pickupLng });
          const toCustomer = distanceKm(here, { lat: o.dropLat, lng: o.dropLng });
          return (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <Txt b s={14}>{o.items}</Txt>
              <Txt s={11} c={C.mute}>{o.customer} · {ORDER_STATUS[o.status] || o.status} · fare {peso(o.fee)}</Txt>
              <Txt s={11} c={C.mute} style={{ marginTop: 2 }}>🏪 {o.pickup}{toStore != null ? ' · ' + fmtKm(toStore) : ''}</Txt>
              <Txt s={11} c={C.mute}>🏠 {o.dropoff}{toCustomer != null ? ' · ' + fmtKm(toCustomer) : ''}</Txt>
              <PhotoTimeline o={o} />
              {['product', 'packed', 'pickup', 'delivery'].map((k) => (o.photos && o.photos[k]) ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
              {o.status === 'accepted' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Store is packing the order…</Txt>}
              {o.status === 'ready_pickup' && <>
                <Btn small kind="ghost" title="🧭 Navigate to store" onPress={() => open(o.pickupLat, o.pickupLng)} />
                <Btn small busy={busy === 'u' + o.id} title="📦 Picked up — take photo" onPress={() => snap('u' + o.id, 'pickup', (p) => driverPickup(o.id, p))} />
              </>}
              {o.status === 'picked_up' && <>
                <Btn small kind="ghost" title="🧭 Navigate to customer" onPress={() => open(o.dropLat, o.dropLng)} />
                <Btn small busy={busy === 'd' + o.id} title="🏠 Delivered — take photo" onPress={() => snap('d' + o.id, 'delivery', (p) => driverDeliver(o.id, p))} />
              </>}
              {o.status === 'delivered' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>✅ Delivered — waiting for the customer to confirm…</Txt>}
            </Card>
          );
        })}
      </Section>

      <Section title={'💰 Earnings: ' + peso(earnings) + ' net (after ' + pct + '% fee)'}>
        {completed.length === 0 && <Txt s={12} c={C.mute}>No completed deliveries yet.</Txt>}
        {completed.slice(0, 8).map((o) => <Card key={o.id} style={{ paddingVertical: 8 }}><Txt s={12}>🛵 {o.items} · {peso(o.fee)}</Txt></Card>)}
      </Section>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
