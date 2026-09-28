// History-taking simulator: the case JSON itself (import it on student.html or
// clinician.html, or commit it to cases/ and list it in cases/index.json).
import { resolve, slugify } from '../model.js';
import { buildSystemPrompt } from '../../vendor/history/cases.js';
import { simBase } from '../config.js';

export function build(c, target) {
  const h = resolve(c, 'history');
  h.updatedAt = new Date().toISOString();
  const warnings = [];
  if (!h.patient.name) warnings.push('History: the patient has no name.');
  if (!h.history.reasonForAppointment) warnings.push('History: the reason for appointment is empty.');
  try {
    buildSystemPrompt(h);
  } catch (e) {
    warnings.push(`History: the simulator could not build a patient prompt from this case (${e.message}).`);
  }
  return {
    url: `${simBase('history', target)}student.html?case=${encodeURIComponent(h.id)}`,
    warnings,
    files: [{ name: `${slugify(h.patient.name || c.meta.title)}-case.json`, content: JSON.stringify(h, null, 2) }],
    note: 'The link only works after students import the .json on the student page, or once it is added to cases/ and cases/index.json in the repo.',
    primary: 'file',
  };
}
