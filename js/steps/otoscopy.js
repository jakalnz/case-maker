import { h, section, labelled, bound, stepHead, grid, toast } from '../ui.js';
import { caseTitle } from '../model.js';
import { simBase } from '../config.js';
import { loadLibrary, imageUrl, getPassword, setPassword, createCase, updateCase, uploadImage } from '../otoscopy-api.js';

const DIFFICULTY = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
const EARS = [['right', 'Right ear'], ['left', 'Left ear']];

// Library and UI state live in memory; only the chosen ids are saved with the case.
const st = { library: null, loading: false, error: '', filter: { right: '', left: '' }, bothEars: false,
  previews: {}, upload: { right: null, left: null }, tags: { right: '', left: '' }, busy: '', publishError: '' };

async function refreshLibrary(app) {
  st.loading = true; st.error = '';
  app.refresh();
  try { st.library = await loadLibrary(); } catch (e) { st.error = e.message; }
  st.loading = false;
  app.refresh();
}

const src = (img) => st.previews[img.id] || imageUrl(img);

function earColumn(app, ear, label) {
  const o = app.c.otoscopy;
  const key = ear === 'left' ? 'leftImageId' : 'rightImageId';
  const chosen = (st.library || []).find((i) => i.id === o[key]);
  const images = (st.library || []).filter((i) => st.bothEars || i.ear === ear);
  // Filter thumbnails in place so the search box keeps focus while typing.
  const applyFilter = (gridEl) => {
    const q = st.filter[ear].trim().toLowerCase().replace(/^#/, '');
    gridEl.querySelectorAll('.oto-thumb').forEach((b) => { b.hidden = !!q && !b.dataset.search.includes(q); });
  };

  const doUpload = async () => {
    const file = st.upload[ear];
    if (!file) return;
    st.busy = `upload-${ear}`; st.publishError = '';
    app.refresh();
    try {
      const img = await uploadImage({ ear, tags: st.tags[ear].split(',').map((t) => t.trim()).filter(Boolean), file });
      st.previews[img.id] = img.previewUrl;
      delete img.previewUrl;
      st.library = [...(st.library || []), img];
      o[key] = img.id;
      st.upload[ear] = null; st.tags[ear] = '';
      toast('Image added to the otoscopy library');
    } catch (e) {
      st.publishError = e.message;
    }
    st.busy = '';
    app.refresh();
  };

  return h('div.oto-ear',
    h('h4', { class: ear === 'right' ? 'r' : 'l' }, label),
    h('div.oto-chosen', chosen
      ? [h('img', { src: src(chosen), alt: `${label}: ${chosen.tags.join(', ') || chosen.id}` }), h('div.hint', chosen.tags.join(', ') || chosen.id)]
      : o[key] ? h('div.hint', `Image ${o[key]} (not in the library list yet)`) : h('div.hint', 'No image chosen')),
    h('input', { type: 'search', placeholder: 'Search tags, e.g. perforation', value: st.filter[ear],
      oninput: (e) => { st.filter[ear] = e.target.value; applyFilter(e.target.nextElementSibling); } }),
    (() => {
      const gridEl = h('div.oto-grid', images.length ? images.map((img) => h('button.oto-thumb', {
        type: 'button', class: img.id === o[key] ? 'on' : '', title: img.tags.join(', ') || img.id,
        'data-search': `${img.tags.join(' ')} ${img.id}`.toLowerCase(),
        onclick: () => { o[key] = img.id; app.refresh(); },
      }, h('img', { src: src(img), alt: img.tags.join(', ') || img.id, loading: 'lazy' }), h('span', img.tags.join(', ') || img.id)))
        : h('div.hint', st.library ? 'No images for this ear yet.' : ''));
      applyFilter(gridEl);
      return gridEl;
    })(),
    h('details.oto-upload', h('summary', 'Upload a new image'),
      h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: (e) => { st.upload[ear] = e.target.files[0] || null; } }),
      h('input', { type: 'text', placeholder: 'Tags, comma separated (e.g. normal, wax)', value: st.tags[ear], oninput: (e) => { st.tags[ear] = e.target.value; } }),
      h('button.btn.small', { type: 'button', disabled: !!st.busy || !getPassword(), onclick: doUpload }, st.busy === `upload-${ear}` ? 'Uploading…' : 'Upload to library'),
      h('div.hint', 'Shrunk to under 1 MB before upload. Adds a real image to the otoscopy repo for all supervisors; it appears on the live site after about a minute.')));
}

export function render(app) {
  const o = app.c.otoscopy;
  const save = () => app.save();
  const t = (path, label, opts = {}) => labelled(label, bound(o, path, opts, save), opts.hint);
  if (!st.library && !st.loading && !st.error) refreshLibrary(app);

  const title = o.title || caseTitle(app.c);
  const ready = o.leftImageId && o.rightImageId && title;
  const fields = () => ({ title, difficulty: o.difficulty, description: o.description, findings: o.findings, leftImageId: o.leftImageId, rightImageId: o.rightImageId });
  const publish = async () => {
    st.busy = 'publish'; st.publishError = '';
    app.refresh();
    try {
      const isNew = !o.caseId;
      const saved = isNew ? await createCase(fields()) : await updateCase(o.caseId, fields());
      o.caseId = saved.id;
      toast(isNew ? 'Otoscopy case created' : 'Otoscopy case saved');
    } catch (e) {
      st.publishError = e.message;
    }
    st.busy = '';
    app.refresh();
  };
  const link = o.caseId ? `${simBase('otoscopy')}index.html?case=${encodeURIComponent(o.caseId)}` : '';

  return h('div',
    stepHead(app, 'Otoscopy', 'The student views left and right ear images and can reveal the findings.', ['otoscopy']),
    section('Case text',
      grid(
        t('title', 'Title', { placeholder: caseTitle(app.c) }),
        t('difficulty', 'Difficulty', { options: DIFFICULTY }),
        h('div.field.wide', t('description', 'Description shown to the student', { type: 'textarea', rows: 3 })),
        h('div.field.wide', t('findings', 'Findings (revealed on request)', { type: 'textarea', rows: 3, hint: 'Leave empty to hide the Reveal button.' })))),

    section(h('span', 'Images'),
      h('div.inline', { style: { marginBottom: '10px' } },
        h('button.btn.small', { type: 'button', onclick: () => refreshLibrary(app) }, st.loading ? 'Loading…' : '↻ Refresh library'),
        h('label.check', h('input', { type: 'checkbox', checked: st.bothEars, onchange: (e) => { st.bothEars = e.target.checked; app.refresh(); } }), ' Show images from both ears'),
        st.library ? h('span.hint', `${st.library.length} images in the library`) : null),
      st.error ? h('div.warn', st.error) : null,
      h('div.oto-ears', EARS.map(([ear, label]) => earColumn(app, ear, label)))),

    section('Publish to the otoscopy simulator',
      h('div.grid',
        labelled('Otoscopy admin password', h('input', { type: 'password', autocomplete: 'off', value: getPassword(), placeholder: 'Same as the otoscopy admin page',
          onchange: (e) => { setPassword(e.target.value.trim()); app.refresh(); } }), 'Kept for this browser tab only.')),
      h('div.inline', { style: { marginTop: '10px' } },
        h('button.btn.primary', { type: 'button', disabled: !ready || !!st.busy || !getPassword(), onclick: publish },
          st.busy === 'publish' ? 'Saving…' : o.caseId ? 'Save changes to the otoscopy case' : 'Create otoscopy case'),
        !ready ? h('span.hint', 'Choose an image for each ear first.') : null),
      st.publishError ? h('div.warn', { style: { marginTop: '8px' } }, st.publishError) : null,
      o.caseId ? h('div', { style: { marginTop: '10px' } },
        h('div', 'Case ', h('code', o.caseId), ' · ', h('a', { href: link, target: '_blank', rel: 'noopener' }, 'Open ↗')),
        h('div.hint', 'New or changed cases take about a minute to appear on the live site.')) : null,
      h('p.hint', 'Creating or saving commits the case to the otoscopy repo, where other supervisors can see it.'),
      h('details', h('summary', 'Link an existing otoscopy case instead'),
        h('div.grid', t('caseId', 'Existing case id', { placeholder: 'e.g. case_gp_e0npwn', hint: 'The ?case= value from an otoscopy share link.' })))),
  );
}
