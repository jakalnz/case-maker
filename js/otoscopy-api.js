// Otoscopy simulator data: the image library is read from the live site
// (GitHub Pages); cases and images are written through the otoscopy-admin
// worker, which commits them to the jakalnz/otoscopy repo.

import { OTOSCOPY_WORKER_URL } from './config.js';

export const OTOSCOPY_SITE = 'https://jakalnz.github.io/otoscopy/';
const PW_KEY = 'casemaker-otoscopy-password';
const MAX_EDGE = 1600;          // px; otoscope photos don't need more
const TARGET_BYTES = 900 * 1024; // the worker/GitHub path fails at about 1 MB

const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };
export const getPassword = () => safe(() => sessionStorage.getItem(PW_KEY), '') || '';
export const setPassword = (p) => safe(() => sessionStorage.setItem(PW_KEY, p), null);

export const imageUrl = (img) => OTOSCOPY_SITE + img.path;

export async function loadLibrary() {
  const res = await fetch(`${OTOSCOPY_SITE}data/library/index.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load the otoscopy image library (HTTP ${res.status}).`);
  return (await res.json()).images || [];
}

async function request(method, path, body) {
  const password = getPassword();
  if (!password) throw new Error('Enter the otoscopy admin password first.');
  let res;
  try {
    res = await fetch(OTOSCOPY_WORKER_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    throw new Error(`Could not reach the otoscopy service (${e.message}).`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('The otoscopy admin password was not accepted.');
  if (!res.ok) throw new Error(data.error || `Otoscopy service error (HTTP ${res.status}).`);
  return data;
}

// {title, difficulty, description, findings, leftImageId, rightImageId}
export const createCase = (fields) => request('POST', '/api/case', fields).then((d) => d.case);
export const updateCase = (id, fields) => request('PUT', `/api/case/${encodeURIComponent(id)}`, fields).then((d) => d.case);

// Scale the photo down and re-encode as JPEG until it fits under TARGET_BYTES.
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const quality = attempt < 3 ? 0.88 - attempt * 0.08 : 0.7;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    if (bytes <= TARGET_BYTES) return { dataUrl, bytes, width: canvas.width, height: canvas.height };
    if (attempt >= 2) scale *= 0.8;
  }
  throw new Error('This image is too large to upload even after shrinking it.');
}

// {ear: 'left'|'right', tags: string[], file} -> library image record
export async function uploadImage({ ear, tags, file }) {
  const { dataUrl } = await prepareImage(file);
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  const data = await request('POST', '/api/image', { ear, tags, filename: name, dataUrl });
  return { ...data.image, previewUrl: dataUrl };
}
