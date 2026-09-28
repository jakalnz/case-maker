import { h, section, labelled, bound, stepHead, toast } from '../ui.js';
import { SIMS } from '../config.js';
import { audiogramIsEmpty } from '../model.js';
import { adultExample, childExample } from '../examples.js';
import { extractCase, getToken, setToken, getModel, setModel, MODELS, MAX_BYTES, AiError } from '../ai.js';
import { SECTIONS, describe, applyExtraction } from '../apply-extraction.js';

// Files and results live only in memory: documents are never saved with the case.
const ai = { files: [], anonymised: false, invent: true, busy: false, error: '', result: null, picked: new Set(), meta: null };

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/gif,image/webp';
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

function autofill(app) {
  const { c } = app;
  const addFiles = (list) => {
    for (const f of list) {
      if (!ACCEPT.split(',').includes(f.type)) { toast(`${f.name}: only PDF or image files`); continue; }
      if (!ai.files.some((g) => g.name === f.name && g.size === f.size)) ai.files.push(f);
    }
    ai.anonymised = false;
    app.refresh();
  };
  const input = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true, onchange: (e) => addFiles(e.target.files) });
  const total = ai.files.reduce((n, f) => n + f.size, 0);
  const needsConfirm = ai.files.length > 0;
  const canRun = !ai.busy && (c.sources.guidance.trim() || ai.files.length) && (!needsConfirm || ai.anonymised) && getToken();

  const run = async () => {
    ai.busy = true; ai.error = ''; ai.result = null;
    app.refresh();
    try {
      const { result, usage, model } = await extractCase({ guidance: c.sources.guidance, files: ai.files, invent: ai.invent });
      ai.result = result;
      ai.meta = { usage, model };
      const found = describe(result);
      ai.picked = new Set(SECTIONS.map(([k]) => k).filter((k) => found[k]));
      c.sources.files = ai.files.map((f) => f.name);
    } catch (e) {
      ai.error = e instanceof AiError ? e.message : `Something went wrong: ${e.message}`;
    }
    ai.busy = false;
    app.refresh();
  };

  const drop = h('div.dropzone', {
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    ondragleave: (e) => e.currentTarget.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); },
  },
  input,
  h('div', 'Drop anonymised PDFs or images here (referral letters, audiograms, reports), or ',
    h('button.btn.small', { type: 'button', onclick: () => input.click() }, 'choose files')),
  h('div.hint', `Up to ${mb(MAX_BYTES)} in total. Files are sent to Claude for this request only and are not saved with the case.`));

  return section('Auto-fill with Claude',
    h('p.hint', { style: { marginTop: 0 } }, 'Claude reads your guidance and any documents, then drafts the history and test results for you to review before anything is changed.'),
    drop,
    ai.files.length ? h('ul.file-list', ai.files.map((f, i) => h('li', `📄 ${f.name} `, h('span.muted', mb(f.size)),
      h('button.btn.small.ghost', { type: 'button', title: 'Remove', onclick: () => { ai.files.splice(i, 1); app.refresh(); } }, '✕')))) : null,
    total > MAX_BYTES ? h('div.warn', `Too large: ${mb(total)} of ${mb(MAX_BYTES)}.`) : null,
    needsConfirm ? h('label.check.confirm', h('input', { type: 'checkbox', checked: ai.anonymised, onchange: (e) => { ai.anonymised = e.target.checked; app.refresh(); } }),
      ' I confirm these documents are anonymised: no names, NHI numbers, dates of birth, addresses or other identifying details.') : null,
    h('label.check', { style: { marginTop: '8px' } }, h('input', { type: 'checkbox', checked: ai.invent, onchange: (e) => { ai.invent = e.target.checked; app.refresh(); } }),
      ' Invent plausible history details where the documents are silent (test results are never invented)'),
    h('div.grid', { style: { marginTop: '12px' } },
      labelled('Simulator access code', h('input', { type: 'password', autocomplete: 'off', value: getToken(), placeholder: 'Same code as the history simulator',
        onchange: (e) => { setToken(e.target.value.trim()); app.refresh(); } }), 'Kept for this browser tab only.'),
      labelled('Model', h('select', { onchange: (e) => setModel(e.target.value) },
        MODELS.map(([v, l]) => h('option', { value: v, selected: v === getModel() }, l))))),
    h('div.inline', { style: { marginTop: '12px' } },
      h('button.btn.primary', { type: 'button', disabled: !canRun, onclick: run }, ai.busy ? 'Reading…' : '✨ Auto-fill with Claude'),
      ai.busy ? h('span.hint', 'This can take a minute for scanned documents.') : null,
      !getToken() ? h('span.hint', 'Enter the access code to enable.') : null),
    ai.error ? h('div.warn', { style: { marginTop: '10px' } }, ai.error) : null,
    ai.result ? review(app) : null);
}

function review(app) {
  const x = ai.result;
  const found = describe(x);
  const ids = x.possibleIdentifiers || [];
  return h('div.review',
    h('h4', 'Review the draft'),
    ids.length ? h('div.warn', h('b', 'Possible identifying details were found in the documents. '),
      'They were not copied into the case, but check the originals are properly anonymised before using them again:',
      h('ul', ids.map((t) => h('li', t)))) : null,
    h('p.hint', 'Choose what to bring into the case. This replaces the current history and any matching test results; thresholds not in the documents stay as they are.'),
    h('div.review-list', SECTIONS.map(([k, label]) => h('label.check.review-item', { class: found[k] ? '' : 'muted' },
      h('input', { type: 'checkbox', disabled: !found[k], checked: ai.picked.has(k), onchange: (e) => { if (e.target.checked) ai.picked.add(k); else ai.picked.delete(k); } }),
      h('span', h('b', label), ': ', found[k] || 'nothing found')))),
    x.provenance.invented.length ? h('details', h('summary', `Invented by Claude (${x.provenance.invented.length})`), h('ul', x.provenance.invented.map((t) => h('li', t)))) : null,
    x.provenance.fromDocuments.length ? h('details', h('summary', `Taken from the documents (${x.provenance.fromDocuments.length})`), h('ul', x.provenance.fromDocuments.map((t) => h('li', t)))) : null,
    x.provenance.notes ? h('p.hint', h('b', 'Notes: '), x.provenance.notes) : null,
    h('div.inline', { style: { marginTop: '10px' } },
      h('button.btn.primary', { type: 'button', onclick: () => {
        applyExtraction(app.c, x, [...ai.picked]);
        ai.result = null;
        toast('Draft applied – review each step');
        app.refresh();
      } }, 'Apply selected'),
      h('button.btn', { type: 'button', onclick: () => { ai.result = null; app.refresh(); } }, 'Discard'),
      ai.meta?.usage ? h('span.hint', `${ai.meta.model} · ${ai.meta.usage.input_tokens + (ai.meta.usage.cache_read_input_tokens || 0)} in / ${ai.meta.usage.output_tokens} out tokens`) : null));
}

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

    section('Guidance',
      labelled('What should this case teach?', bound(c.sources, 'guidance', { type: 'textarea', rows: 4,
        placeholder: 'e.g. 67-year-old retired printer, noise exposure, sudden left loss 40 years ago with vertigo, now struggling in groups. Moderate difficulty.' }, () => app.refresh()),
      'Used by Auto-fill below, or just as your own notes.')),

    autofill(app),

    isBlank ? section('Or start from an example',
      h('div.inline',
        h('button.btn', { type: 'button', onclick: () => app.load(adultExample()) }, 'Adult: sudden left loss + noise'),
        h('button.btn', { type: 'button', onclick: () => app.load(childExample()) }, 'Child, 4: glue ear (play audiometry)'))) : null,
  );
}
