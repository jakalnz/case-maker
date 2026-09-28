// Immittance simulator: index.html#case=<compact codec>, ported from
// "immittance simulator/caseCodec.js" encodePatientCompact. Cases the compact
// codec can't hold exactly fall back to the simulator's lossless legacy form.
import { bytesToBase64Url, stringToBase64 } from './base64url.js';
import { resolve } from '../model.js';
import { simBase } from '../config.js';

const CASE_CODEC_VERSION = 1;
const TYMP_TYPES = ['A', 'As', 'Ad', 'Ar', 'B', 'C', 'other'];
export const REFLEX_SHAPES = ['symmetric', 'standard', 'drifting', 'other'];
const REFLEX_FREQS = [500, 1000, 2000];

class BitWriter {
  constructor() { this.bits = []; }
  write(value, n) { for (let i = n - 1; i >= 0; i--) this.bits.push((value >>> i) & 1); }
  toBytes() {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (7 - (i & 7)); });
    return bytes;
  }
}

const enumIndex = (list, v, fb) => { const i = list.indexOf(v); return i === -1 ? fb : i; };
const scaled100 = (v) => Math.max(0, Math.min(511, Math.round(v * 100)));
const reflex = (v) => (v == null ? 255 : Math.max(0, Math.min(254, Math.round(v))));

function packEar(w, ear) {
  w.write(enumIndex(TYMP_TYPES, ear.tympType, TYMP_TYPES.length - 1), 3);
  w.write(scaled100(ear.peakAdmittance), 9);
  w.write(Math.max(0, Math.min(1023, Math.round(ear.TPP) + 512)), 10);
  w.write(scaled100(ear.ECV), 9);
  w.write(Math.max(0, Math.min(511, Math.round(ear.gradient))), 9);
  w.write(enumIndex(REFLEX_SHAPES, ear.reflexShape, REFLEX_SHAPES.length - 1), 3);
  ['ipsi', 'contra'].forEach((side) => REFLEX_FREQS.forEach((f) => w.write(reflex(ear.reflexes?.[side]?.[f]), 8)));
}

export function encodePatientCompact(p) {
  const w = new BitWriter();
  w.write(CASE_CODEC_VERSION, 4);
  packEar(w, p.ears.right);
  packEar(w, p.ears.left);
  const head = w.toBytes();
  const name = new TextEncoder().encode(p.name || '');
  const out = new Uint8Array(head.length + name.length);
  out.set(head, 0);
  out.set(name, head.length);
  return bytesToBase64Url(out);
}

// Would the compact codec reproduce this patient exactly?
export function compactIsLossless(p) {
  return ['right', 'left'].every((e) => {
    const ear = p.ears[e];
    const r = ear.reflexes || {};
    return TYMP_TYPES.slice(0, -1).includes(ear.tympType)
      && REFLEX_SHAPES.slice(0, -1).includes(ear.reflexShape)
      && Number.isInteger(ear.TPP) && ear.TPP >= -512 && ear.TPP <= 511
      && ear.peakAdmittance >= 0 && ear.peakAdmittance <= 5.11
      && ear.ECV >= 0 && ear.ECV <= 5.11
      && Number.isInteger(ear.gradient) && ear.gradient >= 0 && ear.gradient <= 511
      && ['ipsi', 'contra'].every((s) => REFLEX_FREQS.every((f) => r[s]?.[f] == null || (Number.isInteger(r[s][f]) && r[s][f] <= 254)));
  });
}

export function build(c, target) {
  const p = resolve(c, 'immittance');
  const base = `${simBase('immittance', target)}index.html#case=`;
  const warnings = [];
  let url;
  if (compactIsLossless(p)) {
    url = base + encodePatientCompact(p);
  } else {
    // Legacy form: standard base64 of the JSON, URI-encoded because the app reads the hash with URLSearchParams.
    url = base + encodeURIComponent(stringToBase64(JSON.stringify(p)));
    warnings.push('Immittance: using the longer lossless link format (e.g. for the biphasic reflex shape).');
  }
  return { url, warnings, files: [], note: '' };
}
