import React, { useState } from 'react';
import { View } from 'react-native';
import { C, Btn, Card, Field, Txt, rpc, run, supabase, useLive, useT } from './lib';

// Live customer <-> driver chat for one order
export default function Chat({ orderId, meId }) {
  const t = useT();
  const [text, setText] = useState('');
  const [msgs] = useLive(async () => (await supabase.from('messages').select('*').eq('order_id', orderId).order('created_at')).data || [], ['messages'], [orderId]);
  const send = () => { const b = text; setText(''); run(() => rpc('send_message', { p_order: orderId, p_body: b })); };
  return (
    <Card>
      <Txt b style={{ marginBottom: 8 }}>{t('Chat')}</Txt>
      {(msgs || []).slice(-30).map((m) => (
        <View key={m.id} style={{ alignSelf: m.sender_id === meId ? 'flex-end' : 'flex-start', backgroundColor: m.sender_id === meId ? C.green : C.paper, borderRadius: 12, padding: 8, marginBottom: 6, maxWidth: '85%' }}>
          <Txt c={m.sender_id === meId ? '#fff' : C.ink}>{m.body}</Txt>
        </View>
      ))}
      <Field value={text} onChangeText={setText} placeholder="…" onSubmitEditing={send} />
      <Btn title={t('Send')} onPress={send} disabled={!text.trim()} />
    </Card>
  );
}
