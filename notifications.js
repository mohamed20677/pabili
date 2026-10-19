// Pabili PH — push notifications (real Expo push, no fake send).
// Falls back to local in-app Alerts when running in Expo Go / no projectId.
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: true }),
});

let _token = null;
export async function registerPush() {
  try {
    if (!Constants?.expoConfig?.extra?.eas?.projectId) return null;
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
    return _token;
  } catch (e) {
    return null;
  }
}

// Local notification helper for in-app lifecycle events (no network needed)
export async function notify(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch (e) {
    Alert.alert(title, body);
  }
}

export function pushToken() { return _token; }

// FIX BUILD V7 (export alias): App.js + api.js both call `initPush(...)`, but this
// module's real function is named `registerPush`. Without this alias the app crashes
// at runtime with "TypeError: 0,c.initPush is not a function (it is undefined)".
export { registerPush as initPush };
