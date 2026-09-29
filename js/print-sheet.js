// The printable case sheet (Print → Save as PDF keeps the links clickable).
// Built as its own element on <body> and only shown by @media print, so the
// on-screen page is unaffected. Student copy = steps + links; instructor copy
// adds the answer key.

import { h } from './ui.js';
import { SIMS } from './config.js';
import { caseTitle, resolve, EARS, FREQS, earThresholds, avg, DPOAE_PROTOCOLS } from './model.js';
import { audiogramSvg } from './steps/audiogram.js';
import { speechSvg } from './steps/speech.js';

const TASKS = {
  history: 'Take a case history from the patient.',
  otoscopy: 'Examine both ears and record your findings.',
  pta: 'Find air- and bone-conduction thresholds, masking where needed.',
  play: 'Condition the child and find thresholds with play audiometry.',
  speech: 'Measure word recognition for each ear.',
  immittance: 'Run tympanometry and acoustic reflexes for each ear.',
  dpoae: 'Record DPOAEs for each ear.',
  abr: 'Record and interpret the ABR.',
};

const fk = (x) => (x >= 1000 ? `${x / 1000}k` : String(x));
const side = (e) => (e === 'right' ? 'Right' : 'Left');

function stepItem(n, sim, r, c) {
  let action;
  if (!r.url) {
    action = h('span.ps-missing', 'Link not available yet');
  } else if (sim.key === 'history') {
    const file = r.files && r.files[0] ? r.files[0].name : 'the case file';
    action = h('span', h('a.ps-link', { href: r.url }, `Open ${sim.label} ›`),
      h('span.ps-sub', ` Import “${file}” first if the case isn’t listed.`));
  } else {
    action = h('a.ps-link', { href: r.url }, `Open ${sim.label} ›`);
  }
  const extra = sim.key === 'otoscopy' && c.otoscopy.description ? h('div.ps-sub', c.otoscopy.description) : null;
  return h('li.ps-step',
    h('span.ps-num', n),
    h('div.ps-step-body', h('div.ps-step-name', sim.label), h('div.ps-task', TASKS[sim.key]), extra, h('div.ps-action', action)));
}

function audiogramBlock(c) {
  const rows = EARS.map((e) => {
    const t = earThresholds(c, e);
    const ac = avg(t.ac, [500, 1000, 2000]);
    const gap = avg(t.gap, [500, 1000, 2000]);
    const coch = avg(t.cochlear, [500, 1000, 2000]);
    let type = 'Normal';
    if (ac > 20) type = gap >= 15 ? (coch > 20 ? 'Mixed' : 'Conductive') : 'Sensorineural';
    return h('tr', h('th', { class: `ps-${e}` }, side(e)), h('td', `${Math.round(ac)} dB HL`), h('td', `${Math.round(gap)} dB`), h('td', type));
  });
  const table = h('table.ps-table',
    h('tr', h('th', 'dB HL'), FREQS.map((f) => h('th', fk(f)))),
    EARS.flatMap((e) => ['ac', 'bc'].map((k) => h('tr', h('th', { class: `ps-${e}` }, `${side(e)} ${k.toUpperCase()}`),
      FREQS.map((f) => h('td', c.audiogram[e][k][f] ?? (k === 'bc' && f > 4000 ? '' : '–')))))));
  return h('div.ps-block',
    h('h3', 'Audiogram'),
    h('div.ps-two', h('div.ps-chart', audiogramSvg(c)),
      h('div', h('table.ps-table.ps-narrow', h('tr', h('th'), h('th', 'PTA (0.5–2k)'), h('th', 'Mean ABG'), h('th', 'Type')), rows))),
    table);
}

function speechBlock(c) {
  const sp = resolve(c, 'speech');
  return h('div.ps-block',
    h('h3', 'Speech'),
    h('div.ps-two', h('div.ps-chart', speechSvg(sp)),
      h('table.ps-table.ps-narrow',
        h('tr', h('th'), h('th', 'PI max'), h('th', 'At 90 dB HL'), h('th', 'Data points')),
        [['right', sp.rightEar], ['left', sp.leftEar]].map(([e, x]) => h('tr',
          h('th', { class: `ps-${e}` }, side(e)), h('td', `${x.piMax}%`), h('td', `${x.score90}%`),
          h('td', x.dataPoints.map((d) => `${d.level} dB → ${d.score}%`).join(', ')))))));
}

function immittanceBlock(c) {
  const im = resolve(c, 'immittance');
  const rf = (v) => (v == null ? 'NR' : v);
  return h('div.ps-block',
    h('h3', 'Immittance'),
    h('table.ps-table',
      h('tr', h('th', 'Probe'), h('th', 'Type'), h('th', 'Peak (mmho)'), h('th', 'TPP (daPa)'), h('th', 'ECV (mL)'),
        h('th', 'Ipsi 0.5/1/2k'), h('th', 'Contra 0.5/1/2k')),
      EARS.map((e) => {
        const x = im.ears[e];
        return h('tr', h('th', { class: `ps-${e}` }, side(e)), h('td', x.tympType), h('td', x.peakAdmittance), h('td', x.TPP), h('td', x.ECV),
          h('td', [500, 1000, 2000].map((q) => rf(x.reflexes.ipsi[q])).join(' / ')),
          h('td', [500, 1000, 2000].map((q) => rf(x.reflexes.contra[q])).join(' / ')));
      })),
    h('p.ps-note', 'Reflexes in dB HL; NR = no response. Contra is listed by probe ear.'));
}

function dpoaeBlock(c) {
  const dp = resolve(c, 'dpoae');
  const pts = DPOAE_PROTOCOLS[dp.protocol].points;
  return h('div.ps-block',
    h('h3', `DPOAEs (${DPOAE_PROTOCOLS[dp.protocol].name})`),
    h('table.ps-table',
      h('tr', h('th', 'f2 (Hz)'), pts.map((f) => h('th', fk(f)))),
      EARS.map((e) => h('tr', h('th', { class: `ps-${e}` }, side(e)),
        pts.map((_, i) => h('td', dp.ears[e].points[i]?.present ? '✓' : '✗'))))));
}

function abrBlock(c) {
  const ab = resolve(c, 'abr');
  const path = ['None', 'Retrocochlear', 'ANSD'];
  return h('div.ps-block',
    h('h3', 'ABR'),
    h('table.ps-table',
      h('tr', h('th'), h('th', 'AC 0.5/1/2/4k'), h('th', 'BC 0.5/1/2/4k'), h('th', 'Pathology')),
      ab.ears.map((x, i) => h('tr', h('th', { class: i ? 'ps-left' : 'ps-right' }, i ? 'Left' : 'Right'),
        h('td', x.ac.join(' / ')), h('td', x.bc.join(' / ')), h('td', path[x.path])))),
    h('p.ps-note', ab.adult ? 'Adult.' : `Child, ${ab.ageMonths} months.`));
}

export function buildPrintSheet(c, built) {
  const inc = c.meta.include;
  const included = SIMS.filter((s) => inc[s.key]);
  const p = c.history.patient;
  const who = [p.name, p.age && `${p.age}${/\d$/.test(p.age) ? ' years' : ''}`].filter(Boolean).join(', ');
  const key = [
    c.meta.notes ? h('div.ps-block', h('h3', 'Instructor notes'), h('p', c.meta.notes)) : null,
    audiogramBlock(c),
    inc.speech ? speechBlock(c) : null,
    inc.immittance ? immittanceBlock(c) : null,
    inc.dpoae ? dpoaeBlock(c) : null,
    inc.abr ? abrBlock(c) : null,
  ];
  return h('div.print-sheet',
    h('header.ps-head',
      h('div.ps-kicker', 'Audiology case', h('span.ps-copy.ps-instructor-only', ' · Instructor copy')),
      h('h1', caseTitle(c)),
      h('div.ps-meta', [who, new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' · '))),
    h('section',
      h('h2', 'Work through the case in this order'),
      h('ol.ps-steps', included.map((s, i) => stepItem(i + 1, s, built[s.key], c)))),
    h('section.ps-instructor-only.ps-key', h('h2', 'Answer key'), key),
    h('footer.ps-foot', 'Made with Case-maker · jakalnz.github.io/case-maker'));
}

// Put a fresh sheet on <body>, print it as the student or instructor copy, then tidy up.
export function printSheet(c, built, mode) {
  document.querySelectorAll('.print-sheet').forEach((el) => el.remove());
  const sheet = buildPrintSheet(c, built);
  document.body.appendChild(sheet);
  document.body.dataset.print = mode;
  const prevTitle = document.title;
  document.title = `${caseTitle(c)} – ${mode === 'instructor' ? 'instructor' : 'student'} sheet`; // default PDF file name
  const done = () => {
    delete document.body.dataset.print;
    document.title = prevTitle;
    sheet.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
