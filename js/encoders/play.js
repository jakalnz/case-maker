// Play audiometry simulator: index.html#case=~<compact> via the simulator's own
// js/case-codec.js (vendored), falling back to base64url(JSON of the versioned
// share wrapper) as play-simulator/js/case-serializer.js serializeCase makes it.
import { stringToBase64Url, stringToBase64 } from './base64url.js';
import { resolve, slugify } from '../model.js';
import { simBase } from '../config.js';
import '../../vendor/play/case-codec.js';

const KEY = 'play-sim-case-obfuscation-v1';

// Same as play-simulator/js/obfuscate.js obfuscate().
export function obfuscate(obj) {
  const json = JSON.stringify(obj);
  let out = '';
  for (let i = 0; i < json.length; i++) out += String.fromCharCode(json.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
  return stringToBase64(out);
}

export function shareWrapper(cfg) {
  const locked = !!cfg.locked;
  const wrap = (v) => (locked ? { __obfuscated: true, data: obfuscate(v) } : v);
  const out = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    locked,
    name: cfg.name,
    vignette: cfg.vignette,
    trueThreshold: wrap(cfg.trueThreshold),
    conductiveLoss: wrap(cfg.conductiveLoss),
    startingFatigue: cfg.startingFatigue,
    startingPhase: cfg.startingPhase,
    responseBudget: cfg.responseBudget,
    engagementDecayRate: cfg.engagementDecayRate,
    falsePositiveSusceptibility: cfg.falsePositiveSusceptibility,
    games: cfg.games,
    clipEligibility: cfg.clipEligibility,
  };
  if (cfg.videoSet) out.videoSet = cfg.videoSet;
  return out;
}

export function build(c, target) {
  const cfg = resolve(c, 'play');
  const raw = { ...cfg };
  delete raw.locked;
  const codec = globalThis.CaseCodec;
  const warnings = [];
  let hash;
  if (codec.canEncode(raw)) {
    hash = codec.encode(raw, { locked: cfg.locked });
  } else {
    hash = stringToBase64Url(JSON.stringify(shareWrapper(cfg)));
    warnings.push('Play: this case needs the long link format (values off the 5 dB grid or out of range).');
  }
  const url = `${simBase('play', target)}index.html#case=${hash}`;
  return {
    url,
    warnings,
    files: [{ name: `${slugify(cfg.name)}-play.json`, content: JSON.stringify(raw, null, 2) }],
    note: 'The link adds a "Shared via link" card to the play simulator home page; click it to start.',
  };
}
