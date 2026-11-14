# SafePair

Two people, one shared map. See each other live, chat, and send SOS with one hold.

## What it does

- **Pair**: one phone makes a 6-letter code, the other types it. Done.
- **Live map**: both people on the map, with distance and “updated X min ago”.
- **SOS**: hold the big red button 2 seconds. The other phone gets a push alert, vibrates,
  and shows a red banner with “Go to them”. Tap “I’m OK now” to end it.
- **Navigate**: “Go to {name}” and “Go home” open walking directions in Google Maps.
- **Chat**: simple messages, with SOS and “I’m OK” shown in the chat too.
- English and Spanish (follows the phone language).

## How it works

- Expo (React Native), JavaScript. Entry `index.js` → `App.js`.
- Server: Firebase. Anonymous sign-in (no email or password) + Cloud Firestore.
  Data layout is described at the top of `src/backend.js`. Security: `firestore.rules`.
- Push alerts: Expo push service (free). In-app banner + vibration also work without push.
- Map: `react-native-maps` (Google Maps on Android, Apple Maps on iPhone).
- `src/core.js`: pure logic (codes, distance, when to send location). Tested by `npm test`.

## Limits of version 1

- Location is shared **while the app is open** (also in the background for a short time).
  Sharing with the app fully closed needs “background location”, which Google Play reviews
  strictly. Planned for a later version.

## One-time setup (owner)

1. **Firebase** (free): firebase.google.com → Get started → Create project “SafePair”.
   - Build → Authentication → Get started → turn on **Anonymous**.
   - Build → Firestore Database → Create database (production mode, a region near you).
   - Firestore → Rules → paste `firestore.rules` → Publish.
   - Project settings → General → Add app → **Web** (</>) → copy the `firebaseConfig` values
     into `src/firebaseConfig.js`.
   - Project settings → General → Add app → **Android**, package `com.thepurpleiai.safepair`
     → download `google-services.json` (for push alerts).
2. **Google Maps key** (free tier): console.cloud.google.com, same project →
   APIs & Services → enable “Maps SDK for Android” → Credentials → Create API key.
   Save it as an EAS secret named `GOOGLE_MAPS_API_KEY`.
3. **Build**: `npm test`, then `npm run build:android:preview` → install the APK on both phones.
