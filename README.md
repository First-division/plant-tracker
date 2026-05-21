# Plant Tracker

Plant Tracker is an Expo app for plant care reminders, calendar tracking, household sharing, and Firebase-backed sync.

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Start the app.

   ```bash
   npx expo start --dev-client
   ```

3. Open the dev build on iOS or Android.

This app uses Expo Router and the app directory for routing.

## Android Google sign-in for household sharing

The Android Google sign-in path is gated behind `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

1. Open the Firebase project `plant-tracker-b0286`.
2. Make sure the Android app is registered as `com.firstdivisioncaptain.planttracker`.
3. Add the SHA-1 and SHA-256 fingerprints for the Android builds you use for development and release.
4. In the same Firebase/Google Cloud project, copy the OAuth 2.0 Web client ID that ends in `.apps.googleusercontent.com`.
5. Create `.env.local` in the project root and add:

   ```bash
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   ```

6. Restart Expo after changing the env file. For Play Store releases, create a new Android build after the ID is added.

Notes:

- `.env.example` shows the expected variable name.
- The current household-sharing implementation uses the Firebase JS SDK, so there is no checked-in `google-services.json` in this repo today.
- If the env value is missing, Android falls back to Share Code Only instead of exposing a broken Google sign-in button.

## Useful commands

```bash
npm run lint
npx expo start --dev-client
npx expo run:android
npx expo run:ios
```
