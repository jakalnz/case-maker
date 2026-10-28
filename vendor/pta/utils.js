export const FREQUENCIES = [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];

export const DB_MIN = -10;
export const DB_MAX = 120;
export const DB_STEP = 5;

// Bone conductor output ceiling per frequency — real audiometers can't
// drive BC anywhere near AC's 120dB max, and the ceiling itself varies by
// frequency. 6000/8000Hz have no entry: BC isn't offered at those
// frequencies, same as most clinical audiometers.
export const BC_MAX_LEVEL = {
  250: 45,
  500: 60,
  750: 70,
  1000: 70,
  1500: 70,
  2000: 70,
  3000: 70,
  4000: 70,
};

// Standard BC occlusion effect (dB) for the ear covered by the AC
// transducer: supra-aural headphones 30/20/10 dB and inserts 10/10/0 dB at
// 250/500/1000 Hz, 750 Hz halfway between, none above 1000 Hz.
const OCCLUSION_TABLE = {
  headphone: { 250: 30, 500: 20, 750: 15, 1000: 10 },
  insertphone: { 250: 10, 500: 10, 750: 5, 1000: 0 },
};

export function standardOcclusionRow(transducer) {
  return Object.fromEntries(FREQUENCIES.map((f) => [f, OCCLUSION_TABLE[transducer][f] ?? 0]));
}

// Measured occlusion effects, mean and SD (dB), from Wallaert et al. (2024)
// Trends in Hearing 28, Table 7 (with masking, one measure per ear):
// TDH 39 headphones (n = 14) and inserts (ER1 / IP30, n = 20). No 8 kHz data.
// https://doi.org/10.1177/23312165241286456
const OCCLUSION_MEASURED = {
  headphone: {
    250: [6.63, 11.33], 500: [8.13, 11.26], 750: [5.25, 9.46], 1000: [2.88, 6.55], 1500: [3.63, 5.76],
    2000: [2.0, 5.65], 3000: [0.75, 5.26], 4000: [0.13, 5.88], 6000: [0.25, 2.68],
  },
  insertphone: {
    250: [7.75, 13.67], 500: [3.88, 11.28], 750: [3.0, 7.01], 1000: [4.5, 8.65], 1500: [3.75, 6.91],
    2000: [0.88, 5.08], 3000: [1.38, 5.53], 4000: [0.75, 5.14], 6000: [0.38, 3.74],
  },
};

export const OCCLUSION_PERCENTILE_Z = { 25: -0.6745, 50: 0, 75: 0.6745, 90: 1.2816 };

// The occlusion effect is a low-frequency effect: above 2 kHz the measured
// means are about 0–1 dB and the SD is mostly test–retest spread, so the
// presets leave those frequencies at 0.
const OCCLUSION_MAX_FREQ = 2000;

// Occlusion row at a position z (standard normal) in the measured
// distribution: mean + z × SD at each frequency up to 2 kHz, negative
// values set to 0, rounded to the 5 dB grid the patient model uses.
export function measuredOcclusionRow(transducer, z) {
  return Object.fromEntries(FREQUENCIES.map((f) => {
    const d = OCCLUSION_MEASURED[transducer][f];
    return [f, d && f <= OCCLUSION_MAX_FREQ ? Math.max(0, roundToStep(d[0] + z * d[1], DB_STEP)) : 0];
  }));
}

// Standard-normal draw (Box–Muller) for a 'random' occlusion patient.
export function randomNormal(random = Math.random) {
  return Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) * Math.cos(2 * Math.PI * random());
}

/**
 * Occlusion rows for both transducers from a preset: 'standard' (the
 * clinical OEF table), a percentile (25, 50, 75, 90) of the measured data,
 * or 'random' (one position in the distribution per patient, shared by
 * both transducers and all frequencies).
 */
export function occlusionPreset(preset, random = Math.random) {
  if (preset === 'standard') {
    return { headphone: standardOcclusionRow('headphone'), insertphone: standardOcclusionRow('insertphone') };
  }
  const z = preset === 'random' ? randomNormal(random) : OCCLUSION_PERCENTILE_Z[preset];
  if (z === undefined) throw new Error(`Unknown occlusion preset: ${preset}`);
  return { headphone: measuredOcclusionRow('headphone', z), insertphone: measuredOcclusionRow('insertphone', z) };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampLevel(db, max = DB_MAX) {
  return clamp(roundToStep(db, DB_STEP), DB_MIN, max);
}

export function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

export function formatFreq(freq) {
  if (freq < 1000) return `${freq} Hz`;
  const kHz = freq / 1000;
  const label = Number.isInteger(kHz) ? kHz : kHz.toFixed(1);
  return `${label} kHz`;
}

export function formatDb(db) {
  return `${db} dB`;
}

export function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const OTHER_EAR = { left: 'right', right: 'left' };
