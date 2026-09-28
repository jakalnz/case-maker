// DPOAE simulator: #case='z'+base64url(deflate-raw(minified JSON)), as encodeCase
// in dpoae-simulator/app.js; 'j'+base64url(JSON) where CompressionStream is missing.
import { bytesToBase64Url } from './base64url.js';
import { resolve } from '../model.js';
import { simBase } from '../config.js';

export function minify(patient) {
  const mini = { id: patient.id, name: patient.name, protocol: patient.protocol, ears: {} };
  ['right', 'left'].forEach((ear) => {
    const pts = (patient.ears && patient.ears[ear] && patient.ears[ear].points) || [];
    mini.ears[ear] = { points: pts.map((pt) => {
      const out = {};
      if (pt.present) out.present = true;
      ['level', 'snr', 'noise', 'reliability', 'l1', 'l2'].forEach((k) => { if (typeof pt[k] === 'number') out[k] = pt[k]; });
      return out;
    }) };
  });
  return mini;
}

export async function encodeCase(patient) {
  const json = JSON.stringify(minify(patient));
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'j' + bytesToBase64Url(new TextEncoder().encode(json));
}

export async function build(c, target) {
  const p = resolve(c, 'dpoae');
  return { url: `${simBase('dpoae', target)}index.html#case=${await encodeCase(p)}`, warnings: [], files: [], note: '' };
}
