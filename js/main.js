// App shell: PIN gate, step rail, project storage (autosave + saved cases),
// theme. Each step module exports `render(app)` returning a DOM node.

import { blankCase, normaliseCase, caseTitle, slugify } from './model.js';
import { h, toast, download, overrideCount } from './ui.js';
import * as start from './steps/start.js';
import * as history from './steps/history.js';
import * as otoscopy from './steps/otoscopy.js';
import * as audiogram from './steps/audiogram.js';
import * as speech from './steps/speech.js';
import * as immittance from './steps/immittance.js';
import * as dpoae from './steps/dpoae.js';
import * as abr from './steps/abr.js';
import * as output from './steps/output.js';

const STEPS = [
  { id: 'start', label: 'Start', mod: start },
  { id: 'history', label: 'History', mod: history, sims: ['history'] },
  { id: 'otoscopy', label: 'Otoscopy', mod: otoscopy, sims: ['otoscopy'] },
  { id: 'audiogram', label: 'Pure-tone / play', mod: audiogram, sims: ['pta', 'play'] },
  { id: 'speech', label: 'Speech', mod: speech, sims: ['speech'] },
  { id: 'immittance', label: 'Immittance', mod: immittance, sims: ['immittance'] },
  { id: 'dpoae', label: 'DPOAEs', mod: dpoae, sims: ['dpoae'] },
  { id: 'abr', label: 'ABR', mod: abr, sims: ['abr'] },
  { id: 'output', label: 'Links & files', mod: output },
];

const CURRENT_KEY = 'casemaker-current';
const PROJECTS_KEY = 'casemaker-projects';
const GATE_KEY = 'casemaker-admin';
const THEME_KEY = 'casemaker-theme';
const PIN = '1234';

const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

const app = {
  c: null,
  step: 'start',
  // Re-render after an edit, keeping scroll position; saves too.
  refresh() { app.save(); const y = window.scrollY; renderAll(); window.scrollTo(0, y); },
  save() {
    app.c.updatedAt = new Date().toISOString();
    store.set(CURRENT_KEY, app.c);
    const all = store.get(PROJECTS_KEY, {});
    all[app.c.id] = app.c;
    if (!store.set(PROJECTS_KEY, all)) toast('Browser storage is full – download the case to keep it');
  },
  load(c) { app.c = normaliseCase(c); app.save(); app.go('start'); },
  newCase() { app.load(blankCase()); },
  steps: STEPS,
};
window.caseMaker = app; // handy for debugging in the console

// `history` is shadowed by the step import above, so use window.history for the URL.
app.go = (id) => {
  app.step = id;
  renderAll();
  window.scrollTo(0, 0);
  try { window.history.replaceState(null, '', '#' + id); } catch { /* ignore */ }
};

// ─── rendering ─────────────────────────────────────────────────────────────

const rail = document.getElementById('rail');
const panel = document.getElementById('panel');
const titleInput = document.getElementById('caseTitle');

function renderRail() {
  rail.replaceChildren(
    ...STEPS.map((s, i) => {
      const included = !s.sims || s.sims.some((k) => app.c.meta.include[k]);
      const ov = (s.sims || []).filter((k) => app.c.sims[k]).reduce((n, k) => n + overrideCount(app.c, k), 0);
      const node = h('button.rail-step', { type: 'button', class: [s.id === app.step ? 'active' : '', included ? '' : 'excluded'].join(' '),
        onclick: () => app.go(s.id), title: included ? '' : 'Not included in this case' },
      h('span.num', i + 1), s.label, ov ? h('span.badge', { title: `${ov} hand-edited value(s)` }, `✎${ov}`) : null);
      return i === STEPS.length - 1 ? [h('div.rail-sep'), node] : node;
    }).flat(),
    h('div.rail-foot', 'Clinical order: history → otoscopy → PTA/play → speech → immittance → DPOAE → ABR'),
  );
}

function renderAll() {
  if (!STEPS.find((s) => s.id === app.step)) app.step = 'start';
  titleInput.value = app.c.meta.title;
  renderRail();
  const idx = STEPS.findIndex((s) => s.id === app.step);
  const step = STEPS[idx];
  const body = step.mod.render(app);
  const nav = h('div.step-nav.no-print',
    idx > 0 ? h('button.btn', { type: 'button', onclick: () => app.go(STEPS[idx - 1].id) }, '← ', STEPS[idx - 1].label) : h('span'),
    idx < STEPS.length - 1 ? h('button.btn.primary', { type: 'button', onclick: () => app.go(STEPS[idx + 1].id) }, STEPS[idx + 1].label, ' →') : h('span'));
  panel.replaceChildren(body, nav);
  document.title = `${caseTitle(app.c)} · Case-maker`;
}

titleInput.addEventListener('change', () => { app.c.meta.title = titleInput.value.trim(); app.refresh(); });

// ─── cases menu ────────────────────────────────────────────────────────────

let menu = null;
function closeMenu() { if (menu) { menu.remove(); menu = null; } }

function openFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.schema !== 'casemaker/1') throw new Error('not a case-maker file (.casemaker.json)');
      data.id = data.id || crypto.randomUUID();
      app.load(data);
      toast(`Opened “${caseTitle(app.c)}”`);
    } catch (e) {
      toast('Could not open: ' + e.message, 4000);
    }
  } });
  input.click();
}

function renderMenu() {
  const all = Object.values(store.get(PROJECTS_KEY, {})).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  menu = h('div.menu', { role: 'dialog', 'aria-label': 'Cases' },
    h('div.menu-actions',
      h('button.btn.small.primary', { type: 'button', onclick: () => { closeMenu(); app.newCase(); } }, '+ New case'),
      h('button.btn.small', { type: 'button', onclick: () => { closeMenu(); openFile(); } }, 'Open file…'),
      h('button.btn.small', { type: 'button', onclick: () => {
        closeMenu();
        download(`${slugify(caseTitle(app.c))}.casemaker.json`, JSON.stringify(app.c, null, 2));
      } }, 'Download this case'),
      h('button.btn.small', { type: 'button', onclick: () => {
        closeMenu();
        const copy = JSON.parse(JSON.stringify(app.c));
        copy.id = crypto.randomUUID();
        copy.meta.title = (copy.meta.title || 'Case') + ' (copy)';
        copy.history.id = 'case-' + crypto.randomUUID().slice(0, 8);
        copy.otoscopy.caseId = '';
        app.load(copy);
      } }, 'Duplicate')),
    h('div.hint', { style: { padding: '2px 6px 6px' } }, 'Saved in this browser:'),
    all.length ? all.map((p) => h('div.proj', { class: p.id === app.c.id ? 'current' : '', onclick: () => { closeMenu(); app.load(p); } },
      h('div.grow', h('div', caseTitle(p)), h('div.meta', new Date(p.updatedAt).toLocaleString())),
      h('button.btn.small.ghost.danger', { type: 'button', title: 'Remove from this browser', onclick: (e) => {
        e.stopPropagation();
        const store2 = store.get(PROJECTS_KEY, {});
        delete store2[p.id];
        store.set(PROJECTS_KEY, store2);
        if (p.id === app.c.id) { closeMenu(); app.newCase(); } else { closeMenu(); renderMenu(); }
      } }, '✕'))) : h('div.hint', { style: { padding: '6px' } }, 'None yet.'));
  document.body.appendChild(menu);
}

document.getElementById('btnProjects').addEventListener('click', (e) => {
  e.stopPropagation();
  if (menu) closeMenu(); else renderMenu();
});
document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// ─── theme ─────────────────────────────────────────────────────────────────

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
applyTheme(store.get(THEME_KEY, null));
document.getElementById('btnTheme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  store.set(THEME_KEY, next);
  applyTheme(next);
});

// ─── start ─────────────────────────────────────────────────────────────────

function boot() {
  const saved = store.get(CURRENT_KEY, null);
  app.c = saved ? normaliseCase(saved) : blankCase();
  const hash = location.hash.slice(1);
  if (STEPS.find((s) => s.id === hash)) app.step = hash;
  renderAll();
}

const gate = document.getElementById('gate');
let unlocked = false;
try { unlocked = sessionStorage.getItem(GATE_KEY) === 'ok'; } catch { /* ignore */ }
if (unlocked) {
  boot();
} else {
  gate.hidden = false;
  document.getElementById('gatePin').focus();
  gate.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.getElementById('gatePin').value === PIN) {
      try { sessionStorage.setItem(GATE_KEY, 'ok'); } catch { /* ignore */ }
      gate.hidden = true;
      boot();
    } else {
      document.getElementById('gateMsg').textContent = 'Incorrect PIN.';
    }
  });
}
