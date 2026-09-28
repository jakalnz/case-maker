import { h, section, simInput, stepHead, legend, resetOverrides } from '../ui.js';
import { resolve, DPOAE_PROTOCOLS } from '../model.js';

export function render(app) {
  const ctx = { c: app.c, key: 'dpoae', refresh: () => app.refresh() };
  const p = resolve(app.c, 'dpoae');
  const f2s = DPOAE_PROTOCOLS[p.protocol].points;

  const ear = (e, label, cls) => section(h('span', { class: cls }, label),
    h('div.table-wrap', h('table.data',
      h('tr', h('th', 'f2 (Hz)'), h('th', 'Present'), h('th', 'Level (dB SPL)'), h('th', 'SNR (dB)'), h('th', 'Noise (dB SPL)')),
      f2s.map((f, i) => h('tr',
        h('th.row-h', f),
        h('td', simInput(ctx, `ears.${e}.points.${i}.present`, { type: 'checkbox' })),
        ['level', 'snr', 'noise'].map((k) => h('td', simInput(ctx, `ears.${e}.points.${i}.${k}`, { step: 0.5, nullable: true }))))))),
    h('button.btn.small', { type: 'button', style: { marginTop: '8px' }, onclick: () => { resetOverrides(app.c, 'dpoae', `ears.${e}`); app.refresh(); } }, `Reset ${e} ear to auto`));

  const protocolSel = simInput(ctx, 'protocol', { label: 'Protocol', options: Object.entries(DPOAE_PROTOCOLS).map(([k, v]) => [k, v.name]) });
  protocolSel.querySelector('select').addEventListener('change', () => { resetOverrides(app.c, 'dpoae', 'ears'); app.refresh(); });

  return h('div',
    stepHead(app, 'DPOAEs', 'Auto: present where air conduction is ≤ 30 dB HL with no air–bone gap. Leave level/SNR/noise blank to let the simulator generate realistic values.', ['dpoae']),
    section('Protocol',
      h('div.grid', protocolSel),
      h('p.hint', 'Changing the protocol changes the frequency grid, so per-point edits are cleared.')),
    legend(),
    h('div.grid.two', { style: { marginTop: '10px' } }, ear('right', 'Right ear', 'r'), ear('left', 'Left ear', 'l')),
  );
}
