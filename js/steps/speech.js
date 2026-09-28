import { h, section, simInput, stepHead, legend } from '../ui.js';
import { resolve, isOverridden, setOverride, clearOverride, clone } from '../model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  kids.forEach((k) => el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
  return el;
};

// Rough preview: the simulator fits a logistic curve through these points.
function preview(p) {
  const W = 420, H = 200, M = { l: 34, r: 10, t: 10, b: 24 };
  const x = (db) => M.l + ((db + 10) / 130) * (W - M.l - M.r);
  const y = (pc) => M.t + (1 - pc / 100) * (H - M.t - M.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'aud-svg', style: 'cursor:default', role: 'img', 'aria-label': 'Performance–intensity preview' });
  for (let pc = 0; pc <= 100; pc += 25) {
    svg.appendChild(s('line', { x1: M.l, x2: W - M.r, y1: y(pc), y2: y(pc), class: 'gridline' }));
    svg.appendChild(s('text', { x: M.l - 5, y: y(pc) + 3, 'text-anchor': 'end' }, `${pc}%`));
  }
  for (let db = 0; db <= 120; db += 20) {
    svg.appendChild(s('line', { x1: x(db), x2: x(db), y1: M.t, y2: H - M.b, class: 'gridline' }));
    svg.appendChild(s('text', { x: x(db), y: H - 8, 'text-anchor': 'middle' }, String(db)));
  }
  [['right', p.rightEar], ['left', p.leftEar]].forEach(([ear, e]) => {
    const pts = [...(e.bestAC != null ? [[e.bestAC, 0]] : []), ...e.dataPoints.map((d) => [d.level, d.score])].sort((a, b) => a[0] - b[0]);
    if (e.score90 != null) pts.push([Math.max(90, pts.length ? pts[pts.length - 1][0] : 90), e.score90]);
    svg.appendChild(s('polyline', { points: pts.map(([a, b]) => `${x(a)},${y(b)}`).join(' '), fill: 'none', stroke: `var(--${ear})`, 'stroke-width': 1.5, opacity: 0.6 }));
    e.dataPoints.forEach((d) => svg.appendChild(s('circle', { cx: x(d.level), cy: y(d.score), r: 4, fill: `var(--${ear})` })));
  });
  return svg;
}

function pointsTable(app, earKey) {
  const { c } = app;
  const path = `${earKey}.dataPoints`;
  const pts = resolve(c, 'speech')[earKey].dataPoints;
  const over = isOverridden(c, 'speech', path);
  const commit = (next) => { setOverride(c, 'speech', path, next); app.refresh(); };
  const cell = (i, k, attrs) => h('input', { type: 'number', value: pts[i][k], ...attrs, onchange: (e) => {
    const next = clone(pts);
    next[i][k] = Number(e.target.value);
    commit(next);
  } });
  return h('div',
    h('table.data', { class: over ? 'overridden' : '' },
      h('tr', h('th', 'Level (dB HL)'), h('th', 'Score (%)'), h('th')),
      pts.map((p, i) => h('tr',
        h('td', h('span.sim-input', { class: over ? 'overridden' : 'auto' }, cell(i, 'level', { step: 5, min: -10, max: 100 }))),
        h('td', h('span.sim-input', { class: over ? 'overridden' : 'auto' }, cell(i, 'score', { step: 1, min: 0, max: 100 }))),
        h('td', h('button.btn.small.ghost', { type: 'button', title: 'Remove point', onclick: () => commit(pts.filter((_, j) => j !== i)) }, '✕'))))),
    h('div.inline', { style: { marginTop: '6px' } },
      pts.length < 8 ? h('button.btn.small', { type: 'button', onclick: () => {
        const last = pts[pts.length - 1];
        commit([...clone(pts), { level: last ? Math.min(100, last.level + 10) : 40, score: last ? last.score : 50 }]);
      } }, '+ Add point') : null,
      over ? h('button.btn.small', { type: 'button', onclick: () => { clearOverride(c, 'speech', path); app.refresh(); } }, '↺ Back to auto') : h('span.hint', 'Auto: anchored at the ear’s PTA.')));
}

export function render(app) {
  const ctx = { c: app.c, key: 'speech', refresh: () => app.refresh() };
  const p = resolve(app.c, 'speech');
  const ear = (earKey, label, cls) => section(h('span', { class: cls }, label),
    h('div.grid',
      simInput(ctx, `${earKey}.bestAC`, { label: 'Best AC threshold (dB HL)', step: 5, nullable: true, hint: 'The curve is 0% below this level.' }),
      simInput(ctx, `${earKey}.bestBC`, { label: 'Best BC threshold (dB HL)', step: 5, hint: 'Used for cross-hearing when this is the non-test ear.' }),
      simInput(ctx, `${earKey}.largestABGap`, { label: 'Largest air–bone gap (dB)', step: 5, min: 0, max: 70, hint: 'Used when this is the non-test (masked) ear.' }),
      simInput(ctx, `${earKey}.piMax`, { label: 'PI max (%)', min: 0, max: 100 }),
      simInput(ctx, `${earKey}.score90`, { label: 'Score at 90 dB HL (%)', min: 0, max: 100, hint: 'Lower than PI max = rollover.' })),
    h('h4', 'Word-score data points'),
    pointsTable(app, earKey));

  return h('div',
    stepHead(app, 'Speech testing', 'Word recognition per ear. Values start from the audiogram; edit anything to shape the curve.', ['speech']),
    legend(),
    h('div.grid.two', { style: { marginTop: '10px' } }, ear('rightEar', 'Right ear', 'r'), ear('leftEar', 'Left ear', 'l')),
    section('Preview', preview(p), h('p.hint', 'Approximate: the simulator fits a smooth logistic curve through your points.')),
  );
}
