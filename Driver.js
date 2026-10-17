import React, { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import * as Location from 'expo-location';
import { C, Btn, Card, Field, Me, Screen, Stars, TabBar, Txt, fmtKm, getPos, kmBetween, peso, rpc, run, supabase, useLive, useNow, useT } from './lib';
import Chat from './Chat';
import MapBox from './MapBox';

export default function Driver({ profile, onSignOut }) {
  const t = useT();
  const [tab, setTab] = useState('jobs');
  const [online, setOnline] = useState(false);
  const last = useRef(null);

  useEffect(() => { // share location while online (foreground)
    if (!online) return undefined;
    let sub;
    const ping = (p) => { last.current = p; rpc('driver_ping', { p_lat: p.lat, p_lng: p.lng, p_online: true }).catch(() => {}); };
    (async () => {
      ping(await getPos());
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 50 },
        (l) => ping({ lat: l.coords.latitude, lng: l.coords.longitude }));
    })().catch((e) => { Alert.alert('Cannot go online', e.message); setOnline(false); });
    return () => { if (sub) sub.remove(); };
  }, [online]);

  const toggle = () => {
    if (online && last.current) rpc('driver_ping', { p_lat: last.current.lat, p_lng: last.current.lng, p_online: false }).catch(() => {});
    setOnline(!online);
  };
  return (
    <View style={{ flex: 1 }}>
      {tab === 'jobs' && <Jobs me={profile.id} online={online} onToggle={toggle} />}
      {tab === 'wallet' && <WalletTab />}
      {tab === 'me' && <Me profile={profile} onSignOut={onSignOut} />}
      <TabBar tabs={[['jobs', t('Jobs')], ['wallet', t('Wallet')], ['me', t('Profile')]]} tab={tab} onTab={setTab} />
    </View>
  );
}

function Jobs({ me, online, onToggle }) {
  const t = useT();
  const [orders, reload] = useLive(async () => (await supabase.from('orders').select('*, vendors(name,lat,lng,address), order_items(name,qty,approved)').order('created_at', { ascending: false }).limit(20)).data || [], ['orders'], []);
  const [pos, setPos] = useState(null);
  useEffect(() => { if (online) getPos().then(setPos).catch(() => {}); }, [online]);
  const offers = (orders || []).filter((o) => o.offered_to === me && o.status === 'finding_driver');
  const active = (orders || []).filter((o) => o.driver_id === me && ['awaiting_payment', 'paid', 'picked_up', 'delivered', 'completed'].includes(o.status)).slice(0, 3);
  return (
    <Screen title={t('Jobs')}>
      <Btn kind={online ? 'danger' : undefined} title={online ? 'Go offline' : 'Go online'} onPress={onToggle} />
      <Txt c={C.mute} style={{ marginBottom: 10 }}>{online ? 'You are online. New offers appear here for 30 seconds each.' : 'Go online to receive offers near you.'}</Txt>
      {online && offers.length === 0 && active.length === 0 ? <Txt c={C.mute}>Waiting for orders…</Txt> : null}
      {offers.map((o) => <Offer key={o.id} o={o} pos={pos} reload={reload} />)}
      {active.map((o) => <Active key={o.id} o={o} me={me} reload={reload} />)}
    </Screen>
  );
}

function Offer({ o, pos, reload }) {
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const secs = Math.max(0, Math.ceil((new Date(o.offer_expires_at).getTime() - now) / 1000));
  const pickup = o.vendors ? { lat: o.vendors.lat, lng: o.vendors.lng } : { lat: o.pickup_lat, lng: o.pickup_lng };
  const drop = { lat: o.drop_lat, lng: o.drop_lng };
  const act = (name, args) => run(async () => { await rpc(name, { p_order: o.id, ...args }); reload(); }, setBusy);
  if (secs === 0) return null;
  if (o.driver_ask != null) {
    return <Card><Txt b>You asked for {peso(o.driver_ask)}</Txt><Txt c={C.mute}>Waiting for the customer to answer ({secs}s)…</Txt></Card>;
  }
  return (
    <Card style={{ borderColor: C.green, borderWidth: 2 }}>
      <Txt b s={17}>{o.kind === 'send' ? 'Send a package' : (o.vendors && o.vendors.name) || 'Order'} · {secs}s</Txt>
      <Txt c={C.mute}>{o.request}</Txt>
      <Txt style={{ marginVertical: 6 }}>To the store: {fmtKm(kmBetween(pos, pickup)) || '-'}   Store to customer: {fmtKm(kmBetween(pickup, drop))}</Txt>
      <Txt s={20} b>{peso(o.fee)}</Txt>
      <Btn title={`Accept ${peso(o.fee)}`} onPress={() => act('driver_accept', {})} busy={busy} />
      <Field keyboardType="number-pad" placeholder="Ask for more (₱)" value={ask} onChangeText={setAsk} />
      <Btn kind="ghost" title="Ask for this fee" disabled={!ask} onPress={() => act('driver_counter', { p_ask: Number(ask) })} />
      <Btn kind="ghost" title="Decline" onPress={() => act('driver_decline', {})} />
    </Card>
  );
}

function Active({ o, me, reload }) {
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(5);
  const [rated, setRated] = useState(false);
  const act = (name) => run(async () => { await rpc(name, { p_order: o.id }); reload(); }, setBusy);
  const pickup = o.vendors ? { label: 'Store', lat: o.vendors.lat, lng: o.vendors.lng } : { label: 'Pickup', lat: o.pickup_lat, lng: o.pickup_lng };
  const drop = { label: 'Customer', lat: o.drop_lat, lng: o.drop_lng };
  return (
    <Card>
      <Txt b>{o.kind === 'send' ? 'Package' : o.vendors && o.vendors.name} · {peso(o.fee)}</Txt>
      <Txt c={C.mute}>{o.request}</Txt>
      {o.status !== 'completed' ? <MapBox points={[pickup, drop]} /> : null}
      <Txt c={C.mute}>Store to customer: {fmtKm(kmBetween(pickup, drop))}  {o.drop_address ? '· ' + o.drop_address : ''}</Txt>
      {o.status === 'awaiting_payment' ? <Txt c={C.bad} style={{ marginVertical: 8 }}>Wait for the customer's payment before you buy or go to the store.</Txt> : null}
      {o.status === 'paid' ? (
        <>
          <Txt style={{ marginVertical: 8 }}>{o.vendor_handed || o.kind === 'send' ? 'Ready: collect the items.' : 'Payment secured. Go to the store; they will mark the items as handed over.'}</Txt>
          <Btn title="I picked up the items" onPress={() => act('driver_pickup')} busy={busy} />
        </>
      ) : null}
      {o.status === 'picked_up' ? <Btn title="Delivered to the customer" onPress={() => act('driver_deliver')} busy={busy} /> : null}
      {o.status === 'delivered' ? <Txt c={C.green} style={{ marginVertical: 8 }}>Waiting for the customer to confirm. Your pay is released after that.</Txt> : null}
      {o.status === 'completed' ? (
        <>
          <Txt c={C.green} style={{ marginBottom: 6 }}>Completed - payment added to your wallet.</Txt>
          <Stars value={stars} onChange={setStars} />
          <Btn kind="ghost" title={rated ? 'Thank you ✓' : 'Rate the customer'} disabled={rated} onPress={() => run(async () => { await rpc('rate_order', { p_order: o.id, p_stars: stars }); setRated(true); })} />
        </>
      ) : null}
      {['awaiting_payment', 'paid', 'picked_up', 'delivered'].includes(o.status) ? <Chat orderId={o.id} meId={me} /> : null}
    </Card>
  );
}

function WalletTab() {
  const t = useT();
  const [d] = useLive(async () => ({
    w: (await supabase.from('wallets').select('balance').maybeSingle()).data,
    tx: (await supabase.from('wallet_tx').select('*').order('created_at', { ascending: false }).limit(30)).data || [],
  }), ['wallets', 'wallet_tx'], []);
  return (
    <Screen title={t('Wallet')}>
      <Card><Txt c={C.mute}>Balance</Txt><Txt s={26} b>{peso(d && d.w && d.w.balance)}</Txt></Card>
      {((d && d.tx) || []).map((x) => (
        <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Txt c={C.mute}>{new Date(x.created_at).toLocaleDateString()} · {x.kind}</Txt>
          <Txt b>{peso(x.amount)}</Txt>
        </View>
      ))}
    </Screen>
  );
}
