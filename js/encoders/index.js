import * as history from './history.js';
import * as otoscopy from './otoscopy.js';
import * as pta from './pta.js';
import * as play from './play.js';
import * as speech from './speech.js';
import * as immittance from './immittance.js';
import * as dpoae from './dpoae.js';
import * as abr from './abr.js';

export const ENCODERS = { history, otoscopy, pta, play, speech, immittance, dpoae, abr };

// Build every simulator's output. Always resolves; a failure becomes a warning.
export async function buildAll(c, target) {
  const out = {};
  for (const [key, enc] of Object.entries(ENCODERS)) {
    try {
      out[key] = await enc.build(c, target);
    } catch (e) {
      out[key] = { url: '', warnings: [`${key}: ${e.message}`], files: [], note: '' };
    }
  }
  return out;
}
