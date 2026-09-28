// ABR simulator: index.html#case=<ABRCodec.encode>, the simulator's own codec (vendored).
import '../../vendor/abr/codec.js';
import { resolve } from '../model.js';
import { simBase } from '../config.js';

export function build(c, target) {
  const p = resolve(c, 'abr');
  const warnings = [];
  p.ears.forEach((e, i) => {
    const side = i === 0 ? 'right' : 'left';
    [...e.ac, ...e.bc].forEach((v) => {
      if (v % 5 !== 0 || v < -5 || v > 150) warnings.push(`ABR ${side}: threshold ${v} is off the 5 dB grid (-5..150).`);
    });
    ['latI', 'latIII', 'latV'].forEach((k) => {
      if (e[k] != null && (e[k] < 0 || e[k] > 12.75)) warnings.push(`ABR ${side}: ${k} must be 0–12.75 ms.`);
    });
  });
  return { url: `${simBase('abr', target)}index.html#case=${globalThis.ABRCodec.encode(p)}`, warnings, files: [], note: '' };
}
