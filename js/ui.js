// Small DOM helpers shared by the step modules.

import { getPath, setPath, resolve, derive, isOverridden, setOverride, clearOverride, clone } from './model.js';

// h('div.card#id', {attrs/on*}, ...children)
export function h(tag, attrs, ...children) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(name || 'div');
  (rest.match(/[.#][^.#]+/g) || []).forEach((t) => {
    if (t[0] === '.') el.classList.add(t.slice(1));
    else el.id = t.slice(1);
  });
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' || (k in el && k !== 'list' && typeof v !== 'string')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  children.flat(Infinity).forEach((ch) => {
    if (ch == null || ch === false) return;
    el.appendChild(ch instanceof Node ? ch : document.createTextNode(String(ch)));
  });
  return el;
}

export function toast(msg, ms = 2500) {
  const el = h('div.toast', msg);
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

export async function copyText(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Copy failed – select the text and copy it manually');
  }
}

export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Step title, description and "include in this case" toggles for its simulators.
export function stepHead(app, title, desc, sims = []) {
  const labels = { history: 'History', otoscopy: 'Otoscopy', pta: 'PTA', play: 'Play', speech: 'Speech', immittance: 'Immittance', dpoae: 'DPOAE', abr: 'ABR' };
  return h('div.step-head',
    h('div', h('h2', title), desc ? h('p', desc) : null),
    sims.length ? h('div.include.inline', sims.map((k) => h('label.check', { title: 'Include this simulator in the case' },
      h('input', { type: 'checkbox', checked: app.c.meta.include[k], onchange: (e) => { app.c.meta.include[k] = e.target.checked; app.refresh(); } }),
      ` Include ${labels[k]}`))) : null);
}

export const legend = () => h('div.legend',
  h('span', h('span.sw.auto'), 'from audiogram'),
  h('span', h('span.sw.ov'), 'edited (↺ to reset)'));

export const section =(title, ...children) => h('section.card', h('h3', title), ...children);

export const grid = (...children) => h('div.grid', ...children);

export function labelled(label, control, hint) {
  return h('label.field', h('span.label', label), control, hint ? h('span.hint', hint) : null);
}

// ─── plain bindings (history, otoscopy, meta): value lives at obj[path] ────

function coerce(raw, type) {
  if (type === 'number') {
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

// A text/number/textarea/select bound to obj at path. opts: {type, options, rows, min, max, step, placeholder}
export function bound(obj, path, opts, onChange) {
  const value = getPath(obj, path);
  const set = (v) => { setPath(obj, path, v); onChange && onChange(path, v); };
  if (opts.options) {
    return h('select', { onchange: (e) => set(e.target.value) },
      opts.options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  }
  if (opts.type === 'textarea') {
    return h('textarea', { rows: opts.rows || 3, placeholder: opts.placeholder || '', value: value ?? '',
      onchange: (e) => set(e.target.value) });
  }
  if (opts.type === 'checkbox') {
    return h('input', { type: 'checkbox', checked: !!value, onchange: (e) => set(e.target.checked) });
  }
  return h('input', {
    type: opts.type || 'text', value: value ?? '', placeholder: opts.placeholder || '',
    min: opts.min, max: opts.max, step: opts.step,
    onchange: (e) => set(coerce(e.target.value, opts.type)),
  });
}

// A set of checkboxes editing an array of strings at obj[path].
export function multiCheck(obj, path, options, onChange) {
  const arr = getPath(obj, path) || [];
  return h('div.checks', options.map(([v, l]) => h('label.check',
    h('input', { type: 'checkbox', checked: arr.includes(v), onchange: (e) => {
      const cur = new Set(getPath(obj, path) || []);
      if (e.target.checked) cur.add(v); else cur.delete(v);
      const next = options.map(([o]) => o).filter((o) => cur.has(o));
      setPath(obj, path, next);
      onChange && onChange(path, next);
    } }), ' ', l)));
}

// ─── simulator bindings: value is derived, editing it records an override ──

// ctx = { c, key, refresh }. opts as bound(), plus {nullable, label}.
export function simInput(ctx, path, opts = {}) {
  const { c, key, refresh } = ctx;
  const value = getPath(resolve(c, key), path);
  const over = isOverridden(c, key, path);
  const auto = getPath(derive(c, key), path);
  const commit = (v) => {
    if (JSON.stringify(v) === JSON.stringify(auto) && !opts.keepOverride) clearOverride(c, key, path);
    else setOverride(c, key, path, v);
    refresh();
  };
  let control;
  if (opts.options) {
    control = h('select', { onchange: (e) => commit(opts.parse ? opts.parse(e.target.value) : e.target.value) },
      opts.options.map(([v, l]) => h('option', { value: String(v), selected: String(v) === String(value ?? '') }, l)));
  } else if (opts.type === 'checkbox') {
    control = h('input', { type: 'checkbox', checked: !!value, onchange: (e) => commit(e.target.checked) });
  } else {
    control = h('input', {
      type: opts.type || 'number', value: value ?? '', min: opts.min, max: opts.max, step: opts.step,
      placeholder: opts.nullable ? '–' : '',
      onchange: (e) => {
        const raw = e.target.value;
        if (opts.type === 'text') return commit(raw);
        if (raw === '') return opts.nullable ? commit(null) : refresh();
        commit(Number(raw));
      },
    });
  }
  const wrap = h('span.sim-input', { class: over ? 'overridden' : 'auto', title: over ? `Auto value: ${fmt(auto)}` : 'Following the audiogram' },
    control,
    over ? h('button.reset', { type: 'button', title: `Reset to auto (${fmt(auto)})`, onclick: () => { clearOverride(c, key, path); refresh(); } }, '↺') : null);
  return opts.label ? labelled(opts.label, wrap, opts.hint) : wrap;
}

const fmt = (v) => (v == null ? 'none' : typeof v === 'object' ? 'default' : String(v));

// Reset every override under a path prefix (or all, with '').
export function resetOverrides(c, key, prefix = '') {
  Object.keys(c.sims[key].overrides).forEach((p) => { if (!prefix || p === prefix || p.startsWith(prefix + '.')) delete c.sims[key].overrides[p]; });
}

export function overrideCount(c, key) {
  return Object.keys(c.sims[key].overrides).length;
}

export { clone };
