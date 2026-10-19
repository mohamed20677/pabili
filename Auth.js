// Pabili PH — Auth screens: Login (green hero), OTP (4 boxes + timer), Terms consent.
// Matches the reference screenshots exactly (same layout/colors), localized en/tl.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { ADMIN_CODE, ADMIN_PHONE, isAdminPhone, normalizePhone, useT, validPhone, USER_TEST_CODE } from './lib';
import { Btn, Card, Field, Txt } from './ui';

// ---------- 1) LOGIN (reference: full green hero + bottom white card) ----------
export function PhoneScreen({ onDone }) {
  const T = useT();
  const [num, setNum] = useState('');
  const [busy, setBusy] = useState(false);
  const digits = normalizePhone(num);

  const send = () => {
    if (!validPhone(digits)) {
      Alert.alert(T('login'), 'Enter your 10-digit mobile number, e.g. 917 123 4567.');
      return;
    }
    setBusy(true);
    // Stage 1: no network. Stage 2: signInWithOtp here (admin bypasses SMS).
    setTimeout(() => { setBusy(false); onDone(digits); }, 350);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0E7C5B' }}>
      {/* hero ~65% */}
      <View style={{ flex: 1.8, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: 14, left: 14, width: 30, height: 30, borderRadius: 15,
                       backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
          <Txt b c="#0E7C5B" s={16}>?</Txt>
        </View>
        {/* brand mark: approved logo lockup on white card (brand sheet 2026-10-19) */}
        <View style={{ alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 26, paddingVertical: 12, paddingHorizontal: 20 }}>
            <Image source={require('./assets/logo-lockup.png')} style={{ width: 216, height: 144 }} resizeMode="contain" />
          </View>
          <Txt c="#fff" s={13} style={{ opacity: 0.92, marginTop: 12 }}>Any item, any store, any time.</Txt>
        </View>
      </View>
      {/* bottom sheet ~35% */}
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22 }}>
        <Txt b s={20}>{T('login')}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, borderWidth: 1,
                       borderColor: '#DCE5DF', borderRadius: 14, paddingHorizontal: 12 }}>
          <Txt b s={15}>🇵🇭 +63</Txt>
          <Field value={num} onChangeText={setNum} keyboardType="phone-pad" maxLength={11}
                 placeholder={T('phonePh')}
                 style={{ flex: 1, borderWidth: 0, marginLeft: 8, backgroundColor: 'transparent' }} />
        </View>
        <Btn title={T('sendCode')} onPress={send} busy={busy} />
        <Txt c="#0E7C5B" s={13} style={{ textAlign: 'center', marginTop: 14 }}>{T('social')}</Txt>
        <Txt c="#6B7A72" s={11} style={{ textAlign: 'center', marginTop: 16 }}>{T('termsNote')}</Txt>
        <Txt c="#B9C4BE" s={10} style={{ textAlign: 'center', marginTop: 6 }}>{T('testHint')}</Txt>
      </View>
    </View>
  );
}

// ---------- 2) OTP (reference: 4 green boxes + 01:30 resend timer) ----------
export function OtpScreen({ digits, onVerified, onBack }) {
  const T = useT();
  const [code, setCode] = useState(['', '', '', '']);
  const [secs, setSecs] = useState(90);
  const refs = [useRef(), useRef(), useRef(), useRef()];
  const admin = isAdminPhone(digits);
  const expected = admin ? ADMIN_CODE : USER_TEST_CODE;

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const put = (i, v) => {
    const c = normalizePhone(v).slice(-1);
    const next = [...code]; next[i] = c; setCode(next);
    if (c && i < 3) refs[i + 1].current && refs[i + 1].current.focus();
  };

  const verify = () => {
    const entered = code.join('');
    if (entered.length < 4) return;
    if (entered !== expected) {
      Alert.alert('Wrong code', admin ? 'Wrong admin code.' : `Wrong code. For testing use ${USER_TEST_CODE}.`);
      return;
    }
    onVerified({ phone: '+63' + digits, role: admin ? 'admin' : null, verified: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 22 }}>
      <Pressable onPress={onBack} style={{ alignSelf: 'flex-end', padding: 6 }}><Txt s={22} c="#17231E">›</Txt></Pressable>
      <Txt b s={22} style={{ textAlign: 'center', marginTop: 30 }}>{T('otpTitle')}</Txt>
      <Txt c="#6B7A72" s={13} style={{ textAlign: 'center', marginTop: 8 }}>
        {T('otpSub')} <Txt b c="#0E7C5B">+63{digits}</Txt>
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 28 }}>
        {code.map((v, i) => (
          <Field key={i} ref={refs[i]} value={v} onChangeText={(t) => put(i, t)} keyboardType="number-pad"
                 maxLength={1} style={{ width: 56, height: 60, marginHorizontal: 6, textAlign: 'center',
                 fontSize: 24, fontWeight: '800', borderColor: v ? '#0E7C5B' : '#DCE5DF', borderWidth: 1.5 }} />
        ))}
      </View>
      <Txt c="#6B7A72" s={13} style={{ textAlign: 'center', marginTop: 26 }}>
        {secs > 0 ? `${T('resendIn')} 0${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
                  : <Txt c="#0E7C5B" b onPress={() => setSecs(90)}>{T('resend')}</Txt>}
      </Txt>
      <Btn title={T('verify')} onPress={verify} disabled={code.join('').length < 4} />
      <Txt c="#B9C4BE" s={11} style={{ textAlign: 'center', marginTop: 60 }}>{T('safeNote')}</Txt>
    </View>
  );
}

// ---------- 3) TERMS (reference: white card, 2 green checkboxes, wide agree) ----------
export function TermsScreen({ onAgree }) {
  const T = useT();
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const Box = ({ on, label }) => (
    <Pressable onPress={() => (label === T('tC1') ? setC1(!c1) : setC2(!c2))}
      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, marginRight: 12,
                     borderColor: '#0E7C5B', backgroundColor: on ? '#0E7C5B' : '#fff',
                     alignItems: 'center', justifyContent: 'center' }}>
        {on && <Txt c="#fff" b s={13}>✓</Txt>}
      </View>
      <Txt s={13} style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', marginTop: 60 }}>
        <Image source={require('./assets/icon.png')} style={{ width: 74, height: 74, borderRadius: 20, marginBottom: 26 }} />
        <Txt b s={20} style={{ textAlign: 'center' }}>{T('tTitle')}</Txt>
        <Txt c="#6B7A72" s={13} style={{ textAlign: 'center', marginTop: 14, lineHeight: 20 }}>{T('tBody')}</Txt>
      </View>
      <View>
        <Box on={c1} label={T('tC1')} />
        <Box on={c2} label={T('tC2')} />
        <Btn title={T('agree')} onPress={onAgree} disabled={!c1} />
      </View>
    </View>
  );
}
