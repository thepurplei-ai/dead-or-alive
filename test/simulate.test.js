// Simulated recordings of a padel ball bouncing, with background noise.
// Run: node test/simulate.test.js
const { analyzeBounce } = require('../src/bounceAnalyzer');

const SR = 44100;
const G = 9.81;

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Builds a recording: ball released from dropM metres with restitution e. */
function makeRecording({ e, dropM = 1.5, seconds = 4, noise = 0.01, seed = 1, voice = false, stray = null }) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const n = Math.round(SR * seconds);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = noise * gauss();
  if (voice) {
    // talking nearby: strong low-frequency content with syllable modulation
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      x[i] += 0.15 * Math.sin(2 * Math.PI * 180 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t)) +
        0.08 * Math.sin(2 * Math.PI * 420 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t));
    }
  }
  const impact = (t0, amp) => {
    const start = Math.round(t0 * SR);
    const f = 2200 + 400 * r();
    for (let i = 0; i < Math.round(0.03 * SR) && start + i < n; i++) {
      const t = i / SR;
      x[start + i] += amp * Math.exp(-t / 0.004) * (0.7 * Math.sin(2 * Math.PI * f * t) + 0.3 * gauss());
    }
  };
  let t = 0.6; // first impact
  let v = Math.sqrt(2 * G * dropM);
  const truth = [];
  while (t < seconds - 0.05 && v > 0.4) {
    truth.push(t);
    impact(t, Math.min(0.9, 0.12 * v));
    v *= e;
    t += (2 * v) / G;
  }
  if (stray) impact(stray.t, stray.amp);
  return { x, truth };
}

let failures = 0;
function check(name, cond, info) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!cond) failures++;
}

// e for a given equivalent bounce height from 2.54 m
const eFor = (cm) => Math.sqrt(cm / 254);

const cases = [
  { label: 'new ball 142 cm', cm: 142, verdict: 'alive' },
  { label: 'tired ball 128 cm', cm: 128, verdict: 'tired' },
  { label: 'dead ball 110 cm', cm: 110, verdict: 'dead' },
];

for (const c of cases) {
  for (const drop of [1.0, 1.5, 2.0]) {
    const { x } = makeRecording({ e: eFor(c.cm), dropM: drop, seed: Math.round(c.cm * drop * 10) });
    const res = analyzeBounce(x, SR);
    check(`${c.label}, dropped from ${drop} m`, res.ok && res.verdict === c.verdict && Math.abs(res.equivalentCm - c.cm) < 3,
      res.ok ? `→ ${res.equivalentCm} cm, ${res.verdict}, ${res.confidence}` : `→ ${res.reason}`);
  }
}

{
  const { x } = makeRecording({ e: eFor(140), voice: true, noise: 0.02, seed: 7 });
  const res = analyzeBounce(x, SR);
  check('people talking nearby', res.ok && Math.abs(res.equivalentCm - 140) < 3, res.ok ? `→ ${res.equivalentCm} cm` : res.reason);
}
{
  const { x } = makeRecording({ e: eFor(140), seed: 9, stray: { t: 3.4, amp: 0.3 } });
  const res = analyzeBounce(x, SR);
  check('stray sound after the bounces', res.ok && Math.abs(res.equivalentCm - 140) < 3, res.ok ? `→ ${res.equivalentCm} cm` : res.reason);
}
{
  // Softer floor: every ball loses 6% more speed. Calibrating with a new ball fixes it.
  const soft = 0.94;
  const ref = analyzeBounce(makeRecording({ e: eFor(140) * soft, seed: 11 }).x, SR);
  const test = analyzeBounce(makeRecording({ e: eFor(128) * soft, seed: 12 }).x, SR);
  const calibrated = analyzeBounce(makeRecording({ e: eFor(128) * soft, seed: 12 }).x, SR, { referenceE: ref.e });
  check('soft floor without calibration reads too low', test.ok && test.equivalentCm < 118, `→ ${test.equivalentCm} cm`);
  check('soft floor with new-ball calibration', calibrated.ok && Math.abs(calibrated.equivalentCm - 128) < 3, `→ ${calibrated.equivalentCm} cm`);
}
{
  const r = rng(3);
  const x = new Float32Array(SR * 3).map(() => 0.01 * (r() - 0.5));
  const res = analyzeBounce(x, SR);
  check('silence gives a clear "try again"', !res.ok && res.reason === 'no_impacts', `→ ${res.reason}`);
}

console.log(failures ? `\n${failures} failing` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
