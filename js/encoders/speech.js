// Speech testing simulator: index.html?case=base64url(JSON [id, name, rightArr, leftArr]),
// the compact array form made by exportPatientAsLink in speech-testing-simulator/index.html.
import { stringToBase64Url } from './base64url.js';
import { resolve } from '../model.js';
import { simBase } from '../config.js';

const round1 = (n) => Math.round(n * 10) / 10;

function compactEar(ear) {
  const flat = [];
  ear.dataPoints.forEach((p) => { flat.push(round1(p.level), round1(p.score)); });
  return [
    round1(ear.bestBC),
    ear.bestAC != null ? round1(ear.bestAC) : null,
    round1(ear.largestABGap),
    round1(ear.piMax),
    round1(ear.score90),
    ...flat,
  ];
}

export function build(c, target) {
  const p = resolve(c, 'speech');
  const warnings = [];
  [['right', p.rightEar], ['left', p.leftEar]].forEach(([side, ear]) => {
    if (ear.dataPoints.length > 8) warnings.push(`Speech ${side}: the simulator's admin only shows 8 data points.`);
  });
  const payload = [p.id, p.name, compactEar(p.rightEar), compactEar(p.leftEar)];
  return { url: `${simBase('speech', target)}index.html?case=${stringToBase64Url(JSON.stringify(payload))}`, warnings, files: [], note: '' };
}
