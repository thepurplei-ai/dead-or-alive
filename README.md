# Dead or Alive — padel ball checker

Drop a padel ball near your phone. The app listens to the bounces and tells you if the ball is ALIVE, TIRED or DEAD.

## What's in this folder

| File | What it is |
| --- | --- |
| `src/bounceAnalyzer.js` | The brain: finds the bounces in the microphone sound and calculates the ball's bounce. Tested. |
| `test/simulate.test.js` | Tests with simulated bounce recordings. Run `node test/simulate.test.js` |
| `App.js` | The app screens ("Night Court" design: colours are in `C` at the top) |
| `assets/` | App icon and splash screen |
| `docs/design-preview.png` | Picture of every screen |
| `src/strings.js` | All the app's text, in one place for translation |
| `app.json` | App name, microphone permission text, plugins |

## How the measurement works

Between two bounces the ball flies freely, so the time between bounces shows how fast it left the floor.
Each bounce keeps a fraction **e** of the speed (e = take-off speed ÷ landing speed).
That does not depend on how high you drop the ball, so the app needs nothing but the microphone.

To make the reading accurate, the app:

1. **Includes air drag.** Drag slows the ball in flight. From a 2.54 m drop it takes about 10 cm off the bounce.
2. **Removes contact time.** The ball spends about 4 ms squashed on the floor before it leaves.
3. **Uses every bounce.** Each bounce gives its own e. A weighted fit combines them all and throws out a bounce that clearly disagrees (a stray tap, a shoe).
4. **Corrects for speed.** A ball bounces a little less when it hits harder. The fit measures that from your bounces and reads the ball at the speed of the official 2.54 m test, even though you drop it from waist height.
5. **Gives a ± range** (e.g. 138 cm ± 3). A wide range means "test again".
6. **Filters the sound** to the ball's "pock" (about 1.5–5 kHz), so it hears quiet late bounces through hiss and voices.

FIP rule: a legal ball dropped from 2.54 m on a hard surface bounces 135–145 cm.
The app converts **e** into "bounce from 2.54 m", with air drag included.

| Result | Bounce from 2.54 m |
| --- | --- |
| ALIVE | 135 cm or more |
| TIRED | 120–135 cm |
| DEAD | under 120 cm |

The 120 cm line is a starting guess. Tune it with real balls (see "Field testing").

## Set up your computer (one time)

You need a computer (Windows or Mac both work) and your phones.

1. Install **Node.js** (LTS version) from nodejs.org.
2. Create free accounts at **expo.dev**.
3. Open a terminal and run:

```bash
npx create-expo-app@latest dead-or-alive --template blank
cd dead-or-alive
npx expo install expo-audio expo-dev-client @siteed/audio-studio
npm install -g eas-cli
eas login
```

4. Copy these files into the new `dead-or-alive` folder, replacing the ones there:
   `App.js`, `app.json`, the `src` folder and the `test` folder.
5. In `app.json`, replace `CHANGEME` (twice) with your own name, e.g. `com.marta.deadoralive`.

## Run it on your phones

The microphone library has native code, so the app does not run in the Expo Go app.
You make a "development build" once, in the cloud (no Mac needed):

```bash
eas build:configure
eas build --profile development --platform android
eas build --profile development --platform ios   # needs a paid Apple Developer account
```

Install the build on your phone from the link EAS gives you, then run:

```bash
npx expo start --dev-client
```

Scan the QR code with your phone. Changes you make to the code appear on the phone straight away.

## Field testing (the most important step)

The tests here use simulated sound. Real courts are noisier, so before launch:

1. Get 3 groups of balls: a **new can**, balls used **2–3 matches**, and balls used **6+ matches**.
2. Measure each ball the official way once: drop it from 2.54 m next to a wall with tape marks and film it in slow motion. Note the bounce height.
3. Test each ball 5 times with the app, on 2–3 different floors.
4. Compare the app's numbers with the filmed numbers and adjust `THRESHOLDS` in `src/bounceAnalyzer.js` if needed.

## Publish

```bash
eas build --profile production --platform all
eas submit --platform ios
eas submit --platform android
```

Store accounts: Apple Developer Program (paid yearly) and Google Play Console (one-time fee).
