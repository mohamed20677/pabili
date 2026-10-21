# Pabili PH — Background location (V16)

Background tracking is **real on the Android APK**: when a courier goes Online, `tracking.js`
starts an Android foreground service (`expo-task-manager` + `expo-location`). A persistent
notification ("Pabili — you are online") keeps it alive with the screen locked or the app in
the background. Points are upserted every ~10 s / 15 m into `driver_locations` (one row per driver).

## What the courier must do once
1. Allow **Location → "Allow all the time"** (Android 11+ sends you to the app's settings page).
2. Allow notifications (Android 13+) so the foreground-service notice is visible.
3. On Xiaomi / Oppo / Vivo / Samsung: set battery to **Unrestricted** for Pabili, otherwise the
   phone may still kill it after a while.

## Honest limits
- Does not work in a browser or Expo Go; it needs the built APK (`expo prebuild` applies the plugin).
- If the courier picks "While using the app" only, the app falls back to foreground tracking and says so.
- Google Play requires a background-location declaration + demo video before you can publish.
- `driver_locations` is readable by anyone with the anon key (dev policy). Tighten before launch.
