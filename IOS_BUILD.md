# Pabili PH — iPhone (iOS) build & App Store guide

The same code runs on iPhone. **You do not need a Mac**: Expo's cloud builder (EAS) compiles it.
This project was prepared for iOS but **never built or run on an iPhone by me** — treat the first
TestFlight build as the real test.

## What you need
- **Apple Developer Program** account (USD 99 / year). Individual works; a company account needs a D-U-N-S number.
- A free **Expo** account (expo.dev). EAS free tier has a monthly build quota.
- An iPhone for testing (location, camera and background tracking cannot be tested on a simulator).

## Steps
1. Supabase SQL editor: run `pabili-sql/setup-07-ios.sql` (account deletion — Apple requires it).
2. On your computer, inside the project folder:
   ```
   npm install
   npx expo install --fix
   npm install -g eas-cli
   eas login
   eas init                      # creates the Expo project id (also needed for push notifications)
   eas build -p ios --profile production
   ```
   EAS asks for your Apple login and creates the certificates and provisioning profile for `com.pabili.ph` by itself.
   Say YES when it offers to enable Push Notifications.
3. In **App Store Connect** → My Apps → "+" → New App: bundle ID `com.pabili.ph`, name "Pabili".
4. Send the build to TestFlight: `eas submit -p ios --latest`, then add yourself as an internal tester and install from the TestFlight app.
5. Test on a real iPhone (checklist below), then submit for review from App Store Connect.

## Test checklist on the iPhone
- Courier mode → Online: iOS first asks "While Using the App", then later offers "Change to Always Allow". Choose **Always**.
  Lock the screen and walk around: the blue location pill/bar should stay on and `driver_locations` keeps updating.
- Camera and photo library for: avatar, KYC documents, product / pickup / delivery photos.
- Order, ride and errand flows between two phones (see `V17_NOTES.md`).
- Profile → Delete my account (works only with no open orders and a zero wallet).

## App Store Connect — what Apple will ask for
- **Privacy Policy URL** (required) and a Support URL. The policy must mention: phone number, name, photo, precise location
  (also in the background for couriers/drivers), ID / licence / permit photos, order history, and how to delete the account.
- **App Privacy ("nutrition label")**: Contact info (phone, name), Precise location, Photos, User content, Identifiers/purchases-style order history. "Not used for tracking".
- **Screenshots**: iPhone 6.9" (or 6.7") and 6.5". `supportsTablet` is off, so no iPad screenshots.
- **Review notes** (important — reviewers cannot test a two-sided app alone). Provide: demo login numbers + the code,
  one **approved courier**, one **approved store (open)** and one customer, plus a 1–2 minute screen-recording link of a full order and a ride.
  Explain background location: *"Couriers/drivers who switch to Online share their live location with the customer of their active delivery or ride, also with the screen locked. Location sharing stops when they go Offline."*
- Age rating: answer the questionnaire honestly (no user-to-user chat, no mature content).
- Payments: you sell real-world goods and services, so Apple's in-app purchase rule does not apply.

## Do these BEFORE submitting to the App Store
1. **Replace the fake login code (2067)** with real SMS/WhatsApp OTP. A public store release with a login anyone can pass is not safe.
2. Lock down the Supabase policies (everything is still open to the public anon key).
3. Host the privacy policy and terms pages.

## Known iPhone differences
- Push notifications on iOS need the APNs key that EAS creates; real push (app closed) also needs the server-side sender, which is still to do.
- "Navigate" buttons open Google Maps (app or browser). Apple Maps links can be added later.
- Background location can be switched off by the user in Settings; the courier screen shows a warning when it is not "Always".
