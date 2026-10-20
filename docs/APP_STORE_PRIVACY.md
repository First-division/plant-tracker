# App Store Connect: App Privacy answers

Use these when filling in **App Store Connect > App Privacy**. They describe PlantCare as it works today.
Re-check them whenever a feature that collects data is added.

## Does the app collect data?
Yes (only when the user turns on cloud backup or household sharing; the app works fully offline without it).

## Data types

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact Info: Email Address | Yes (Google/Apple sign-in) | Yes | No | App Functionality |
| Contact Info: Name | Yes (display name, name typed in the app) | Yes | No | App Functionality |
| User Content: Photos | Yes (plant photos in cloud backup/household) | Yes | No | App Functionality |
| User Content: Other User Content | Yes (plant names, notes, watering history) | Yes | No | App Functionality |
| Identifiers: User ID | Yes (Firebase user ID) | Yes | No | App Functionality |
| Diagnostics: Crash Data | Only if Sentry is enabled | No | No | App Functionality |

Not collected: location, contacts, health, financial info, browsing history, purchases, advertising data.

**Tracking:** No. The app does not track users and shows no ads. Answer "No" to the tracking question.

## Other answers
- **Third-party SDKs:** Firebase (Auth, Firestore), Google Sign-In, Sign in with Apple, Sentry (crash reports, optional).
- **Encryption:** Standard HTTPS only. `ITSAppUsesNonExemptEncryption` is already `false`.
- **Account deletion:** Settings > Data > Delete Account & Cloud Data (needed because the app supports account creation).
- **Privacy Policy URL:** https://first-division.github.io/ (also linked in Settings > About). Make sure it names Firebase/Google, Sign in with Apple, plant photos, and crash reporting.
- **Support URL / contact:** firstdivision159@gmail.com.

## Permission strings (already in `app.json`)
- Photos: "PlantCare uses your photo library so you can choose a picture of each plant."
- Camera: "PlantCare uses your camera so you can take a picture of a plant."
- Save to library: "PlantCare saves a plant photo to your photo library only when you ask it to."
- Microphone: not requested.
- Notifications: iOS has no usage string; the welcome tour explains reminders before the system prompt appears.

## Review notes to paste into App Store Connect
Sign-in is optional. The app works without an account. To test cloud backup, sign in with Google or Apple in Settings > Cloud Backup. Account deletion is in Settings > Data > Delete Account & Cloud Data.
