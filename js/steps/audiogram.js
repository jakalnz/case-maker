// Audiogram step: the single source of truth for thresholds, plus the PTA and
// play simulator settings that are derived from it.
import { h, section, labelled, simInput, stepHead, legend, resetOverrides } from '../ui.js';
import { FREQS, BC_FREQS, EARS, earThresholds, avg, clamp, r5 } from '../model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  kids.forEach((k) => el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
  return el;
};

const MODES = [
  { ear: 'right', kind: 'ac', label: 'Right AC  O', cls: 'r' },
  { ear: 'left', kind: 'ac', label: 'Left AC  X', cls: 'l' },
  { ear: 'right', kind: 'bc', label: 'Right BC  <', cls: 'r' },
  { ear: 'left', kind: 'bc', label: 'Left BC  >', cls: 'l' },
];

const PRESETS = {
  normal: { label: 'Normal', ac: () => 10, bc: () => 10 },
  conductive: { label: 'Flat conductive (40 dB gap)', ac: () => 45, bc: () => 5 },
  sloping: { label: 'Sloping SNHL', ac: (f) => r5(15 + Math.max(0, Math.log2(f / 500)) * 17), bc: null },
  notch: { label: 'Noise notch (4 kHz)', ac: (f) => ({ 3000: 40, 4000: 55, 6000: 45 }[f] ?? (f >= 8000 ? 30 : 15)), bc: null },
  severe: { label: 'Severe–profound', ac: (f) => r5(75 + Math.log2(f / 250) * 6), bc: null },
  clear: { label: 'Clear', ac: () => null, bc: () => null },
};

let mode = 0;
let tab = null;

// ─── audiogram chart ───────────────────────────────────────────────────────

const W = 460;
const H = 400;
const M = { l: 42, r: 16, t: 30, b: 16 };
const xOf = (f) => M.l + (Math.log2(f / 250) / 5) * (W - M.l - M.r);
const yOf = (db) => M.t + ((db + 10) / 130) * (H - M.t - M.b);

function symbol(ear, kind, x, y) {
  const color = `var(--${ear})`;
  if (kind === 'ac' && ear === 'right') return s('circle', { cx: x, cy: y, r: 6, fill: 'none', stroke: color, 'stroke-width': 2 });
  if (kind === 'ac') return s('path', { d: `M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}`, stroke: color, 'stroke-width': 2 });
  // BC symbols sit beside the frequency line so they don't hide under AC symbols.
  const d = ear === 'right' ? `M${x - 9} ${y - 6}L${x - 15} ${y}L${x - 9} ${y + 6}` : `M${x + 9} ${y - 6}L${x + 15} ${y}L${x + 9} ${y + 6}`;
  return s('path', { d, stroke: color, 'stroke-width': 2, fill: 'none' });
}

// Read-only audiogram chart (also used on the printed case sheet).
export function audiogramSvg(c, label = 'Audiogram') {
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'aud-svg', role: 'img', 'aria-label': label });
  for (let db = -10; db <= 120; db += 10) {
    svg.appendChild(s('line', { x1: M.l, x2: W - M.r, y1: yOf(db), y2: yOf(db), class: 'gridline' + (db === 0 ? ' major' : '') }));
    svg.appendChild(s('text', { x: M.l - 6, y: yOf(db) + 3, 'text-anchor': 'end' }, String(db)));
  }
  FREQS.forEach((f) => {
    const octave = [250, 500, 1000, 2000, 4000, 8000].includes(f);
    svg.appendChild(s('line', { x1: xOf(f), x2: xOf(f), y1: M.t, y2: H - M.b, class: 'gridline' + (octave ? ' major' : ''), 'stroke-dasharray': octave ? '' : '3 3' }));
    if (octave || f === 750 || f === 1500 || f === 3000 || f === 6000) {
      svg.appendChild(s('text', { x: xOf(f), y: M.t - 10, 'text-anchor': 'middle' }, f >= 1000 ? `${f / 1000}k` : String(f)));
    }
  });
  EARS.forEach((ear) => {
    const pts = FREQS.filter((f) => c.audiogram[ear].ac[f] != null).map((f) => `${xOf(f)},${yOf(c.audiogram[ear].ac[f])}`);
    if (pts.length > 1) svg.appendChild(s('polyline', { points: pts.join(' '), fill: 'none', stroke: `var(--${ear})`, 'stroke-width': 1.5, opacity: 0.7 }));
    ['ac', 'bc'].forEach((kind) => Object.entries(c.audiogram[ear][kind]).forEach(([f, v]) => {
      if (v != null) svg.appendChild(symbol(ear, kind, xOf(+f), yOf(v)));
    }));
  });
  return svg;
}

function chart(app) {
  const { c } = app;
  const svg = audiogramSvg(c, 'Audiogram. Click to set a threshold for the selected ear and mode.');
  svg.addEventListener('click', (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const m = MODES[mode];
    const freqs = m.kind === 'bc' ? BC_FREQS : FREQS;
    const f = freqs.reduce((best, fr) => (Math.abs(xOf(fr) - p.x) < Math.abs(xOf(best) - p.x) ? fr : best), freqs[0]);
    const db = clamp(r5(((p.y - M.t) / (H - M.t - M.b)) * 130 - 10), -10, 120);
    const row = c.audiogram[m.ear][m.kind];
    row[f] = row[f] === db ? null : db;
    app.refresh();
  });
  return svg;
}

// ─── threshold grid ────────────────────────────────────────────────────────

function thresholdTable(app) {
  const { c } = app;
  return h('div.table-wrap', h('table.data',
    h('tr', h('th'), FREQS.map((f) => h('th', f >= 1000 ? `${f / 1000}k` : f))),
    MODES.map((m, i) => h('tr',
      h('th.row-h', { class: m.cls }, m.label.replace(/\s+\S+$/, '')),
      FREQS.map((f) => h('td', (m.kind === 'bc' && !BC_FREQS.includes(f)) ? h('span.muted', '–') : h('input', {
        type: 'number', step: 5, min: -10, max: 120, value: c.audiogram[m.ear][m.kind][f] ?? '',
        'aria-label': `${m.label} ${f} Hz`,
        onfocus: () => { mode = i; },
        onchange: (e) => {
          const v = e.target.value === '' ? null : clamp(r5(Number(e.target.value)), -10, 120);
          c.audiogram[m.ear][m.kind][f] = v;
          app.refresh();
        },
      })))))));
}

function summary(c) {
  const rows = EARS.map((ear) => {
    const t = earThresholds(c, ear);
    const ac = avg(t.ac, [500, 1000, 2000]);
    const gap = avg(t.gap, [500, 1000, 2000]);
    const coch = avg(t.cochlear, [500, 1000, 2000]);
    let type = 'Normal';
    if (ac > 20) type = gap >= 15 ? (coch > 20 ? 'Mixed' : 'Conductive') : 'Sensorineural';
    return h('div', h('b', { class: ear === 'right' ? 'r' : 'l' }, ear === 'right' ? 'Right: ' : 'Left: '),
      `PTA (0.5–2k) ${Math.round(ac)} dB HL, mean air–bone gap ${Math.round(gap)} dB – ${type}`);
  });
  return h('div.hint', { style: { marginTop: '8px', fontSize: '13px' } }, rows);
}

function presets(app) {
  const sel = h('select', Object.entries(PRESETS).map(([k, p]) => h('option', { value: k }, p.label)));
  const apply = (ears) => {
    const p = PRESETS[sel.value];
    ears.forEach((ear) => {
      FREQS.forEach((f) => { app.c.audiogram[ear].ac[f] = p.ac(f); });
      BC_FREQS.forEach((f) => { app.c.audiogram[ear].bc[f] = p.bc ? p.bc(f) : p.ac(f); });
    });
    app.refresh();
  };
  return h('div.inline', h('span.hint', 'Quick fill:'), h('span', { style: { width: '220px' } }, sel),
    h('button.btn.small', { type: 'button', onclick: () => apply(['right']) }, 'Right'),
    h('button.btn.small', { type: 'button', onclick: () => apply(['left']) }, 'Left'),
    h('button.btn.small', { type: 'button', onclick: () => apply(['right', 'left']) }, 'Both'));
}

// ─── PTA and play settings ─────────────────────────────────────────────────

function ptaPanel(app) {
  const ctx = { c: app.c, key: 'pta', refresh: () => app.refresh() };
  const row = (label, path, cls) => h('tr', h('th.row-h', { class: cls }, label),
    FREQS.map((f) => h('td', simInput(ctx, `${path}.${f}`, { step: 5 }))));
  return h('div',
    h('div.grid',
      simInput(ctx, 'transducer', { label: 'Transducer', options: [['headphone', 'Headphones'], ['insertphone', 'Insert earphones']] }),
      simInput(ctx, 'toggleDirection', { label: 'Level control', options: [['up-louder', 'Up = louder'], ['up-quieter', 'Up = quieter']] }),
      labelled('Exam mode', h('label.check', simInput(ctx, 'locked', { type: 'checkbox' }), ' Hide thresholds and lock Edit Thresholds'))),
    h('details', { style: { marginTop: '12px' } },
      h('summary', 'Per-frequency patient model (advanced)'),
      h('p.hint', 'Cochlear = true bone-conduction threshold; conductive = air–bone gap added to air conduction. Interaural attenuation controls cross-hearing.'),
      legend(),
      h('div.table-wrap', h('table.data',
        h('tr', h('th'), FREQS.map((f) => h('th', f >= 1000 ? `${f / 1000}k` : f))),
        row('R cochlear', 'patient.right.cochlear', 'r'),
        row('R conductive', 'patient.right.ipsiConductive', 'r'),
        row('L cochlear', 'patient.left.cochlear', 'l'),
        row('L conductive', 'patient.left.ipsiConductive', 'l'),
        row('R asc/desc diff', 'patient.right.ascDescDiff', 'r'),
        row('R psych. width', 'patient.right.psychWidth', 'r'),
        row('L asc/desc diff', 'patient.left.ascDescDiff', 'l'),
        row('L psych. width', 'patient.left.psychWidth', 'l'),
        row('IA headphones', 'patient.crossIAA.headphone'),
        row('IA inserts', 'patient.crossIAA.insertphone'))),
      h('button.btn.small', { type: 'button', style: { marginTop: '8px' }, onclick: () => { resetOverrides(app.c, 'pta', 'patient'); app.refresh(); } }, 'Reset model to audiogram')));
}

function playPanel(app) {
  const ctx = { c: app.c, key: 'play', refresh: () => app.refresh() };
  const games = ['cars', 'horses', 'marbles'];
  const freqs = [500, 1000, 2000, 4000];
  return h('div',
    h('div.grid',
      h('div.field.wide', simInput(ctx, 'vignette', { type: 'text', label: 'Vignette (one line shown on the case card)', keepOverride: true })),
      simInput(ctx, 'startingPhase', { label: 'Starting phase', options: [['conditioning', 'Conditioning'], ['testing', 'Testing']] }),
      simInput(ctx, 'responseBudget', { label: 'Response budget', min: 20, max: 400, step: 10, hint: 'Responses before the child is done (80–180 typical).' }),
      simInput(ctx, 'startingFatigue', { label: 'Starting fatigue (0–100)', min: 0, max: 100, step: 5 }),
      simInput(ctx, 'engagementDecayRate', { label: 'Engagement decay (×)', min: 0.1, max: 3, step: 0.1 }),
      simInput(ctx, 'falsePositiveSusceptibility', { label: 'False-positive tendency (×)', min: 0.1, max: 3, step: 0.1 }),
      simInput(ctx, 'videoSet', { label: 'Real-child video', options: [['', 'None (animated)'], ['benji', 'Benji']], parse: (v) => v || null }),
      labelled('Exam mode', h('label.check', simInput(ctx, 'locked', { type: 'checkbox' }), ' Hide the answer key in the link'))),
    h('h4', 'Games'),
    h('div.table-wrap', h('table.data',
      h('tr', h('th'), h('th', 'Conditioning gain (0–2)'), h('th', 'Starting conditioning (0–100)')),
      games.map((g) => h('tr', h('th.row-h', g[0].toUpperCase() + g.slice(1)),
        h('td', simInput(ctx, `games.${g}.conditioningGainRate`, { min: 0, max: 2, step: 0.1 })),
        h('td', simInput(ctx, `games.${g}.startingConditioning`, { min: 0, max: 100, step: 5 })))))),
    h('details', { style: { marginTop: '12px' } },
      h('summary', 'Answer key (from the audiogram)'),
      legend(),
      h('div.table-wrap', h('table.data',
        h('tr', h('th'), freqs.map((f) => h('th', f >= 1000 ? `${f / 1000}k` : f))),
        EARS.flatMap((ear) => [
          h('tr', h('th.row-h', { class: ear[0] }, `${ear === 'right' ? 'R' : 'L'} true (BC)`), freqs.map((f) => h('td', simInput(ctx, `trueThreshold.${ear}.${f}`, { step: 5 })))),
          h('tr', h('th.row-h', { class: ear[0] }, `${ear === 'right' ? 'R' : 'L'} conductive gap`), freqs.map((f) => h('td', simInput(ctx, `conductiveLoss.${ear}.${f}`, { step: 5 })))),
        ])))));
}

export function render(app) {
  const { c } = app;
  const inc = c.meta.include;
  if (!tab) tab = inc.pta || !inc.play ? 'pta' : 'play';
  return h('div',
    stepHead(app, 'Pure-tone / play audiometry', 'Enter the audiogram once. It sets the thresholds for PTA, play, speech, immittance, DPOAE and ABR; you can still edit each one.', ['pta', 'play']),
    section('Audiogram',
      h('div.aud-wrap',
        h('div', chart(app)),
        h('div',
          h('div.mode-btns', MODES.map((m, i) => h('button.btn.small', { type: 'button', class: [m.cls, i === mode ? 'on' : ''].join(' '),
            onclick: () => { mode = i; app.refresh(); } }, m.label))),
          h('p.hint', { style: { margin: '0 0 8px' } }, 'Click the chart to place a threshold for the selected ear and mode; click it again to remove it. BC isn’t tested at 6 and 8 kHz; missing frequencies are interpolated.'),
          presets(app),
          summary(c))),
      h('div', { style: { marginTop: '12px' } }, thresholdTable(app))),
    section('Simulator settings',
      h('div.tabs',
        h('button.tab', { type: 'button', class: tab === 'pta' ? 'on' : '', onclick: () => { tab = 'pta'; app.refresh(); } }, `PTA simulator${inc.pta ? '' : ' (not included)'}`),
        h('button.tab', { type: 'button', class: tab === 'play' ? 'on' : '', onclick: () => { tab = 'play'; app.refresh(); } }, `Play simulator${inc.play ? '' : ' (not included)'}`)),
      tab === 'pta' ? ptaPanel(app) : playPanel(app)),
  );
}
