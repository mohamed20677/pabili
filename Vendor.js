// Vendor dashboard (V17): real orders from real customers. Quote with a real photo → customer accepts or
// counters → a courier is found → pack (photo) → courier collects → paid out when the customer confirms.
import React, { useState } from 'react';
import { Image, ScrollView, Switch, View } from 'react-native';
import { C, peso, statusText, distanceKm, fmtKm } from './lib';
import { useStore } from './store';
import { takeProofPhoto, captureAndUpload, BUCKETS } from './media';
import { Btn, Card, Field, Section, Txt } from './ui';
import { PhotoTimeline, photoBubble, NegotiationBox } from './Customer';

export default function Vendor() {
  const { s, vendorQuote, vendorRespond, vendorDecline, vendorPacked, toggleOnline, vendorMenuAdd, vendorMenuPrice, vendorMenuToggle, vendorMenuDel } = useStore();
  const [price, setPrice] = useState({});
  const [shots, setShots] = useState({}); // orderId -> uploaded product photo
  const [busy, setBusy] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newShot, setNewShot] = useState(null); // V37: product photo (uploaded)
  const [priceEdit, setPriceEdit] = useState({});
  const owner = s.auth && s.auth.phone;
  const store = s.myStore;

  const snap = async (key, kind, then) => {
    setBusy(key);
    try { const p = await takeProofPhoto({ kind, owner }); if (p) then(p); } finally { setBusy(null); }
  };

  const mine = s.orders.filter((o) => (o.myRoles || [o.myRole]).includes('vendor') || o.vendorPhone === owner); // V24: role-set (self-test safe)
  const live = mine.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const done = mine.filter((o) => o.status === 'completed');
  const earnings = (s.wallet.tx || []).filter((t) => t.kind === 'sale').reduce((a, t) => a + t.amount, 0);
  const pct = s.settings.commissions.vendorPct;
  // V37 MENU: the vendor's LIVE menu on the server (name + photo + price)
  const myMenu = store ? (s.menu || []).filter((p) => p.storeId === store.id) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt b s={20}>🏪 {store ? store.name : 'Store board'}</Txt>
          <Txt s={12} c={C.mute}>{live.length} live · earned {peso(earnings)} (after {pct}% fee) · wallet {peso(s.wallet.balance)}</Txt>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Txt s={11} c={C.mute}>Open</Txt>
          <Switch value={!!(store && store.open)} onValueChange={(v) => toggleOnline('vendor', v)} trackColor={{ true: C.green }} />
        </View>
      </View>
      {!(store && store.open) && <Card><Txt s={13} c={C.mute}>Your store is closed — customers cannot see it. Switch it to Open to receive orders.</Txt></Card>}
      {store && store.open && live.length === 0 && <Card><Txt s={13} c={C.mute}>Waiting for orders…</Txt></Card>}

      {live.map((o) => {
        const shot = shots[o.id];
        const km = distanceKm({ lat: o.pickupLat, lng: o.pickupLng }, { lat: o.dropLat, lng: o.dropLng });
        return (
          <Card key={o.id} style={{ marginBottom: 12 }}>
            <Txt b s={15}>{o.items}</Txt>
            <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>👤 {o.customer} · {statusText(o)} · delivery {peso(o.fee)}{km != null ? ' · ' + fmtKm(km) : ''} · {o.payVia === 'wallet' ? '👛 wallet' : '💵 cash'}</Txt>
            {o.price > 0 && <Txt s={12} b c={C.green} style={{ marginTop: 2 }}>Price {peso(o.price)}</Txt>}
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
                  <Btn small title="Send quote" disabled={!shot || !price[o.id]} onPress={() => vendorQuote(o, Number(price[o.id]), shot)}
                       style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
                </View>
                <Btn small kind="bad" title="Decline this order" onPress={() => vendorDecline(o)} />
              </View>
            )}

            {o.status === 'quote_review' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Quote of {peso(o.neg ? o.neg.amount : o.price)} sent — waiting for the customer…</Txt>}
            {o.status === 'vendor_talk' && o.neg && (
              <NegotiationBox title="💬 The customer counter-offered" amount={o.neg.amount} note={'Your price was ' + peso(o.price)}
                onAccept={() => vendorRespond(o, 'accept')} onCounter={(a) => vendorRespond(o, 'counter', a)}
                onRefuse={() => vendorRespond(o, 'refuse')} refuseLabel="Keep my price" />
            )}
            {['finding_driver', 'driver_offer', 'driver_talk'].includes(o.status) && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🔎 Price agreed — finding a courier…</Txt>}
            {o.status === 'accepted' && (
              <View style={{ marginTop: 8 }}>
                <Txt s={12} b c={C.green}>🛵 {o.driver || 'A courier'} accepted — pack the order now.</Txt>
                <Btn small busy={busy === 'p' + o.id} title="📷 Order packed — take photo" onPress={() => snap('p' + o.id, 'packed', (p) => vendorPacked(o, p))} />
              </View>
            )}
            {o.status === 'ready_pickup' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>📦 Packed — waiting for the courier to collect it.</Txt>}
            {['picked_up', 'delivered'].includes(o.status) && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🛵 With the courier. You are paid when the customer confirms.</Txt>}
            {['product', 'packed'].map((k) => (o.photos && o.photos[k]) ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
          </Card>
        );
      })}

      {done.length > 0 && <Section title={'✅ Completed (' + done.length + ')'}>
        {done.slice(0, 6).map((o) => <Card key={o.id} style={{ paddingVertical: 8, marginBottom: 6 }}><Txt s={12}>{o.items} · {peso(o.price)}</Txt></Card>)}
      </Section>}

      <Section title="📦 My menu (live — customers order from it)">
        {!store && <Card><Txt s={13} c={C.mute}>Register your store first (My Page → Register my store) to build your menu.</Txt></Card>}
        {store && myMenu.length === 0 && (
          <Card><Txt s={13} c={C.mute}>No products yet — add your first item below. Customers see it instantly with its photo and price.</Txt></Card>
        )}
        {myMenu.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {p.image
                ? <Image source={{ uri: p.image }} style={{ width: 52, height: 52, borderRadius: 12, marginRight: 10 }} />
                : <View style={{ width: 52, height: 52, borderRadius: 12, marginRight: 10, backgroundColor: '#EAF3EF', alignItems: 'center', justifyContent: 'center' }}><Txt s={22}>🍽</Txt></View>}
              <View style={{ flex: 1 }}>
                <Txt b s={14}>{p.name}{!p.available ? '  ·  ⏸ hidden' : ''}</Txt>
                <Txt b s={13} c={C.green}>{peso(p.price)}</Txt>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Btn small kind={p.available ? 'bad' : 'main'} title={p.available ? '⏸ Hide' : '▶ Show'} onPress={() => vendorMenuToggle(p)} style={{ marginRight: 6, marginTop: 0 }} />
                <Btn small kind="bad" title="✕" onPress={() => vendorMenuDel(p)} style={{ marginTop: 0, paddingHorizontal: 10 }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Field value={priceEdit[p.id] != null ? String(priceEdit[p.id]) : ''} onChangeText={(v) => setPriceEdit({ ...priceEdit, [p.id]: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="Change price (₱)" style={{ flex: 1, padding: 9 }} />
              <Btn small kind="ghost" title="Save" disabled={priceEdit[p.id] == null || priceEdit[p.id] === ''} onPress={() => { vendorMenuPrice(p, Number(priceEdit[p.id])); setPriceEdit({ ...priceEdit, [p.id]: '' }); }} style={{ marginLeft: 8, marginTop: 0 }} />
            </View>
          </Card>
        ))}
        {store && (
          <Card style={{ marginTop: 4 }}>
            <Txt b s={14}>＋ Add a product</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Btn small kind={newShot ? 'ghost' : 'main'} busy={busy === 'mshot'} title={newShot ? '✓ Photo added — retake' : '📷 Product photo'} onPress={async () => {
                setBusy('mshot');
                try { const up = await captureAndUpload({ bucket: BUCKETS.orders, owner: owner || 'vendor', folder: 'products', square: true, title: 'Product photo' }); if (up) setNewShot(up.uri); } finally { setBusy(null); }
              }} style={{ marginRight: 10, marginTop: 0 }} />
              {newShot
                ? <Image source={{ uri: newShot }} style={{ width: 44, height: 44, borderRadius: 10 }} />
                : <Txt s={11} c={C.mute} style={{ flex: 1 }}>Shown on the customer's menu</Txt>}
            </View>
            <Field value={newName} onChangeText={setNewName} placeholder="Product name" style={{ marginTop: 8 }} />
            <Field value={newPrice} onChangeText={(v) => setNewPrice(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Price (₱)" style={{ marginTop: 8 }} />
            <Btn small title="＋ Add to menu" disabled={!newName || !newPrice} onPress={() => { vendorMenuAdd({ name: newName, price: Number(newPrice), image: newShot }); setNewName(''); setNewPrice(''); setNewShot(null); }} style={{ marginTop: 8 }} />
          </Card>
        )}
        <Txt s={10} c={C.mute} style={{ marginTop: 4 }}>Menu prices are final — customers pay exactly these prices (no negotiation on registered-store orders).</Txt>
      </Section>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
