// Play audiometry simulator: index.html#case=base64url(JSON of the versioned
// share wrapper), as play-simulator/js/case-serializer.js serializeCase makes it.
import { stringToBase64Url, stringToBase64 } from './base64url.js';
import { resolve, slugify } from '../model.js';
import { simBase } from '../config.js';

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
  const url = `${simBase('play', target)}index.html#case=${stringToBase64Url(JSON.stringify(shareWrapper(cfg)))}`;
  const raw = { ...cfg };
  delete raw.locked;
  return {
    url,
    warnings: [],
    files: [{ name: `${slugify(cfg.name)}-play.json`, content: JSON.stringify(raw, null, 2) }],
    note: 'The link adds a "Shared via link" card to the play simulator home page; click it to start.',
  };
}
