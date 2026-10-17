import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { C, Btn, Card, Chip, Field, Txt, getPos, pickPhoto, rpc, run, supabase, useT } from './lib';

export function PhoneScreen() {
  const [step, setStep] = useState('phone');
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const digits = num.replace(/\D/g, '').replace(/^0/, '');
  const phone = '+63' + digits;
  const isAdmin = digits === '562989152'; // admin test login: 0562989152 / 1785
  const TEST_CODE = '1234'; // TESTING ONLY: any valid number + 1234 signs in (SMS not yet enabled). Remove before launch.
  const send = () => run(async () => {
    if (isAdmin) { setStep('code'); return; } // no SMS for the admin test account
    if (digits.length !== 10) throw new Error('Enter your 10-digit mobile number, e.g. 917 123 4567.');
    // TESTING ONLY: skip the SMS call (phone provider not enabled) and go straight to the code screen.
    // When a real SMS provider is configured, uncomment the two lines below and remove setStep('code'):
    // const { error } = await supabase.auth.signInWithOtp({ phone });
    // if (error) throw error;
    setStep('code');
  }, setBusy);
  const verify = () => run(async () => {
    if (isAdmin) {
      if (code.trim() !== '1785') throw new Error('Wrong code.');
      const { error: e1 } = await supabase.auth.signInAnonymously();
      if (e1) throw e1;
      await rpc('admin_login', { p_phone: '0562989152', p_code: '1785' });
      return; // onAuthStateChange in App.js routes to the admin dashboard
    }
    // TESTING ONLY: accept the fixed code 1234 for everyone, then create an
    // anonymous session and stamp the entered phone on the profile.
    if (code.trim() === TEST_CODE) {
      const { error: e2 } = await supabase.auth.signInAnonymously();
      if (e2) throw e2;
      await supabase.from('profiles').upsert({ id: (await supabase.auth.getUser()).data.user.id, phone });
      return; // onAuthStateChange routes to RolePicker / the app
    }
    throw new Error('Wrong code. For testing use 1234.');
  }, setBusy);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.green }}>
      <Txt s={34} b c="#fff">Pabili</Txt>
      <Txt c="#fff" style={{ marginBottom: 28 }}>Any item, any store, any time.</Txt>
      <Card>
        {step === 'phone' ? (
          <>
            <Txt b style={{ marginBottom: 8 }}>Mobile number (+63)</Txt>
            <Field keyboardType="phone-pad" value={num} onChangeText={setNum} placeholder="917 123 4567" />
            <Btn title="Send code" onPress={send} busy={busy} />
          </>
        ) : (
          <>
            <Txt b style={{ marginBottom: 8 }}>Enter the code sent to {phone}</Txt>
            <Field keyboardType="number-pad" value={code} onChangeText={setCode} placeholder="123456" />
            <Btn title="Verify" onPress={verify} busy={busy} />
            <Btn kind="ghost" title="Change number" onPress={() => setStep('phone')} />
          </>
        )}
      </Card>
      <Txt s={12} c="#fff">By using this app you agree to our Terms of Use.</Txt>
    </View>
  );
}

export function RolePicker({ onDone }) {
  const locked = process.env.EXPO_PUBLIC_APP_ROLE; // set to customer | driver | vendor to ship three separate apps from this code
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const roles = [['customer', 'Customer - order anything'], ['driver', 'Shopper - earn per delivery'], ['vendor', 'Store - receive orders']]
    .filter(([k]) => !locked || k === locked);
  const pick = (role) => run(async () => {
    if (!name.trim()) throw new Error('Enter your name first.');
    await rpc('set_role', { p_role: role, p_name: name.trim() });
    onDone();
  }, setBusy);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Txt s={24} b style={{ marginBottom: 12 }}>Account type</Txt>
      <Field value={name} onChangeText={setName} placeholder="Your name" />
      {roles.map(([k, label]) => <Btn key={k} title={label} onPress={() => pick(k)} busy={busy} />)}
    </View>
  );
}

// Registration + documents for drivers and stores. A human approves the request (see README).
export function KycForm({ role, rejected, onDone }) {
  const t = useT();
  const isV = role === 'vendor';
  const [f, setF] = useState({ category: 'sari_sari', vehicle_type: 'Motorcycle' });
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const addDoc = (camera) => run(async () => { const p = await pickPhoto('kyc', camera); if (p) setDocs([...docs, p]); });
  const here = () => run(async () => { const p = await getPos(); setF({ ...f, lat: p.lat, lng: p.lng }); });
  const submit = () => run(async () => {
    if (isV && (!f.name || !f.address || !f.phone)) throw new Error('Fill in the store name, address and phone.');
    if (!isV && (!f.vehicle_model || !f.plate)) throw new Error('Fill in the vehicle model and plate number.');
    if (isV && f.lat == null) throw new Error('Tap "I am at the store" to set the store location.');
    if (docs.length < 2) throw new Error(isV ? 'Upload the business license and a storefront photo.' : "Upload your driver's license and a clear selfie.");
    await rpc('submit_kyc', { p_data: f, p_docs: docs });
    onDone();
  }, setBusy);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 50 }}>
      <Txt s={22} b>{isV ? 'Tell us about your store' : 'Enter your vehicle and license'}</Txt>
      <Txt c={C.mute} style={{ marginBottom: 14 }}>We verify shoppers' identity and stores' licenses. Your documents are never shown to customers.</Txt>
      {rejected ? <Txt c={C.bad} style={{ marginBottom: 10 }}>Your last request was not approved. Please check the details and send again.</Txt> : null}
      {isV ? (
        <>
          <Field placeholder="Store name" value={f.name} onChangeText={set('name')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[['sari_sari', 'Sari-sari stores'], ['grocery', 'Grocery'], ['restaurant', 'Restaurants']].map(([k, l]) => <Chip key={k} label={t(l)} on={f.category === k} onPress={() => set('category')(k)} />)}
          </View>
          <Field placeholder="Store address" value={f.address} onChangeText={set('address')} />
          <Field placeholder="Store phone" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} />
          <Btn kind="ghost" title={f.lat != null ? 'Location saved ✓' : 'I am at the store (save location)'} onPress={here} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['Motorcycle', 'Bicycle', 'Walking'].map((v) => <Chip key={v} label={v} on={f.vehicle_type === v} onPress={() => set('vehicle_type')(v)} />)}
          </View>
          <Field placeholder="Vehicle model" value={f.vehicle_model} onChangeText={set('vehicle_model')} />
          <Field placeholder="Plate number" autoCapitalize="characters" value={f.plate} onChangeText={set('plate')} />
        </>
      )}
      <Txt b style={{ marginVertical: 8 }}>Documents ({docs.length}/2+)</Txt>
      <Btn kind="ghost" title={isV ? 'Photo: business license / storefront' : "Photo: license / selfie"} onPress={() => addDoc(true)} />
      <Btn kind="ghost" title="Choose from gallery" onPress={() => addDoc(false)} />
      <Btn title="Send for review" onPress={submit} busy={busy} />
    </ScrollView>
  );
}

export function Pending({ onRefresh, onSignOut }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Txt s={22} b>Your account is under review</Txt>
      <Txt c={C.mute} style={{ marginVertical: 12 }}>We will unlock your account as soon as your documents are approved. Tap refresh to check.</Txt>
      <Btn title="Refresh" onPress={onRefresh} />
      <Btn kind="ghost" title="Log out" onPress={onSignOut} />
    </View>
  );
}
