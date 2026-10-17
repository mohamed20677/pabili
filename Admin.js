// Admin dashboard: review KYC requests (approve/reject) + watch live orders.
// Only reachable when profiles.role = 'admin'. Server-side functions
// admin_queue / admin_decide / admin_orders enforce that too.
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Btn, Card, C, Txt, rpc, run, STATUS } from './lib';

export default function Admin({ profile, onSignOut }) {
  const [tab, setTab] = useState('kyc');
  const [kyc, setKyc] = useState([]);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [q, o] = await Promise.all([rpc('admin_queue'), rpc('admin_orders')]);
      setKyc(q || []); setOrders(o || []);
    } catch (e) { /* shown via run() on actions; list errors are non-fatal */ }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const decide = (row, ok) => run(async () => {
    await rpc('admin_decide', { p_user: row.user_id, p_role: row.role, p_ok: ok });
    await load();
  }, setBusy);

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ backgroundColor: C.green, padding: 20, paddingTop: 12 }}>
        <Txt s={22} b c="#fff">Pabili Admin</Txt>
        <Txt s={12} c="#fff">{profile.phone || profile.id}</Txt>
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          {[['kyc', 'KYC requests'], ['orders', 'Orders']].map(([k, label]) => (
            <Btn key={k} kind={tab === k ? 'main' : 'ghost'} title={label}
                 onPress={() => setTab(k)} style={{ flex: 1, marginRight: 8 }} />
          ))}
        </View>
      </View>

      {tab === 'kyc' ? (
        <FlatList data={kyc} keyExtractor={(r) => r.user_id + ':' + r.role}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Txt c={C.mute} style={{ textAlign: 'center', marginTop: 40 }}>No pending requests. Pull to refresh.</Txt>}
          renderItem={({ item }) => (
            <Card>
              <Txt b s={16}>{item.role === 'vendor' ? 'Store' : 'Driver'} verification</Txt>
              <Txt s={12} c={C.mute}>{item.user_id}</Txt>
              <Txt s={12} c={C.mute} style={{ marginVertical: 6 }}>
                {new Date(item.created_at).toLocaleString()} - status: {item.status}
              </Txt>
              {!!item.data && <Txt s={12}>{JSON.stringify(item.data).slice(0, 220)}</Txt>}
              <View style={{ flexDirection: 'row', marginTop: 10 }}>
                <Btn title={busy ? '...' : 'Approve'} onPress={() => decide(item, true)} style={{ flex: 1, marginRight: 8 }} />
                <Btn kind="bad" title="Reject" onPress={() => decide(item, false)} style={{ flex: 1 }} />
              </View>
            </Card>
          )} />
      ) : (
        <FlatList data={orders} keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Txt c={C.mute} style={{ textAlign: 'center', marginTop: 40 }}>No orders yet.</Txt>}
          renderItem={({ item }) => (
            <Card>
              <Txt b>{item.item_text || item.id}</Txt>
              <Txt s={12} c={C.mute}>
                {STATUS[item.status] || item.status} - fee {item.fee} - {new Date(item.created_at).toLocaleString()}
              </Txt>
            </Card>
          )} />
      )}

      <View style={{ padding: 16 }}>
        <Btn kind="ghost" title="Log out" onPress={onSignOut} />
      </View>
    </View>
  );
}
