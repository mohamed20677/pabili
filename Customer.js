// Customer screens for V9: home, store list, cart, single+multi order, addresses.
// Extends V8 without breaking save/query invariants.
import React, { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { C, CATEGORIES, CATEGORY_ICONS, ORDER_STATUS, peso, useT, statusText, distanceKm, fmtKm } from './lib';
import { useStore } from './store';
import { fetchDriverLocation } from './tracking';
import { Btn, Card, Chip, Countdown, Field, Section, Txt } from './ui';

// V16: real photos render as an image (tap to zoom). Photos from the local demo engine are
// flagged "demo" instead of pretending to be proof.
export function PhotoBubble({ p }) {
  const [open, setOpen] = useState(false);
  if (!p) return null;
  const real = !!p.uri;
  return (
    <View style={{ backgroundColor: '#EAF3EF', borderRadius: 12, padding: 10, marginTop: 8, borderWidth: 1, borderColor: C.green }}>
      <Txt s={13} b c={C.green}>📷 {p.kind} — photo proof{real ? '' : ' (demo, simulated)'}</Txt>
      {real && (
        <Pressable onPress={() => setOpen(true)}>
          <Image source={{ uri: p.uri }} resizeMode="cover" style={{ width: '100%', height: 170, borderRadius: 10, marginTop: 6, backgroundColor: C.line }} />
        </Pressable>
      )}
      <Txt s={10} c={C.mute} style={{ marginTop: 4 }}>{p.stamp}</Txt>
      {real && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
            <Image source={{ uri: p.uri }} resizeMode="contain" style={{ width: '100%', height: '85%' }} />
            <Txt c="#fff" s={12} style={{ textAlign: 'center', marginTop: 8 }}>Tap anywhere to close</Txt>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
export function photoBubble(p) { return <PhotoBubble p={p} />; }

export function PhotoTimeline({ o }) {
  const steps = [['product', '📦'], ['packed', '✅'], ['pickup', '🛵'], ['delivery', '🏠']];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
      {steps.map(([k, ic], i) => {
        const done = !!(o.photos && o.photos[k]);
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                           backgroundColor: done ? C.green : '#fff', borderWidth: 1.5, borderColor: done ? C.green : C.line }}>
              <Txt s={15}>{done ? '📷' : ic}</Txt>
            </View>
            {i < 3 && <View style={{ width: 26, height: 2, backgroundColor: done && o.photos[steps[i + 1][0]] ? C.green : C.line }} />}
          </View>
        );
      })}
    </View>
  );
}

// Live location of the assigned courier / driver (read from Supabase every 8 s).
export function DriverLocationBanner({ o }) {
  const [loc, setLoc] = useState(null);
  React.useEffect(() => {
    let alive = true;
    const load = async () => { const r = await fetchDriverLocation(o.driverPhone); if (alive) setLoc(r); };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [o.driverPhone]);
  const box = { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#EAF3EF' };
  if (!loc) return <View style={box}><Txt s={11} c={C.mute}>📡 Waiting for the {o.kind === 'ride' ? 'driver' : 'courier'}'s location…</Txt></View>;
  const age = Math.round((Date.now() - new Date(loc.updated_at).getTime()) / 1000);
  const errand = o.kind === 'errand';
  const toPickup = !errand && (o.status === 'accepted' || o.status === 'ready_pickup');
  const km = distanceKm({ lat: Number(loc.lat), lng: Number(loc.lng) }, toPickup ? { lat: o.pickupLat, lng: o.pickupLng } : { lat: o.dropLat, lng: o.dropLng });
  return (
    <View style={box}>
      <Txt b s={13} c={C.green}>📡 {o.kind === 'ride' ? 'Driver' : 'Courier'} location — {loc.source === 'bg' ? 'live' : 'app open'}</Txt>
      <Txt s={11}>{km != null ? fmtKm(km) + (errand ? ' from your address · ' : toPickup ? ' from the pickup point · ' : ' from the destination · ') : ''}updated {age < 60 ? age + 's' : Math.round(age / 60) + ' min'} ago{age > 120 ? ' ⚠️' : ''}</Txt>
      <Btn small kind="ghost" title="🗺 See on map" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${loc.lat},${loc.lng}`)} />
    </View>
  );
}

// Seconds left on a time-boxed offer (ticks every second on its own).
export function Remaining({ until, total }) {
  const [, force] = useState(0);
  React.useEffect(() => { const id = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, (until || 0) - Date.now());
  return (
    <View style={{ marginTop: 4 }}>
      <Txt s={11} b c={left < 10000 ? C.bad : C.green}>⏱ {Math.ceil(left / 1000)}s left</Txt>
      <Countdown left={left} total={(total || 30) * 1000} />
    </View>
  );
}

// Accept / counter / refuse box — the same widget for store quotes, courier fares and ride fares.
export function NegotiationBox({ title, amount, note, onAccept, onCounter, onRefuse, refuseLabel, canCounter = true, until, total }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <View style={{ backgroundColor: '#FBF7EC', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.gold }}>
      <Txt b s={14}>{title}</Txt>
      <Txt b s={22} c={C.green} style={{ marginTop: 2 }}>{peso(amount)}</Txt>
      {note ? <Txt s={11} c={C.mute}>{note}</Txt> : null}
      {until ? <Remaining until={until} total={total} /> : null}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Btn small busy={busy} title={'✓ Accept ' + peso(amount)} onPress={() => go(onAccept)} style={{ flex: 1, marginRight: 6 }} />
        {onRefuse ? <Btn small kind="bad" title={refuseLabel || 'Refuse'} onPress={() => go(onRefuse)} style={{ flex: 1 }} /> : null}
      </View>
      {canCounter && onCounter ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Field value={v} onChangeText={(x) => setV(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Your offer ₱" style={{ flex: 1, padding: 10 }} />
          <Btn small kind="ghost" title="Counter" disabled={!v || Number(v) === amount}
               onPress={() => go(async () => { await onCounter(Number(v)); setV(''); })} style={{ marginLeft: 8, marginTop: 0, paddingHorizontal: 14 }} />
        </View>
      ) : null}
    </View>
  );
}

// V9: cart view + add to cart workflow.
export function CartScreen({ onClose, onPlace }) {
  const { s, removeFromCart, cartTotals, clearCart } = useStore();
  const t = cartTotals();
  const items = s.cart?.items || [];
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={20}>‹ Back</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>🛒 Cart ({items.length} store{items.length === 1 ? '' : 's'})</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.85 }}>One courier picks up all items; per-store prices stay separate.</Txt>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, padding: 14 }}>
        {items.length === 0 && <Card style={{ paddingVertical: 30, alignItems: 'center' }}>
          <Txt s={40}>🛍️</Txt>
          <Txt b s={16} style={{ marginTop: 4 }}>Cart is empty</Txt>
          <Txt s={12} c={C.mute} style={{ marginTop: 4 }}>Pick a store from the list and tap "Add to cart" to combine orders.</Txt>
        </Card>}
        {items.map((it) => (
          <Card key={it.storeId} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: '#EAF3EF', alignItems: 'center', justifyContent: 'center' }}>
                <Txt s={22}>{CATEGORY_ICONS[(s.stores || []).find((x) => x.id === it.storeId)?.category] || '🏪'}</Txt>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Txt b s={14}>{it.storeName}</Txt>
                <Txt s={11} c={C.mute}>{it.description || '—'}</Txt>
              </View>
              <Txt b c={C.green}>{peso(it.fees)}</Txt>
            </View>
            <Btn small kind="bad" title="Remove" onPress={() => removeFromCart(it.storeId)} />
          </Card>
        ))}
        {items.length > 0 && (
          <Card style={{ marginTop: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt>Items total</Txt><Txt b>{peso(t.itemsFee)}</Txt></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt>Shipping ({t.items} stores)</Txt><Txt b>{peso(t.shipping)}</Txt></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Txt b s={15}>Total</Txt><Txt b s={17} c={C.green}>{peso(t.total)}</Txt>
            </View>
            <Btn title={'🛵 Place order · ' + peso(t.total)} onPress={onPlace} />
            <Btn kind="ghost" title="Clear cart" onPress={clearCart} />
          </Card>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

export function StoresByCategory({ category, onPick, onBack, onAddCart }) {
  const { listStoresByCategory } = useStore();
  const stores = listStoresByCategory(category) || [];
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onBack}><Txt c="#fff" s={20}>‹ Back</Txt></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Txt s={26} style={{ marginRight: 8 }}>{CATEGORY_ICONS[category] || '🏪'}</Txt>
          <View>
            <Txt b s={20} c="#fff">{category}</Txt>
            <Txt s={12} c="#fff" style={{ opacity: 0.85 }}>{stores.length} store{stores.length === 1 ? '' : 's'} available</Txt>
          </View>
        </View>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, padding: 14 }}>
        {stores.length === 0 && (
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <Txt s={36}>🏚</Txt>
            <Txt b s={16} style={{ marginTop: 6 }}>No {category} store open right now</Txt>
            <Txt s={12} c={C.mute} style={{ textAlign: 'center', marginTop: 6 }}>Register your store from My Page → Register my store.</Txt>
          </Card>
        )}
        {stores.map((s) => (
          <Card key={s.id} style={{ marginBottom: 12, borderColor: s.featured ? C.gold : C.green, borderWidth: s.featured ? 2 : 1.5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#EAF3EF', alignItems: 'center', justifyContent: 'center' }}>
                <Txt s={26}>{CATEGORY_ICONS[s.category] || '🏪'}</Txt>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt b s={15}>{s.name} {s.featured ? '⭐' : ''}</Txt>
                <Txt s={11} c={C.mute}>📍 {s.area || s.address}</Txt>
                <Txt s={11} c={s.rating ? C.green : C.mute}>{s.rating ? '★ ' + s.rating.toFixed(1) : 'New'}</Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <Btn small title={'🛒 Order from ' + s.name} onPress={() => onPick(s)} style={{ flex: 1 }} />
            </View>
            {s.lat && s.lng && (
              <Btn small kind="ghost" title={'🗺 Open in Google Maps'}
                   onPress={() => Linking.openURL(`https://www.google.com/maps?q=${s.lat},${s.lng}`)} />
            )}
          </Card>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

export function HomeScreen({ goNew, goStores, goCart, goRide }) {
  const { s, cartTotals } = useStore();
  const T = useT();
  const cats = s.settings.categories;
  const t = cartTotals();
  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: '#EAF3EF', padding: 16, paddingTop: 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center' }} onPress={goCart}>
          <Txt s={17}>📍</Txt>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Txt b s={14}>{s.addresses.find((a) => a.default)?.label || 'Saved address'} — <Txt s={12} c={C.mute}>{(s.addresses.find((a) => a.default) || {}).addr || 'Tap to add'}</Txt></Txt>
          </View>
          {t.items > 0 ? (
            <View style={{ backgroundColor: C.gold, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Txt s={11} b c="#fff">🛒 {t.items} · {peso(t.total)}</Txt>
            </View>
          ) : (<Txt c={C.mute}>⌄</Txt>)}
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          {cats.map((c2, i) => (
            <Pressable key={c2} onPress={() => goStores(c2)} style={{ alignItems: 'center', marginRight: 16 }}>
              <View style={{ width: 58, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                             backgroundColor: i === 0 ? C.green : '#fff', borderWidth: 1, borderColor: C.line }}>
                <Txt s={24}>{CATEGORY_ICONS[c2] || '🏪'}</Txt>
              </View>
              <Txt s={11} b={i === 0} c={i === 0 ? C.green : C.ink} style={{ marginTop: 4 }}>{c2}</Txt>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line,
                       padding: 13, marginTop: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Txt s={16} c={C.mute}>🔍</Txt>
          <Txt c={C.mute} s={14} style={{ marginLeft: 8 }}>{T('howHelp')}</Txt>
        </View>
      </View>

      <View style={{ margin: 14, borderRadius: 18, overflow: 'hidden', backgroundColor: '#111' }}>
        <View style={{ padding: 18 }}>
          <Txt s={17} b c={C.gold}>{s.settings.banner.title}</Txt>
          <Txt s={13} c="#fff" style={{ marginTop: 4 }}>Any store, even without an app</Txt>
          <Pressable onPress={() => goNew(null)} style={{ backgroundColor: '#fff', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 18, alignSelf: 'flex-start', marginTop: 12 }}>
            <Txt b s={13}>{s.settings.banner.cta}</Txt>
          </Pressable>
        </View>
      </View>

      {s.settings.ride && s.settings.ride.enabled && (
        <Pressable onPress={goRide} style={{ marginHorizontal: 14, marginTop: 4, backgroundColor: C.green, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Txt s={38}>🚕</Txt>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt b s={17} c="#fff">Need a ride?</Txt>
            <Txt s={12} c="#fff" style={{ opacity: 0.92 }}>Request a driver, agree on the fare, get picked up.</Txt>
          </View>
          <Txt b s={24} c="#fff">›</Txt>
        </Pressable>
      )}

      <Section title={'🚩 ' + T('nearYou')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable onPress={() => goNew(null)} style={{ width: 200, marginRight: 12 }}>
            <Card style={{ borderColor: C.green, borderWidth: 2 }}>
              <View style={{ backgroundColor: C.green, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Txt s={10} b c="#fff">{T('mostReq')}</Txt>
              </View>
              <Txt s={44} style={{ textAlign: 'center', marginVertical: 8 }}>📍</Txt>
              <Txt b s={16}>{T('orderAny')}</Txt>
              <Txt s={11} c={C.mute}>{T('orderAnySub')}</Txt>
            </Card>
          </Pressable>
          <Pressable onPress={() => goStores('Parcel')} style={{ width: 200 }}>
            <Card>
              <Txt s={44} style={{ textAlign: 'center', marginVertical: 8 }}>📦</Txt>
              <Txt b s={16}>{T('sendAny')}</Txt>
              <Txt s={11} c={C.mute}>{T('sendAnySub')}</Txt>
            </Card>
          </Pressable>
        </ScrollView>
      </Section>

      <Section title={T('needHelp')}>
        <Card style={{ backgroundColor: '#FBF3E6', borderColor: '#F0E0C0' }}>
          <Txt s={60}>🚚</Txt>
          <Txt b s={16}>{T('needHelp')}</Txt>
          <Txt s={12} c={C.mute}>{T('helpSub')}</Txt>
        </Card>
      </Section>
      <View style={{ height: 90 }} />
    </ScrollView>
  );
}

export function OrderForm({ preselectStore, onClose, onPlaced }) {
  const { s, placeOrder, placeErrand, listStoresAll } = useStore();
  const T = useT();
  const [mode, setMode] = useState(preselectStore ? 'store' : 'errand'); // errand = a courier buys it at ANY shop
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [budget, setBudget] = useState('');
  const [fee, setFee] = useState('20');
  const [pay, setPay] = useState('cash');
  const [store, setStore] = useState(preselectStore || null);
  const [busy, setBusy] = useState(false);
  const f = Number(fee) || 0;
  const addr = (s.addresses || []).find((a) => a.default) || (s.addresses || [])[0];
  const stores = listStoresAll();
  const errand = mode === 'errand';
  const place = async () => {
    setBusy(true);
    const dropoff = { addr: addr.addr, lat: addr.lat, lng: addr.lng };
    const ok = errand
      ? await placeErrand({ text: text.trim(), hint: hint.trim(), budget: Number(budget) || null, fee: f, payVia: pay, dropoff })
      : await placeOrder({ text: text.trim(), fee: f, payVia: pay, storeId: store.id, dropoff });
    setBusy(false);
    if (ok) { if (onPlaced) onPlaced(); onClose(); }
  };
  const chip = (on) => ({ borderWidth: 1.5, borderColor: on ? C.green : C.line, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, marginBottom: 8, backgroundColor: on ? '#EAF3EF' : '#fff' });
  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingTop: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={22}>✕</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>{errand ? '🧭 Buy it for me' : '🛍 ' + (store ? store.name : 'Order from a store')}</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.9 }}>{errand ? 'A courier buys it at any shop, shows you the item and price, and only buys after you approve.' : 'A registered store quotes you, then a courier delivers.'}</Txt>
      </View>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <Pressable onPress={() => setMode('errand')} style={chip(errand)}><Txt s={13} b={errand}>🧭 Any shop — courier buys it</Txt></Pressable>
          <Pressable onPress={() => setMode('store')} style={chip(!errand)}><Txt s={13} b={!errand}>🏪 A registered store</Txt></Pressable>
        </View>

        {!errand && (
          <Section title="1 · Store">
            {stores.length === 0 && <Card><Txt s={13} c={C.mute}>No store is open in the app yet. Use "Any shop — courier buys it", or wait for stores to register.</Txt></Card>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {stores.map((x) => (
                <Pressable key={x.id} onPress={() => setStore(x)} style={chip(store && store.id === x.id)}>
                  <Txt s={13} b={store && store.id === x.id}>{CATEGORY_ICONS[x.category] || '🏪'} {x.name}</Txt>
                </Pressable>
              ))}
            </View>
            {store && <Txt s={11} c={C.mute}>📍 {store.address || store.area}</Txt>}
          </Section>
        )}

        <Section title={errand ? '1 · What should the courier buy?' : '2 · What do you need?'}>
          <Field multiline numberOfLines={4} value={text} onChangeText={setText} placeholder={T('describe')} style={{ minHeight: 100, textAlignVertical: 'top' }} />
        </Section>
        {errand && (
          <Section title="2 · Where? (optional)">
            <Field value={hint} onChangeText={setHint} placeholder="Shop name or area, e.g. Mercury Drug, Brgy. Poblacion" />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Field value={budget} onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Budget ₱ (optional)" style={{ width: 170 }} />
              <Txt s={11} c={C.mute} style={{ marginLeft: 10, flex: 1 }}>The courier sees it; you still approve the real price first.</Txt>
            </View>
          </Section>
        )}
        <Section title={T('deliverTo')}>
          {addr ? (
            <Card>
              <Txt b s={14}>🏠 {addr.label || 'Home'} — <Txt s={12} c={C.mute}>{addr.addr}</Txt></Txt>
              {addr.lat ? <Txt s={11} c={C.mute}>📍 {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)}</Txt> : <Txt s={11} c={C.amber}>Tip: save this address with "Use my current location" so couriers can find you.</Txt>}
            </Card>
          ) : <Card><Txt s={13} c={C.bad}>Add a delivery address first (My Page → Saved addresses).</Txt></Card>}
        </Section>
        <Section title={errand ? '3 · Courier fee (delivery only)' : T('feeOffer')}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Field value={fee} onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" style={{ width: 110, textAlign: 'center', fontSize: 22, fontWeight: '800' }} />
            <Txt s={13} c={C.mute} style={{ marginLeft: 12, flex: 1 }}>the courier can accept or counter, and you decide{errand ? '. The items are paid on top, at the approved price.' : ''}</Txt>
          </View>
        </Section>
        <Section title="Pay with">
          <View style={{ flexDirection: 'row' }}>
            <Pressable onPress={() => setPay('cash')} style={chip(pay === 'cash')}><Txt s={13} b={pay === 'cash'}>💵 Cash on delivery</Txt></Pressable>
            <Pressable onPress={() => setPay('wallet')} style={chip(pay === 'wallet')}><Txt s={13} b={pay === 'wallet'}>👛 Wallet ({peso(s.wallet.balance)})</Txt></Pressable>
          </View>
        </Section>
        <Btn title={(errand ? '🧭 Send request' : T('placeOrder')) + ' · ' + peso(f)} busy={busy}
             disabled={(!errand && !store) || !addr || !text.trim() || f <= 0} onPress={place} />
        <View style={{ height: 100 }} />
      </View>
    </ScrollView>
  );
}

// V15: addresses screen wired to the new actions — now with EDIT (the user's
// report: addresses could be added but never edited/updated).
export function AddressesScreen({ onClose }) {
  const { s, addAddress, removeAddress, setDefaultAddress, updateAddress } = useStore();
  const [label, setLabel] = useState('New');
  const [addr, setAddr] = useState('');
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAddr, setEditAddr] = useState('');

  const startEdit = (a) => { setEditId(a.id); setEditLabel(a.label); setEditAddr(a.addr); setErr(''); };
  const saveEdit = () => {
    if (!editAddr.trim()) { setErr('Address cannot be empty.'); return; }
    updateAddress(editId, { label: editLabel.trim() || 'Saved', addr: editAddr.trim() });
    setEditId(null); setEditLabel(''); setEditAddr('');
  };

  const useCurrentLocation = async () => {
    setErr('');
    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setErr('Permission denied.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let human = `GPS ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const r = Array.isArray(rev) && rev[0];
        if (r) human = [r.name, r.street, r.city || r.subregion, r.region].filter(Boolean).join(', ');
      } catch (e) {}
      addAddress({ label: label || 'New', addr: human, lat, lng });
      setAddr('');
    } catch (e) { setErr('GPS not readable on this build.'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={20}>‹ Close</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>📍 Saved addresses</Txt>
        <Txt s={12} c="#fff" style={{ opacity: 0.85 }}>Tap a star to mark default; one address is the default.</Txt>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, padding: 14 }}>
        {(s.addresses || []).map((a) => (
          <Card key={a.id} style={{ marginBottom: 10, borderColor: a.default ? C.green : C.line, borderWidth: a.default ? 2 : 1 }}>
            {editId === a.id ? (
              /* V15: inline edit mode */
              <View>
                <Txt b s={14}>✎ Editing “{a.label}”</Txt>
                <Field value={editLabel} onChangeText={setEditLabel} placeholder="Label (Home, Office…)" style={{ marginTop: 8 }} />
                <Field value={editAddr} onChangeText={setEditAddr} placeholder="Street, barangay, city" style={{ marginTop: 8 }} />
                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                  <Btn small title="💾 Save changes" onPress={saveEdit} style={{ flex: 1, marginRight: 6 }} />
                  <Btn small kind="ghost" title="Cancel" onPress={() => setEditId(null)} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Txt b s={15}>{a.label} {a.default ? '⭐ default' : ''}</Txt>
                    <Txt s={12} c={C.mute}>{a.addr}</Txt>
                    {a.lat && <Txt s={11} c={C.mute}>📡 {a.lat.toFixed(4)}, {a.lng.toFixed(4)}</Txt>}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Btn small kind="ghost" title="✎ Edit" onPress={() => startEdit(a)} style={{ flex: 1, marginRight: 6 }} />
                  {!a.default && <Btn small title="⭐ Set default" onPress={() => setDefaultAddress(a.id)} style={{ flex: 1, marginRight: 6 }} />}
                  <Btn small kind="bad" title="Remove" onPress={() => removeAddress(a.id)} style={{ flex: 1 }} />
                </View>
              </View>
            )}
          </Card>
        ))}
        <Card style={{ marginTop: 4 }}>
          <Txt b s={14}>Add a new address</Txt>
          <Field value={label} onChangeText={setLabel} placeholder="Label (Home, Office…)" style={{ marginTop: 8 }} />
          <Field value={addr} onChangeText={setAddr} placeholder="Street, barangay, city" style={{ marginTop: 8 }} />
          <Btn small title="📡 Use my current location" onPress={useCurrentLocation} />
          {addr.length > 0 && <Btn small kind="ghost" title="Add address ✚" onPress={() => { addAddress({ label, addr }); setAddr(''); }} />}
          {err ? <Txt s={11} c={C.bad} style={{ marginTop: 6 }}>{err}</Txt> : null}
        </Card>
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

function OrderCard({ o }) {
  const { s, customerConfirm, cancelOrder, dispute, quoteAnswer, driverAnswer } = useStore();
  const ride = o.kind === 'ride';
  const errand = o.kind === 'errand';
  const bad = o.status === 'cancelled', good = o.status === 'completed';
  const canCancel = ['vendor_quote', 'vendor_talk', 'finding_driver', 'driver_offer'].includes(o.status) || (ride && ['accepted', 'ready_pickup'].includes(o.status)) || (errand && o.status === 'accepted');
  const who = ride ? 'driver' : 'courier';
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt b s={15} style={{ flex: 1 }}>{ride ? '🚕 Ride' : errand ? '🧭 Errand' : o.storeName ? '🏪 ' + o.storeName : '🛍 ' + o.items}</Txt>
        <View style={{ backgroundColor: bad ? '#FDECEC' : good ? '#EAF3EF' : '#FBF7EC', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '55%' }}>
          <Txt s={11} b c={bad ? C.bad : good ? C.green : C.amber}>{statusText(o)}</Txt>
        </View>
      </View>
      {ride
        ? <Txt s={12} style={{ marginTop: 4 }}>📍 {o.pickup}{'\n'}🏁 {o.dropoff}</Txt>
        : <Txt s={12} style={{ marginTop: 4 }}>{o.items}{errand && o.budget ? '\n💡 Budget ' + peso(o.budget) : ''}</Txt>}
      <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>
        {ride ? 'Fare ' + peso(o.fee) : (errand ? 'Courier fee ' : 'Delivery ') + peso(o.fee) + (o.price ? ' · items ' + peso(o.price) + ' · total ' + peso(o.fee + o.price) : '')} · {o.payVia === 'wallet' ? '👛 wallet' : '💵 cash'}
      </Txt>

      {!ride && <PhotoTimeline o={o} />}
      {!ride && ['product', 'packed', 'pickup', 'delivery'].map((k) => (o.photos && o.photos[k]) ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}

      {!ride && o.status === 'vendor_quote' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Waiting for the store to confirm stock and price…</Txt>}
      {!ride && o.status === 'quote_review' && o.neg && (
        <NegotiationBox title={errand ? '🧾 Your courier found it — price (see the photo above)' : "🧾 The store's price (see the photo above)"} amount={o.neg.amount}
          note={(o.neg.final ? (errand ? 'The courier will not go lower.' : 'The store will not go lower.') : 'Accept it, or make a counter-offer.') + (errand && o.budget && o.neg.amount > o.budget ? ' ⚠️ Above your budget of ' + peso(o.budget) + '.' : '') + (errand ? ' Nothing is bought until you accept.' : '')}
          canCounter={!o.neg.final}
          onAccept={() => quoteAnswer(o, 'accept')} onCounter={(a) => quoteAnswer(o, 'counter', a)}
          onRefuse={() => cancelOrder(o)} refuseLabel="Cancel order" />
      )}
      {!ride && o.status === 'vendor_talk' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>⏳ Waiting for the {errand ? 'courier' : 'store'} to answer your offer of {peso(o.neg ? o.neg.amount : 0)}…</Txt>}
      {errand && o.status === 'accepted' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🛵 Your courier is heading to a shop. You will get the item photo and price to approve.</Txt>}
      {errand && o.status === 'ready_pickup' && <Txt s={12} c={C.green} style={{ marginTop: 8 }}>✅ You approved {peso(o.price)} — your courier is buying it now.</Txt>}

      {o.status === 'finding_driver' && <Txt s={12} c={C.mute} style={{ marginTop: 8 }}>🔎 Looking for a {who} near you… keep the app open.</Txt>}
      {o.status === 'driver_offer' && (
        <View style={{ marginTop: 8 }}>
          <Txt s={12} c={C.mute}>📨 Your offer of {peso(o.neg ? o.neg.amount : o.fee)} was sent to a nearby {who}.</Txt>
          {o.offerDeadline ? <Remaining until={o.offerDeadline} total={s.settings.offerSecs} /> : null}
        </View>
      )}
      {o.status === 'driver_talk' && o.neg && (
        <NegotiationBox title={ride ? '🚕 The driver asks for' : '🛵 The courier asks for'} amount={o.neg.amount} note={'Your offer was ' + peso(o.fee)}
          until={o.offerDeadline} total={s.settings.customerSecs}
          onAccept={() => driverAnswer(o, 'accept')} onCounter={(a) => driverAnswer(o, 'counter', a)}
          onRefuse={() => driverAnswer(o, 'refuse')} refuseLabel={'Find another'} />
      )}

      {o.driverPhone && ['accepted', 'quote_review', 'vendor_talk', 'ready_pickup', 'picked_up', 'delivered'].includes(o.status) && (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#EAF3EF' }}>
          <Txt b s={13}>{ride ? '🚕' : '🛵'} {o.driver || 'Your ' + who}</Txt>
          {o.driverVehicle ? <Txt s={12}>{o.driverVehicle}</Txt> : null}
          <Btn small kind="ghost" title="📞 Call" onPress={() => Linking.openURL('tel:' + o.driverPhone)} />
        </View>
      )}
      {o.driverPhone && ['accepted', 'quote_review', 'vendor_talk', 'ready_pickup', 'picked_up'].includes(o.status) && <DriverLocationBanner o={o} />}

      {o.status === 'delivered' && (
        <View>
          <Btn small title={ride ? '✓ I arrived — confirm & pay' : 'Confirm ✓'} onPress={() => customerConfirm(o)} />
          <Btn small kind="ghost" title="Report a problem" onPress={() => dispute(o)} />
        </View>
      )}
      {canCancel && <Btn small kind="bad" title={ride ? 'Cancel ride' : 'Cancel'} onPress={() => cancelOrder(o)} />}
    </Card>
  );
}

export function OrdersTab() {
  const { s } = useStore();
  const mine = s.orders.filter((o) => o.mine);
  return (
    <ScrollView automaticallyAdjustKeyboardInsets style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <Txt b s={20} style={{ marginBottom: 10 }}>Orders & rides</Txt>
      {mine.length === 0 && <Txt c={C.mute} style={{ textAlign: 'center', marginTop: 60 }}>Nothing yet — order from a store or request a ride from Home.</Txt>}
      {mine.map((o) => <OrderCard key={o.id} o={o} />)}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
