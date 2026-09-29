// Output: the case sheet in clinical order, with links, files and an answer key.
import { h, section, stepHead, copyText, download } from '../ui.js';
import { SIMS, getLinkTarget, setLinkTarget } from '../config.js';
import { buildAll } from '../encoders/index.js';
import { caseTitle, slugify, resolve, EARS, FREQS, earThresholds, DPOAE_PROTOCOLS } from '../model.js';
import { printSheet } from '../print-sheet.js';

const LINK_LIMIT = 255;

function row(n, sim, r) {
  const hasUrl = !!r.url;
  return h('div.out-row',
    h('span.n', n),
    h('div', h('div.name', sim.label),
      hasUrl ? h('span.pill', { class: r.url.length > LINK_LIMIT ? 'long' : '', title: 'Word hyperlinks and some LMS fields break above 255 characters' },
        `${r.url.length} chars`) : null),
    h('div',
      hasUrl ? h('div.url', r.url) : null,
      r.note ? h('div.note', r.note) : null,
      (r.warnings || []).map((w) => h('div.warn', w))),
    h('div.acts',
      (r.files || []).map((f) => h('button.btn.small' + (r.primary === 'file' ? '.primary' : ''), { type: 'button', onclick: () => download(f.name, f.content) }, '⬇ ', f.name)),
      hasUrl ? h('button.btn.small' + (r.primary === 'file' ? '' : '.primary'), { type: 'button', onclick: () => copyText(r.url, 'Link copied') }, 'Copy link') : null,
      hasUrl ? h('a.btn.small', { href: r.url, target: '_blank', rel: 'noopener' }, 'Open ↗') : null));
}

function answerKey(c) {
  const inc = c.meta.include;
  const f = (x) => (x >= 1000 ? `${x / 1000}k` : String(x));
  const th = Object.fromEntries(EARS.map((e) => [e, earThresholds(c, e)]));
  const parts = [];
  parts.push(h('h4', 'Audiogram (as entered; interpolated values in grey)'),
    h('div.table-wrap', h('table.data',
      h('tr', h('th'), FREQS.map((x) => h('th', f(x)))),
      EARS.flatMap((e) => ['ac', 'bc'].map((k) => h('tr', h('th.row-h', { class: e[0] }, `${e === 'right' ? 'R' : 'L'} ${k.toUpperCase()}`),
        FREQS.map((x) => {
          const v = c.audiogram[e][k][x];
          if (v != null) return h('td', v);
          if (k === 'bc' && x > 4000) return h('td.muted', '–');
          return h('td.muted', Math.round(k === 'ac' ? th[e].ac[x] : th[e].cochlear[x]));
        })))))));
  if (inc.immittance) {
    const im = resolve(c, 'immittance');
    parts.push(h('h4', 'Immittance'), h('div', EARS.map((e) => {
      const x = im.ears[e];
      const rf = (side) => [500, 1000, 2000].map((q) => x.reflexes[side][q] ?? 'NR').join(' / ');
      return h('div', h('b', { class: e[0] }, `${e === 'right' ? 'Right' : 'Left'}: `),
        `Type ${x.tympType}, ${x.peakAdmittance} mmho at ${x.TPP} daPa, ECV ${x.ECV} mL · ipsi ${rf('ipsi')} · contra ${rf('contra')} (0.5/1/2k)`);
    })));
  }
  if (inc.speech) {
    const sp = resolve(c, 'speech');
    parts.push(h('h4', 'Speech'), h('div', [['right', sp.rightEar], ['left', sp.leftEar]].map(([e, x]) =>
      h('div', h('b', { class: e[0] }, `${e === 'right' ? 'Right' : 'Left'}: `), `PI max ${x.piMax}%, ${x.score90}% at 90 dB HL; points ${x.dataPoints.map((d) => `${d.level} dB→${d.score}%`).join(', ')}`))));
  }
  if (inc.dpoae) {
    const dp = resolve(c, 'dpoae');
    const pts = DPOAE_PROTOCOLS[dp.protocol].points;
    parts.push(h('h4', `DPOAEs (${DPOAE_PROTOCOLS[dp.protocol].name})`), h('div', EARS.map((e) =>
      h('div', h('b', { class: e[0] }, `${e === 'right' ? 'Right' : 'Left'}: `),
        pts.map((x, i) => `${f(x)} ${dp.ears[e].points[i]?.present ? '✓' : '✗'}`).join('  ')))));
  }
  if (inc.abr) {
    const ab = resolve(c, 'abr');
    const path = ['none', 'retrocochlear', 'ANSD'];
    parts.push(h('h4', 'ABR'), h('div', ab.ears.map((x, i) =>
      h('div', h('b', { class: i ? 'l' : 'r' }, i ? 'Left: ' : 'Right: '), `AC ${x.ac.join('/')} · BC ${x.bc.join('/')} (0.5–4k) · pathology ${path[x.path]}`))));
  }
  return parts;
}

export function render(app) {
  const { c } = app;
  const target = getLinkTarget();
  const list = h('div', h('p.hint', 'Building links…'));
  const included = SIMS.filter((s) => c.meta.include[s.key]);
  let built = null;
  const printBtns = ['student', 'instructor'].map((mode) => h('button.btn.small', {
    type: 'button', disabled: true, title: mode === 'student' ? 'Steps and clickable links' : 'Steps, links and the answer key',
    // Printed sheets always carry the live links, even while testing against a local server.
    onclick: async () => printSheet(c, target === 'deployed' ? built : await buildAll(c, 'deployed'), mode),
  }, mode === 'student' ? '🖨 Student sheet' : '🖨 Instructor sheet'));

  buildAll(c, target).then((res) => {
    built = res;
    printBtns.forEach((b) => { b.disabled = false; });
    list.replaceChildren(...(included.length ? included.map((s, i) => row(i + 1, s, res[s.key])) : [h('p.hint', 'No simulators are included. Choose them on the Start step.')]));
  });

  const copyAll = () => {
    if (!built) return;
    const lines = [`${caseTitle(c)}`, ''];
    included.forEach((s, i) => {
      const r = built[s.key];
      if (s.key === 'history') lines.push(`${i + 1}. ${s.label}: import ${r.files[0].name} (${r.url})`);
      else lines.push(`${i + 1}. ${s.label}: ${r.url || '(no link yet)'}`);
    });
    copyText(lines.join('\n'), 'All links copied');
  };

  return h('div',
    stepHead(app, 'Links & files', 'Give students the steps in this order. Links carry the whole case, so nothing is stored on a server.'),
    section(h('span', 'Case sheet: ', caseTitle(c)),
      h('div.inline.no-print', { style: { marginBottom: '8px' } },
        h('label.check', 'Links point to ',
          h('select', { style: { width: 'auto' }, onchange: (e) => { setLinkTarget(e.target.value); app.refresh(); } },
            h('option', { value: 'deployed', selected: target === 'deployed' }, 'the live simulators (GitHub Pages)'),
            h('option', { value: 'local', selected: target === 'local' }, 'this server (local testing)'))),
        h('span.spacer'),
        h('button.btn.small', { type: 'button', onclick: copyAll }, 'Copy all links'),
        h('button.btn.small', { type: 'button', onclick: () => download(`${slugify(caseTitle(c))}.casemaker.json`, JSON.stringify(c, null, 2)) }, '⬇ Case-maker file'),
        printBtns),
      h('p.hint.no-print', 'Print sheets open your browser’s print dialog; choose “Save as PDF” to keep the links clickable.'),
      list),
    section('Instructor answer key', c.meta.notes ? h('p', c.meta.notes) : null, answerKey(c)),
  );
}
