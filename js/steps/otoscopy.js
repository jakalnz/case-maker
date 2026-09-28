import { h, section, labelled, bound, stepHead, grid } from '../ui.js';

const DIFFICULTY = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];

export function render(app) {
  const o = app.c.otoscopy;
  const save = () => app.save();
  const t = (path, label, opts = {}) => labelled(label, bound(o, path, opts, save), opts.hint);

  return h('div',
    stepHead(app, 'Otoscopy', 'The student views left and right ear images and can reveal the findings.', ['otoscopy']),
    section('Case text',
      grid(
        t('title', 'Title', { placeholder: app.c.meta.title || 'Case title' }),
        t('difficulty', 'Difficulty', { options: DIFFICULTY }),
        h('div.field.wide', t('description', 'Description shown to the student', { type: 'textarea', rows: 3 })),
        h('div.field.wide', t('findings', 'Findings (revealed on request)', { type: 'textarea', rows: 3,
          hint: 'Leave empty to hide the Reveal button.' })))),
    section('Images and case',
      h('div.callout', 'Choosing images from the otoscopy library, uploading new ones and creating the case are coming in a later stage. ',
        'For now, you can link an otoscopy case that already exists.'),
      h('div.grid', { style: { marginTop: '12px' } },
        t('caseId', 'Existing otoscopy case id', { placeholder: 'e.g. case_gp_e0npwn',
          hint: 'The ?case= value from the otoscopy admin page share link.' }))),
  );
}
