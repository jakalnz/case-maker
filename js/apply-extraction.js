// Merge an ai.js extraction into a case, one section at a time. Test results
// that the extraction left null are not touched, so they keep following the
// audiogram (or any edits already made).

import { setPaediatric, setOverride, clearOverride, resolve, DPOAE_PROTOCOLS, FREQS, BC_FREQS, EARS, r5, clamp } from './model.js';

export const SECTIONS = [
  ['history', 'History'],
  ['otoscopy', 'Otoscopy text'],
  ['audiogram', 'Audiogram'],
  ['speech', 'Speech'],
  ['immittance', 'Immittance'],
  ['dpoae', 'DPOAEs'],
  ['abr', 'ABR pathology'],
];

const cap = (e) => e[0].toUpperCase() + e.slice(1);

// What each section would bring in, for the review list. null = nothing found.
export function describe(x) {
  const out = {};
  const p = x.patient;
  out.history = `${p.name || 'Unnamed'}, ${p.age || 'age unknown'}${x.isPaediatric ? ' (paediatric)' : ''} – ${x.history.reasonForAppointment || 'no reason given'}`;
  out.otoscopy = x.otoscopy.description || x.otoscopy.findings ? (x.otoscopy.findings || x.otoscopy.description) : null;
  const pts = EARS.flatMap((e) => ['AC', 'BC'].map((k) => Object.values(x.audiogram[`${e}${k}`]).filter((v) => v != null).length));
  const n = pts.reduce((a, b) => a + b, 0);
  out.audiogram = n ? `${n} thresholds (R AC ${pts[0]}, R BC ${pts[1]}, L AC ${pts[2]}, L BC ${pts[3]})` : null;
  const sp = EARS.filter((e) => x.speech[e]).map((e) => `${cap(e)}: PI max ${x.speech[e].piMax ?? '?'}%, ${x.speech[e].dataPoints.length} points`);
  out.speech = sp.length ? sp.join('; ') : null;
  const im = EARS.filter((e) => x.immittance[e]).map((e) => `${cap(e)}: type ${x.immittance[e].tympType ?? '?'}`);
  out.immittance = im.length ? im.join('; ') : null;
  const dp = EARS.filter((e) => x.dpoae[e] && x.dpoae[e].length).map((e) => `${cap(e)}: ${x.dpoae[e].filter((q) => q.present).length}/${x.dpoae[e].length} present`);
  out.dpoae = dp.length ? dp.join('; ') : null;
  out.abr = x.abr.rightPathology !== 'none' || x.abr.leftPathology !== 'none' ? `Right ${x.abr.rightPathology}, left ${x.abr.leftPathology}` : null;
  return out;
}

export function applyExtraction(c, x, sections) {
  const on = (k) => sections.includes(k);
  if (x.caseTitle && !c.meta.title) c.meta.title = x.caseTitle;

  if (on('history')) {
    setPaediatric(c, !!x.isPaediatric);
    const h = c.history;
    Object.assign(h.patient, x.patient, { additionalNotes: h.patient.additionalNotes });
    h.patient.chattiness = clamp(Math.round(x.patient.chattiness || 3), 1, 5);
    h.meta = { ...h.meta, ...x.meta };
    h.history = JSON.parse(JSON.stringify(x.history));
    if (x.isPaediatric && x.paediatric) {
      const ph = h.paediatricHistory;
      const q = x.paediatric;
      Object.assign(ph.prenatalAndPerinatal, { gestationalAge: q.gestationalAge, birthWeight: q.birthWeight, nicuAdmission: q.nicuAdmission });
      Object.assign(ph.hearingScreening.newbornScreening, { result: q.newbornScreeningResult, technology: q.newbornScreeningTechnology });
      ph.hearingScreening.b4SchoolCheck.result = q.b4SchoolCheckResult;
      ph.speechAndLanguage.receptiveExpressiveNotes = q.speechLanguageSummary;
      ph.generalDevelopment.developmentalDiagnoses = q.developmentSummary;
      ph.functionalImpact.homeImpact = q.functionalImpactSummary;
    }
    if (x.isPaediatric) {
      // Young children are usually tested with play audiometry.
      c.meta.include.play = true;
    }
  }

  if (on('otoscopy')) {
    c.otoscopy.description = x.otoscopy.description;
    c.otoscopy.findings = x.otoscopy.findings;
    if (!c.otoscopy.title) c.otoscopy.title = x.caseTitle;
  }

  if (on('audiogram')) {
    EARS.forEach((e) => {
      FREQS.forEach((f) => { c.audiogram[e].ac[f] = fixDb(x.audiogram[`${e}AC`][f]); });
      BC_FREQS.forEach((f) => { c.audiogram[e].bc[f] = fixDb(x.audiogram[`${e}BC`][f]); });
    });
  }

  if (on('speech')) {
    EARS.forEach((e) => {
      const s = x.speech[e];
      if (!s) return;
      const key = `${e}Ear`;
      if (s.piMax != null) setOverride(c, 'speech', `${key}.piMax`, clamp(Math.round(s.piMax), 0, 100));
      if (s.score90 != null) setOverride(c, 'speech', `${key}.score90`, clamp(Math.round(s.score90), 0, 100));
      if (s.dataPoints.length) {
        setOverride(c, 'speech', `${key}.dataPoints`, s.dataPoints.slice(0, 8)
          .map((d) => ({ level: clamp(r5(d.level), -10, 100), score: clamp(Math.round(d.score), 0, 100) }))
          .sort((a, b) => a.level - b.level));
      }
    });
  }

  if (on('immittance')) {
    EARS.forEach((e) => {
      const m = x.immittance[e];
      if (!m) return;
      const base = `ears.${e}`;
      if (m.tympType) setOverride(c, 'immittance', `${base}.tympType`, m.tympType);
      if (m.peakAdmittance != null) setOverride(c, 'immittance', `${base}.peakAdmittance`, Math.round(m.peakAdmittance * 100) / 100);
      if (m.TPP != null) setOverride(c, 'immittance', `${base}.TPP`, Math.round(m.TPP));
      if (m.ECV != null) setOverride(c, 'immittance', `${base}.ECV`, Math.round(m.ECV * 100) / 100);
      if (m.tympType === 'B') setOverride(c, 'immittance', `${base}.gradient`, 0);
      ['ipsi', 'contra'].forEach((side) => [500, 1000, 2000].forEach((f) => {
        const v = m[side][f];
        if (v === 'NR') setOverride(c, 'immittance', `${base}.reflexes.${side}.${f}`, null);
        else if (typeof v === 'number') setOverride(c, 'immittance', `${base}.reflexes.${side}.${f}`, clamp(r5(v), 70, 110));
      }));
    });
  }

  if (on('dpoae')) {
    const all = EARS.flatMap((e) => x.dpoae[e] || []);
    if (all.length) {
      const wide = all.some((q) => q.f2Hz < 1000 || q.f2Hz > 6000);
      const protocol = wide ? 'dp0_5_10' : 'dp1_6';
      clearOverride(c, 'dpoae', 'protocol');
      Object.keys(c.sims.dpoae.overrides).forEach((k) => { if (k.startsWith('ears.')) delete c.sims.dpoae.overrides[k]; });
      if (protocol !== resolve(c, 'dpoae').protocol) setOverride(c, 'dpoae', 'protocol', protocol);
      const grid = DPOAE_PROTOCOLS[protocol].points;
      EARS.forEach((e) => (x.dpoae[e] || []).forEach((q) => {
        const i = grid.reduce((best, f, j) => (Math.abs(Math.log(f / q.f2Hz)) < Math.abs(Math.log(grid[best] / q.f2Hz)) ? j : best), 0);
        setOverride(c, 'dpoae', `ears.${e}.points.${i}.present`, !!q.present);
      }));
    }
  }

  if (on('abr')) {
    const code = { none: 0, retrocochlear: 1, ANSD: 2 };
    [x.abr.rightPathology, x.abr.leftPathology].forEach((pth, i) => {
      if (code[pth]) setOverride(c, 'abr', `ears.${i}.path`, code[pth]);
      else clearOverride(c, 'abr', `ears.${i}.path`);
    });
  }
}

const fixDb = (v) => (v == null ? null : clamp(r5(v), -10, 120));
