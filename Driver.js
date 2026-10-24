// Driver board (V17): real offers from real customers — store deliveries AND passenger rides.
// Offers arrive one driver at a time with a countdown; accept, refuse, or counter the fare.
import React, { useEffect, useState } from 'react';
import { Image, Linking, ScrollView, Switch, View } from 'react-native';
import { C, peso, BG_GEO, distanceKm, fmtKm, mapsUrl, statusText } from './lib';
import { useStore } from './store';
import { startBgTracking, stopBgTracking, publishLocation, heartbeat } from './tracking';
import { takeProofPhoto } from './media';
import { Btn, Card, Field, Row, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble, Remaining, NegotiationBox } from './Customer';

export default function Driver() {
  const { s, driverPickup, driverDeliver, driverOfferAnswer, rideStep, driverCancel, shopperQuote, shopperRespond, toggleOnline, updateDriverLocation } = useStore();
  const [counter, setCounter] = useState({});
  const [price, setPrice] = useState({});
  const [shots, setShots] = useState({}); // errand: orderId -> uploaded item photo
  const [busy, setBusy] = useState(null);
  const [trk, setTrk] = useState({ state: 'idle' }); // idle | starting | bg | fg | denied
  const phone = s.auth && s.auth.phone;

  // Online → background tracking (foreground service) + a foreground watcher; heartbeat keeps a parked courier "online".
  useEffect(() => {
    if (!s.driverOnline) { stopBgTracking(); setTrk({ state: 'idle' }); return undefined; }
    let alive = true, sub = null, first = true;
    const hb = setInterval(() => heartbeat(phone), 30000);
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
          if (!r.ok) { publishLocation(phone, pos.coords, 'fg', first); first = false; } // foreground-only fallback publishes itself
        });
      } catch (e) { /* location module unavailable */ }
    })();
    // Leaving this screen must NOT stop the background service — only going offline / logging out does.
    return () => { alive = false; clearInterval(hb); if (sub) sub.remove(); };
  }, [s.driverOnline]);

  const snap = async (key, kind, then) => {
    setBusy(key);
    try { const p = await takeProofPhoto({ kind, owner: phone }); if (p) then(p); } finally { setBusy(null); }
  };

  const mine = s.orders.filter((o) => o.myRole === 'driver');
  const offers = mine.filter((o) => o.status === 'driver_offer' && o.neg && o.neg.turn === 'me');
  const waiting = mine.filter((o) => o.status === 'driver_talk');
  const active = mine.filter((o) => o.driverPhone === phone && ['accepted', 'quote_review', 'vendor_talk', 'ready_pickup', 'picked_up', 'delivered'].includes(o.status));
  const completed = mine.filter((o) => o.driverPhone === phone && o.status === 'completed');
  const earned = (s.wallet.tx || []).filter((t) => t.kind === 'delivery').reduce((a, t) => a + t.amount, 0);
  const pct = s.settings.commissions.driverPct;
  const me = (s.driverLocations || {})[phone || 'me'];
  const here = me ? { lat: me.lat, lng: me.lng } : null;
  const nav = (lat, lng, text) => Linking.openURL(mapsUrl(lat, lng, text)).catch(() => {});
  const call = (p) => Linking.openURL('tel:' + p).catch(() => {});

  const statusLine = {
    idle: null,
    starting: { c: C.mute, t: '⏳ Starting location sharing…' },
    bg: { c: C.green, t: '✅ Online · you receive offers, location is live even with the screen locked' },
    fg: { c: C.amber, t: '⚠️ Online, but only while the app is open. Set Location to "Allow all the time" (Android) / "Always" (iPhone) to keep receiving offers with the screen locked.' },
    denied: { c: C.bad, t: '❌ Location permission denied — customers and dispatch cannot see you. Enable it in Settings → Pabili → Location on your phone.' },
  }[trk.state];

  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <Section title="🛵 Driver board">
        <Row icon="🟢" label="Online" right={<Switch value={!!s.driverOnline} onValueChange={(v) => toggleOnline('driver', v)} trackColor={{ true: C.green }} />} />
        {!s.driverOnline && <Txt s={12} c={C.mute} style={{ marginTop: 6 }}>Go online to receive delivery offers and ride requests. {BG_GEO.info}</Txt>}
        {statusLine && <Txt s={12} c={statusLine.c} style={{ marginTop: 6 }}>{statusLine.t}</Txt>}
        {s.driverOnline && !['bg', 'starting', 'idle'].includes(trk.state) && (
          <Btn small kind="ghost" title="Open app settings" onPress={() => Linking.openSettings().catch(() => {})} />
        )}
        {trk.message ? <Txt s={10} c={C.mute} style={{ marginTop: 4 }}>{trk.message}</Txt> : null}
      </Section>

      <Section title="📥 Incoming offers">
        {offers.length === 0 && <Txt s={12} c={C.mute}>{s.driverOnline ? 'Waiting for an offer near you…' : 'Go online first.'}</Txt>}
        {offers.map((o) => {
          const ride = o.kind === 'ride', errand = o.kind === 'errand';
          const trip = errand ? null : distanceKm({ lat: o.pickupLat, lng: o.pickupLng }, { lat: o.dropLat, lng: o.dropLng });
          const toPickup = distanceKm(here, { lat: o.pickupLat, lng: o.pickupLng });
          return (
            <Card key={o.id} style={{ marginBottom: 10, borderColor: C.gold, borderWidth: 1.5 }}>
              <Txt b s={15}>{ride ? '🚕 Passenger ride' : errand ? '🧭 Errand: buy it & deliver' : '🛍 ' + o.items}</Txt>
              {errand ? <Txt s={12}>{o.items}{o.budget ? '  ·  💡 budget ' + peso(o.budget) : ''}</Txt> : null}
              <Txt s={11} c={C.mute}>{o.customer} · customer offers {peso(o.neg.amount)} · {o.payVia === 'wallet' ? '👛 wallet' : '💵 cash'}</Txt>
              <Txt s={11} c={C.mute} style={{ marginTop: 2 }}>{ride ? '📍 ' : '🏪 '}{o.pickup}{!errand && toPickup != null ? ' · ' + fmtKm(toPickup) + ' from you' : ''}</Txt>
              <Txt s={11} c={C.mute}>{ride ? '🏁 ' : '🏠 '}{o.dropoff}{errand && toPickup != null ? ' · ' + fmtKm(toPickup) + ' from you' : ''}{trip != null ? ' · trip ' + fmtKm(trip) : ''}</Txt>
              {ride && o.items && o.items !== 'Passenger ride' ? <Txt s={11} c={C.mute}>📝 {o.items}</Txt> : null}
              {o.offerDeadline ? <Remaining until={o.offerDeadline} total={s.settings.offerSecs} /> : null}
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <Btn small busy={busy === 'a' + o.id} title={'✓ Accept ' + peso(o.neg.amount)}
                     onPress={async () => { setBusy('a' + o.id); await driverOfferAnswer(o, 'accept'); setBusy(null); }} style={{ flex: 1, marginRight: 6 }} />
                <Btn small kind="bad" title="Refuse" onPress={() => driverOfferAnswer(o, 'refuse')} style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Field value={counter[o.id] || ''} onChangeText={(v) => setCounter({ ...counter, [o.id]: v.replace(/[^0-9]/g, '') })}
                       keyboardType="number-pad" placeholder="Your fare ₱" style={{ flex: 1, padding: 10 }} />
                <Btn small kind="ghost" title="Counter" disabled={!counter[o.id] || Number(counter[o.id]) === o.neg.amount}
                     onPress={() => { driverOfferAnswer(o, 'counter', Number(counter[o.id])); setCounter({ ...counter, [o.id]: '' }); }}
                     style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
              </View>
            </Card>
          );
        })}
        {waiting.map((o) => (
          <Card key={o.id} style={{ marginBottom: 8, paddingVertical: 10 }}>
            <Txt s={12} c={C.mute}>⏳ You asked {peso(o.neg ? o.neg.amount : 0)} for {o.kind === 'ride' ? 'a ride' : 'a delivery'} — waiting for {o.customer}…</Txt>
            {o.offerDeadline ? <Remaining until={o.offerDeadline} total={s.settings.customerSecs} /> : null}
          </Card>
        ))}
      </Section>

      <Section title="🚚 Active">
        {active.length === 0 && <Txt s={12} c={C.mute}>No active trips or deliveries.</Txt>}
        {active.map((o) => {
          const ride = o.kind === 'ride', errand = o.kind === 'errand';
          const toStore = errand ? null : distanceKm(here, { lat: o.pickupLat, lng: o.pickupLng });
          const shot = shots[o.id];
          return (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <Txt b s={15}>{ride ? '🚕 Ride with ' + o.customer : errand ? '🧭 Errand for ' + o.customer : '🛍 ' + o.items}</Txt>
              {errand ? <Txt s={12}>{o.items}{o.budget ? '  ·  💡 budget ' + peso(o.budget) : ''}</Txt> : null}
              <Txt s={11} c={C.mute}>{statusText(o)} · fare {peso(o.fee)}</Txt>
              <Txt s={11} c={C.mute} style={{ marginTop: 2 }}>{ride ? '📍 ' : '🏪 '}{o.pickup}{toStore != null ? ' · ' + fmtKm(toStore) + ' from you' : ''}</Txt>
              <Txt s={11} c={C.mute}>{ride ? '🏁 ' : '🏠 '}{o.dropoff}</Txt>
              <Txt s={12} b c={C.green} style={{ marginTop: 4 }}>
                {o.payVia === 'wallet' ? '👛 Paid through the wallet — nothing to collect.'
                  : ride ? '💵 Collect ' + peso(o.fee) + ' cash from the passenger.'
                  : errand ? '💵 Collect ' + peso(o.fee + o.price) + ' cash. You advance the item price at the shop — only after the customer approves it.'
                  : '💵 Collect ' + peso(o.fee + o.price) + ' cash (pay the store ' + peso(o.price) + ' at pickup).'}
              </Txt>
              {!ride && <PhotoTimeline o={o} />}
              {errand && o.payVia === 'wallet' && o.price > 0 ? <Txt s={11} c={C.mute}>You will be refunded the item price + your fee through the wallet.</Txt> : null}
              {!ride && ['product', 'packed', 'pickup', 'delivery'].map((k) => (o.photos && o.photos[k]) ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
              <Btn small kind="ghost" title={'📞 Call ' + (ride ? 'passenger' : 'customer')} onPress={() => call(o.customerPhone)} />

              {ride && o.status === 'accepted' && <>
                <Btn small kind="ghost" title="🧭 Navigate to the passenger" onPress={() => nav(o.pickupLat, o.pickupLng, o.pickup)} />
                <Btn small busy={busy === 'r' + o.id} title="📍 I have arrived" onPress={async () => { setBusy('r' + o.id); await rideStep(o, 'arrived'); setBusy(null); }} />
              </>}
              {ride && o.status === 'ready_pickup' && <Btn small busy={busy === 'r' + o.id} title="▶ Passenger on board — start trip" onPress={async () => { setBusy('r' + o.id); await rideStep(o, 'start'); setBusy(null); }} />}
              {ride && o.status === 'picked_up' && <>
                <Btn small kind="ghost" title="🧭 Navigate to the destination" onPress={() => nav(o.dropLat, o.dropLng, o.dropoff)} />
                <Btn small busy={busy === 'r' + o.id} title="🏁 End trip" onPress={async () => { setBusy('r' + o.id); await rideStep(o, 'end'); setBusy(null); }} />
              </>}

              {o.kind === 'order' && o.status === 'accepted' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ The store is packing the order…</Txt>}

              {errand && o.status === 'accepted' && (
                <View style={{ marginTop: 8 }}>
                  <Txt s={12} c={C.mute}>Find the item at a shop. Send the customer a photo and the price — nothing is bought until they approve.</Txt>
                  <Btn small kind="ghost" title="🧭 Find shops nearby" onPress={() => nav(null, null, (o.pickup && !o.pickup.startsWith('Any shop') ? o.pickup : 'store') + ' near me')} />
                  <Btn small kind={shot ? 'ghost' : 'main'} busy={busy === 'q' + o.id} title={shot ? '✓ Item photo uploaded — tap to retake' : '📷 Photo of the item at the shop (required)'}
                       onPress={() => snap('q' + o.id, 'product', (p) => setShots({ ...shots, [o.id]: p }))} />
                  {shot ? <Image source={{ uri: shot.uri }} style={{ width: '100%', height: 140, borderRadius: 10, marginTop: 8 }} resizeMode="cover" /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Field value={price[o.id] || ''} onChangeText={(v) => setPrice({ ...price, [o.id]: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="Item price ₱" style={{ flex: 1, padding: 10 }} />
                    <Btn small title="Send to customer" disabled={!shot || !price[o.id]} onPress={() => shopperQuote(o, Number(price[o.id]), shot)} style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 12 }} />
                  </View>
                </View>
              )}
              {errand && o.status === 'quote_review' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Waiting for {o.customer} to approve {peso(o.neg ? o.neg.amount : o.price)}… (do not buy yet)</Txt>}
              {errand && o.status === 'vendor_talk' && o.neg && o.neg.turn === 'me' && (
                <NegotiationBox title="💬 The customer counter-offered the item price" amount={o.neg.amount} note={'Your price was ' + peso(o.price)}
                  onAccept={() => shopperRespond(o, 'accept')} onCounter={(a) => shopperRespond(o, 'counter', a)}
                  onRefuse={() => shopperRespond(o, 'keep')} refuseLabel="Keep my price" />
              )}
              {errand && o.status === 'vendor_talk' && o.neg && o.neg.turn !== 'me' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Waiting for the customer…</Txt>}
              {errand && o.status === 'ready_pickup' && <>
                <Txt s={12} b c={C.green} style={{ marginTop: 8 }}>✅ Approved at {peso(o.price)} — buy it now.</Txt>
                <Btn small busy={busy === 'u' + o.id} title="🧾 Bought it — take a photo & start delivery" onPress={() => snap('u' + o.id, 'pickup', (p) => driverPickup(o, p))} />
              </>}
              {o.kind === 'order' && o.status === 'ready_pickup' && <>
                <Btn small kind="ghost" title="🧭 Navigate to the store" onPress={() => nav(o.pickupLat, o.pickupLng, o.pickup)} />
                <Btn small busy={busy === 'u' + o.id} title="📦 Picked up — take photo" onPress={() => snap('u' + o.id, 'pickup', (p) => driverPickup(o, p))} />
              </>}
              {!ride && o.status === 'picked_up' && <>
                <Btn small kind="ghost" title="🧭 Navigate to the customer" onPress={() => nav(o.dropLat, o.dropLng, o.dropoff)} />
                <Btn small busy={busy === 'd' + o.id} title="🏠 Delivered — take photo" onPress={() => snap('d' + o.id, 'delivery', (p) => driverDeliver(o, p))} />
              </>}

              {o.status === 'delivered' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>✅ Done — waiting for the {ride ? 'passenger' : 'customer'} to confirm…</Txt>}
              {(o.status === 'accepted' || (ride && o.status === 'ready_pickup') || (errand && ['quote_review', 'vendor_talk'].includes(o.status))) && <Btn small kind="bad" title={ride ? 'Cancel this trip' : errand && o.status !== 'accepted' ? "Can't buy it — release this errand" : 'Cancel this delivery'} onPress={() => driverCancel(o)} />}
            </Card>
          );
        })}
      </Section>

      <Section title={'💰 Earned ' + peso(earned) + ' (after ' + pct + '% fee) · wallet ' + peso(s.wallet.balance)}>
        {completed.length === 0 && <Txt s={12} c={C.mute}>No completed trips yet.</Txt>}
        {completed.slice(0, 8).map((o) => <Card key={o.id} style={{ paddingVertical: 8, marginBottom: 6 }}><Txt s={12}>{o.kind === 'ride' ? '🚕 ' + o.dropoff : o.kind === 'errand' ? '🧭 ' + o.items : '🛵 ' + o.items} · {peso(o.fee)}</Txt></Card>)}
      </Section>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
