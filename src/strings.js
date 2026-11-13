// All text in one place, so the app is easy to translate (Spanish next).
export const T = {
  back: 'Back',
  home: {
    title: 'Is your ball still alive?',
    steps: [
      'Stand on a hard floor: concrete or tiles, not the court turf.',
      'Put your phone on the floor, about one step away.',
      'Tap the button, then drop the ball from waist height. Let it bounce until it stops.',
    ],
    test: 'Test a ball',
    calibrate: 'First time here? Calibrate with a NEW ball for best accuracy',
    recalibrate: 'Calibrated ✓  Tap to calibrate again',
    history: 'Recent tests',
  },
  listening: {
    title: 'Listening…',
    test: 'Drop the ball now and stay quiet for a few seconds.',
    calibrate: 'Drop a ball from a NEW can now.',
  },
  result: {
    equivalent: (min, max) => `Bounce if dropped from 2.54 m. A new ball bounces ${min}–${max} cm (official FIP rule).`,
    range: (cm) => `± ${cm} cm`,
    again: 'Test another ball',
    lowConfidence: 'The bounces were a bit noisy. Test again for a surer result.',
    notCalibrated: 'Tip: calibrate with a new ball on this floor for a more accurate reading.',
    calibrated: 'Calibrated',
    calibratedText: 'Done. Your tests on this floor will now be compared with a new ball.',
  },
  verdict: {
    alive: { title: 'ALIVE', advice: 'Great bounce. Keep playing with it.' },
    tired: { title: 'TIRED', advice: 'Still playable for training, but slower than a new ball.' },
    dead: { title: 'DEAD', advice: 'Too slow for a good match. Time to open a new can.' },
  },
  errors: {
    title: 'Let’s try again',
    permission: 'The app needs the microphone to hear the bounces. Allow it in your phone settings.',
    mic: 'The microphone could not start. Close other apps that use it and try again.',
    noImpacts: 'No bounces heard. Put the phone closer to where the ball lands.',
    tooFew: 'Not enough clear bounces. Drop the ball on a hard floor and keep things quiet.',
    retry: 'Try again',
  },
};
