/**
 * Dead or Alive — bounce analyzer
 *
 * Listens to a padel ball dropped on a hard floor and estimates how "alive" it is.
 *
 * Physics: between two impacts the ball flies freely, so the time between impacts tells
 * the take-off speed (about T = 2v / g, plus a small air-drag correction). Each impact keeps a
 * fraction e of the speed (coefficient of restitution):  e = take-off speed / landing speed.
 * This does NOT depend on the height you drop the ball from, so the app only needs a microphone.
 *
 * Accuracy steps:
 *  1. Air drag is included in the flight times and in the FIP conversion.
 *  2. The ~4 ms the ball spends squashed on the floor is removed from each gap.
 *  3. Every bounce gives its own e. A weighted fit uses all of them, and drops bounces that
 *     clearly disagree (a stray sound, a bounce off a shoe).
 *  4. e is a bit lower at higher speeds. The fit measures that trend and reads e at the
 *     speed of the official test, even though you drop the ball from waist height.
 *  5. The fit gives a ± range, shown to the user and used for the confidence.
 *
 * The FIP rules say a legal ball dropped from 2.54 m on a hard surface must bounce
 * 135–145 cm. We convert e to that "equivalent bounce from 2.54 m", with air drag.
 *
 * Pure JavaScript, no dependencies: runs in React Native/Expo and in Node (for tests).
 */

const G = 9.81;
const FIP_DROP_CM = 254;
const FIP_MIN_CM = 135;
const FIP_MAX_CM = 145;

// Verdict thresholds in equivalent cm (from a 2.54 m drop). Starting values:
// tune them with real field tests (see the launch plan).
const THRESHOLDS = { alive: 135, tired: 120 };

/** One-pole high-pass filter: removes rumble, wind and most of the voice energy. */
function highPass(samples, sampleRate, cutoffHz = 1500) {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const a = rc / (rc + dt);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = a * (prevY + x - prevX);
    out[i] = y;
    prevX = x;
    prevY = y;
  }
  return out;
}

/** One-pole low-pass filter: removes high hiss above the ball's "pock" sound. */
function lowPass(samples, sampleRate, cutoffHz = 5000) {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += a * (samples[i] - y);
    out[i] = y;
  }
  return out;
}

/** Energy envelope in short frames. Returns { env, hop } where env[i] covers samples [i*hop, i*hop+win). */
function envelope(x, sampleRate, frameMs = 1) {
  const hop = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const n = Math.floor(x.length / hop);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i++) s += x[i] * x[i];
    env[f] = Math.sqrt(s / hop);
  }
  return { env, hop };
}

function median(arr) {
  const a = Array.from(arr).sort((p, q) => p - q);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Finds impact times (seconds) in a mono recording.
 * @param {Float32Array} samples  values in [-1, 1]
 * @param {number} sampleRate     e.g. 44100
 */
function detectImpacts(samples, sampleRate, opts = {}) {
  const minGapS = opts.minGapS ?? 0.12; // ignore echoes/rattles closer than this
  // Three cascaded passes give a steep filter, so nearby voices barely register.
  const cutoff = opts.cutoffHz ?? 1500;
  const hp = highPass(highPass(highPass(samples, sampleRate, cutoff), sampleRate, cutoff), sampleRate, cutoff);
  // Two low-pass passes keep the ball's sound band (about 1.5–5 kHz) and drop most hiss.
  const lp = opts.lowCutHz ?? 5000;
  const x = lp ? lowPass(lowPass(hp, sampleRate, lp), sampleRate, lp) : hp;
  const { env, hop } = envelope(x, sampleRate, 1);
  if (env.length === 0) return [];

  const noise = median(env); // background level
  let peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
  if (peak < noise * 4) return []; // nothing that sounds like an impact

  // Threshold well above the noise and relative to the loudest impact,
  // because later bounces are quieter than the first.
  const thr = Math.max(noise * 3.5, peak * 0.06);
  const minGapFrames = Math.round((minGapS * sampleRate) / hop);
  const impacts = [];
  let last = -Infinity;
  for (let f = 1; f < env.length; f++) {
    if (env[f] >= thr && env[f - 1] < thr && f - last >= minGapFrames) {
      // Refine to sample accuracy: first sample whose |x| reaches 30% of this burst's peak.
      const start = Math.max(0, (f - 2) * hop);
      const end = Math.min(x.length, (f + 6) * hop);
      let localPeak = 0;
      for (let i = start; i < end; i++) localPeak = Math.max(localPeak, Math.abs(x[i]));
      let onset = f * hop;
      for (let i = start; i < end; i++) {
        if (Math.abs(x[i]) >= localPeak * 0.3) { onset = i; break; }
      }
      impacts.push({ t: onset / sampleRate, level: localPeak });
      last = f;
    }
  }
  return impacts;
}

/**
 * Picks the longest run of impacts whose gaps shrink like a bouncing ball
 * (each gap 40–95% of the previous one) and returns its restitution estimates.
 */
function bounceSequence(impacts) {
  let best = [];
  for (let s = 0; s < impacts.length; s++) {
    const seq = [impacts[s]];
    let prevGap = null;
    for (let j = s + 1; j < impacts.length; j++) {
      const gap = impacts[j].t - seq[seq.length - 1].t;
      if (gap < 0.12 || gap > 1.6) {
        if (gap > 1.6) break;
        continue; // too close: rattle/echo, skip it
      }
      if (prevGap !== null) {
        const r = gap / prevGap;
        if (r < 0.4 || r > 0.95) {
          if (r > 0.95) continue; // probably a stray sound; keep looking
          break;
        }
      }
      seq.push(impacts[j]);
      prevGap = gap;
      if (seq.length >= 10) break; // enough: the last tiny bounces are hard to time
    }
    if (seq.length > best.length) best = seq;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Ball flight physics with air drag
// ---------------------------------------------------------------------------
// A padel ball (57 g, 6.5 cm) feels air drag F = m·g·(v/VT)². VT is its terminal speed:
//   VT = sqrt(2·m·g / (ρ·Cd·A)) ≈ sqrt(2·0.057·9.81 / (1.2·0.55·0.0033)) ≈ 22.6 m/s
// Drag matters: from a 2.54 m drop it takes about 10 cm off the bounce height, and the FIP
// 135–145 cm rule is measured in real air, so the app must include it too.
const DRAG_VT = 22.6;
// The microphone hears the moment the ball touches the floor. It leaves about 4 ms later,
// so each gap between sounds is (flight time + contact time).
const CONTACT_S = 0.004;
// How precisely one impact sound can be timed (seconds), and the smallest error we allow for
// one bounce (spin, slightly uneven floor). Used to weight bounces and to compute the ± range.
const ONSET_SIGMA_S = 0.0003;
const E_SIGMA_FLOOR = 0.004;
// e changes a little with impact speed. We measure that from the bounces, but we only trust it
// so far: SLOPE_PRIOR_SIGMA (per m/s) keeps the estimate sensible when there are few bounces.
const SLOPE_PRIOR_SIGMA = 0.015;

const VT2 = DRAG_VT * DRAG_VT;

/** Time in the air (s) for a ball that leaves the floor at speed v (m/s), with drag. */
function flightTime(v) {
  const up = (DRAG_VT / G) * Math.atan(v / DRAG_VT);
  const down = (DRAG_VT / G) * Math.acosh(Math.sqrt(1 + (v * v) / VT2));
  return up + down;
}

/** Take-off speed (m/s) that gives this flight time. flightTime grows with v, so bisect. */
function takeoffSpeed(t) {
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (flightTime(mid) < t) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Speed when the ball comes back down, after leaving the floor at v. */
const landingSpeed = (v) => v / Math.sqrt(1 + (v * v) / VT2);
/** Impact speed after a drop from h metres. */
const dropSpeed = (h) => DRAG_VT * Math.sqrt(1 - Math.exp((-2 * G * h) / VT2));
/** Highest point (m) reached after leaving the floor at v. */
const riseHeight = (v) => (VT2 / (2 * G)) * Math.log(1 + (v * v) / VT2);
/** Speed needed to rise h metres. */
const speedForHeight = (h) => DRAG_VT * Math.sqrt(Math.exp((2 * G * h) / VT2) - 1);

// Impact speed in the official FIP test (drop from 2.54 m): ≈ 6.9 m/s.
const V_FIP = dropSpeed(FIP_DROP_CM / 100);

/** Bounce height (cm) in the FIP test for a ball with restitution e (at FIP speed). */
function fipBounceCm(e) {
  return riseHeight(e * V_FIP) * 100;
}
/** Restitution (at FIP speed) of a ball that bounces `cm` in the FIP test. */
function eForFipCm(cm) {
  return speedForHeight(cm / 100) / V_FIP;
}
// A new ball (middle of the FIP range), used for calibration: ≈ 0.77 with drag.
const E_NEW_BALL = eForFipCm((FIP_MIN_CM + FIP_MAX_CM) / 2);

/**
 * Turns impact times into one restitution measurement per bounce.
 * Bounce k: the ball lands at speed w (from the previous flight) and leaves at speed u.
 */
function perBounce(times) {
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const u = gaps.map((g) => takeoffSpeed(Math.max(0.01, g - CONTACT_S)));
  const sigmaGap = Math.SQRT2 * ONSET_SIGMA_S;
  const out = [];
  for (let k = 1; k < u.length; k++) {
    const w = landingSpeed(u[k - 1]);
    const e = u[k] / w;
    // speed error ≈ (g/2)·(gap error); relative errors of both speeds add up
    const r1 = ((G / 2) * sigmaGap) / u[k - 1];
    const r2 = ((G / 2) * sigmaGap) / u[k];
    const sigma = Math.sqrt((e * e) * (r1 * r1 + r2 * r2) + E_SIGMA_FLOOR * E_SIGMA_FLOOR);
    out.push({ e, speed: w, sigma });
  }
  return { points: out, gaps, takeoff: u };
}

/**
 * Fits e = a + b·(speed − V_FIP) by weighted least squares, with a gentle prior on b.
 * So `a` is directly the restitution at the FIP test speed.
 * Returns { a, b, sigmaA, chi2 }.
 */
function fitRestitution(points) {
  let sw = 0, swx = 0, swxx = 0, swy = 0, swxy = 0;
  for (const p of points) {
    const w = 1 / (p.sigma * p.sigma);
    const x = p.speed - V_FIP;
    sw += w; swx += w * x; swxx += w * x * x; swy += w * p.e; swxy += w * x * p.e;
  }
  const m11 = sw, m12 = swx, m22 = swxx + 1 / (SLOPE_PRIOR_SIGMA * SLOPE_PRIOR_SIGMA);
  const det = m11 * m22 - m12 * m12;
  const a = (m22 * swy - m12 * swxy) / det;
  const b = (m11 * swxy - m12 * swy) / det;
  let chi2 = 0;
  for (const p of points) {
    const r = (p.e - a - b * (p.speed - V_FIP)) / p.sigma;
    chi2 += r * r;
  }
  // If the bounces disagree more than expected, widen the error accordingly.
  const scale = points.length > 2 ? Math.max(1, chi2 / (points.length - 2)) : 1;
  const sigmaA = Math.sqrt((m22 / det) * scale);
  return { a, b, sigmaA, chi2 };
}

/**
 * Fits, then removes the worst bounce while it clearly disagrees with the rest (keeps ≥ 2).
 * Each bounce is judged against a fit of the OTHER bounces, so one bad bounce cannot bend
 * the fit toward itself and make a good bounce look wrong.
 */
function robustFit(points) {
  let pts = points.slice();
  const dropped = [];
  while (pts.length > 2) {
    let worst = -1;
    let worstR = 0;
    pts.forEach((p, i) => {
      const others = fitRestitution(pts.filter((_, j) => j !== i));
      const predicted = others.a + others.b * (p.speed - V_FIP);
      const r = Math.abs(p.e - predicted) / Math.sqrt(p.sigma * p.sigma + others.sigmaA * others.sigmaA);
      if (r > worstR) { worstR = r; worst = i; }
    });
    if (worstR < 4) break;
    dropped.push(pts[worst]);
    pts = pts.filter((_, i) => i !== worst);
  }
  return { ...fitRestitution(pts), used: pts, dropped };
}

/**
 * Main entry point.
 * @param {Float32Array} samples  mono PCM in [-1, 1]
 * @param {number} sampleRate
 * @param {{ referenceE?: number, referenceSigma?: number }} [opts]
 *        referenceE = result `e` measured with a NEW ball on the same floor (calibration).
 *        Corrects for floors that are softer than concrete.
 * @returns {{ ok: boolean, reason?: string, e?: number, eSigma?: number, eCorrected?: number,
 *            equivalentCm?: number, uncertaintyCm?: number, firstBounceCm?: number,
 *            verdict?: 'alive'|'tired'|'dead', confidence?: 'high'|'medium'|'low',
 *            bounces?: number[], speedSlope?: number, droppedBounces?: number }}
 */
function analyzeBounce(samples, sampleRate, opts = {}) {
  const impacts = detectImpacts(samples, sampleRate, opts);
  const seq = bounceSequence(impacts);
  if (seq.length < 3) {
    return {
      ok: false,
      reason: seq.length === 0 && impacts.length === 0
        ? 'no_impacts'
        : 'too_few_bounces',
      bounces: impacts.map((i) => i.t),
    };
  }

  const { points, takeoff } = perBounce(seq.map((i) => i.t));
  const fit = robustFit(points);
  const e = fit.a;

  // Calibration: a new ball on this floor should read like the middle of the FIP range.
  let eCorrected = e;
  let sigma = fit.sigmaA;
  if (opts.referenceE) {
    const k = E_NEW_BALL / opts.referenceE;
    eCorrected = e * k;
    const relRef = (opts.referenceSigma || 0) / opts.referenceE;
    sigma = Math.sqrt((fit.sigmaA * k) ** 2 + (eCorrected * relRef) ** 2);
  }

  const equivalentCm = fipBounceCm(eCorrected);
  const uncertaintyCm = (fipBounceCm(eCorrected + sigma) - fipBounceCm(eCorrected - sigma)) / 2;
  const firstBounceCm = riseHeight(takeoff[0]) * 100;

  let verdict = 'dead';
  if (equivalentCm >= THRESHOLDS.alive) verdict = 'alive';
  else if (equivalentCm >= THRESHOLDS.tired) verdict = 'tired';

  let confidence = 'high';
  if (uncertaintyCm > 4 || fit.used.length < 2) confidence = 'medium';
  if (uncertaintyCm > 8) confidence = 'low';

  return {
    ok: true,
    e: round(e, 4),
    eSigma: round(fit.sigmaA, 4),
    eCorrected: round(eCorrected, 4),
    equivalentCm: round(equivalentCm, 1),
    uncertaintyCm: round(uncertaintyCm, 1),
    firstBounceCm: round(firstBounceCm, 1),
    verdict,
    confidence,
    bounces: seq.map((i) => round(i.t, 4)),
    speedSlope: round(fit.b, 4),
    droppedBounces: fit.dropped.length,
  };
}

function round(v, d) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/** Converts little-endian 16-bit PCM bytes (what most recorders stream) to Float32 in [-1, 1]. */
function pcm16ToFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

module.exports = {
  analyzeBounce,
  detectImpacts,
  pcm16ToFloat32,
  THRESHOLDS,
  E_NEW_BALL,
  fipBounceCm,
  eForFipCm,
  flightTime,
  landingSpeed,
  dropSpeed,
  CONTACT_S,
  FIP_MIN_CM,
  FIP_MAX_CM,
};
