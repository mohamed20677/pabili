import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { C, Btn, Card, Field, Me, Screen, STATUS, TabBar, Txt, peso, pickPhoto, rpc, run, supabase, useLive, useT } from './lib';

export default function Vendor({ profile, onSignOut }) {
  const t = useT();
  const [tab, setTab] = useState('orders');
  return (
    <View style={{ flex: 1 }}>
      {tab === 'orders' && <Orders />}
      {tab === 'promos' && <Promos />}
      {tab === 'store' && <StoreTab profile={profile} onSignOut={onSignOut} />}
      <TabBar tabs={[['orders', t('Orders')], ['promos', t('Promos')], ['store', t('Store')]]} tab={tab} onTab={setTab} />
    </View>
  );
}

function Orders() {
  const t = useT();
  const [orders, reload] = useLive(async () => (await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(40)).data || [], ['orders', 'order_items'], []);
  const todo = (o) => ['pending_vendor', 'paid'].includes(o.status) ? 0 : 1;
  return (
    <Screen title={t('Orders')}>
      {orders && orders.length === 0 ? <Txt c={C.mute}>No orders yet. New requests appear here instantly.</Txt> : null}
      {(orders || []).slice().sort((a, b) => todo(a) - todo(b)).map((o) => <OrderCard key={o.id} o={o} reload={reload} />)}
    </Screen>
  );
}

// The store sets the price and sends a photo for every item - nothing is priced automatically.
function OrderCard({ o, reload }) {
  const [q, setQ] = useState({});
  const [alt, setAlt] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = (o.order_items || []).filter((i) => !i.alt_of);
  const set = (id, patch) => setQ({ ...q, [id]: { ...q[id], ...patch } });
  const photo = (apply) => run(async () => { const u = await pickPhoto('photos', true); if (u) apply(u); });
  const sendQuote = () => run(async () => {
    const p_items = items.map((i) => { const x = q[i.id] || {}; return { id: i.id, available: !x.na, price: x.price ? Number(x.price) : null, photo: x.photo || null }; });
    await rpc('vendor_quote', { p_order: o.id, p_items });
    reload();
  }, setBusy);
  const sendAlt = () => run(async () => {
    await rpc('vendor_alternative', { p_item: alt.item, p_name: alt.name, p_price: Number(alt.price), p_photo: alt.photo });
    setAlt(null); reload();
  }, setBusy);
  return (
    <Card>
      <Txt b>{STATUS[o.status]}</Txt>
      <Txt c={C.mute} style={{ marginBottom: 6 }}>{o.request}</Txt>

      {o.status === 'pending_vendor' ? (
        <>
          {items.map((i) => {
            const x = q[i.id] || {};
            return (
              <View key={i.id} style={{ marginBottom: 10 }}>
                <Txt b>{i.qty}x {i.name}</Txt>
                {x.na ? <Txt c={C.bad}>Marked as not available</Txt> : (
                  <>
                    <Field keyboardType="decimal-pad" placeholder="Price per item (₱)" value={x.price} onChangeText={(v) => set(i.id, { price: v })} />
                    {x.photo ? <Image source={{ uri: x.photo }} style={{ height: 110, borderRadius: 10, marginBottom: 8 }} /> : null}
                    <Btn kind="ghost" title={x.photo ? 'Retake photo' : 'Take a photo of the item'} onPress={() => photo((u) => set(i.id, { photo: u }))} />
                  </>
                )}
                <Btn kind="ghost" title={x.na ? 'Mark available' : 'Out of stock'} onPress={() => set(i.id, { na: !x.na })} />
              </View>
            );
          })}
          <Btn title="Send quote to customer" onPress={sendQuote} busy={busy} />
          <Btn kind="danger" title="Decline order" onPress={() => run(() => rpc('cancel_order', { p_order: o.id }))} />
        </>
      ) : null}

      {o.status === 'quoted' ? (
        <>
          <Txt c={C.mute}>Waiting for the customer. You can offer a cheaper alternative for an item.</Txt>
          {items.filter((i) => i.status === 'quoted').map((i) => (
            <Btn key={i.id} kind="ghost" title={`Offer a cheaper alternative to ${i.name}`} onPress={() => setAlt({ item: i.id, name: '', price: '', photo: null })} />
          ))}
          {alt ? (
            <View>
              <Field placeholder="Alternative product" value={alt.name} onChangeText={(v) => setAlt({ ...alt, name: v })} />
              <Field keyboardType="decimal-pad" placeholder="Price (₱)" value={alt.price} onChangeText={(v) => setAlt({ ...alt, price: v })} />
              <Btn kind="ghost" title={alt.photo ? 'Photo added ✓' : 'Take a photo'} onPress={() => photo((u) => setAlt({ ...alt, photo: u }))} />
              <Btn title="Send alternative" onPress={sendAlt} busy={busy} disabled={!alt.name || !alt.price || !alt.photo} />
            </View>
          ) : null}
        </>
      ) : null}

      {['finding_driver', 'awaiting_payment'].includes(o.status) ? <Txt c={C.mute}>Approved ({peso(o.items_total)}). Waiting for a shopper and payment.</Txt> : null}

      {o.status === 'paid' ? (
        o.vendor_handed ? <Txt c={C.green}>Handed over. Waiting for the shopper to confirm pickup.</Txt> : (
          <>
            <Txt>Payment is secured. Prepare the items for the shopper ({peso(o.items_total)}).</Txt>
            <Btn title="Items handed to the shopper" onPress={() => run(async () => { await rpc('vendor_handover', { p_order: o.id }); reload(); }, setBusy)} busy={busy} />
            <Btn kind="danger" title="Cannot fulfil - cancel and refund" onPress={() => run(() => rpc('cancel_order', { p_order: o.id }))} />
          </>
        )
      ) : null}
    </Card>
  );
}

function Promos() {
  const t = useT();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, reload] = useLive(async () => {
    const { data: v } = await supabase.from('vendors').select('id').maybeSingle();
    if (!v) return { vendor: null, rows: [] };
    return { vendor: v.id, rows: (await supabase.from('promos').select('*').eq('vendor_id', v.id).order('created_at', { ascending: false })).data || [] };
  }, ['promos'], []);
  const add = () => run(async () => {
    const { error } = await supabase.from('promos').insert({ vendor_id: list.vendor, title: title.trim(), body: body.trim() });
    if (error) throw error;
    setTitle(''); setBody(''); reload();
  }, setBusy);
  return (
    <Screen title={t('Promos')}>
      <Card>
        <Txt b style={{ marginBottom: 6 }}>New promo (shown on the customer home banner)</Txt>
        <Field placeholder="Title, e.g. Free ice with 6 sodas" value={title} onChangeText={setTitle} />
        <Field placeholder="Details" value={body} onChangeText={setBody} />
        <Btn title="Publish promo" onPress={add} busy={busy} disabled={!title.trim() || !list || !list.vendor} />
      </Card>
      {((list && list.rows) || []).map((p) => (
        <Card key={p.id}>
          <Txt b>{p.title}</Txt>
          <Txt c={C.mute}>{p.body}</Txt>
          <Btn kind="ghost" title={p.active ? 'Stop promo' : 'Restart promo'} onPress={() => run(async () => { await supabase.from('promos').update({ active: !p.active }).eq('id', p.id); reload(); })} />
        </Card>
      ))}
    </Screen>
  );
}

function StoreTab({ profile, onSignOut }) {
  const t = useT();
  const [d, reload] = useLive(async () => ({
    v: (await supabase.from('vendors').select('*').maybeSingle()).data,
    w: (await supabase.from('wallets').select('balance').maybeSingle()).data,
  }), ['vendors', 'wallets'], []);
  return (
    <Me profile={profile} onSignOut={onSignOut}>
      {d && d.v ? (
        <Card>
          <Txt b>{d.v.name}</Txt>
          <Txt c={d.v.is_open ? C.green : C.bad} style={{ marginBottom: 8 }}>{d.v.is_open ? 'Open for orders' : 'Closed'}</Txt>
          <Btn kind="ghost" title={d.v.is_open ? 'Close the store' : 'Open the store'} onPress={() => run(async () => { await rpc('vendor_set_open', { p_open: !d.v.is_open }); reload(); })} />
          <Txt>{t('Wallet')}: {peso(d.w && d.w.balance)}</Txt>
        </Card>
      ) : null}
    </Me>
  );
}
