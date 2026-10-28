// PTA simulator: compact "#c=" share link (the simulator's own codec, vendored)
// plus the full v2 session JSON, which also keeps the patient name.
import { encodeCompact } from '../../vendor/pta/share-codec.js';
import { xorBytes, obfuscate } from '../../vendor/pta/obfuscate.js';
import { bytesToBase64Url } from './base64url.js';
import { resolve, slugify, FREQS, EARS } from '../model.js';
import { simBase } from '../config.js';

export function build(c, target) {
  const session = resolve(c, 'pta');
  const warnings = [];
  EARS.forEach((ear) => ['cochlear', 'ipsiConductive'].forEach((row) => FREQS.forEach((f) => {
    const v = session.patient[ear][row][f];
    if (v % 5 !== 0 || v < -10 || v > 120) warnings.push(`PTA ${ear} ${row} ${f} Hz = ${v} is off the 5 dB grid (-10..120).`);
  })));
  const { minMs, maxMs } = session.patient.responseLatency;
  if (minMs > maxMs) warnings.push(`PTA response delay min (${minMs} ms) is greater than max (${maxMs} ms).`);
  [minMs, maxMs].forEach((ms) => {
    if (ms % 50 !== 0 || ms < 0 || ms > 3000) warnings.push(`PTA response delay ${ms} ms is off the 50 ms grid (0..3000); the link rounds it.`);
  });
  // encodeCompact XORs the patient bytes in place when locked, as buildShareUrl in pta-simulator/js/share-link.js does.
  const bytes = encodeCompact(session, { xorPatientBytes: xorBytes });
  const url = `${simBase('pta', target)}index.html#c=${bytesToBase64Url(bytes)}`;
  const fileSession = session.locked
    ? { ...session, patient: { __obfuscated: true, data: obfuscate(session.patient) } }
    : session;
  return {
    url,
    warnings,
    files: [{ name: `${slugify(session.patientInfo.name)}-pta.json`, content: JSON.stringify(fileSession, null, 2) }],
    note: session.locked ? 'Exam mode: thresholds are hidden from the student and Edit Thresholds is locked.' : '',
  };
}
