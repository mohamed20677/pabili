// Pabili PH — driver live location. Foreground samples + REAL background tracking
// (Android foreground service via expo-task-manager + expo-location).
// The task is defined at module scope and index.js imports this file before the app mounts,
// so Android can start it headless even when the screen is locked or the app is swiped to background.
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_ENABLED } from './supabase';

export const BG_TASK = 'pabili-bg-location';
const PHONE_KEY = 'pabili.driver.phone';
let lastSent = 0;

// Upsert the driver's latest point (one row per driver). Throttled so fg + bg don't double-write.
export async function publishLocation(phone, coords, source) {
  if (!SUPABASE_ENABLED || !supabase || !phone || !coords) return false;
  const t = Date.now();
  if (t - lastSent < 4000) return true;
  lastSent = t;
  try {
    const { error } = await supabase.from('driver_locations').upsert({
      driver_phone: phone, lat: coords.latitude, lng: coords.longitude,
      accuracy: coords.accuracy == null ? null : coords.accuracy,
      source: source || 'fg', updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_phone' });
    return !error;
  } catch (e) { return false; }
}

TaskManager.defineTask(BG_TASK, async ({ data, error }) => {
  if (error || !data || !data.locations || !data.locations.length) return;
  const last = data.locations[data.locations.length - 1];
  const phone = await AsyncStorage.getItem(PHONE_KEY);
  await publishLocation(phone, last.coords, 'bg');
});

// Returns { ok, mode: 'bg' } or { ok:false, reason: 'foreground-denied' | 'background-denied' | 'error', message }
export async function startBgTracking(phone) {
  try {
    await AsyncStorage.setItem(PHONE_KEY, phone);
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return { ok: false, reason: 'foreground-denied' };
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return { ok: false, reason: 'background-denied' };
    if (!(await Location.hasStartedLocationUpdatesAsync(BG_TASK))) {
      await Location.startLocationUpdatesAsync(BG_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000, distanceInterval: 15,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Pabili — you are online',
          notificationBody: 'Sharing your live location for active deliveries.',
          notificationColor: '#0E7C5B',
        },
      });
    }
    return { ok: true, mode: 'bg' };
  } catch (e) {
    return { ok: false, reason: 'error', message: String((e && e.message) || e) };
  }
}

export async function stopBgTracking() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) await Location.stopLocationUpdatesAsync(BG_TASK);
  } catch (e) { /* not running */ }
  try { await AsyncStorage.removeItem(PHONE_KEY); } catch (e) { /* ignore */ }
}

// Customer side: freshest driver points from Supabase (last N minutes).
export async function fetchRecentDrivers(minutes = 5) {
  if (!SUPABASE_ENABLED || !supabase) return [];
  try {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    const { data } = await supabase.from('driver_locations').select('*')
      .gte('updated_at', since).order('updated_at', { ascending: false }).limit(5);
    return data || [];
  } catch (e) { return []; }
}
