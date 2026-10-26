// Galabili PH — Intercity board (V28): the DRIVER side of intercity travel.
// A dedicated tab on the Driver board lists every OPEN trip request posted by
// passengers; a registered (approved) driver sends ONE offer per request
// (their own fare + message) and can update it any time. The customer picks
// the best offer — booked trips show the driver's contact (phone/WhatsApp).
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { C, peso } from './lib';
import { Btn, Card, Field, Section, Txt } from './ui';

const dateLabel = (iso) => {
  try { return new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return iso; }
};

export default function IntercityBoard({ open, mine, busy, onSend, note }) {
  const [fare, setFare] = useState({});     // requestId -> driver's own fare
  const [msg, setMsg] = useState({});       // requestId -> optional message
  const openIds = new Set((open || []).map((t) => t.id));
  const myActive = (mine || []).filter((t) => t.status === 'open' || t.status === 'booked');

  return (
    <View>
      <Section title="🚌 Open intercity trips">
        <Txt s={11} c={C.mute}>Passengers posted these trips. Send YOUR fare and message — the passenger sees every offer sorted by price and picks one. Contact details open only after they book you.</Txt>
        {note ? (
          <Card style={{ marginBottom: 8, borderColor: C.bad, borderWidth: 1 }}>
            <Txt s={12} c={C.bad}>Couldn't load trips: {note}</Txt>
          </Card>
        ) : null}
        {(open || []).length === 0 && !note && (
          <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>No open trips right now. Passengers post trips from the app's "Travel between cities" button.</Txt>
        )}
        {(open || []).map((t) => {
          const already = (t.offers || []).some((o) => o.driverPhone && (o.status === 'sent' || o.status === 'accepted'));
          const f = fare[t.id], m = msg[t.id];
          return (
            <Card key={t.id} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt b s={15}>🚌 {t.fromCity} → {t.toCity}</Txt>
                {already && <View style={{ backgroundColor: '#EAF3EF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Txt s={11} b c={C.green}>✓ My offer sent</Txt></View>}
              </View>
              <Txt s={12} c={C.mute}>{dateLabel(t.date)} · {t.passengers} passenger(s){t.note ? ' · 📝 ' + t.note : ''}</Txt>
              <Txt s={11} c={C.mute}>Posted by {t.offers && t.passengerName ? t.passengerName : (t.customerName || 'a passenger')}</Txt>

              {(t.offers || []).length > 0 && (
                <Txt s={11} c={C.mute} style={{ marginTop: 6 }}>
                  Current offers: {(t.offers || []).length} · lowest {peso(Math.min(...t.offers.map((o) => o.price)))}
                </Txt>
              )}

              {!already ? (
                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Field value={f || ''} onChangeText={(v) => setFare({ ...fare, [t.id]: v.replace(/[^0-9]/g, '') })}
                           keyboardType="number-pad" placeholder="Your fare ₱" style={{ flex: 1, padding: 10 }} />
                    <Btn small title="Send offer" disabled={!f} busy={busy === 'i' + t.id}
                         onPress={() => onSend(t, Number(f), m || '')} style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 12 }} />
                  </View>
                  <Field value={m || ''} onChangeText={(v) => setMsg({ ...msg, [t.id]: v })}
                         placeholder="Message (optional): vehicle, seats, pickup point…" style={{ marginTop: 6 }} multiline />
                </View>
              ) : (
                <Txt s={12} c={C.green} b style={{ marginTop: 8 }}>⏳ Your offer is with the passenger — you'll be notified when they choose.</Txt>
              )}
            </Card>
          );
        })}
      </Section>

      {myActive.length > 0 && (
        <Section title="🧾 My intercity offers">
          {myActive.map((t) => {
            const myOf = (t.offers || []).find((o) => o.driverPhone && (t.bookedOffer ? t.bookedOffer.id === o.id || o.driverPhone === t.bookedOffer.driverPhone : o.status === 'sent'))
              || (t.offers || []).find((o) => o.driverPhone);
            if (!myOf) return null;
            const booked = t.status === 'booked' && t.bookedOffer;
            return (
              <Card key={t.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt b s={14}>🚌 {t.fromCity} → {t.toCity}</Txt>
                  <Txt b s={14} c={booked ? C.green : C.gold}>{booked ? '✅ BOOKED ' + peso(myOf.price) : peso(myOf.price) + ' · waiting'}</Txt>
                </View>
                <Txt s={12} c={C.mute}>{dateLabel(t.date)} · {t.passengers} passenger(s){myOf.message ? ' · 💬 ' + myOf.message : ''}</Txt>
                {booked && (
                  <>
                    <Txt s={12} b c={C.green} style={{ marginTop: 6 }}>✅ The passenger booked you — coordinate the pickup point and time directly:</Txt>
                    <View style={{ flexDirection: 'row', marginTop: 6 }}>
                      <Btn small kind="ghost" title={'📞 ' + (t.bookedOffer.driverPhone || '')} onPress={() => Linking.openURL('tel:' + (t.bookedOffer.driverPhone || ''))} style={{ flex: 1, marginRight: 6 }} />
                      <Btn small kind="ghost" title="WhatsApp" onPress={() => Linking.openURL('https://wa.me/' + String((t.bookedOffer.driverPhone || t.bookedOffer.passengerPhone) || '').replace(/[^0-9]/g, ''))} style={{ flex: 1 }} />
                    </View>
                  </>
                )}
                {!booked && t.status === 'open' && (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Field value={fare[t.id] !== undefined ? fare[t.id] : String(myOf.price)}
                             onChangeText={(v) => setFare({ ...fare, [t.id]: v.replace(/[^0-9]/g, '') })}
                             keyboardType="number-pad" placeholder="Your fare ₱" style={{ flex: 1, padding: 10 }} />
                      <Btn small title="Update offer" busy={busy === 'i' + t.id}
                           onPress={() => onSend(t, Number(fare[t.id] !== undefined ? fare[t.id] : myOf.price), msg[t.id] !== undefined ? msg[t.id] : (myOf.message || ''))}
                           style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 12 }} />
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </Section>
      )}
    </View>
  );
}
