import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { C, Btn, Card, Chip, Field, Me, Screen, Stars, STATUS, TabBar, Txt, fmtKm, geocode, getPos, kmBetween, peso, rpc, run, supabase, useLive, useT } from './lib';
import Chat from './Chat';
import MapBox from './MapBox';

const CATS = [['sari_sari', 'Sari-sari stores'], ['grocery', 'Grocery'], ['restaurant', 'Restaurants']];

export default function Customer({ profile, onSignOut }) {
  const t = useT();
  const [tab, setTab] = useState('home');
  const [view, setView] = useState(null);
  if (view && view.type === 'compose') return <Compose {...view} onClose={(id) => setView(id ? { type: 'order', id } : null)} />;
  if (view && view.type === 'order') {
    return <OrderView id={view.id} me={profile.id} onBack={() => setView(null)} onReorder={(r) => setView({ type: 'compose', kind: 'buy', vendor: r.vendor, seed: r.items })} />;
  }
  return (
    <View style={{ flex: 1 }}>
      {tab === 'home' && <Home open={setView} />}
      {tab === 'orders' && <OrderList open={setView} />}
      {tab === 'me' && <Me profile={profile} onSignOut={onSignOut} />}
      <TabBar tabs={[['home', t('Home')], ['orders', t('Orders')], ['me', t('Profile')]]} tab={tab} onTab={setTab} />
    </View>
  );
}

function Home({ open }) {
  const t = useT();
  const [cat, setCat] = useState('sari_sari');
  const [pos, setPos] = useState(null);
  useEffect(() => { getPos().then(setPos).catch(() => {}); }, []);
  const [vendors] = useLive(async () => (await supabase.from('vendors').select('*').eq('verified', true)).data || [], ['vendors'], []);
  const [promos] = useLive(async () => {
    const { data } = await supabase.from('promos').select('*, vendors(id,name)').eq('active', true).order('created_at', { ascending: false }).limit(10);
    return (data || []).filter((p) => !p.ends_at || new Date(p.ends_at) > new Date());
  }, ['promos'], []);
  const list = (vendors || []).filter((v) => v.category === cat).map((v) => ({ ...v, d: kmBetween(pos, v) })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <Txt s={22} b>{t('Order anything')}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
        {(promos && promos.length ? promos : [null]).map((p) => (
          <Pressable key={p ? p.id : 'brand'} disabled={!p} onPress={() => p && open({ type: 'compose', kind: 'buy', vendor: p.vendors })}
            style={{ width: 280, marginRight: 10, padding: 16, borderRadius: 16, backgroundColor: C.sun }}>
            <Txt b s={17}>{p ? p.title : 'Any item, any store, any time.'}</Txt>
            <Txt s={13}>{p ? `${(p.vendors && p.vendors.name) || ''} ${p.body || ''}` : 'Pick a store and tell us what you need.'}</Txt>
          </Pressable>
        ))}
      </ScrollView>
      <Btn kind="ghost" title={t('Send anything')} onPress={() => open({ type: 'compose', kind: 'send' })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {CATS.map(([k, l]) => <Chip key={k} label={t(l)} on={cat === k} onPress={() => setCat(k)} />)}
      </View>
      <Txt b style={{ marginVertical: 6 }}>{t('Close to you')}</Txt>
      {list.length === 0 ? <Txt c={C.mute}>No stores in this category yet.</Txt> : null}
      {list.map((v) => (
        <Pressable key={v.id} onPress={() => open({ type: 'compose', kind: 'buy', vendor: v })}>
          <Card>
            <Txt b>{v.name}</Txt>
            <Txt s={13} c={C.mute}>{v.address}</Txt>
            <Txt s={13} c={v.is_open ? C.green : C.bad}>{v.is_open ? 'Open' : 'Closed'} {v.d != null ? '· ' + fmtKm(v.d) : ''}</Txt>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// Describe the order (AI assistant), set your delivery fee offer, place it.
function Compose({ vendor, kind, seed, onClose }) {
  const t = useT();
  const send = kind === 'send';
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [items, setItems] = useState(seed || []);
  const [fee, setFee] = useState('20');
  const [addr, setAddr] = useState('');
  const [pickup, setPickup] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);

  const ask = () => {
    const q = text.trim();
    if (!q) return;
    const next = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setThinking(true);
    supabase.functions.invoke('order-assistant', { body: { messages: next, store: vendor && vendor.name } })
      .then(({ data, error }) => {
        if (error || !data || !data.reply) { // assistant not deployed/offline: keep the request as typed
          setItems((i) => [...i, { name: q, qty: 1 }]);
          setMsgs([...next, { role: 'assistant', content: 'Added to your list. Add more or place the order.' }]);
        } else {
          setMsgs([...next, { role: 'assistant', content: data.reply }]);
          if (data.items && data.items.length) setItems(data.items);
        }
      }).finally(() => setThinking(false));
  };
  const place = () => run(async () => {
    const f = Number(fee);
    if (!(f >= 10)) throw new Error('Minimum delivery fee is ₱10.');
    if (!send && !items.length) throw new Error('Tell us what you want first.');
    if (send && (!desc.trim() || !pickup.trim() || !addr.trim())) throw new Error('Fill in what to send, the pickup address and the delivery address.');
    const drop = send ? await geocode(addr) : await getPos();
    const pk = send ? await geocode(pickup) : { lat: null, lng: null };
    const id = await rpc('place_order', {
      p_vendor: send ? null : vendor.id, p_kind: kind,
      p_request: send ? desc : items.map((i) => `${i.qty || 1}x ${i.name}`).join(', '),
      p_items: send ? [] : items, p_fee: f, p_drop_address: addr,
      p_drop_lat: drop.lat, p_drop_lng: drop.lng,
      p_pickup_address: send ? pickup : null, p_pickup_lat: pk.lat, p_pickup_lng: pk.lng,
    });
    onClose(id);
  }, setBusy);

  return (
    <Screen title={send ? t('Send anything') : vendor.name} onBack={() => onClose(null)}>
      {send ? (
        <>
          <Field placeholder="What are we sending?" value={desc} onChangeText={setDesc} />
          <Field placeholder="Pickup address (street, barangay, town)" value={pickup} onChangeText={setPickup} />
          <Field placeholder="Delivery address (street, barangay, town)" value={addr} onChangeText={setAddr} />
        </>
      ) : (
        <>
          <Card>
            {msgs.length === 0 ? <Txt c={C.mute}>Tell us what you need, in your own words. Example: "2 liters of Coke and a sliced loaf of bread".</Txt> : null}
            {msgs.map((m, i) => (
              <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', backgroundColor: m.role === 'user' ? C.green : C.paper, borderRadius: 12, padding: 8, marginBottom: 6, maxWidth: '90%' }}>
                <Txt c={m.role === 'user' ? '#fff' : C.ink}>{m.content}</Txt>
              </View>
            ))}
            <Field value={text} onChangeText={setText} placeholder="What do you need?" onSubmitEditing={ask} />
            <Btn title={t('Send')} onPress={ask} busy={thinking} disabled={!text.trim()} />
          </Card>
          {items.length ? (
            <Card>
              <Txt b>{t('Items')}</Txt>
              {items.map((i, n) => (
                <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Txt>{i.qty || 1}x {i.name}</Txt>
                  <Pressable onPress={() => setItems(items.filter((_, k) => k !== n))}><Txt c={C.bad}>Remove</Txt></Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          <Field value={addr} onChangeText={setAddr} placeholder="Delivery notes (landmark, gate color) - we use your GPS location" />
        </>
      )}
      <Card>
        <Txt b>{t('Delivery fee')} (₱)</Txt>
        <Txt s={13} c={C.mute} style={{ marginBottom: 6 }}>Your offer to the shopper. They can accept it or ask for more, and you can accept, refuse or counter.</Txt>
        <Field keyboardType="number-pad" value={fee} onChangeText={setFee} />
      </Card>
      <Btn title={t('Place order')} onPress={place} busy={busy} />
    </Screen>
  );
}

function OrderList({ open }) {
  const t = useT();
  const [orders] = useLive(async () => (await supabase.from('orders').select('*, vendors(name)').order('created_at', { ascending: false }).limit(50)).data || [], ['orders'], []);
  return (
    <Screen title={t('Orders')}>
      {orders && orders.length === 0 ? <Txt c={C.mute}>No orders yet. Pick a store on Home to start.</Txt> : null}
      {(orders || []).map((o) => (
        <Pressable key={o.id} onPress={() => open({ type: 'order', id: o.id })}>
          <Card>
            <Txt b>{o.kind === 'send' ? t('Send anything') : (o.vendors && o.vendors.name) || 'Order'}</Txt>
            <Txt s={13} c={C.mute} numberOfLines={1}>{o.request}</Txt>
            <Txt s={13} c={o.status === 'cancelled' ? C.bad : C.green}>{STATUS[o.status]}</Txt>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function OrderView({ id, me, onBack, onReorder }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [method, setMethod] = useState('GCash');
  const [counter, setCounter] = useState('');
  const [stars, setStars] = useState(5);
  const [rated, setRated] = useState(false);
  const [d] = useLive(async () => {
    const { data: o, error } = await supabase.from('orders').select('*, vendors(name,lat,lng,phone,address), order_items(*)').eq('id', id).single();
    if (error) throw error;
    let drv = null;
    if (o.driver_id) drv = (await supabase.from('drivers').select('lat,lng,vehicle_type,plate').eq('user_id', o.driver_id).maybeSingle()).data;
    return { o, drv };
  }, ['orders', 'order_items', 'drivers'], [id]);
  const status = d && d.o.status;
  useEffect(() => { // keeps the driver search moving; a driver who does not answer in time is skipped
    if (status !== 'finding_driver') return undefined;
    const go = () => rpc('dispatch_order', { p_order: id }).catch(() => {});
    go();
    const h = setInterval(go, 8000);
    return () => clearInterval(h);
  }, [status, id]);
  if (!d) return <Screen title="…" onBack={onBack} />;

  const { o, drv } = d;
  const items = o.order_items || [];
  const act = (fn) => run(fn, setBusy);
  const eff = sel || new Set(items.filter((i) => !i.alt_of && i.status === 'quoted').map((i) => i.id));
  const toggle = (it) => {
    const root = it.alt_of || it.id;
    const group = items.filter((x) => x.id === root || x.alt_of === root).map((x) => x.id);
    const s = new Set(eff); const had = s.has(it.id);
    group.forEach((g) => s.delete(g)); if (!had) s.add(it.id);
    setSel(s);
  };
  const picked = items.filter((i) => eff.has(i.id));
  const quoteTotal = picked.reduce((a, i) => a + Number(i.price) * i.qty, 0);
  const vendorPt = o.vendors ? { label: 'Store', lat: o.vendors.lat, lng: o.vendors.lng } : { label: 'Pickup', lat: o.pickup_lat, lng: o.pickup_lng };
  const dropPt = { label: 'You', lat: o.drop_lat, lng: o.drop_lng };
  const drvPt = drv ? { label: 'Shopper', lat: drv.lat, lng: drv.lng } : null;
  const total = Number(o.items_total) + Number(o.fee) + Number(o.cust_fee);
  const cancel = () => Alert.alert(t('Cancel order'), 'Any money already held will be refunded.', [{ text: 'No' }, { text: 'Yes, cancel', style: 'destructive', onPress: () => act(() => rpc('cancel_order', { p_order: id })) }]);
  const cancellable = ['pending_vendor', 'quoted', 'finding_driver', 'awaiting_payment', 'paid'].includes(o.status);

  return (
    <Screen title={o.kind === 'send' ? t('Send anything') : (o.vendors && o.vendors.name) || 'Order'} onBack={onBack}>
      <Card><Txt b>{STATUS[o.status]}</Txt><Txt c={C.mute}>{o.request}</Txt></Card>

      {o.status === 'pending_vendor' ? <Card><Txt>{t('Waiting for the store to confirm stock and price')}</Txt><Txt s={13} c={C.mute}>The store will send a photo and a price for each item.</Txt></Card> : null}

      {o.status === 'quoted' ? (
        <>
          <Txt b style={{ marginBottom: 6 }}>Check each photo and price, then approve.</Txt>
          {items.filter((i) => i.status !== 'pending').map((i) => (
            <Pressable key={i.id} disabled={i.status === 'unavailable'} onPress={() => toggle(i)}>
              <Card style={{ borderColor: eff.has(i.id) ? C.green : C.line, borderWidth: eff.has(i.id) ? 2 : 1, opacity: i.status === 'unavailable' ? 0.5 : 1, marginLeft: i.alt_of ? 20 : 0 }}>
                {i.photo ? <Image source={{ uri: i.photo }} style={{ height: 150, borderRadius: 10, marginBottom: 8 }} /> : null}
                <Txt b>{i.alt_of ? 'Cheaper alternative: ' : ''}{i.qty}x {i.name}</Txt>
                <Txt c={C.mute}>{i.status === 'unavailable' ? 'Not available' : `${peso(i.price)} each`}</Txt>
              </Card>
            </Pressable>
          ))}
          <Txt b style={{ marginBottom: 6 }}>{t('Items')}: {peso(quoteTotal)}</Txt>
          <Btn title={t('Approve and continue')} onPress={() => act(() => rpc('approve_quote', { p_order: id, p_ids: [...eff] }))} busy={busy} disabled={!picked.length} />
        </>
      ) : null}

      {o.status === 'finding_driver' ? (
        o.offered_to && o.driver_ask != null ? (
          <Card>
            <Txt b>The shopper asks for {peso(o.driver_ask)}</Txt>
            <Txt c={C.mute} style={{ marginBottom: 8 }}>You offered {peso(o.fee)}.</Txt>
            <Btn title={`${t('Accept')} ${peso(o.driver_ask)}`} onPress={() => act(() => rpc('customer_respond', { p_order: id, p_action: 'accept' }))} busy={busy} />
            <Btn kind="ghost" title="Refuse - keep my offer" onPress={() => act(() => rpc('customer_respond', { p_order: id, p_action: 'refuse' }))} />
            <Field keyboardType="number-pad" value={counter} onChangeText={setCounter} placeholder={`Counter between ${peso(o.fee)} and ${peso(o.driver_ask)}`} />
            <Btn kind="ghost" title={t('Counter')} disabled={!counter} onPress={() => act(() => rpc('customer_respond', { p_order: id, p_action: 'counter', p_fee: Number(counter) }))} />
          </Card>
        ) : <Card><Txt>{t('Finding a shopper…')}</Txt><Txt s={13} c={C.mute}>Offered at {peso(o.fee)}. Each shopper has {30} seconds to answer before the next one is asked.</Txt></Card>
      ) : null}

      {o.status === 'awaiting_payment' ? (
        <Card>
          <Txt b>{t('Total')}</Txt>
          <Txt>{t('Items')}: {peso(o.items_total)}</Txt>
          <Txt>{t('Delivery fee')}: {peso(o.fee)}</Txt>
          <Txt>Service fee: {peso(o.cust_fee)}</Txt>
          <Txt s={20} b style={{ marginVertical: 8 }}>{peso(total)}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['GCash', 'Maya', 'Card', 'Bank'].map((m) => <Chip key={m} label={m} on={method === m} onPress={() => setMethod(m)} />)}
          </View>
          <Txt s={13} c={C.mute} style={{ marginBottom: 8 }}>Your money is held safely and released only after you confirm delivery. If any step fails, it is refunded.</Txt>
          <Btn title={t('Pay now')} onPress={() => act(() => rpc('pay_order', { p_order: id, p_method: method.toLowerCase() }))} busy={busy} />
        </Card>
      ) : null}

      {['awaiting_payment', 'paid', 'picked_up', 'delivered'].includes(o.status) ? (
        <>
          <MapBox points={[vendorPt, dropPt, drvPt].filter(Boolean)} />
          <Txt c={C.mute} style={{ marginBottom: 8 }}>
            Store to you: {fmtKm(kmBetween(vendorPt, dropPt))}{drvPt ? `  ·  Shopper to you: ${fmtKm(kmBetween(drvPt, dropPt))}` : ''}{drv ? `  ·  ${drv.vehicle_type} ${drv.plate || ''}` : ''}
          </Txt>
          <Chat orderId={id} meId={me} />
        </>
      ) : null}

      {o.status === 'delivered' ? <Btn title={t('Confirm delivery')} onPress={() => act(() => rpc('confirm_delivery', { p_order: id }))} busy={busy} /> : null}

      {o.status === 'completed' ? (
        <Card>
          <Txt b style={{ marginBottom: 6 }}>{t('Rate your driver')}</Txt>
          <Stars value={stars} onChange={setStars} />
          <Btn kind="ghost" title={rated ? 'Thank you ✓' : 'Send rating'} disabled={rated} onPress={() => act(async () => { await rpc('rate_order', { p_order: id, p_stars: stars }); setRated(true); })} />
          {o.kind === 'buy' && o.vendor_id ? (
            <Btn title={t('Reorder')} onPress={() => onReorder({ vendor: { id: o.vendor_id, name: o.vendors && o.vendors.name }, items: items.filter((i) => i.approved).map((i) => ({ name: i.name, qty: i.qty })) })} />
          ) : null}
        </Card>
      ) : null}

      {cancellable ? <Btn kind="danger" title={t('Cancel order')} onPress={cancel} /> : null}
    </Screen>
  );
}
