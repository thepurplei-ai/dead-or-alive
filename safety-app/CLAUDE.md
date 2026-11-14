# SafePair — instructions for Claude Code

A second app in this repo (the padel app lives in the repo root). Two paired people share
live location, chat, and send SOS. See README.md for features and the owner's setup steps.

The owner is learning to code and works from a phone. Explain steps in plain, simple English,
keep them short. Never ask the owner to run terminal commands: run them yourself, from `safety-app/`.

## Project

- Expo SDK 58 (React Native), JavaScript. Entry `index.js` → `App.js`. Settings in `app.config.js`.
- `src/core.js`: pure logic, tested by `npm test` (must end with "All tests passed").
- `src/backend.js`: all Firebase calls. `src/firebaseConfig.js`: the owner's Firebase web config.
- `src/notify.js`: push alerts (Expo push service). `src/strings.js`: EN + ES, add every text to both.
- `firestore.rules`: security rules; keep them in sync with `src/backend.js`.
- Package / bundle ID: `com.thepurpleiai.safepair`.

## Rules

- Run `npm test` before every build.
- Location goes only to the paired person. Never add analytics or send location anywhere else.
- Keep the UI simple: the SOS button must stay big and on the map screen.
- Build for phones with `npm run build:android:preview` (needs `EXPO_TOKEN`, `GOOGLE_MAPS_API_KEY` EAS secret).
