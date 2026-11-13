// All text in one place. English (EN) and Spanish (ES); the phone's language picks one.
const EN = {
  back: 'Back',
  home: {
    kicker: 'Padel ball check',
    title: 'Is your ball still alive?',
    steps: [
      'Stand on a hard floor: concrete or tiles, not the court turf.',
      'Put your phone on the floor, about one step away.',
      'Tap the button, then drop the ball from waist height. Let it bounce until it stops.',
    ],
    test: 'Test a ball',
    calibrate: 'First time? Calibrate with a NEW ball',
    recalibrate: (date) =>
      `Calibrated ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ✓ · Calibrate again`,
    calibratedBadge: 'Calibrated',
    history: 'Recent tests',
  },
  listening: {
    kicker: 'Microphone on',
    title: 'Listening…',
    test: 'Drop the ball now and stay quiet for a few seconds.',
    calibrate: 'Drop a ball from a NEW can now.',
  },
  result: {
    equivalent: (min, max) => `Bounce if dropped from 2.54 m. A new ball bounces ${min}–${max} cm (official FIP rule).`,
    range: (cm) => `± ${cm} cm`,
    newBall: 'New ball',
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
    noSound: 'The microphone sent no sound. Check that no other app is using it, then try again.',
    heard: (seconds, loudest, bounces) =>
      `Heard ${seconds.toFixed(1)} s · loudest ${Math.round(loudest * 100)}%` +
      (bounces != null ? ` · ${bounces} bounce sounds` : ''),
    retry: 'Try again',
  },
};

const ES = {
  back: 'Volver',
  home: {
    kicker: 'Control de pelotas de pádel',
    title: '¿Tu pelota sigue viva?',
    steps: [
      'Ponte sobre un suelo duro: cemento o baldosas, no el césped de la pista.',
      'Deja el móvil en el suelo, a un paso de distancia.',
      'Pulsa el botón y suelta la pelota a la altura de la cintura. Déjala botar hasta que pare.',
    ],
    test: 'Probar una pelota',
    calibrate: '¿Primera vez? Calibra con una pelota NUEVA',
    recalibrate: (date) =>
      `Calibrado ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ✓ · Calibrar de nuevo`,
    calibratedBadge: 'Calibrado',
    history: 'Pruebas recientes',
  },
  listening: {
    kicker: 'Micrófono activado',
    title: 'Escuchando…',
    test: 'Suelta la pelota ahora y haz silencio unos segundos.',
    calibrate: 'Suelta ahora una pelota de un bote NUEVO.',
  },
  result: {
    equivalent: (min, max) => `Bote si se suelta desde 2,54 m. Una pelota nueva bota ${min}–${max} cm (norma oficial FIP).`,
    range: (cm) => `± ${cm} cm`,
    newBall: 'Pelota nueva',
    again: 'Probar otra pelota',
    lowConfidence: 'Los botes se oyeron con algo de ruido. Prueba otra vez para un resultado más seguro.',
    notCalibrated: 'Consejo: calibra con una pelota nueva en este suelo para una medida más precisa.',
    calibrated: 'Calibrado',
    calibratedText: 'Listo. Tus pruebas en este suelo se compararán ahora con una pelota nueva.',
  },
  verdict: {
    alive: { title: 'VIVA', advice: 'Muy buen bote. Sigue jugando con ella.' },
    tired: { title: 'CANSADA', advice: 'Aún sirve para entrenar, pero es más lenta que una nueva.' },
    dead: { title: 'MUERTA', advice: 'Demasiado lenta para un buen partido. Toca abrir un bote nuevo.' },
  },
  errors: {
    title: 'Probemos otra vez',
    permission: 'La app necesita el micrófono para oír los botes. Permítelo en los ajustes del móvil.',
    mic: 'No se pudo activar el micrófono. Cierra otras apps que lo usen y vuelve a intentarlo.',
    noImpacts: 'No se oyó ningún bote. Acerca el móvil a donde cae la pelota.',
    tooFew: 'No hay suficientes botes claros. Suelta la pelota sobre un suelo duro y en silencio.',
    noSound: 'El micrófono no envió sonido. Comprueba que ninguna otra app lo esté usando y vuelve a intentarlo.',
    heard: (seconds, loudest, bounces) =>
      `Oído ${seconds.toFixed(1).replace('.', ',')} s · máximo ${Math.round(loudest * 100)}%` +
      (bounces != null ? ` · ${bounces} sonidos de bote` : ''),
    retry: 'Intentar de nuevo',
  },
};

/** The phone's language, e.g. "es-ES" → "es". Falls back to English. */
function phoneLanguage() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();
  } catch (e) {
    return 'en';
  }
}

export const STRINGS = { en: EN, es: ES };
export const T = STRINGS[phoneLanguage()] || EN;
