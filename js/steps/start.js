import { h, section, labelled, bound, stepHead } from '../ui.js';
import { SIMS } from '../config.js';
import { audiogramIsEmpty } from '../model.js';
import { adultExample, childExample } from '../examples.js';

export function render(app) {
  const { c } = app;
  const save = () => app.save();

  const isBlank = !c.meta.title && !c.history.patient.name && audiogramIsEmpty(c);

  return h('div',
    stepHead(app, 'Start a case', 'Describe the case, choose which simulators it uses, then work through the steps in clinical order.'),

    section('Case',
      h('div.grid.two',
        labelled('Case title', bound(c.meta, 'title', { placeholder: 'e.g. Sudden left SNHL, 67-year-old' }, () => app.refresh()),
          'Shown in every simulator as the patient/case name.'),
        labelled('Instructor notes', bound(c.meta, 'notes', { type: 'textarea', rows: 2, placeholder: 'Learning goals, answer key notes… (not sent to students)' }, save)))),

    section('Simulators in this case',
      h('p.hint', { style: { marginTop: 0 } }, 'Typical adult case: PTA. Young child: play audiometry instead of (or as well as) PTA.'),
      h('div.checks', SIMS.map((s) => h('label.check',
        h('input', { type: 'checkbox', checked: c.meta.include[s.key], onchange: (e) => { c.meta.include[s.key] = e.target.checked; app.refresh(); } }),
        ' ', s.label)))),

    section('Guidance and source documents',
      labelled('Guidance for the case', bound(c.sources, 'guidance', { type: 'textarea', rows: 4,
        placeholder: 'e.g. 67-year-old retired printer, noise exposure, sudden left loss 40 years ago with vertigo, now struggling in groups. Mild–moderate high-frequency SNHL on the right.' }, save),
        'Used by “Auto-fill with Claude”. You can also just use it as your own notes.'),
      h('div.dropzone', { style: { marginTop: '12px' } },
        h('div', 'Anonymised PDF upload and “Auto-fill with Claude” are coming in the next stage.'),
        h('div.hint', 'For now, enter the case by hand in each step.'))),

    isBlank ? section('Or start from an example',
      h('div.inline',
        h('button.btn', { type: 'button', onclick: () => app.load(adultExample()) }, 'Adult: sudden left loss + noise'),
        h('button.btn', { type: 'button', onclick: () => app.load(childExample()) }, 'Child, 4: glue ear (play audiometry)'))) : null,
  );
}
