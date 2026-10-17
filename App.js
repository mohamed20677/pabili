import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, LangCtx, Txt, supabase } from './src/lib';
import { KycForm, Pending, PhoneScreen, RolePicker } from './src/Auth';
import Customer from './src/Customer';
import Vendor from './src/Vendor';
import Driver from './src/Driver';

export default function App() {
  const [lang, setLangState] = useState('en');
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState(null);
  const setLang = (l) => { setLangState(l); AsyncStorage.setItem('pabili.lang', l); };

  const load = useCallback(async (uid) => {
    if (!uid) { setState(null); return; }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    let kyc = null;
    if (profile && (profile.role === 'driver' || profile.role === 'vendor')) {
      const q = profile.role === 'vendor'
        ? supabase.from('vendors').select('verified').eq('owner_id', uid)
        : supabase.from('drivers').select('verified').eq('user_id', uid);
      const { data: row } = await q.maybeSingle();
      const { data: k } = await supabase.from('kyc_requests').select('status').order('created_at', { ascending: false }).limit(1).maybeSingle();
      kyc = { submitted: !!row && !!k, verified: !!(row && row.verified), last: k && k.status };
    }
    setState({ profile, kyc });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('pabili.lang').then((v) => { if (v) setLangState(v); });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session && data.session.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); load(s && s.user.id); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const signOut = () => supabase.auth.signOut();
  const refresh = () => load(session && session.user.id);

  let body;
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    body = <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Txt b s={18}>Setup needed</Txt><Txt>Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the .env file, then rebuild.</Txt></View>;
  } else if (session === undefined || (session && !state)) {
    body = <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.green} size="large" /></View>;
  } else if (!session) {
    body = <PhoneScreen />;
  } else {
    const { profile, kyc } = state;
    if (!profile || !profile.role) body = <RolePicker onDone={refresh} />;
    else if (kyc && !kyc.verified) {
      body = !kyc.submitted || kyc.last === 'rejected'
        ? <KycForm role={profile.role} rejected={kyc.last === 'rejected'} onDone={refresh} />
        : <Pending onRefresh={refresh} onSignOut={signOut} />;
    } else if (profile.role === 'admin') body = <Admin profile={profile} onSignOut={signOut} />;
    else if (profile.role === 'vendor') body = <Vendor profile={profile} onSignOut={signOut} />;
    else if (profile.role === 'driver') body = <Driver profile={profile} onSignOut={signOut} />;
    else body = <Customer profile={profile} onSignOut={signOut} />;
  }

  return (
    <SafeAreaProvider>
      <LangCtx.Provider value={{ lang, setLang }}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>{body}</SafeAreaView>
      </LangCtx.Provider>
    </SafeAreaProvider>
  );
}
