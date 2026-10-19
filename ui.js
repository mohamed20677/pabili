// Pabili PH — UI atoms (reference-matched)
import React from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { C } from './lib';

export function Txt({ children, s = 14, b, c = C.ink, style, ...rest }) {
  // CHANGED: approved brand fonts (Nunito per brand sheet 2026-10-19)
  return <Text {...rest} style={[{ fontSize: s, color: c, fontFamily: b ? 'Nunito-Bold' : 'Nunito-Regular', fontWeight: b ? '700' : '400' }, style]}>{children}</Text>;
}
export function Btn({ title, onPress, kind = 'main', busy, disabled, style, small }) {
  const bg = kind === 'main' ? C.green : kind === 'bad' ? C.bad : kind === 'dark' ? '#111' : 'transparent';
  const fg = kind === 'ghost' ? C.green : '#fff';
  return (
    <Pressable onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [st.btn, small && { paddingVertical: 9, marginTop: 6 },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          borderWidth: kind === 'ghost' ? 1.5 : 0, borderColor: kind === 'bad' ? C.bad : C.green }, style]}>
      <Txt b c={kind === 'ghost' ? (kind === 'bad' ? C.bad : fg) : fg} s={small ? 13 : 16}>{busy ? '…' : title}</Txt>
    </Pressable>
  );
}
export function Field({ style, ...props }) {
  return <TextInput placeholderTextColor={C.mute} {...props} style={[st.field, style]} />;
}
export function Card({ children, style }) {
  return <View style={[st.card, style]}>{children}</View>;
}
export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, active && { backgroundColor: C.green, borderColor: C.green }]}>
      <Txt s={13} b={active} c={active ? '#fff' : C.ink}>{label}</Txt>
    </Pressable>
  );
}
export function Row({ icon, label, value, onPress, right, green }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={st.row}>
      <Txt s={17} style={{ width: 30 }}>{icon}</Txt>
      <Txt s={15} style={{ flex: 1 }}>{label}</Txt>
      {right || (value != null && <Txt s={14} b c={green ? C.green : C.mute}>{value} {onPress ? '›' : ''}</Txt>)}
    </Pressable>
  );
}
export function Section({ title, children }) {
  return (
    <View style={{ marginTop: 22, marginBottom: 10 }}>
      <Txt b s={18} style={{ marginBottom: 4 }}>{title}</Txt>
      {children}
    </View>
  );
}
export function Countdown({ left, total }) {
  const pct = Math.max(0, Math.min(1, left / total));
  const col = pct > 0.5 ? C.green : pct > 0.25 ? C.gold : C.bad;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden', marginTop: 8 }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: col, width: (pct * 100) + '%' }} />
    </View>
  );
}
const st = StyleSheet.create({
  btn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  field: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, color: C.ink, fontSize: 16, fontFamily: 'Nunito-Regular', backgroundColor: C.card },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.line },
});
