# Pabili PH — Background-geolocation limitations (honest)

Browsers **halt `watchPosition` when the page is backgrounded or the screen is locked**.
That is a platform reality, not a bug we can patch around. Drivers in the web build
will only see live GPS samples while the app is in the foreground.

## What V9 ships now

| Path | Where it works | Notes |
|------|----------------|-------|
| Foreground `Location.watchPositionAsync({ timeInterval: 5000 })` | Mobile foreground + browser active tab | Source flag = `fg`. |
| Manual jitter fallback if permission denied / `expo-location` missing | Web BlueStacks preview | Source flag = `fg` but value is simulated. Banner says so clearly ("GPS simulated"). |
| Live courier banner in `OrdersTab` (`DriverLocationBanner`) | Already wired to `useStore().listDriverLocations()` | Renders last reported point + source/age. |

## Recommended upgrade for "background" tracking

To get true continuous tracking — even with the screen locked — you need a native
build. Two options:

1. **Capacitor 6 + `@capacitor-community/background-geolocation`**  
   The plugin runs an Android foreground service that survives lock screen and
   reboots. Configure `ACCESS_BACKGROUND_LOCATION` in your `capacitor.config.ts`.
   Pair the output with a Supabase Edge Function that debounces the writes so
   the battery cost is bounded.

2. **Expo Dev Build + `expo-task-manager` + `expo-location`**  
   Define a `TaskManager.defineTask('bg-location', …)`, register it with
   `Location.startLocationUpdatesAsync(taskName, { accuracy, timeInterval })`.
   This requires that the APK be built via `eas build` (not `expo export:embed`
   intra-BlueStacks preview), and works only with `ACCESS_BACKGROUND_LOCATION`
   granted at runtime.

Until one of those is enabled, the banner inside the customer app *honestly says*
"Driver hasn't shared live location yet" rather than printing a fake coordinate.
