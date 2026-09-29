// The case-maker project: one object holding a whole patient across every
// simulator. The audiogram is the single source of truth for thresholds;
// derive*() turns it into each simulator's native case shape, and per-sim
// `overrides` (dotted path -> value) are layered on top of that, so anything
// can be hand-edited while untouched fields keep following the audiogram.

import { newCaseTemplate, newPaediatricHistoryTemplate } from '../vendor/history/cases.js';
import { fitLogistic, buildPICurve } from '../vendor/speech/pi-curve.js';

export const FREQS = [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];
export const BC_FREQS = [250, 500, 750, 1000, 1500, 2000, 3000, 4000];
export const EARS = ['right', 'left'];
export const SIM_KEYS = ['history', 'otoscopy', 'pta', 'play', 'speech', 'immittance', 'dpoae', 'abr'];
export const DERIVED_SIMS = ['pta', 'play', 'speech', 'immittance', 'dpoae', 'abr'];

export const DPOAE_PROTOCOLS = {
  dp1_6: { name: 'DP 1 - 6 kHz', points: [1000, 1500, 2000, 3000, 4000, 6000] },
  dp0_5_10: { name: 'DP 0.5 - 10 kHz', points: [500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000] },
};

// ─── small utilities ───────────────────────────────────────────────────────

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const r5 = (v) => Math.round(v / 5) * 5;
export const clone = (o) => JSON.parse(JSON.stringify(o));

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'case';
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}

const flatRow = (freqs, v) => Object.fromEntries(freqs.map((f) => [f, v]));

// ─── blank project ─────────────────────────────────────────────────────────

export function blankAudiogram() {
  const ear = () => ({ ac: flatRow(FREQS, null), bc: flatRow(BC_FREQS, null) });
  return { right: ear(), left: ear() };
}

export function blankCase() {
  const now = new Date().toISOString();
  const history = newCaseTemplate(false);
  history.id = 'case-' + crypto.randomUUID().slice(0, 8);
  return {
    schema: 'casemaker/1',
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    meta: {
      title: '',
      notes: '',
      include: Object.fromEntries(SIM_KEYS.map((k) => [k, !['play'].includes(k)])),
    },
    sources: { guidance: '', files: [] },
    history,
    otoscopy: { title: '', description: '', findings: '', difficulty: 'beginner', leftImageId: '', rightImageId: '', caseId: '' },
    audiogram: blankAudiogram(),
    sims: Object.fromEntries(DERIVED_SIMS.map((k) => [k, { overrides: {} }])),
  };
}

export function setPaediatric(c, on) {
  if (on && !c.history.paediatricHistory) c.history.paediatricHistory = newPaediatricHistoryTemplate();
  if (!on) delete c.history.paediatricHistory;
}

// Fill in anything missing from an older/partial project file.
export function normaliseCase(c) {
  const base = blankCase();
  const out = { ...base, ...c };
  out.meta = { ...base.meta, ...c.meta, include: { ...base.meta.include, ...(c.meta && c.meta.include) } };
  out.sources = { ...base.sources, ...c.sources };
  out.otoscopy = { ...base.otoscopy, ...c.otoscopy };
  out.audiogram = c.audiogram || base.audiogram;
  out.sims = { ...base.sims };
  DERIVED_SIMS.forEach((k) => { out.sims[k] = { overrides: {}, ...(c.sims && c.sims[k]) }; });
  out.history = mergeDeep(newCaseTemplate(!!(c.history && c.history.paediatricHistory)), c.history || {});
  return out;
}

function mergeDeep(target, src) {
  Object.keys(src).forEach((k) => {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      mergeDeep(target[k], v);
    } else {
      target[k] = v;
    }
  });
  return target;
}

// ─── audiogram interpretation ──────────────────────────────────────────────

// Fill gaps in a {freq: value|null} row across `freqs` by log-frequency
// interpolation, extending flat beyond the ends. Returns null if the row is empty.
function fillRow(row, freqs) {
  const known = freqs.filter((f) => row && typeof row[f] === 'number');
  if (!known.length) return null;
  const out = {};
  freqs.forEach((f) => { out[f] = interpAt(known.map((k) => [k, row[k]]), f); });
  return out;
}

function interpAt(pairs, f) {
  if (f <= pairs[0][0]) return pairs[0][1];
  if (f >= pairs[pairs.length - 1][0]) return pairs[pairs.length - 1][1];
  for (let i = 1; i < pairs.length; i++) {
    const [f1, v1] = pairs[i - 1];
    const [f2, v2] = pairs[i];
    if (f <= f2) {
      const t = Math.log(f / f1) / Math.log(f2 / f1);
      return v1 + t * (v2 - v1);
    }
  }
  return pairs[pairs.length - 1][1];
}

// Per-ear AC, cochlear (true BC) and air-bone gap at every audiogram frequency.
// Where BC isn't tested (6/8 kHz, or not entered) the gap is carried from the
// nearest tested frequency; with no BC at all the loss is treated as sensorineural.
export function earThresholds(c, ear) {
  const a = c.audiogram[ear];
  let ac = fillRow(a.ac, FREQS);
  const bcFilled = fillRow(a.bc, BC_FREQS);
  if (!ac) ac = bcFilled ? fillRow(bcFilled, FREQS) : flatRow(FREQS, 0);
  const gap = {};
  const cochlear = {};
  FREQS.forEach((f) => {
    const fb = Math.min(f, 4000);
    const g = bcFilled ? Math.max(0, ac[fb] - bcFilled[fb]) : 0;
    gap[f] = g;
    cochlear[f] = ac[f] - g;
  });
  return { ac, cochlear, gap };
}

export const avg = (row, freqs) => freqs.reduce((s, f) => s + row[f], 0) / freqs.length;
const at = (row, f) => interpAt(FREQS.map((k) => [k, row[k]]), f);

export function audiogramIsEmpty(c) {
  return EARS.every((e) => Object.values(c.audiogram[e].ac).every((v) => v == null)
    && Object.values(c.audiogram[e].bc).every((v) => v == null));
}

// Age from the history's free-text age ("67", "4 years", "18 months", "3y 6m").
export function parseAgeMonths(str) {
  const s = String(str || '').toLowerCase();
  if (!s.trim()) return null;
  const y = s.match(/(\d+(?:\.\d+)?)\s*(y|yr|yrs|year|years)\b/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(m|mo|mos|month|months)\b/);
  const w = s.match(/(\d+(?:\.\d+)?)\s*(w|wk|wks|week|weeks)\b/);
  if (y || m || w) return Math.round((y ? +y[1] * 12 : 0) + (m ? +m[1] : 0) + (w ? +w[1] / 4.345 : 0));
  const n = s.match(/\d+(?:\.\d+)?/);
  return n ? Math.round(+n[0] * 12) : null;
}

const caseTitle = (c) => c.meta.title || c.history.patient.name || 'Untitled case';
// Short but stable per project (DPOAE also seeds its generated values from it),
// so links stay under the 255-character limit.
const caseSlugId = (c) => 'cm-' + String(c.id).replace(/-/g, '').slice(0, 8);

// ─── derive: native case for each simulator ────────────────────────────────

export function derivePta(c) {
  const patient = { crossIAA: {
    headphone: flatRow(FREQS, 40),
    insertphone: Object.fromEntries(FREQS.map((f) => [f, f <= 1000 ? 60 : 50])),
  } };
  EARS.forEach((ear) => {
    const t = earThresholds(c, ear);
    const cochlear = {};
    const ipsi = {};
    FREQS.forEach((f) => {
      cochlear[f] = clamp(r5(t.cochlear[f]), -10, 120);
      ipsi[f] = clamp(r5(t.gap[f]), 0, 120 - cochlear[f]);
    });
    patient[ear] = { cochlear, ipsiConductive: ipsi, ascDescDiff: flatRow(FREQS, 2), psychWidth: flatRow(FREQS, 4) };
  });
  return {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    patientInfo: { name: caseTitle(c), id: c.history.id || '', dob: '' },
    transducer: 'headphone',
    toggleDirection: 'up-louder',
    patient,
    storedPoints: [],
    durationSeconds: 0,
    locked: false,
  };
}

export function derivePlay(c) {
  const freqs = [500, 1000, 2000, 4000];
  const trueThreshold = {};
  const conductiveLoss = {};
  EARS.forEach((ear) => {
    const t = earThresholds(c, ear);
    trueThreshold[ear] = Object.fromEntries(freqs.map((f) => [f, clamp(r5(t.cochlear[f]), -10, 120)]));
    conductiveLoss[ear] = Object.fromEntries(freqs.map((f) => [f, clamp(r5(t.gap[f]), 0, 120 - trueThreshold[ear][f])]));
  });
  const game = (gain) => ({ baseResponseLevel: 50, conditioningGainRate: gain, startingConditioning: 30 });
  return {
    name: caseTitle(c),
    vignette: '',
    trueThreshold,
    conductiveLoss,
    startingFatigue: 0,
    startingPhase: 'conditioning',
    responseBudget: 120,
    engagementDecayRate: 1,
    falsePositiveSusceptibility: 1,
    games: { cars: game(0.9), horses: game(0.8), marbles: game(0.7) },
    clipEligibility: {},
    videoSet: null,
    locked: false,
  };
}

// Speech: a performance-intensity curve anchored at the ear's PTA (0.5/1/2 kHz AC).
// piMax drops as the cochlear loss worsens. These are starting suggestions only.
export function deriveSpeechEar(c, ear) {
  const t = earThresholds(c, ear);
  const speechFreqs = [250, 500, 1000, 2000, 4000];
  const pta = avg(t.ac, [500, 1000, 2000]);
  const cochlearPta = avg(t.cochlear, [500, 1000, 2000]);
  const piMax = Math.round(clamp(100 - Math.max(0, cochlearPta - 40) * 1.25, 20, 100));
  const pts = [[5, 0.25], [15, 0.65], [30, 1]].map(([dl, frac]) => ({
    level: clamp(r5(pta + dl), -10, 100),
    score: Math.round(piMax * frac),
  }));
  const dataPoints = pts.filter((p, i) => i === 0 || p.level > pts[i - 1].level);
  return {
    dataPoints,
    bestBC: clamp(r5(Math.min(...speechFreqs.map((f) => t.cochlear[f]))), -10, 120),
    bestAC: clamp(r5(Math.min(...speechFreqs.map((f) => t.ac[f]))), -10, 120),
    largestABGap: clamp(r5(Math.max(...[500, 1000, 2000, 4000].map((f) => t.gap[f]))), 0, 70),
    piMax,
    score90: piMax,
  };
}

// Does the simulator use "score at 90 dB HL" for this ear? Only for rollover:
// buildPICurve applies it when the fitted curve peaks below 90 dB HL (and the
// score is below PI max). When the curve is still rising at 90 dB it is ignored.
export function speechCurvePeaksBelow90(ear) {
  const pts = (ear.dataPoints || []).filter((p) => p.level != null && p.score != null && p.level !== '' && p.score !== '');
  if (!pts.length) return true;
  const { L50, k } = fitLogistic(pts, ear.piMax);
  return L50 + Math.log(99) / k < 90;
}

// Automatic "score at 90 dB HL": PI max when the curve has peaked before 90 dB
// (no rollover unless edited), otherwise what the curve actually gives at 90 dB,
// so the field matches what a student scores there.
export function autoScore90(ear) {
  if (speechCurvePeaksBelow90(ear)) return ear.piMax;
  const curve = buildPICurve({ ...ear, score90: ear.piMax });
  return clamp(Math.round(curve(90)), 0, ear.piMax);
}

export function deriveSpeech(c) {
  const ov = c.sims.speech.overrides;
  const ear = (side) => {
    const key = `${side}Ear`;
    const base = deriveSpeechEar(c, side);
    // Use any hand-edited curve inputs, so the auto score follows the curve actually sent.
    const effective = { ...base };
    ['dataPoints', 'piMax', 'bestAC'].forEach((f) => { if (`${key}.${f}` in ov) effective[f] = clone(ov[`${key}.${f}`]); });
    return { ...base, score90: autoScore90(effective) };
  };
  return { id: caseSlugId(c), name: caseTitle(c), rightEar: ear('right'), leftEar: ear('left') };
}

export const TYMP_PRESETS = {
  A: { peakAdmittance: 0.7, TPP: -5, gradient: 80 },
  As: { peakAdmittance: 0.2, TPP: -5, gradient: 50 },
  Ad: { peakAdmittance: 2.2, TPP: 0, gradient: 100 },
  B: { peakAdmittance: 0.1, TPP: 0, gradient: 0 },
  C: { peakAdmittance: 0.5, TPP: -200, gradient: 90 },
};

export function isChild(c) {
  const m = parseAgeMonths(c.history.patient.age);
  return m != null && m < 72;
}

export function deriveImmittance(c) {
  const child = isChild(c);
  const th = { right: earThresholds(c, 'right'), left: earThresholds(c, 'left') };
  const conductive = (ear) => avg(th[ear].gap, [500, 1000, 2000]) >= 15;
  const reflexLevel = (probe, stim, contra, f) => {
    if (conductive(probe)) return null;
    const gS = th[stim].gap[f];
    if (contra && gS >= 30) return null;
    const t = th[stim].cochlear[f];
    if (t > 75) return null;
    const base = t <= 50 ? 85 : 85 + (t - 50) * 0.8;
    const lvl = r5(base + gS);
    return lvl > 110 ? null : lvl;
  };
  const ears = {};
  EARS.forEach((ear) => {
    const other = ear === 'right' ? 'left' : 'right';
    const type = conductive(ear) ? (child ? 'B' : 'As') : 'A';
    ears[ear] = {
      tympType: type,
      ...TYMP_PRESETS[type],
      ECV: child ? 0.7 : 1.2,
      reflexShape: 'standard',
      reflexes: {
        ipsi: Object.fromEntries([500, 1000, 2000].map((f) => [f, reflexLevel(ear, ear, false, f)])),
        contra: Object.fromEntries([500, 1000, 2000].map((f) => [f, reflexLevel(ear, other, true, f)])),
      },
    };
  });
  return { id: caseSlugId(c), name: caseTitle(c), ears };
}

export function deriveDpoae(c) {
  const protocol = 'dp1_6';
  const th = { right: earThresholds(c, 'right'), left: earThresholds(c, 'left') };
  const ears = {};
  EARS.forEach((ear) => {
    ears[ear] = { points: DPOAE_PROTOCOLS[protocol].points.map((f2) => ({
      present: at(th[ear].ac, f2) <= 30 && at(th[ear].gap, f2) < 10,
    })) };
  });
  return { id: caseSlugId(c), name: caseTitle(c), protocol, ears };
}

// Re-align DPOAE points when the protocol is changed by an override.
export function dpoaeForProtocol(c, protocol) {
  const th = { right: earThresholds(c, 'right'), left: earThresholds(c, 'left') };
  return Object.fromEntries(EARS.map((ear) => [ear, { points: DPOAE_PROTOCOLS[protocol].points.map((f2) => ({
    present: at(th[ear].ac, f2) <= 30 && at(th[ear].gap, f2) < 10,
  })) }]));
}

export function deriveAbr(c) {
  const months = parseAgeMonths(c.history.patient.age);
  const adult = months == null || months >= 72;
  const freqs = [500, 1000, 2000, 4000];
  const ears = ['right', 'left'].map((ear) => {
    const t = earThresholds(c, ear);
    return {
      ac: freqs.map((f) => clamp(r5(t.ac[f]), -5, 150)),
      bc: freqs.map((f) => clamp(r5(t.cochlear[f]), -5, 150)),
      path: 0, sev: 0, cm: 1, ring: 0, morph: 0, pam: 0, latI: null, latIII: null, latV: null,
    };
  });
  return {
    name: caseTitle(c).slice(0, 60),
    adult,
    ageMonths: adult ? 4 : clamp(months, 0, 63),
    noisy: false,
    noise: 0.3,
    electrodes: 0,
    ears,
  };
}

const DERIVERS = { pta: derivePta, play: derivePlay, speech: deriveSpeech, immittance: deriveImmittance, dpoae: deriveDpoae, abr: deriveAbr };

export function derive(c, key) {
  return DERIVERS[key](c);
}

// Derived native case with the user's overrides applied.
export function resolve(c, key) {
  if (key === 'history') return clone(c.history);
  if (key === 'otoscopy') return clone(c.otoscopy);
  const base = derive(c, key);
  const ov = c.sims[key].overrides;
  // DPOAE: a protocol override changes the point grid, so rebuild it first.
  if (key === 'dpoae' && ov.protocol && ov.protocol !== base.protocol) {
    base.protocol = ov.protocol;
    base.ears = dpoaeForProtocol(c, ov.protocol);
  }
  Object.keys(ov).sort().forEach((p) => setPath(base, p, clone(ov[p])));
  return base;
}

export function isOverridden(c, key, path) {
  return Object.prototype.hasOwnProperty.call(c.sims[key].overrides, path);
}

export function setOverride(c, key, path, value) {
  c.sims[key].overrides[path] = value;
}

export function clearOverride(c, key, path) {
  delete c.sims[key].overrides[path];
}

export { caseTitle };
