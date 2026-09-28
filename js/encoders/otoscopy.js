// Otoscopy: cases live in the otoscopy repo (created through the otoscopy-admin
// worker); the link just names the case id.
import { simBase } from '../config.js';

export function build(c, target) {
  const o = c.otoscopy;
  if (!o.caseId) {
    return { url: '', warnings: ['Otoscopy: create the case on the Otoscopy step to get a link.'], files: [], note: '' };
  }
  return {
    url: `${simBase('otoscopy', target)}index.html?case=${encodeURIComponent(o.caseId)}`,
    warnings: [],
    files: [],
    note: 'A new otoscopy case can take about a minute to go live while GitHub Pages rebuilds.',
  };
}
