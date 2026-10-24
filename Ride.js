// Pabili PH — passenger ride request (V17). No photos: pickup, destination, an opening fare, then the
// same offer → counter → accept negotiation as store orders, with nearby drivers offered one by one.
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { C, peso, distanceKm, fmtKm } from './lib';
import { useStore } from './store';
import { Btn, Card, Chip, Field, Section, Txt } from './ui';

const geocode = async (text) => {
  try {
    const Location = require('expo-location');
    const r = await Location.geocodeAsync(text);
    return r && r[0] ? { lat: r[0].latitude, lng: r[0].longitude } : null;
  } catch (e) { return null; }
};

export default function RideForm({ onClose, onPlaced }) {
  const { s, placeRide } = useStore();
  const r = s.settings.ride;
  const saved = s.addresses || [];
  const def = saved.find((a) => a.default) || saved[0];
  const [pickup, setPickup] = useState(def ? { addr: def.addr, lat: def.lat, lng: def.lng } : { addr: '', lat: null, lng: null });
  const [dest, setDest] = useState({ addr: '', lat: null, lng: null });
  const [note, setNote] = useState('');
  const [fee, setFee] = useState('');
  const [pay, setPay] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const f = Number(fee) || 0;
  const ready = pickup.addr.trim() && dest.addr.trim() && f >= r.minFare;

  const useHere = async () => {
    setLocBusy(true);
    try {
      const Location = require('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setEst({ error: 'Location permission is off — type your pickup address instead.' }); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let human = `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const x = Array.isArray(rev) && rev[0];
        if (x) human = [x.name, x.street, x.city || x.subregion].filter(Boolean).join(', ') || human;
      } catch (e) { /* keep GPS text */ }
      setPickup({ addr: human, lat, lng });
    } catch (e) { setEst({ error: 'Could not read your GPS position.' }); }
    finally { setLocBusy(false); }
  };

  const estimate = async () => {
    setEst({ busy: true });
    const a = pickup.lat != null ? pickup : { ...pickup, ...((await geocode(pickup.addr)) || {}) };
    const b = dest.lat != null ? dest : { ...dest, ...((await geocode(dest.addr)) || {}) };
    setPickup(a); setDest(b);
    const km = distanceKm(a, b);
    if (km == null) { setEst({ error: "Couldn't find one of the places on the map — enter your own fare." }); return; }
    const road = km * 1.3; // straight line → rough road distance
    const fare = Math.max(r.minFare, Math.round((r.base + r.perKm * road) / 5) * 5);
    setEst({ km: road, fare }); setFee(String(fare));
  };

  const place = async () => {
    setBusy(true);
    const ok = await placeRide({ pickup, dest, fee: f, note, payVia: pay });
    setBusy(false);
    if (ok) { if (onPlaced) onPlaced(); onClose(); }
  };
  const chip = (on) => ({ borderWidth: 1.5, borderColor: on ? C.green : C.line, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, marginBottom: 8, backgroundColor: on ? '#EAF3EF' : '#fff' });

  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingTop: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={22}>✕</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>🚕 Request a ride</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.9 }}>A nearby driver comes to you and takes you to your destination.</Txt>
      </View>
      <View style={{ padding: 16 }}>
        <Section title="📍 Pickup — where the driver finds you">
          <Field value={pickup.addr} onChangeText={(v) => { setPickup({ addr: v, lat: null, lng: null }); setEst(null); }} placeholder="Street, barangay, landmark" />
          <Btn small kind="ghost" busy={locBusy} title="📡 Use my current location (best for the driver)" onPress={useHere} />
          {saved.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
              {saved.map((a) => <Chip key={a.id} label={a.label} onPress={() => { setPickup({ addr: a.addr, lat: a.lat, lng: a.lng }); setEst(null); }} />)}
            </View>
          )}
        </Section>

        <Section title="🏁 Destination — where you want to go">
          <Field value={dest.addr} onChangeText={(v) => { setDest({ addr: v, lat: null, lng: null }); setEst(null); }} placeholder="Where to? (place, street, barangay)" />
          {saved.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
              {saved.map((a) => <Chip key={a.id} label={a.label} onPress={() => { setDest({ addr: a.addr, lat: a.lat, lng: a.lng }); setEst(null); }} />)}
            </View>
          )}
          <Field value={note} onChangeText={setNote} placeholder="Note for the driver (optional): 2 passengers, luggage…" style={{ marginTop: 8 }} />
        </Section>

        <Section title="💰 Your fare offer">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Field value={fee} onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="₱"
                   style={{ width: 120, textAlign: 'center', fontSize: 22, fontWeight: '800' }} />
            <Btn small kind="ghost" busy={est && est.busy} title="Suggest a fare" onPress={estimate} style={{ marginLeft: 10, marginTop: 0, paddingHorizontal: 14 }} />
          </View>
          {est && est.km != null && <Txt s={12} c={C.green} style={{ marginTop: 6 }}>≈ {fmtKm(est.km)} by road · suggested {peso(est.fare)}. You can change it.</Txt>}
          {est && est.error ? <Txt s={12} c={C.bad} style={{ marginTop: 6 }}>{est.error}</Txt> : null}
          <Txt s={11} c={C.mute} style={{ marginTop: 6 }}>Minimum {peso(r.minFare)}. The driver can accept or suggest another fare, and you can accept, counter or choose another driver.</Txt>
        </Section>

        <Section title="Pay with">
          <View style={{ flexDirection: 'row' }}>
            <Pressable onPress={() => setPay('cash')} style={chip(pay === 'cash')}><Txt s={13} b={pay === 'cash'}>💵 Cash to the driver</Txt></Pressable>
            <Pressable onPress={() => setPay('wallet')} style={chip(pay === 'wallet')}><Txt s={13} b={pay === 'wallet'}>👛 Wallet ({peso(s.wallet.balance)})</Txt></Pressable>
          </View>
        </Section>

        <Card style={{ backgroundColor: '#F4F8F5' }}>
          <Txt s={12} c={C.mute}>🔒 Once a driver accepts you will see their name, vehicle and plate number, can call them, and can follow them live on the map.</Txt>
        </Card>
        <Btn title={'🚕 Request ride · ' + peso(f)} busy={busy} disabled={!ready} onPress={place} />
        <View style={{ height: 100 }} />
      </View>
    </ScrollView>
  );
}
