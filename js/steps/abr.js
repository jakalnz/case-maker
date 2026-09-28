import { h, section, simInput, stepHead, legend, resetOverrides } from '../ui.js';
import { resolve } from '../model.js';

const opt = (list) => list.map((l, i) => [String(i), l]);
const num = (v) => Number(v);
const NOISE = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1, 1.5, 2].map((v) => [String(v), `${Math.round(v * 100)}%`]);

export function render(app) {
  const ctx = { c: app.c, key: 'abr', refresh: () => app.refresh() };
  const p = resolve(app.c, 'abr');
  const freqs = ['500', '1k', '2k', '4k'];

  const ear = (i, label, cls) => section(h('span', { class: cls }, label),
    h('table.data',
      h('tr', h('th'), freqs.map((f) => h('th', f))),
      h('tr', h('th.row-h', 'AC (dB HL)'), [0, 1, 2, 3].map((k) => h('td', simInput(ctx, `ears.${i}.ac.${k}`, { step: 5, min: -5, max: 150 })))),
      h('tr', h('th.row-h', 'BC (dB HL)'), [0, 1, 2, 3].map((k) => h('td', simInput(ctx, `ears.${i}.bc.${k}`, { step: 5, min: -5, max: 150 }))))),
    h('div.grid', { style: { marginTop: '12px' } },
      simInput(ctx, `ears.${i}.path`, { label: 'Pathology', options: opt(['None (cochlear/conductive)', 'Retrocochlear', 'ANSD']), parse: num }),
      p.ears[i].path ? simInput(ctx, `ears.${i}.sev`, { label: 'Severity', options: opt(['Mild', 'Moderate', 'Severe', 'Marked / absent']), parse: num }) : null,
      simInput(ctx, `ears.${i}.cm`, { label: 'Cochlear microphonic', options: opt(['Absent', 'Small', 'Moderate', 'Large']), parse: num }),
      simInput(ctx, `ears.${i}.ring`, { label: 'CM type', options: opt(['Brief', 'Ringing']), parse: num }),
      simInput(ctx, `ears.${i}.morph`, { label: 'Click morphology', options: opt(['Standard', 'Separate IV and V', 'Fused IV/V', 'IV dominant', 'Large III / small V']), parse: num }),
      simInput(ctx, `ears.${i}.pam`, { label: 'PAM artefact', options: opt(['Off', 'Small', 'Large']), parse: num })),
    h('h4', 'Latencies at 80 dB nHL (ms, blank = auto)'),
    h('div.grid',
      ['latI', 'latIII', 'latV'].map((k) => simInput(ctx, `ears.${i}.${k}`, { label: `Wave ${k.slice(3)}`, step: 0.05, min: 0, max: 12.75, nullable: true }))),
    h('button.btn.small', { type: 'button', style: { marginTop: '8px' }, onclick: () => { resetOverrides(app.c, 'abr', `ears.${i}`); app.refresh(); } }, 'Reset ear to auto'));

  return h('div',
    stepHead(app, 'ABR', 'Thresholds at 0.5–4 kHz come from the audiogram. Age comes from the history (under 6 years = child).', ['abr']),
    section('Patient state',
      h('div.grid',
        simInput(ctx, 'adult', { label: 'Adult', type: 'checkbox' }),
        p.adult ? null : simInput(ctx, 'ageMonths', { label: 'Age (months after term, 0–63)', min: 0, max: 63, step: 1 }),
        simInput(ctx, 'noisy', { label: 'State', options: [['false', 'Asleep / settled'], ['true', 'Awake / restless']], parse: (v) => v === 'true' }),
        simInput(ctx, 'noise', { label: 'EEG noise', options: NOISE, parse: num }),
        simInput(ctx, 'electrodes', { label: 'Electrodes at start', options: opt(['On, as found', 'Difficult skin', 'Not attached', 'Ready (1.0 kΩ)']), parse: num }))),
    legend(),
    h('div.grid.two', { style: { marginTop: '10px' } }, ear(0, 'Right ear', 'r'), ear(1, 'Left ear', 'l')),
  );
}
