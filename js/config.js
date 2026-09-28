// Where each simulator lives. "deployed" is GitHub Pages; "local" is the same
// static server case-maker is served from (run `python -m http.server` in the
// Coding folder), used to test links against unpushed simulator changes.

export const SIMS = [
  { key: 'history',    label: 'History taking',  deployed: 'https://jakalnz.github.io/history-taking-simulator/', local: '/history-taking-simulator/' },
  { key: 'otoscopy',   label: 'Otoscopy',        deployed: 'https://jakalnz.github.io/otoscopy/',                local: '/otoscopy/' },
  { key: 'pta',        label: 'Pure-tone audiometry', deployed: 'https://jakalnz.github.io/pta-simulator/',     local: '/pta-simulator/' },
  { key: 'play',       label: 'Play audiometry', deployed: 'https://jakalnz.github.io/play-simulator/',          local: '/play-simulator/' },
  { key: 'speech',     label: 'Speech testing',  deployed: 'https://jakalnz.github.io/speech-testing-simulator/', local: '/speech-testing-simulator/' },
  { key: 'immittance', label: 'Immittance',      deployed: 'https://jakalnz.github.io/immittance-simulator/',    local: '/immittance%20simulator/' },
  { key: 'dpoae',      label: 'DPOAEs',          deployed: 'https://jakalnz.github.io/dpoae-simulator/',         local: '/dpoae-simulator/' },
  { key: 'abr',        label: 'ABR',             deployed: 'https://jakalnz.github.io/abr-simulator/',           local: '/ABR/' },
];

export const SIM_BY_KEY = Object.fromEntries(SIMS.map((s) => [s.key, s]));

const TARGET_KEY = 'casemaker-link-target';

export function getLinkTarget() {
  try { return localStorage.getItem(TARGET_KEY) || 'deployed'; } catch { return 'deployed'; }
}

export function setLinkTarget(v) {
  try { localStorage.setItem(TARGET_KEY, v); } catch { /* ignore */ }
}

export function simBase(key, target = getLinkTarget()) {
  const s = SIM_BY_KEY[key];
  if (target === 'local') return new URL(s.local, location.origin).toString();
  return s.deployed;
}

export const HISTORY_WORKER_URL = 'https://audiology-sim.mpsanders.workers.dev';
export const OTOSCOPY_WORKER_URL = 'https://otoscopy-admin.mpsanders.workers.dev';
