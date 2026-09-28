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
