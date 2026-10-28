// Generates a teaching audiogram from age (ISO 7029), noise exposure
// (ISO 1999) and an optional added sensorineural / conductive loss, after
// the Tutorial generator in Wilding's PTA_Sim. Values are dB HL on the 5 dB
// grid; BC is the sensorineural part, AC adds the conductive component.

import { FREQS, BC_FREQS, r5, clamp } from './model.js';

// ISO 7029:2000 at 125, 250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000 Hz.
// Median change from age 18: alpha × (age − 18)²; spread above / below the
// median: beta + 0.445 / 0.356 × median.
const ISO7029_FREQS = [125, 250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000];
const ISO7029 = {
  male: {
    alpha: [0.003, 0.003, 0.0035, 0.004, 0.005, 0.007, 0.0115, 0.016, 0.018, 0.022],
    betaUpper: [7.23, 6.67, 6.12, 6.12, 6.67, 7.23, 7.78, 8.34, 9.45, 10.56],
    betaLower: [5.78, 5.34, 4.89, 4.89, 5.34, 5.78, 6.23, 6.67, 7.56, 8.45],
  },
  female: {
    alpha: [0.003, 0.003, 0.0035, 0.004, 0.005, 0.006, 0.0075, 0.009, 0.012, 0.015],
    betaUpper: [6.67, 6.12, 6.12, 6.12, 6.67, 6.67, 7.23, 7.78, 8.9, 10.56],
    betaLower: [5.34, 4.89, 4.89, 4.89, 5.34, 5.34, 5.78, 6.23, 7.12, 8.45],
  },
};

// Percentile of hearing threshold (higher = poorer hearing) → standard normal z.
export const AGE_PERCENTILES = [
  [10, 'Better than typical (10th)'],
  [25, 'Better than typical (25th)'],
  [50, 'Typical for age (50th)'],
  [75, 'Poorer than typical (75th)'],
  [90, 'Poorer than typical (90th)'],
];
const Z = { 10: -1.2816, 25: -0.6745, 50: 0, 75: 0.6745, 90: 1.2816 };

function interp(table, freqs, f) {
  const i = freqs.indexOf(f);
  if (i >= 0) return table[i];
  const hi = freqs.findIndex((x) => x > f);
  if (hi <= 0) return hi === 0 ? table[0] : table[table.length - 1];
  const t = Math.log(f / freqs[hi - 1]) / Math.log(freqs[hi] / freqs[hi - 1]);
  return table[hi - 1] + t * (table[hi] - table[hi - 1]);
}

// Age-related threshold (dB HL) at a frequency, for an age 18–80 and percentile.
export function ageThreshold(age, sex, percentile, f) {
  const d = ISO7029[sex] ?? ISO7029.male;
  const a = clamp(age, 18, 80);
  const median = interp(d.alpha, ISO7029_FREQS, f) * (a - 18) ** 2;
  const z = Z[percentile] ?? 0;
  return z >= 0
    ? median + z * (interp(d.betaUpper, ISO7029_FREQS, f) + 0.445 * median)
    : median + z * (interp(d.betaLower, ISO7029_FREQS, f) + 0.356 * median);
}

// ISO 1999 median noise-induced permanent threshold shift at 500–6000 Hz:
// (u + v·lg t)(LEX,8h − L0)² for t ≥ 10 years; scaled by lg(t+1)/lg(11) below 10.
const ISO1999_FREQS = [500, 1000, 2000, 3000, 4000, 6000];
const ISO1999 = {
  u: [-0.033, -0.02, -0.045, 0.012, 0.025, 0.019],
  v: [0.11, 0.07, 0.066, 0.037, 0.025, 0.024],
  l0: [93, 89, 80, 77, 75, 77],
};

function noiseAt(i, lex, years) {
  const exposure = Math.max(0, lex - ISO1999.l0[i]) ** 2;
  const at = (t) => (ISO1999.u[i] + ISO1999.v[i] * Math.log10(t)) * exposure;
  return Math.max(0, years >= 10 ? at(years) : (Math.log10(years + 1) / Math.log10(11)) * at(10));
}

export function noiseShift(lex, years, f) {
  if (!lex || !years) return 0;
  if (f < 500 || f > 6000) return 0;
  return interp(ISO1999_FREQS.map((_, i) => noiseAt(i, lex, years)), ISO1999_FREQS, f);
}

// Added sensorineural loss shapes: fraction of the chosen amount at each frequency.
export const SNHL_SHAPES = {
  flat: { label: 'Flat', w: () => 1 },
  sloping: { label: 'High-frequency (sloping)', w: (f) => ({ 250: 0, 500: 0, 750: 0.15, 1000: 0.3, 1500: 0.5, 2000: 0.65, 3000: 0.85 }[f] ?? 1) },
  rising: { label: 'Low-frequency (rising)', w: (f) => ({ 250: 1, 500: 1, 750: 0.8, 1000: 0.6, 1500: 0.35, 2000: 0.2 }[f] ?? 0) },
  cookie: { label: 'Cookie-bite (mid-frequency)', w: (f) => ({ 250: 0, 500: 0.4, 750: 0.7, 1000: 0.9, 1500: 1, 2000: 0.9, 3000: 0.6, 4000: 0.35, 6000: 0.1, 8000: 0 }[f]) },
};

export const CONDUCTIVE_SHAPES = {
  flat: { label: 'Flat', w: () => 1 },
  low: { label: 'Greater at low frequencies', w: (f) => ({ 250: 1, 500: 1, 750: 1, 1000: 1, 1500: 0.85, 2000: 0.75, 3000: 0.6 }[f] ?? 0.5) },
};

/**
 * opts: { age, sex, percentile, lex, years, snhl: { amount, shape },
 *         conductive: { amount, shape } }
 * Returns { ac: {freq: dB}, bc: {freq: dB} } for one ear.
 */
export function generateEar(opts) {
  const ac = {};
  const bc = {};
  FREQS.forEach((f) => {
    const age = ageThreshold(opts.age, opts.sex, opts.percentile, f);
    const noise = noiseShift(opts.lex, opts.years, f);
    // ISO 1999 combination of age- and noise-related loss.
    const sensory = age + noise - (age * noise) / 120 + (opts.snhl?.amount ?? 0) * (SNHL_SHAPES[opts.snhl?.shape]?.w(f) ?? 0);
    const conductive = (opts.conductive?.amount ?? 0) * (CONDUCTIVE_SHAPES[opts.conductive?.shape]?.w(f) ?? 0);
    const cochlear = clamp(r5(sensory), -10, 120);
    ac[f] = clamp(r5(sensory + conductive), -10, 120);
    if (BC_FREQS.includes(f)) bc[f] = cochlear;
  });
  return { ac, bc };
}
