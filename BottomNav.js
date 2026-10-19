// Bottom navigation: 5 tabs with elevated center FAB (reference-matched)
import React from 'react';
import { Pressable, View } from 'react-native';
import { C } from './lib';
import { Txt } from './ui';

export default function BottomNav({ tab, setTab, onFab, alerts }) {
  const unread = (alerts || []).filter((a) => !a.read).length;
  const Item = ({ k, icon, label }) => (
    <Pressable onPress={() => setTab(k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ alignItems: 'center', backgroundColor: tab === k ? '#EAF3EF' : 'transparent',
                     borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4 }}>
        <Txt s={20}>{icon}</Txt>
        <Txt s={10} b={tab === k} c={tab === k ? C.green : C.mute}>{label}</Txt>
        {k === 'alerts' && unread > 0 && (
          <View style={{ position: 'absolute', top: -2, right: 4, backgroundColor: C.bad, borderRadius: 8,
                         minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Txt s={9} b c="#fff">{unread}</Txt>
          </View>
        )}
      </View>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.96)', marginHorizontal: 12,
                   marginBottom: 10, borderRadius: 26, borderWidth: 1, borderColor: C.line, elevation: 6,
                   shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }}>
      <Item k="home" icon="🏠" label="Home" />
      <Item k="orders" icon="🔖" label="Orders" />
      <Pressable onPress={onFab} style={{ width: 74, alignItems: 'center', marginTop: -22 }}>
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: C.greenDk,
                       alignItems: 'center', justifyContent: 'center', elevation: 8,
                       shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
          <Txt s={24} c="#fff">✨</Txt>
        </View>
      </Pressable>
      <Item k="alerts" icon="🔔" label="Alerts" />
      <Item k="profile" icon="👤" label="My Page" />
    </View>
  );
}
