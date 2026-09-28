// Auto-fill a case from guidance text and anonymised documents (PDFs/images)
// via the history simulator's Cloudflare worker, which forwards the request
// body unchanged to the Claude Messages API. Structured outputs
// (output_config.format) guarantee the reply matches EXTRACT_SCHEMA.

import { HISTORY_WORKER_URL } from './config.js';

const TOKEN_KEY = 'audiology-sim-session-token'; // same key as the history simulator
const MODEL_KEY = 'casemaker-ai-model';
export const DEFAULT_MODEL = 'claude-opus-5';
export const MODELS = [
  ['claude-opus-5', 'Claude Opus 5 (most accurate)'],
  ['claude-sonnet-5', 'Claude Sonnet 5 (faster, cheaper)'],
];
export const MAX_BYTES = 20 * 1024 * 1024; // raw file bytes; the API limit is 32 MB per request after base64

const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };
export const getToken = () => safe(() => sessionStorage.getItem(TOKEN_KEY), '') || '';
export const setToken = (t) => safe(() => sessionStorage.setItem(TOKEN_KEY, t), null);
export const getModel = () => safe(() => localStorage.getItem(MODEL_KEY), null) || DEFAULT_MODEL;
export const setModel = (m) => safe(() => localStorage.setItem(MODEL_KEY, m), null);

// ─── schema ────────────────────────────────────────────────────────────────

const str = { type: 'string' };
const bool = { type: 'boolean' };
const nint = { type: ['integer', 'null'] };
const nnum = { type: ['number', 'null'] };
const enm = (values) => ({ type: 'string', enum: values });
const arrEnum = (values) => ({ type: 'array', items: enm(values) });
const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const row = (freqs) => obj(Object.fromEntries(freqs.map((f) => [String(f), nint])));
const reflexVal = { anyOf: [{ type: 'integer' }, enm(['NR']), { type: 'null' }] };
const reflexRow = obj({ 500: reflexVal, 1000: reflexVal, 2000: reflexVal });

const AC_FREQS = [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];
const BC_FREQS = [250, 500, 750, 1000, 1500, 2000, 3000, 4000];

const speechEar = nullable(obj({
  piMax: nnum,
  score90: nnum,
  dataPoints: { type: 'array', items: obj({ level: { type: 'number' }, score: { type: 'number' } }) },
}));
const immEar = nullable(obj({
  tympType: nullable(enm(['A', 'As', 'Ad', 'B', 'C'])),
  peakAdmittance: nnum,
  TPP: nint,
  ECV: nnum,
  ipsi: reflexRow,
  contra: reflexRow,
}));
const dpoaeEar = nullable({ type: 'array', items: obj({ f2Hz: { type: 'integer' }, present: bool }) });

export const EXTRACT_SCHEMA = obj({
  caseTitle: str,
  isPaediatric: bool,
  patient: obj({
    name: str,
    age: str,
    occupation: str,
    pronoun: enm(['she/her', 'he/him', 'they/them']),
    medicalKnowledge: enm(['none', 'basic', 'moderate', 'high']),
    personality: enm(['neutral', 'anxious', 'relaxed', 'defensive', 'confused', 'chatty', 'stoic']),
    chattiness: { type: 'integer' },
    caregiverName: str,
    caregiverRelationship: str,
  }),
  meta: obj({
    category: arrEnum(['NIHL', 'Presbycusis', 'Otosclerosis', "Meniere's", 'Conductive/Otitis media', 'Sudden SNHL', 'Ototoxicity',
      'Tinnitus-predominant', 'Vestibular', 'Congenital/Genetic', 'Traumatic', 'Undifferentiated']),
    difficulty: enm(['beginner', 'moderate', 'advanced']),
    clinicianNotes: str,
  }),
  history: obj({
    reasonForAppointment: str,
    previousHearingTest: obj({ had: bool, details: str }),
    hearing: obj({ betterEar: enm(['right', 'left', 'same']), decline: enm(['gradual', 'sudden', 'none']), declineDetails: str }),
    hearingAids: obj({ current: bool, details: str }),
    tinnitus: obj({ present: bool, location: enm(['', 'right', 'left', 'both', 'bothWorseRight', 'bothWorseLeft', 'central', 'bothAndCentral']), details: str }),
    soundSensitivity: obj({ present: bool, location: enm(['', 'right', 'left', 'both']), details: str }),
    balance: obj({ concern: enm(['none', 'vertigo', 'imbalance', 'both']), details: str }),
    earHealth: obj({ experiences: arrEnum(['auralPressure', 'auralPain', 'auralDrainage', 'earInfections', 'earWax', 'noConcerns']), details: str }),
    ent: obj({ seen: bool, history: arrEnum(['surgery', 'treatment', 'scans', 'noneRelated']), details: str }),
    generalHealth: obj({
      hospitalizations: str,
      headInjuries: bool,
      headInjuriesDetails: str,
      pastInfections: arrEnum(['measles', 'mumps', 'chickenPox', 'meningitis', 'diabetes', 'cancer', 'cardiovascular', 'other']),
      pastInfectionsDetails: str,
      majorIllnesses: str,
      medications: str,
    }),
    noiseHistory: obj({ type: arrEnum(['occupational', 'recreational', 'none']), details: str }),
    familyHistory: obj({ has: bool, details: str }),
    otherConcerns: str,
  }),
  paediatric: nullable(obj({
    gestationalAge: str,
    birthWeight: str,
    nicuAdmission: bool,
    newbornScreeningResult: str,
    newbornScreeningTechnology: enm(['', 'AABR', 'TEOAE', 'AABR + TEOAE', 'unknown', 'not done']),
    b4SchoolCheckResult: str,
    speechLanguageSummary: str,
    developmentSummary: str,
    functionalImpactSummary: str,
  })),
  otoscopy: obj({ description: str, findings: str }),
  audiogram: obj({
    rightAC: row(AC_FREQS), leftAC: row(AC_FREQS),
    rightBC: row(BC_FREQS), leftBC: row(BC_FREQS),
  }),
  speech: obj({ right: speechEar, left: speechEar }),
  immittance: obj({ right: immEar, left: immEar }),
  dpoae: obj({ right: dpoaeEar, left: dpoaeEar }),
  abr: obj({
    rightPathology: enm(['none', 'retrocochlear', 'ANSD']),
    leftPathology: enm(['none', 'retrocochlear', 'ANSD']),
  }),
  provenance: obj({
    fromDocuments: { type: 'array', items: str },
    invented: { type: 'array', items: str },
    notes: str,
  }),
  possibleIdentifiers: { type: 'array', items: str },
});

// ─── prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You help an audiology educator turn clinical source material into a fictional teaching case for a set of student simulators (history taking with an AI patient, otoscopy, pure-tone/play audiometry, speech testing, immittance, DPOAEs, ABR).

Privacy comes first. The documents should already be anonymised, but check anyway:
- Never copy a real person's name, NHI or other ID numbers, date of birth, address, phone, email, clinic or clinician names into the case. Use a plausible pseudonym for the patient, and keep ages approximate.
- List in possibleIdentifiers every identifying detail you notice in the documents, described by type and location (e.g. "NHI number in the page 1 header", "clinician's name in the signature"). Do not repeat the identifier itself. Use an empty list if there are none.

How to fill the case:
- Test results (audiogram, speech, immittance, DPOAE, ABR) must come from the documents or from explicit guidance. Where there is no information, use null (or an empty list) rather than guessing. Audiogram values are dB HL on a 5 dB grid; use null for frequencies not tested; for "no response" record the maximum tested level and say so in provenance.notes. Right ear = red O / < symbols, left ear = blue X / > symbols. Unmasked and masked BC are both just BC here.
- Reflexes: a number in dB HL, "NR" when tested and absent, null when not tested. "contra" is keyed by the probe ear (contra.right = probe right, stimulus left).
- The history is spoken by the AI patient (or caregiver for a child). Write details in plain first-hand facts, not clinical shorthand. Hold back secondary details behind "[ASK: topic]" tags so students must ask for them, e.g. "Noticed it about 5 years ago. [ASK: which ear is worse] The left is worse." Keep the history consistent with the test results.
- ${'{{INVENT}}'}
- Record in provenance which parts came from the documents and which were invented, and note anything uncertain (e.g. an unreadable scan).
- caseTitle: a short teaching title without the pseudonym, e.g. "Sudden left SNHL, noise exposure".`;

const INVENT_ON = 'Where the documents and guidance are silent about the history, invent plausible, internally consistent details that suit the teaching goal (and list them in provenance.invented). Never invent test results.';
const INVENT_OFF = 'Do not invent anything: leave history fields empty ("" / false / []) when the documents and guidance do not cover them.';

// ─── files ─────────────────────────────────────────────────────────────────

export async function fileToBlock(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const data = btoa(binary);
  if (file.type === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: file.name };
  }
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
    return { type: 'image', source: { type: 'base64', media_type: file.type, data } };
  }
  throw new Error(`${file.name}: only PDF, PNG, JPEG, GIF or WebP files can be used.`);
}

// ─── request ───────────────────────────────────────────────────────────────

export class AiError extends Error {}

export async function extractCase({ guidance, files, invent }) {
  const token = getToken();
  if (!token) throw new AiError('Enter the simulator access code first.');
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BYTES) throw new AiError(`The files add up to ${(total / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB.`);
  if (!guidance.trim() && !files.length) throw new AiError('Add some guidance text or at least one document.');

  const content = [];
  for (const f of files) content.push(await fileToBlock(f));
  content.push({ type: 'text', text: (files.length ? `The ${files.length} attached document(s) are the source material.\n\n` : 'There are no documents; build the case from the guidance.\n\n')
    + `Educator's guidance:\n${guidance.trim() || '(none)'}` });

  const body = {
    model: getModel(),
    max_tokens: 16000,
    system: SYSTEM.replace('{{INVENT}}', invent ? INVENT_ON : INVENT_OFF),
    messages: [{ role: 'user', content }],
    // Medium effort keeps a multi-page read to around a minute; thinking counts toward max_tokens.
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
  };

  let res;
  try {
    res = await fetch(HISTORY_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError(`Could not reach the Claude service (${e.message}). Auto-fill only works from the live site, jakalnz.github.io.`);
  }
  const text = await res.text();
  if (res.status === 401) throw new AiError('The access code was not accepted.');
  let data;
  try { data = JSON.parse(text); } catch { throw new AiError(`Unexpected reply (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok) throw new AiError(`Claude API error (HTTP ${res.status}): ${data.error?.message || text.slice(0, 200)}`);
  if (data.stop_reason === 'refusal') throw new AiError('Claude declined this request. Check the documents are anonymised and suitable, then try again.');
  if (data.stop_reason === 'max_tokens') throw new AiError('The reply was cut off before the case was finished. Try again, or split the documents into two runs.');
  const out = (data.content || []).find((b) => b.type === 'text');
  if (!out) throw new AiError('The reply had no case data.');
  try {
    return { result: JSON.parse(out.text), usage: data.usage, model: data.model };
  } catch {
    throw new AiError('The reply was not valid case data.');
  }
}
