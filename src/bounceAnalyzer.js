/**
 * Dead or Alive — bounce analyzer
 *
 * Listens to a padel ball dropped on a hard floor and estimates how "alive" it is.
 *
 * Physics: between two impacts the ball flies freely, so the time between impacts is
 *   T = 2v / g   (v = take-off speed after the impact)
 * Each impact keeps a fraction e of the speed (coefficient of restitution), so
 *   e = T(k+1) / T(k)
 * This ratio does NOT depend on the height you drop the ball from, which is why the app
 * only needs a microphone.
 *
 * The FIP rules say a legal ball dropped from 2.54 m on a hard surface must bounce
 * 135–145 cm. Equivalent bounce height for a 2.54 m drop:  h = 254 cm × e²
 *
 * Pure JavaScript, no dependencies: runs in React Native/Expo and in Node (for tests).
 */

const G = 9.81;
const FIP_DROP_CM = 254;
const FIP_MIN_CM = 135;
const FIP_MAX_CM = 145;
// Middle of the FIP range, used when a reference (new) ball has been measured.
const E_FIP_MID = Math.sqrt(((FIP_MIN_CM + FIP_MAX_CM) / 2) / FIP_DROP_CM); // ≈ 0.742

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
  const x = highPass(highPass(highPass(samples, sampleRate, cutoff), sampleRate, cutoff), sampleRate, cutoff);
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
      if (seq.length >= 6) break; // first bounces are the cleanest
    }
    if (seq.length > best.length) best = seq;
  }
  return best;
}

/**
 * Main entry point.
 * @param {Float32Array} samples  mono PCM in [-1, 1]
 * @param {number} sampleRate
 * @param {{ referenceE?: number }} [opts]  referenceE = restitution measured with a NEW ball
 *        on the same floor (calibration). Corrects for floors that are softer than concrete.
 * @returns {{ ok: boolean, reason?: string, e?: number, eCorrected?: number,
 *            equivalentCm?: number, firstBounceCm?: number, verdict?: 'alive'|'tired'|'dead',
 *            confidence?: 'high'|'medium'|'low', bounces?: number[] }}
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

  const gaps = [];
  for (let i = 1; i < seq.length; i++) gaps.push(seq[i].t - seq[i - 1].t);
  // Use up to the first 3 ratios: later bounces are short and less precise.
  const ratios = [];
  for (let i = 1; i < gaps.length && ratios.length < 3; i++) ratios.push(gaps[i] / gaps[i - 1]);
  const e = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const spread = Math.max(...ratios) - Math.min(...ratios);

  const eCorrected = opts.referenceE ? e * (E_FIP_MID / opts.referenceE) : e;
  const equivalentCm = FIP_DROP_CM * eCorrected * eCorrected;
  const firstBounceCm = ((G * gaps[0] * gaps[0]) / 8) * 100; // height reached after impact 1

  let verdict = 'dead';
  if (equivalentCm >= THRESHOLDS.alive) verdict = 'alive';
  else if (equivalentCm >= THRESHOLDS.tired) verdict = 'tired';

  let confidence = 'high';
  if (ratios.length < 2 || spread > 0.06) confidence = 'medium';
  if (spread > 0.12) confidence = 'low';

  return {
    ok: true,
    e: round(e, 4),
    eCorrected: round(eCorrected, 4),
    equivalentCm: round(equivalentCm, 1),
    firstBounceCm: round(firstBounceCm, 1),
    verdict,
    confidence,
    bounces: seq.map((i) => round(i.t, 4)),
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
  E_FIP_MID,
  FIP_MIN_CM,
  FIP_MAX_CM,
};
