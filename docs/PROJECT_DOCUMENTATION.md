# Plant Tracker Project Documentation

## Project overview

Plant Tracker is a React Native app built with Expo SDK 54, TypeScript, and Expo Router. The app provides plant records, watering history and reminders, a calendar, household sharing, and optional personal cloud backup.

The `app/` directory contains file-based routes. The root layout wraps the route tree in authentication and plant-data providers. Most screens read and update shared state through `useAuth()` and `usePlants()` rather than calling persistence services directly.

## Architecture and internal services

| Module | Responsibility |
| --- | --- |
| `contexts/AuthContext.tsx` | Authentication state and Apple, Google, and anonymous sign-in. |
| `contexts/PlantContext.tsx` | Shared plant/settings state; selects local, household, or personal-backup persistence and exposes operations to screens. |
| `services/firebase.ts` | Lazily initializes the Firebase JavaScript SDK and exposes Auth, Firestore, and Storage instances. |
| `services/plant-sync.ts` | Household plant documents, transactional watering history updates, and household plant-photo uploads. |
| `services/personal-backup.ts` | Per-user cloud plant backup, subscriptions, deletion tombstones, and backup photo uploads. |
| `services/household.ts` | Household creation/join/leave, member profiles, invite codes, and member subscriptions. |
| `services/household-notifications.ts` | Firestore-backed household reminder messages and unread/read state. |
| `services/plant-photos.ts` | Copies selected local photos into the app document directory and repairs saved paths after app-container changes. |
| `services/watering-log.ts` | Pure date/log helpers; watering entries are grouped by local calendar day while other history actions remain separate. |
| `services/plant-intervals.ts` | Parses, normalizes, formats, and converts human-readable care intervals. |
| `services/plant-schedule.ts` | Shared next-watering and overdue date calculations used by screens and schedules. |
| `hooks/use-notifications.ts` | Requests notification permission and schedules local watering and household reminder notifications. |
| `constants/theme.ts` | Theme palettes, member colors, and theme selection helpers. |
| `constants/whats-new.ts` | Generated content displayed by the in-app What's New screen. |

### Data flow

1. Screens call methods from `usePlants()` or `useAuth()`.
2. `PlantContext` applies the operation and chooses its configured data mode:
   - Local-only plant data is persisted on device.
   - Household mode stores shared plant records in Firestore.
   - Personal backup mirrors the signed-in user's plants to a separate Firestore collection.
   - Restore safety: backup sync waits until local plants have loaded and never pushes an empty list. On an empty device with a non-empty cloud copy, the app asks "Restore your plants?" first ("Not now" stops pulling cloud-only plants until the user restores). Users can also restore from Settings → Restore from Backup or from the welcome tour's "Already backed up? Sign in to restore" link.
   - Firestore rules (set in the Firebase console; no rules file in the repo) must allow owners to read/write `users/{uid}/**`.
3. Firestore subscriptions update context state when household or backup records change remotely.
4. Local plant-photo URIs are copied into the app's documents directory. Household mode uploads photos to Firebase Storage. Personal backup instead stores a reduced-size JPEG (about 640 px, base64) in the Firestore document `users/{uid}/plantPhotos/{plantId}`; the plant record carries a `photoVersion` (the local photo file name) so unchanged photos are not re-uploaded, and restore downloads the photo into the app's photo directory. Photo backup needs the `expo-image-manipulator` native module (requires a new native build).
5. Calendar, home reminders, plant detail, and notifications use shared watering-log and schedule helpers so recorded watering affects the same timeline.

Watering dates are ISO timestamps. Calendar-day comparisons use the device's local date. Waterings for the same plant and local day replace one another; non-watering history actions on that day are retained. Household watering-log mutations run in Firestore transactions to avoid losing a concurrent update.

The saved light, dark, or system appearance preference is also applied through React Native's native appearance API so native controls follow the app setting. On iOS, the native tab bar keeps its system background so UIKit can provide its platform-native material, including Liquid Glass on supported iOS versions; Android retains the app's themed tab background.

## External services and platform integrations

### Firebase

The Firebase JavaScript SDK is used instead of the Firebase native SDK. This keeps the integration compatible with Expo Go and development builds. The project configuration is in `services/firebase.ts`.

- **Firebase Authentication** provides anonymous accounts and credentials exchanged with Apple or Google.
- **Cloud Firestore** stores household records, shared plants, member profiles, household reminders, personal-backup plants, and deletion tombstones.
- **Firebase Storage** stores cloud copies of plant photos. Plant records keep the download URI and storage path so the app can display and replace photos.

The Firebase web configuration is bundled with the app; it identifies the Firebase project but is not a server credential. Access control must be enforced by Firebase Security Rules. Google OAuth web-client configuration is read from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (or Expo `extra.googleWebClientId`) for Android Google sign-in.

### Apple and Google sign-in

- On iOS, `expo-apple-authentication` obtains an Apple identity token. `AuthContext` hashes a nonce and exchanges the token for a Firebase credential.
- `@react-native-google-signin/google-signin` obtains a Google ID token and `AuthContext` exchanges it for a Firebase credential. Android Google sign-in is disabled when its web client ID is not configured; household share-code flows remain available.
- Anonymous Firebase sign-in supports app use without an Apple or Google account.

OAuth client IDs are configuration identifiers, not account passwords. Keep private credentials and access tokens out of source control and chat.

### On-device storage and notifications

- `expo-secure-store` holds small user preferences and onboarding/auth-related values managed by app state.
- `@react-native-async-storage/async-storage` supplies persistent storage for Firebase Auth's React Native session.
- `expo-file-system` keeps selected plant photos inside the app sandbox and supports backup uploads.
- `expo-image-picker` lets users choose plant photos; saved local copies are managed by the photo service before optional cloud upload.
- `expo-notifications` schedules local watering reminders and displays incoming household reminder notifications. Notification scheduling is local to each device; the app does not use an Expo push-token server to deliver watering reminders.
- Enabling notifications in Settings requests OS permission; reminders are scheduled only when permission is granted.
- `@react-native-community/datetimepicker` supplies native date/time controls for recording historical watering.
- `@react-native-picker/picker` supplies native scrolling selectors, including custom day/week/month watering intervals.
- `expo-application` and `expo-constants` expose app/device version and Expo configuration values used in settings and authentication setup.

### Build and TestFlight services

- **Expo / EAS Build** builds signed iOS binaries using the EAS project configured by `extra.eas.projectId` in `app.json`.
- **Apple App Store Connect** receives the iOS archive through EAS Submit. Apple processes it before making it available in TestFlight.
- TestFlight manages tester access and installation. Uploading a build does not itself add testers or make an App Store release.

## Release and release-note workflow

### Version values

- `app.json` `expo.version` is the user-facing app version, such as `1.0.6`.
- `eas.json` sets `appVersionSource` to `remote`, and the production build profile has `autoIncrement: true`. EAS increments the remote iOS build number (the build number paired with the marketing version).
- `eas.json` configures the production iOS submission with the App Store Connect app ID.

### Release-note files and in-app What's New

1. Create a versioned Markdown file in `release-notes/`, for example `1.0.7-ios.md`.
2. Fill out `## New Features` and `## Bug Fixes` with concise bullets. These explicit sections take precedence and are used for the in-app What's New content.
3. `npm run generate:whats-new` runs `scripts/generate-whats-new.js`. It selects the newest versioned Markdown filename using natural numeric sorting, ignoring template and draft files, then writes `constants/whats-new.ts`.
4. The What's New screen reads the generated `WHATS_NEW_CONTENT` from `constants/whats-new.ts`.

If neither explicit section contains bullets, the generator falls back to bullets under `## Full Release Notes` and classifies them heuristically. That fallback is less predictable; explicit sections are preferred. The `Store Summary`, `Full Release Notes`, and `Alternate Summary` sections are useful copy for humans but are not automatically published as App Store listing metadata by this project script.

The generated `constants/whats-new.ts` should be regenerated from the release-note Markdown rather than edited by hand; a later generator run overwrites it.

### Build and submit to TestFlight

```sh
npm run release:testflight
```

This command runs `npm run generate:whats-new`, then runs:

```sh
eas build -p ios --profile production --auto-submit
```

An authenticated Expo account and configured Apple/App Store Connect credentials are required. EAS builds the iOS app and submits the binary to App Store Connect. After Apple finishes processing the upload, open the app's TestFlight page in App Store Connect to confirm its status and tester availability.

Other release commands:

```sh
npm run release:testflight:build   # Generate What's New content and build without submission
npm run release:testflight:submit  # Submit the most recent EAS build
```

Before release, verify the Expo config and TypeScript, run lint, and review the generated What's New content:

```sh
npx expo config --type public
npx tsc --noEmit
npm run lint
npm run generate:whats-new
```

## Route and UI organization

- `app/(tabs)/index.tsx`: plant list, search/filter, and upcoming reminders.
- `app/(tabs)/calendar.tsx`: completed watering/history events and projected care dates.
- `app/(tabs)/settings.tsx`: appearance, reminders, backup, household, and app-guide settings.
- `app/plant-detail.tsx`: plant overview, watering, date-specific watering, history, and edits.
- `app/add-plant-modal.tsx`: create and edit plant forms.
- `app/auth-modal.tsx`, `app/welcome-modal.tsx`, and `app/whats-new-modal.tsx`: authentication and onboarding/update flows.
- `components/`: reusable visual elements; `hooks/`: reusable React integrations.

## Local development

```sh
npm install
npx expo start --dev-client
npm run lint
npx tsc --noEmit
```

See `README.md` for local setup and Android Google sign-in configuration.

## UX and Accessibility Conventions

- Interactive controls have `accessibilityRole`/`accessibilityLabel` and a minimum 44pt touch target.
- Calendar day cells announce their date and the number of watered/scheduled events.
- Quick watering from the calendar shows a 6-second "Undo" bar that removes the entry it just created.
- The home search has a clear button; an empty search/filter result offers "Clear search/filter". The calendar shows an "Add a Plant" empty state for new accounts.
- The sign-in sheet shows errors inline and can be cancelled while a sign-in is in flight (a late result is ignored).
- The welcome tour has "Skip tour" and "Skip for now" (saves the default name "Plant Lover", editable in Settings).
- Modal screens, the welcome tour, the sign-in sheet and the walkthrough card follow the selected color theme and appearance.
