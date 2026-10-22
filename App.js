// Pabili PH — full app shell: auth flow → role-based experience
// V8: Store picker step (after tapping a category chip) → StoresByCategory list →
// tapping a store routes into OrderForm with that store pre-selected.
import React, { useState } from 'react';
import { Modal, SafeAreaView, StatusBar, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Nunito_400Regular, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { wireSupabaseSession, SUPABASE_ENABLED } from './supabase';
import { initPush } from './notifications';
import { LangCtx, C } from './lib';
import { StoreProvider, useStore } from './store';
import { ensureProfile, loadProfileRemote } from './api';
import { PhoneScreen, OtpScreen, TermsScreen } from './Auth';
import { HomeScreen, OrderForm, OrdersTab, StoresByCategory, AddressesScreen, CartScreen } from './Customer';
import Profile, { AlertsTab } from './Profile';
import Driver from './Driver';
import Vendor from './Vendor';
import Admin from './Admin';
import BottomNav from './BottomNav';
import RideForm from './Ride';
import { Txt } from './ui';

function Shell() {
  const { s, signIn, agreeTerms, placeCartOrder, setProfile } = useStore();
  const [digits, setDigits] = useState('');
  const [step, setStep] = useState('phone'); // phone | otp
  const [tab, setTab] = useState('home');
  const [newOpen, setNewOpen] = useState(false);
  const [preselect, setPreselect] = useState(null);
  const [preselectStore, setPreselectStore] = useState(null);
  const [storesCat, setStoresCat] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [rideOpen, setRideOpen] = useState(false);

  // V16: make sure the cloud profile row exists, then restore name + photo (e.g. after a reinstall)
  React.useEffect(() => {
    const phone = s.auth && s.auth.phone;
    if (!phone || s.auth.role === 'admin') return undefined;
    let alive = true;
    (async () => {
      await ensureProfile(phone);
      const r = await loadProfileRemote(phone);
      if (alive && r) setProfile({ ...(r.name ? { name: r.name } : {}), ...(r.avatar_url ? { avatar: r.avatar_url } : {}) });
    })();
    return () => { alive = false; };
  }, [s.auth && s.auth.phone]);

  if (!s.auth) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        {step === 'phone'
          ? <PhoneScreen onDone={(d) => { setDigits(d); setStep('otp'); }} />
          : <OtpScreen digits={digits} onVerified={signIn} onBack={() => setStep('phone')} />}
      </View>
    );
  }
  if (!s.terms) return <TermsScreen onAgree={agreeTerms} />;
  if (s.auth.role === 'admin') return <Admin />;

  const role = s.activeRole;
  const main = tab === 'home'
    ? (role === 'driver' ? <Driver /> : role === 'vendor' ? <Vendor />
       : <HomeScreen
           goNew={(c) => { setPreselect(c); setPreselectStore(null); setNewOpen(true); }}
           goStores={(c) => { setStoresCat(c); }} goCart={() => setCartOpen(true)} goRide={() => setRideOpen(true)} />)
    : tab === 'orders' ? <OrdersTab />
    : tab === 'alerts' ? <AlertsTab />
    : <Profile onOpenAddresses={() => setAddrOpen(true)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
      <StatusBar barStyle="dark-content" />
      {s.net === 'offline' && <View style={{ backgroundColor: C.bad, padding: 4 }}><Txt c="#fff" s={11} style={{ textAlign: 'center' }}>No connection — retrying…</Txt></View>}
      <View style={{ flex: 1 }}>{main}</View>
      <BottomNav tab={tab} setTab={setTab} alerts={s.alerts} onFab={() => {
        if (role === 'customer') { setPreselect(null); setPreselectStore(null); setNewOpen(true); }
        else setTab('home');
      }} />
      <Modal visible={cartOpen} animationType="slide" onRequestClose={() => setCartOpen(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          <CartScreen onClose={() => setCartOpen(false)} onPlace={() => { placeCartOrder(s.auth?.phone, 'wallet'); setCartOpen(false); setTab('orders'); }} />
        </SafeAreaView>
      </Modal>
      <Modal visible={newOpen} animationType="slide" onRequestClose={() => setNewOpen(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          <OrderForm preselect={preselect} preselectStore={preselectStore} onClose={() => setNewOpen(false)} onPlaced={() => setTab('orders')} />
        </SafeAreaView>
      </Modal>
      <Modal visible={rideOpen} animationType="slide" onRequestClose={() => setRideOpen(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          <RideForm onClose={() => setRideOpen(false)} onPlaced={() => setTab('orders')} />
        </SafeAreaView>
      </Modal>
      <Modal visible={!!storesCat} animationType="slide" onRequestClose={() => setStoresCat(null)}>
        <SafeAreaView style={{ flex: 1 }}>
          <StoresByCategory category={storesCat} onBack={() => setStoresCat(null)}
            onPick={(s) => { setStoresCat(null); setPreselect(null); setPreselectStore(s); setNewOpen(true); }} />
        </SafeAreaView>
      </Modal>
      <Modal visible={addrOpen} animationType="slide" onRequestClose={() => setAddrOpen(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          <AddressesScreen onClose={() => setAddrOpen(false)} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ 'Nunito-Regular': Nunito_400Regular, 'Nunito-Bold': Nunito_700Bold });
  const [lang, setLangState] = useState('en');
  const setLang = (l) => { setLangState(l); AsyncStorage.setItem('pabili.lang', l); };

  React.useEffect(() => {
    wireSupabaseSession().catch(() => {});
    if (SUPABASE_ENABLED) initPush().catch(() => {});
  }, []);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#0E7C5B' }} />;
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </LangCtx.Provider>
  );
}
