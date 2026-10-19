// V9 — Push notifications.
// Honest platform split:
//   • On the web build, the only practical path is Web Push via a service worker
//     and the VAPID scheme. Firebase Cloud Messaging can also be used if FCM
//     credentials are configured. We do NOT claim any sends happen without keys.
//   • On real Android (APK / native build) we register an Expo push token; bulk
//     sends from a server require an FCM Server Key, stored ONLY as a Supabase
//     Edge Function secret (never in the app bundle).
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: true }),
});

let _token = null;
let _tokenSavedLocally = null;

export async function registerPush() {
  try {
    if (!Constants?.expoConfig?.extra?.eas?.projectId) {
      // web path — would normally call navigator.serviceWorker + PushManager.subscribe
      // with the VAPID public key. Until service worker is installed, return null.
      _token = null;
      return null;
    }
    const { status } = await Notifications.getPermissionsAsync();
    let final = status;
    if (final !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      final = req.status;
    }
    if (final !== 'granted') return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX });
    }
    const t = await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId });
    _token = t.data;
    _tokenSavedLocally = { kind: 'expo', token: t.data, projectId: Constants.expoConfig.extra.eas.projectId };
    return t.data;
  } catch (e) { return null; }
}

export async function notify(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch (e) {
    Alert.alert(title, body);
  }
}

export function pushToken() { return _token; }

// V9: returns what was saved on this device so admin panel can show "device-registered".
export function pushTokenInfo() { return _tokenSavedLocally; }

// Web setup checklist (read BG_GEO_LIMITATIONS.md / KEY_GUIDE.md):
//   1. Create a service-worker.js that listens for 'push' and shows Notification { title, body }.
//   2. On first load call: registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY }).
//   3. Send the subscription to the server; the server pushes to that endpoint using VAPID PRIVATE.
//   4. FCM (alt): replace VAPID with FCM's legacy server key in an Edge Function.
export const PUSH_KEY_GUIDE = {
  vapidPublicKey:  'Use VAPID for Web Push (generate via web-push library).',
  fcmServerKey:    'Use FCM Server Key if you choose FCM. Store strictly in a Supabase Edge Function secret.',
  expoProjectId:   'Set in app.config.js → extra.EXPO_PUBLIC_PROJECT_ID after eas init.',
};

export { registerPush as initPush }; // V7 compatibility fix
