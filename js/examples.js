// Example cases, to show how a finished case looks. Both are fictional.

import { blankCase, setPaediatric } from './model.js';

function setAud(c, ear, ac, bc) {
  Object.entries(ac).forEach(([f, v]) => { c.audiogram[ear].ac[f] = v; });
  Object.entries(bc).forEach(([f, v]) => { c.audiogram[ear].bc[f] = v; });
}

export function adultExample() {
  const c = blankCase();
  c.meta.title = 'Example – sudden left loss, noise exposure';
  const p = c.history.patient;
  Object.assign(p, { name: 'Joan Parker', age: '67', occupation: 'Retired printer', pronoun: 'she/her', personality: 'neutral', chattiness: 2 });
  c.history.meta = { category: ['NIHL', 'Sudden SNHL'], difficulty: 'moderate', clinicianNotes: 'Fictional example case.' };
  const hx = c.history.history;
  hx.reasonForAppointment = 'Referred by GP: difficulty hearing in background noise.';
  hx.previousHearingTest = { had: true, details: 'Tested 40 years ago after a sudden loss in the left ear. [ASK: what did it show] Permanent loss in the left ear.' };
  hx.hearing = { betterEar: 'right', decline: 'sudden', declineDetails: 'Sudden left loss 40 years ago while gardening, with dizziness. [ASK: recent change] Struggling more in groups over the last few years.' };
  hx.balance = { concern: 'vertigo', details: 'Vertigo for about a day at the time of the sudden loss; none since.' };
  hx.earHealth = { experiences: ['noConcerns'], details: '' };
  hx.noiseHistory = { type: ['occupational'], details: 'Ten years in a print shop. [ASK: hearing protection] Mostly wore earmuffs.' };
  hx.generalHealth.majorIllnesses = 'High blood pressure, well controlled.';
  hx.generalHealth.medications = 'Amlodipine 5 mg daily';
  hx.otherConcerns = 'Worried about losing hearing in her good ear.';
  setAud(c, 'right',
    { 250: 10, 500: 10, 1000: 15, 2000: 20, 3000: 35, 4000: 45, 6000: 50, 8000: 45 },
    { 250: 10, 500: 10, 1000: 15, 2000: 20, 3000: 35, 4000: 45 });
  setAud(c, 'left',
    { 250: 80, 500: 85, 1000: 90, 2000: 95, 3000: 100, 4000: 100, 6000: 105, 8000: 110 },
    { 250: 45, 500: 60, 1000: 70, 2000: 70, 3000: 70, 4000: 70 });
  c.otoscopy.title = c.meta.title;
  c.otoscopy.description = 'Routine otoscopy before the hearing assessment.';
  c.otoscopy.findings = 'Both ear canals clear; tympanic membranes intact and normal.';
  c.meta.include.play = false;
  return c;
}

export function childExample() {
  const c = blankCase();
  c.meta.title = 'Example – 4-year-old, glue ear';
  setPaediatric(c, true);
  Object.assign(c.history.patient, { name: 'Mia', age: '4 years', pronoun: 'she/her', caregiverName: 'Aroha', caregiverRelationship: 'Mother', chattiness: 4 });
  c.history.meta = { category: ['Conductive/Otitis media'], difficulty: 'beginner', clinicianNotes: 'Fictional example case.' };
  c.history.history.reasonForAppointment = 'Did not pass the hearing screen at her B4 School Check.';
  c.history.history.earHealth = { experiences: ['earInfections'], details: 'Three ear infections this winter. [ASK: treatment] Antibiotics from the GP each time.' };
  const ph = c.history.paediatricHistory;
  ph.prenatalAndPerinatal.gestationalAge = '39 weeks';
  ph.hearingScreening.newbornScreening = { result: 'Pass both ears', technology: 'AABR', notes: '' };
  ph.hearingScreening.b4SchoolCheck = { result: 'Refer both ears', notes: 'Flat tympanograms at the check.' };
  ph.speechAndLanguage.currentVocabulary = 'Speaks in short sentences; some sounds unclear.';
  ['right', 'left'].forEach((ear) => setAud(c, ear,
    { 500: 35, 1000: 35, 2000: 30, 4000: 35 },
    { 500: 5, 1000: 5, 2000: 5, 4000: 10 }));
  c.otoscopy.title = c.meta.title;
  c.otoscopy.description = 'Four-year-old referred after the B4 School Check.';
  c.otoscopy.findings = 'Dull, retracted tympanic membranes with fluid visible behind them bilaterally.';
  c.meta.include.pta = false;
  c.meta.include.play = true;
  c.meta.include.abr = false;
  return c;
}
