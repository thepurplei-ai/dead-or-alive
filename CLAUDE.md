# Dead or Alive — instructions for Claude Code

A padel app: the phone's microphone hears a ball bounce and says if the ball is ALIVE, TIRED or DEAD.
The owner is learning to code and works from a phone. Explain steps in plain, simple English,
and keep them short. Never ask the owner to run terminal commands: run them yourself.

## Project

- Expo (React Native), JavaScript. Entry: `index.js` → `App.js`.
- `src/bounceAnalyzer.js`: the measuring engine (pure JS, no dependencies). Tested by `npm test`.
- `src/strings.js`: all app text, English (EN) and Spanish (ES). The phone language picks one; add every new text to both.
- Microphone streaming: `@siteed/audio-studio` (native code, so the app needs a development build, not Expo Go).
  Permissions: `expo-audio` (`AudioModule.requestRecordingPermissionsAsync`).
- Bundle ID / package: `com.thepurpleiai.deadoralive`.

## First-time setup (do this in the first session that has internet access)

`EXPO_TOKEN` must be set in the environment. If it is missing, stop and tell the owner how to create one:
expo.dev → Account settings → Access tokens → Create, then add it as `EXPO_TOKEN` in the Code environment settings.

```bash
npm install
npx expo install react react-native expo-audio expo-dev-client @siteed/audio-studio
npx expo install --fix
npm test                               # must end with "All tests passed"
npx expo-doctor                        # fix anything it reports
npx eas-cli@latest whoami              # checks the token
npx eas-cli@latest init --non-interactive --force   # links the Expo project, writes projectId to app.json
npm run build:android:preview          # Android test build (APK) in the cloud, runs without a computer
```

Then get the build page link (`npx eas-cli@latest build:list --limit 1`) and give it to the owner:
they open it on their Android phone and install the APK.
Commit the changed files (package.json, package-lock.json, app.json) and push.

## Running on the phone

The owner has no computer, so there is no Metro dev server on their network.
For testing, prefer a standalone internal build that bundles the JS:
`npx eas-cli@latest build --profile preview --platform android --non-interactive`.
Use the development profile only if a dev server is reachable.

## iPhone

Needs the owner's Apple Developer account ($99/year). Builds without a Mac use EAS with an
App Store Connect API key. Register the owner's iPhone with `npx eas-cli@latest device:create`
(it gives a link to open on the iPhone). Do this after Android works.

## Rules

- Run `npm test` before every build. Do not change `THRESHOLDS` in `src/bounceAnalyzer.js`
  without new test data from real balls.
- The app must keep working fully offline. Audio never leaves the phone.
- Keep the UI simple: one big button, one big result.
