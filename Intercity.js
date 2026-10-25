// Galabili PH — Intercity travel requests (V28). A passenger posts an intercity trip
// (from-city → to-city, date, passengers). REGISTERED drivers browse the open
// requests in a dedicated "Intercity" tab on the Driver board and send their OWN
// offers (fare + message). The customer sees every offer sorted best-first,
// picks one, and contact info opens (call/WhatsApp). Accepting one offer
// automatically declines all others.
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { C, peso, fmtKm, distanceKm } from './lib';
import { useStore } from './store';
import { Btn, Card, Chip, Field, Section, Txt } from './ui';

const CITIES = ['Manila', 'Quezon City', 'Makati', 'Taguig', 'Pasay', 'Cebu City', 'Davao City', 'Baguio',
  'Batangas', 'Lucena', 'Naga', 'Legazpi', 'Iloilo', 'Bacolod', 'Cagayan de Oro', 'Zamboanga', 'Angeles', 'Olongapo'];
const chip = (on) => ({ borderWidth: 1.5, borderColor: on ? C.green : C.line, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, marginBottom: 8, backgroundColor: on ? '#EAF3EF' : '#fff' });
const pick = (open) => open.length ? open[0].addr : null;

const dateLabel = (iso) => {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return iso; }
};

export default function IntercityForm({ onClose, onPlaced }) {
  const { s, placeIntercity, cancelIntercity, acceptIntercityOffer } = useStore();
  const mine = (s.intercity || []).filter((t) => t.mine);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [pax, setPax] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = from.trim() && to.trim() && from.trim().toLowerCase() !== to.trim().toLowerCase() && date && Number(pax) >= 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingTop: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={22}>✕</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>🚌 Travel between cities</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.9 }}>Post your trip — registered intercity drivers send you their own offers. You choose the best one and agree on the details with them directly.</Txt>
      </View>
      <View style={{ padding: 16 }}>
        <Section title="🏙 From city">
          <Field value={from} onChangeText={setFrom} placeholder="e.g. Manila" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {CITIES.map((c) => <Chip key={c} label={c} active={from === c} onPress={() => setFrom(c)} />)}
          </View>
        </Section>

        <Section title="🏁 To city">
          <Field value={to} onChangeText={setTo} placeholder="e.g. Baguio" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {CITIES.map((c) => <Chip key={c} label={c} active={to === c} onPress={() => setTo(c)} />)}
          </View>
          {from && to && from.trim().toLowerCase() === to.trim().toLowerCase() && (
            <Txt s={12} c={C.bad} style={{ marginTop: 6 }}>From and To must be different cities.</Txt>
          )}
        </Section>

        <Section title="📅 Travel date & passengers">
          <Field value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Field value={pax} onChangeText={(v) => setPax(v.replace(/[^0-9]/g, '') || '1')} keyboardType="number-pad"
                 placeholder="Passengers" style={{ marginTop: 8 }} />
          <Field value={note} onChangeText={setNote} placeholder="Notes (optional): big luggage, pet, pickup point…"
                 multiline style={{ marginTop: 8, minHeight: 70 }} />
        </Section>

        <Btn title={'🚌 Post trip request'} busy={busy} disabled={!ready}
             onPress={async () => { setBusy(true); const ok = await placeIntercity({ fromCity: from.trim(), toCity: to.trim(), date, passengers: Math.max(1, Number(pax) || 1), note: note.trim() }); setBusy(false); if (ok) { if (onPlaced) onPlaced(); onClose(); } }} />

        {mine.length > 0 && (
          <Section title="🧾 My trip requests & driver offers">
            {mine.map((t) => (
              <Card key={t.id} style={{ marginBottom: 12 }}>
                <Txt b s={15}>🚌 {t.fromCity} → {t.toCity}</Txt>
                <Txt s={12} c={C.mute}>{dateLabel(t.date)} · {t.passengers} passenger(s){t.note ? ' · 📝 ' + t.note : ''}</Txt>
                <Txt s={11} b c={t.status === 'open' ? C.amber : t.status === 'booked' ? C.green : C.mute} style={{ marginTop: 4 }}>
                  {t.status === 'open' ? '⏳ Open — waiting for driver offers'
                    : t.status === 'booked' ? '✅ Booked — ' + (t.bookedOffer ? '₱' + t.bookedOffer.price + ' · driver ' + (t.bookedOffer.driverName || t.bookedOffer.driverPhone) : 'confirmed')
                    : 'Cancelled'}
                </Txt>

                {t.status === 'open' && (t.offers || []).length === 0 && (
                  <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>No offers yet — drivers will see this trip in their Intercity tab.</Txt>
                )}
                {[...(t.offers || [])].sort((a, b) => a.price - b.price).map((of, i) => (
                  <Card key={of.id} style={{ marginTop: 10, backgroundColor: '#F4F8F5' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt b s={14}>🚗 {of.driverName || 'Driver'}</Txt>
                      <Txt b s={14} c={i === 0 ? C.green : C.ink}>{peso(of.price)}{i === 0 ? '  ⭐ best' : ''}</Txt>
                    </View>
                    {of.message ? <Txt s={12} c={C.mute} style={{ marginTop: 2 }}>💬 {of.message}</Txt> : null}
                    <Txt s={11} c={C.mute} style={{ marginTop: 2 }}>{new Date(of.ts).toLocaleString()}</Txt>
                    {t.status === 'open' && (
                      <Btn small title={'✓ Choose this driver · ' + peso(of.price)}
                           onPress={() => acceptIntercityOffer(t, of)} style={{ marginTop: 8 }} />
                    )}
                    {t.status === 'booked' && t.bookedOffer && t.bookedOffer.id === of.id && (
                      <>
                        <Txt s={12} b c={C.green} style={{ marginTop: 6 }}>✅ You booked this driver. Agree on the exact pickup point and time by phone/WhatsApp:</Txt>
                        <View style={{ flexDirection: 'row', marginTop: 6 }}>
                          <Btn small kind="ghost" title={'📞 ' + of.driverPhone} onPress={() => Linking.openURL('tel:' + of.driverPhone)} style={{ flex: 1, marginRight: 6 }} />
                          <Btn small kind="ghost" title="WhatsApp" onPress={() => Linking.openURL('https://wa.me/' + String(of.driverPhone || '').replace(/[^0-9]/g, ''))} style={{ flex: 1 }} />
                        </View>
                      </>
                    )}
                  </Card>
                ))}
                {t.status === 'booked' && (
                  <Txt s={11} c={C.mute} style={{ marginTop: 6 }}>All other driver offers were automatically declined.</Txt>
                )}
                {t.status === 'open' && (
                  <Btn small kind="bad" title="Cancel this trip request" onPress={() => cancelIntercity(t)} style={{ marginTop: 8 }} />
                )}
              </Card>
            ))}
          </Section>
        )}

        <Card style={{ backgroundColor: '#F4F8F5' }}>
          <Txt s={12} c={C.mute}>🔒 Driver contact details are only revealed after you choose an offer. Until then only your first name and trip details are visible to drivers.</Txt>
        </Card>
        <View style={{ height: 100 }} />
      </View>
    </ScrollView>
  );
}
