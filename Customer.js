// Customer screens for V9: home, store list, cart, single+multi order, addresses.
// Extends V8 without breaking save/query invariants.
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { C, CATEGORIES, CATEGORY_ICONS, ORDER_STATUS, peso, useT } from './lib';
import { useStore } from './store';
import { Btn, Card, Chip, Countdown, Field, Section, Txt } from './ui';

export function photoBubble(p) {
  if (!p) return null;
  return (
    <View style={{ backgroundColor: '#EAF3EF', borderRadius: 12, padding: 10, marginTop: 8, borderWidth: 1, borderColor: C.green }}>
      <Txt s={13} b c={C.green}>📷 {p.kind} — photo proof</Txt>
      <Txt s={10} c={C.mute}>{p.stamp}</Txt>
    </View>
  );
}

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

// V9: per-order live driver banner.
export function DriverLocationBanner({ o }) {
  const { listDriverLocations } = useStore();
  const all = listDriverLocations();
  // Match by assigned driver (string) or fall back to first location for demo.
  const match = (() => {
    if (!o || !o.driver) return null;
    const candidates = Object.keys(all);
    // Try fuzzy match: driver string vs user id  ('Maria Santos' has 'u_d1':'Juan Dela Cruz',etc)
    const guess = candidates.find((k) => (all[k].ts && all[k].ts > Date.now() - 5 * 60 * 1000));
    return guess ? all[guess] : all[candidates[0]];
  })();
  if (!match) return (
    <View style={{ marginTop: 8, padding: 8, borderRadius: 12, backgroundColor: '#EAF3EF' }}>
      <Txt s={11} c={C.mute}>📡 Driver hasn't shared live location yet</Txt>
    </View>
  );
  return (
    <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#EAF3EF' }}>
      <Txt b s={13} c={C.green}>📡 Driver location — {match.source === 'bg' ? 'background' : 'foreground'}</Txt>
      <Txt s={11}>{match.lat.toFixed(4)}, {match.lng.toFixed(4)} · {new Date(match.ts).toLocaleTimeString()}</Txt>
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
      <ScrollView style={{ flex: 1, padding: 14 }}>
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
      <ScrollView style={{ flex: 1, padding: 14 }}>
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
              <Btn small title={'🛒 Order ₱<=100'} onPress={() => onPick(s)} style={{ flex: 1, marginRight: 6 }} />
              <Btn small kind="ghost" title={'➕ Add to cart'} onPress={() => onAddCart(s)} style={{ flex: 1, marginLeft: 6 }} />
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

export function HomeScreen({ goNew, goStores, goCart }) {
  const { s, cartTotals } = useStore();
  const T = useT();
  const cats = s.settings.categories;
  const t = cartTotals();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }}>
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

      <Btn title={`🛒 View cart (${t.items} stores · ${peso(t.total)})`} onPress={goCart}
           style={{ marginHorizontal: 14, marginTop: 6 }} />

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

export function OrderForm({ preselect, preselectStore, onClose }) {
  const { s, placeOrder } = useStore();
  const T = useT();
  const [text, setText] = useState('');
  const [fee, setFee] = useState('20');
  const f = Number(fee) || 0;
  const addr = s.addresses.find((a) => a.default) || s.addresses[0] || { addr: '' };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ backgroundColor: C.greenDk, padding: 18, paddingTop: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={onClose}><Txt c="#fff" s={22}>✕</Txt></Pressable>
        <Txt b s={20} c="#fff" style={{ marginTop: 8 }}>🛍 {preselectStore ? preselectStore.name : 'New order'}</Txt>
      </View>
      <View style={{ padding: 16 }}>
        <Field multiline numberOfLines={4} value={text} onChangeText={setText}
               placeholder={T('describe')} style={{ minHeight: 100, textAlignVertical: 'top' }} />
        <Section title={T('pickupFrom')}>
          <Card style={{ borderColor: C.green, borderWidth: 1.5 }}>
            <Txt s={12} c={C.mute}>{T('pickupFrom')}</Txt>
            <Txt b s={14}>{preselectStore ? preselectStore.name : (typeof preselect === 'string' ? preselect : 'Auto — nearest store')}</Txt>
            {preselectStore && <Txt s={11} c={C.mute}>📍 {preselectStore.address}</Txt>}
          </Card>
        </Section>
        <Section title={T('deliverTo')}>
          <Card>
            <Txt s={12} c={C.mute}>{T('deliverTo')}</Txt>
            <Txt b s={14}>🏠 {addr.label || 'Home'} — <Txt s={12} c={C.mute}>{addr.addr}</Txt></Txt>
            {addr.lat && <Txt s={11} c={C.mute}>📍 {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)} {addr.default ? '⭐ default' : ''}</Txt>}
          </Card>
        </Section>
        <Section title={T('feeOffer')}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Field value={fee} onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad"
                   style={{ width: 110, textAlign: 'center', fontSize: 22, fontWeight: '800' }} />
            <Txt s={14} c={C.mute} style={{ marginLeft: 12 }}>delivery only</Txt>
          </View>
        </Section>
        <Btn title={T('placeOrder') + ' · ' + peso(f)}
             disabled={!text.trim() || f <= 0}
             onPress={() => { placeOrder({ kind: 'order', category: 'Food', text, fee: f, payVia: 'wallet', pickup: 'auto', dropoff: addr.addr, storeId: preselectStore ? preselectStore.id : null }); onClose(); }} />
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
      <ScrollView style={{ flex: 1, padding: 14 }}>
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

export function OrdersTab() {
  const { s, customerConfirm, cancelOrder, dispute } = useStore();
  const mine = s.orders.filter((o) => o.mine);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, padding: 14 }}>
      <Txt b s={20} style={{ marginBottom: 10 }}>{'Orders'}</Txt>
      {mine.length === 0 && <Txt c={C.mute} style={{ textAlign: 'center', marginTop: 60 }}>No orders yet — tap ✨ to place one.</Txt>}
      {mine.map((o) => (
        <Card key={o.id} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt b s={15} style={{ flex: 1 }}>{o.storeName ? `🏪 ${o.storeName}` : '🛍 ' + o.items}</Txt>
            <View style={{ backgroundColor: o.status === 'cancelled' ? '#FDECEC' : o.status === 'completed' ? '#EAF3EF' : '#FBF7EC',
                           borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Txt s={11} b c={o.status === 'cancelled' ? C.bad : o.status === 'completed' ? C.green : C.amber}>
                {ORDER_STATUS[o.status] || o.status}</Txt>
            </View>
          </View>
          <Txt s={11} c={C.mute} style={{ marginTop: 4 }}>{o.category || ''} · fee {peso(o.fee)} · total {peso(o.fee + (o.price || 0))}</Txt>
          {o.kind !== 'cart' && <PhotoTimeline o={o} />}
          {['product', 'packed', 'pickup', 'delivery'].map((k) => o.photos && o.photos[k] ? <View key={k}>{photoBubble(o.photos[k])}</View> : null)}
          {/* V9: live driver banner for active orders */}
          {o.status === 'picked_up' && <DriverLocationBanner o={o} />}
          {o.status === 'delivered' && (
            <View>
              <Btn small title="Confirm ✓" onPress={() => customerConfirm(o.id)} />
              <Btn small kind="ghost" title="Report a problem" onPress={() => dispute(o.id)} />
            </View>
          )}
          {['vendor_quote', 'finding_driver'].includes(o.status) && o.kind !== 'cart' && (
            <Btn small kind="bad" title="Cancel" onPress={() => cancelOrder(o.id)} />
          )}
        </Card>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}
