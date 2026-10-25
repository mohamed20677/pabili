// Galabili PH — Hotel-room booking for tourists and visitors (V29). Mirrors the
// intercity flow: browse ACTIVE hotel listings (room type, price/night, photo),
// send a booking request (check-in/out, guests, rooms, nationality, tourist or
// visitor type, contact), track its status (pending → confirmed/rejected),
// cancel while pending. The ADMIN confirms or rejects from the Hotels tab;
// a CONFIRMED booking reveals the contact for call/WhatsApp coordination.
import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { C, peso } from './lib';
import { useStore } from './store';
import { Btn, Card, Chip, Field, Section, Txt } from './ui';

const todayIso = () => new Date().toISOString().slice(0, 10);
const dateLabel = (iso) => {
  try { return new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return iso; }
};
const nightsBetween = (a, b) => {
  const ms = (s) => new Date(s + 'T00:00:00Z').getTime();
  const n = Math.round((ms(b) - ms(a)) / 86400000);
  return Number.isFinite(n) ? n : 0;
};

const ROOM_TYPES = ['Standard', 'Double', 'Suite', 'Family'];

export default function HotelsScreen({ onClose }) {
  const { s, bookHotel, cancelHotelBooking } = useStore();
  const hotels = (s.hotels || []).filter((h) => h.active);
  const mine = (s.hotelBookings || []).filter((b) => b.mine);

  const [hotelId, setHotelId] = useState(null);
  const [cityFilter, setCityFilter] = useState('');
  const [type, setType] = useState('Standard');
  const [gtype, setGtype] = useState('tourist');
  const [nat, setNat] = useState('');
  const [checkIn, setCheckIn] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [checkOut, setCheckOut] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [guests, setGuests] = useState('1');
  const [rooms, setRooms] = useState('1');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const nights = nightsBetween(checkIn, checkOut);
  const badDates = nights < 1 || checkIn < todayIso();
  const hotel = hotels.find((h) => h.id === hotelId) || null;
  const nRooms = Math.max(1, Number(rooms) || 1);
  const total = hotel ? hotel.price * Math.max(1, nights) * nRooms : 0;
  const cities = [...new Set(hotels.map((h) => h.city))];
  const shown = cityFilter ? hotels.filter((h) => h.city === cityFilter) : hotels;
  const ready = !!hotel && !badDates && !!contact.trim() && (Number(guests) || 0) >= 1;

  const statusChip = (st) => (st === 'confirmed' ? { bg: '#EAF3EF', fg: C.green, tx: '✅ Confirmed' }
    : st === 'rejected' ? { bg: C.pinkBg, fg: C.bad, tx: '❌ Rejected' }
    : st === 'cancelled' ? { bg: '#F2EFE3', fg: C.mute, tx: 'Cancelled' }
    : { bg: '#FBF7EC', fg: C.amber, tx: '⏳ Waiting for confirmation' });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingTop: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={22}>✕</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>🏨 Hotel rooms</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.9 }}>For tourists and visitors — pick a hotel, send a booking request, and the hotel confirms it. Pay at check-in or through your wallet.</Txt>
      </View>
      <View style={{ padding: 16 }}>
        <Section title="🔍 Choose a hotel">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip key="__all" label="All cities" active={!cityFilter} onPress={() => setCityFilter('')} />
            {cities.map((c) => <Chip key={c} label={c} active={cityFilter === c} onPress={() => setCityFilter(c)} />)}
          </View>
          {shown.length === 0 && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>No hotels yet — the admin adds them from the Hotels tab.</Txt>}
          {shown.map((h) => (
            <Card key={h.id} style={{ marginBottom: 10, borderColor: hotelId === h.id ? C.green : C.line, borderWidth: hotelId === h.id ? 2 : 1 }}>
              <Pressable onPress={() => setHotelId(h.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {h.photo ? <Image source={{ uri: h.photo }} style={{ width: 64, height: 64, borderRadius: 12, marginRight: 10 }} /> :
                    <View style={{ width: 64, height: 64, borderRadius: 12, marginRight: 10, backgroundColor: '#EAF3EF', alignItems: 'center', justifyContent: 'center' }}><Txt s={26}>🏨</Txt></View>}
                  <View style={{ flex: 1 }}>
                    <Txt b s={15}>{h.name}</Txt>
                    <Txt s={12} c={C.mute}>{h.city}{h.address ? ' · ' + h.address : ''}</Txt>
                    <Txt s={12} c={C.mute}>{h.roomType} · {h.roomsAvailable} room(s) left{h.amenities ? ' · ' + h.amenities : ''}</Txt>
                    <Txt b s={14} c={C.green} style={{ marginTop: 2 }}>{peso(h.price)} / night</Txt>
                  </View>
                  {hotelId === h.id && <Txt b s={16} c={C.green}>✓</Txt>}
                </View>
              </Pressable>
            </Card>
          ))}
        </Section>

        {hotel && (
          <Section title={'📅 Your stay at ' + hotel.name}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Txt s={11} c={C.mute}>Check-in (YYYY-MM-DD)</Txt>
                <Field value={checkIn} onChangeText={setCheckIn} placeholder="2026-11-01" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt s={11} c={C.mute}>Check-out (YYYY-MM-DD)</Txt>
                <Field value={checkOut} onChangeText={setCheckOut} placeholder="2026-11-03" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {ROOM_TYPES.map((rt) => <Chip key={rt} label={rt} active={type === rt} onPress={() => setType(rt)} />)}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Txt s={11} c={C.mute}>Guests</Txt>
                <Field value={guests} onChangeText={(v) => setGuests(v.replace(/[^0-9]/g, '') || '1')} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt s={11} c={C.mute}>Rooms</Txt>
                <Field value={rooms} onChangeText={(v) => setRooms(v.replace(/[^0-9]/g, '') || '1')} keyboardType="number-pad" />
              </View>
            </View>
            <View style={{ marginTop: 6 }}>
              <Txt s={11} c={C.mute}>I am a</Txt>
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <Chip label="🌍 Tourist" active={gtype === 'tourist'} onPress={() => setGtype('tourist')} />
                <Chip label="🧭 Visitor" active={gtype === 'visitor'} onPress={() => setGtype('visitor')} />
              </View>
            </View>
            <View style={{ marginTop: 6 }}>
              <Txt s={11} c={C.mute}>Nationality</Txt>
              <Field value={nat} onChangeText={setNat} placeholder="e.g. Egyptian, Filipino…" />
            </View>
            <View style={{ marginTop: 6 }}>
              <Txt s={11} c={C.mute}>Contact (phone / WhatsApp)</Txt>
              <Field value={contact} onChangeText={setContact} placeholder="+63 9xx xxx xxxx" keyboardType="phone-pad" />
            </View>
            <Field value={note} onChangeText={setNote} placeholder="Notes (optional): late check-in, airport pickup…" style={{ marginTop: 8 }} multiline />

            {badDates && <Txt s={12} c={C.bad} style={{ marginTop: 8 }}>Check-out must be after check-in, and dates can't be in the past.</Txt>}
            {!badDates && <Txt b s={14} c={C.green} style={{ marginTop: 8 }}>{nights} night(s) × {nRooms} room(s) = {peso(total)} total</Txt>}

            <Btn title={'🏨 Send booking request' + (!badDates ? ' · ' + peso(total) : '')} busy={busy} disabled={!ready}
                 onPress={async () => {
                   setBusy(true);
                   const ok = await bookHotel({ hotel, guestType: gtype, nationality: nat.trim(), checkIn, checkOut, guests: Math.max(1, Number(guests) || 1), rooms: nRooms, contact: contact.trim(), note: note.trim() });
                   setBusy(false);
                   if (ok) { setContact(''); setNote(''); }
                 }} />
          </Section>
        )}

        {mine.length > 0 && (
          <Section title="🧾 My bookings">
            {mine.map((b) => {
              const sc = statusChip(b.status);
              return (
                <Card key={b.id} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt b s={14}>🏨 {b.hotelName}</Txt>
                    <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Txt s={11} b c={sc.fg}>{sc.tx}</Txt>
                    </View>
                  </View>
                  <Txt s={12} c={C.mute}>{dateLabel(b.checkIn)} → {dateLabel(b.checkOut)} · {b.nights} night(s) · {b.guests} guest(s) · {b.rooms} room(s) · {b.roomType}</Txt>
                  <Txt b s={14} c={C.green} style={{ marginTop: 2 }}>{peso(b.total)} total</Txt>
                  {b.status === 'confirmed' && b.contact && (
                    <>
                      <Txt s={12} b c={C.green} style={{ marginTop: 6 }}>✅ Confirmed — coordinate check-in directly:</Txt>
                      <View style={{ flexDirection: 'row', marginTop: 6 }}>
                        <Btn small kind="ghost" title="📞 Call" onPress={() => Linking.openURL('tel:' + String(b.contact || '').replace(/[^0-9+]/g, ''))} style={{ flex: 1, marginRight: 6 }} />
                        <Btn small kind="ghost" title="WhatsApp" onPress={() => Linking.openURL('https://wa.me/' + String(b.contact || '').replace(/[^0-9]/g, ''))} style={{ flex: 1 }} />
                      </View>
                    </>
                  )}
                  {b.status === 'rejected' && b.decidedBy ? <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>Rejected by {b.decidedBy}. Try another hotel or date.</Txt> : null}
                  {b.status === 'pending' && <Btn small kind="bad" title="Cancel this booking request" onPress={() => cancelHotelBooking(b)} style={{ marginTop: 8 }} />}
                </Card>
              );
            })}
          </Section>
        )}

        <Card style={{ backgroundColor: '#F4F8F5' }}>
          <Txt s={12} c={C.mute}>🔒 The request reserves the room only after the hotel confirms it. Payment is settled at check-in (cash or wallet). Until confirmation, only your first name and stay details are visible.</Txt>
        </Card>
        <View style={{ height: 100 }} />
      </View>
    </ScrollView>
  );
}
