# Pabili v5 — build APK with EAS

This folder is ready to be turned into a working APK on Expo's cloud build service.

## 1. Install the toolchain locally

```bash
npm install -g eas-cli            # the Expo cloud build CLI
eas login                          # or: eas register (creates an expo.dev account)
cd pabili-app
npm install --legacy-peer-deps
```

## 2. Paste your Supabase keys

Open `App.js`, replace these two lines near the top:

```js
const SUPABASE_URL      = 'PASTE_YOUR_PROJECT_URL_HERE';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE';
```

with your real values from the Supabase dashboard (`Project Settings -> API`).

## 3. Build the APK

```bash
eas build -p android --profile preview
```

`preview` is the profile inside `eas.json` that emits an APK
(`android.buildType: "apk"`, `distribution: "internal"`).

The result is an installable `.apk` (not the default `.aab`), so you can
sideload it onto any Android device with `adb install`.

## 4. (Optional) Build locally if you have Android Studio

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
```

Resulting APK lands at:

```
android/app/build/outputs/apk/release/app-release.apk
```

## Notes

- Default `applicationId` = `com.pabili.delivery` (change it in `app.json` if
  you need something else; remember the namespace rule: lowercase, dot-separated).
- The APK is **debuggable** for the preview profile. For Play Store distribution
  switch to `eas build -p android --profile production` (outputs `.aab`).
- `expo-document-picker` is whitelisted in `app.json` as a plugin. If EAS says
  the plugin is missing, run `npx expo install expo-document-picker` again.
