// Simulated recordings of a padel ball bouncing, with background noise.
// Run: node test/simulate.test.js
const { analyzeBounce, eForFipCm, dropSpeed, CONTACT_S } = require('../src/bounceAnalyzer');

const SR = 44100;
const G = 9.81;

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Builds a recording: ball released from dropM metres with restitution e. */
function makeRecording({ e, slope = -0.012, dropM = 1.5, seconds = 4, noise = 0.01, seed = 1, voice = false, stray = null }) {
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
  // Real flight with air drag, integrated step by step (independent of the analyzer's formulas).
  const VT = 22.6;
  const flight = (v0) => {
    let v = v0, y = 0, t = 0;
    const dt = 2e-5;
    do {
      const a = -G - Math.sign(v) * G * (v * v) / (VT * VT);
      v += a * dt; y += v * dt; t += dt;
    } while (y > 0);
    return { t, vLand: -v };
  };
  const V_FIP = dropSpeed(2.54);
  const eAt = (speed) => e + slope * (speed - V_FIP); // e is lower when the ball hits harder
  let t = 0.6; // first impact
  let v = dropSpeed(dropM);
  const truth = [];
  while (t < seconds - 0.05 && v > 0.4) {
    truth.push(t);
    impact(t, Math.min(0.9, 0.12 * v));
    const up = v * eAt(v);
    const f = flight(up);
    t += CONTACT_S + f.t;
    v = f.vLand;
  }
  if (stray) impact(stray.t, stray.amp);
  return { x, truth };
}

let failures = 0;
function check(name, cond, info) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!cond) failures++;
}

// e (at the official test speed) for a given bounce height from 2.54 m, with air drag
const eFor = (cm) => eForFipCm(cm);

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
for (const slope of [0, -0.025]) {
  // Balls differ in how much their bounce drops at higher speed. The fit measures it.
  const { x } = makeRecording({ e: eFor(132), slope, dropM: 1.0, seed: 21 });
  const res = analyzeBounce(x, SR);
  check(`speed effect ${slope} per m/s, waist drop`, res.ok && Math.abs(res.equivalentCm - 132) < 4,
    res.ok ? `→ ${res.equivalentCm} ± ${res.uncertaintyCm} cm` : res.reason);
}
{
  // A shoe tap between bounce 2 and 3: it must be ignored, not counted as a bounce.
  const { x, truth } = makeRecording({ e: eFor(138), seed: 31 });
  const mid = (truth[1] + truth[2]) / 2;
  const res = analyzeBounce(makeRecording({ e: eFor(138), seed: 31, stray: { t: mid, amp: 0.25 } }).x, SR);
  check('tap in the middle of the bounces', res.ok && Math.abs(res.equivalentCm - 138) < 4,
    res.ok ? `→ ${res.equivalentCm} ± ${res.uncertaintyCm} cm` : res.reason);
}
{
  // The ± range should be honest: the true value is inside ±2 ranges in nearly every test.
  let inside = 0, total = 0, worst = 0;
  for (let seed = 100; seed < 140; seed++) {
    const cm = 112 + (seed % 9) * 4;
    const drop = 0.8 + (seed % 5) * 0.3;
    const res = analyzeBounce(makeRecording({ e: eFor(cm), dropM: drop, seed, noise: 0.01 + (seed % 3) * 0.01 }).x, SR);
    if (!res.ok) continue;
    total++;
    const err = Math.abs(res.equivalentCm - cm);
    worst = Math.max(worst, err);
    if (err <= 2 * res.uncertaintyCm + 0.5) inside++;
  }
  check('± range contains the true bounce, worst error under 5 cm', total >= 38 && inside / total >= 0.9 && worst < 5,
    `→ ${inside}/${total} inside, worst error ${worst.toFixed(1)} cm`);
}
{
  const r = rng(3);
  const x = new Float32Array(SR * 3).map(() => 0.01 * (r() - 0.5));
  const res = analyzeBounce(x, SR);
  check('silence gives a clear "try again"', !res.ok && res.reason === 'no_impacts', `→ ${res.reason}`);
}

console.log(failures ? `\n${failures} failing` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
