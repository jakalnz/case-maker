import { h, section, simInput, stepHead, legend, resetOverrides } from '../ui.js';
import { resolve, setOverride, TYMP_PRESETS } from '../model.js';

const TYPES = [['A', 'A – normal'], ['As', 'As – shallow (stiff)'], ['Ad', 'Ad – deep (flaccid)'], ['Ar', 'Ar'], ['B', 'B – flat'], ['C', 'C – negative pressure']];
const SHAPES = [['standard', 'Standard'], ['symmetric', 'Symmetric'], ['drifting', 'Drifting'], ['biphasic', 'Biphasic']];
const REFLEX = [['', 'Absent'], ...[70, 75, 80, 85, 90, 95, 100, 105, 110].map((v) => [String(v), `${v} dB`])];

const SVG_NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  kids.forEach((k) => el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
  return el;
};

// Sketch of the tympanogram: a peak of height peakAdmittance at TPP, width ~gradient.
function tymp(e, ear) {
  const W = 260, H = 150, M = { l: 30, r: 8, t: 8, b: 22 };
  const x = (p) => M.l + ((p + 400) / 600) * (W - M.l - M.r);
  const y = (v) => M.t + (1 - v / 2) * (H - M.t - M.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'aud-svg', style: 'cursor:default', role: 'img', 'aria-label': `${ear} tympanogram sketch` });
  [0, 0.5, 1, 1.5, 2].forEach((v) => {
    svg.appendChild(s('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'gridline' }));
    svg.appendChild(s('text', { x: M.l - 4, y: y(v) + 3, 'text-anchor': 'end' }, String(v)));
  });
  [-400, -200, 0, 200].forEach((p) => svg.appendChild(s('text', { x: x(p), y: H - 6, 'text-anchor': 'middle' }, String(p))));
  const width = Math.max(40, e.gradient || 0) * 0.9;
  const pts = [];
  for (let p = -400; p <= 200; p += 5) {
    const v = e.tympType === 'B' || !e.gradient ? e.peakAdmittance : e.peakAdmittance * Math.exp(-(((p - e.TPP) / width) ** 2));
    pts.push(`${x(p)},${y(Math.min(2, v))}`);
  }
  svg.appendChild(s('polyline', { points: pts.join(' '), fill: 'none', stroke: `var(--${ear})`, 'stroke-width': 2 }));
  return svg;
}

export function render(app) {
  const ctx = { c: app.c, key: 'immittance', refresh: () => app.refresh() };
  const p = resolve(app.c, 'immittance');
  const reflexCell = (path) => simInput(ctx, path, { options: REFLEX, parse: (v) => (v === '' ? null : Number(v)) });

  const ear = (e, label, cls) => {
    const base = `ears.${e}`;
    const typeSel = simInput(ctx, `${base}.tympType`, { label: 'Tympanogram type', options: TYPES });
    // Changing the type also moves the curve parameters to that type's typical values.
    typeSel.querySelector('select').addEventListener('change', (ev) => {
      const preset = TYMP_PRESETS[ev.target.value];
      if (preset) Object.entries(preset).forEach(([k, v]) => setOverride(app.c, 'immittance', `${base}.${k}`, v));
      app.refresh();
    });
    return section(h('span', { class: cls }, label),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 260px', gap: '14px' } },
        h('div.grid', { style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } },
          typeSel,
          simInput(ctx, `${base}.peakAdmittance`, { label: 'Peak admittance (mmho)', step: 0.01, min: 0, max: 5 }),
          simInput(ctx, `${base}.TPP`, { label: 'Peak pressure (daPa)', step: 5, min: -600, max: 300 }),
          simInput(ctx, `${base}.ECV`, { label: 'Ear canal volume (mL)', step: 0.05, min: 0, max: 5 }),
          simInput(ctx, `${base}.gradient`, { label: 'Width / gradient (daPa)', step: 5, min: 0, max: 400 }),
          simInput(ctx, `${base}.reflexShape`, { label: 'Reflex shape', options: SHAPES })),
        tymp(p.ears[e], e)),
      h('h4', `Acoustic reflexes – probe in the ${e} ear`),
      h('table.data',
        h('tr', h('th'), h('th', '500'), h('th', '1k'), h('th', '2k')),
        h('tr', h('th.row-h', 'Ipsi'), [500, 1000, 2000].map((f) => h('td', reflexCell(`${base}.reflexes.ipsi.${f}`)))),
        h('tr', h('th.row-h', `Contra (stimulus ${e === 'right' ? 'left' : 'right'})`), [500, 1000, 2000].map((f) => h('td', reflexCell(`${base}.reflexes.contra.${f}`))))),
      h('button.btn.small', { type: 'button', style: { marginTop: '8px' }, onclick: () => { resetOverrides(app.c, 'immittance', base); app.refresh(); } }, `Reset ${e} ear to auto`));
  };

  return h('div',
    stepHead(app, 'Immittance', 'Tympanometry and acoustic reflexes. Auto values follow the audiogram: an air–bone gap suggests As (adult) or B (child) and removes reflexes where the probe ear has a conductive loss.', ['immittance']),
    legend(),
    h('div', { style: { marginTop: '10px' } }, ear('right', 'Right ear', 'r'), ear('left', 'Left ear', 'l')),
    h('p.hint', 'Age (for adult vs child ear-canal volume) comes from the history step. The student chooses adult/child norms in the simulator.'),
  );
}
