// Auto-fill a case from guidance text and anonymised documents (PDFs/images)
// via the history simulator's Cloudflare worker, which forwards the request
// body unchanged to the Claude Messages API. Claude replies with JSON matching
// EXTRACT_SCHEMA (given in the prompt); normalise() enforces it on arrival.

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
const num = { type: 'number' };
const int = { type: 'integer' };
// Fixed-choice fields are plain strings that list their choices in the
// description; normalise() maps each reply back onto the allowed values.
const ENUMS = new WeakMap();
const enm = (values, note) => {
  const schema = { type: 'string', description: `One of: ${values.map((v) => (v === '' ? '"" (none)' : v)).join(' | ')}${note ? `. ${note}` : ''}` };
  ENUMS.set(schema, values);
  return schema;
};
const arrEnum = (values) => ({ type: 'array', items: enm(values) });
const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const list = (props) => ({ type: 'array', items: obj(props) });
const ear = enm(['right', 'left']);
const intNote = (note) => ({ type: 'integer', description: note });

// Test results are lists of what was actually measured: anything not tested is
// simply absent.
const thresholds = list({
  ear,
  conduction: enm(['AC', 'BC']),
  freqHz: intNote('250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000 or 8000'),
  dbHL: int,
  noResponse: bool,
});
const speechEars = list({
  ear,
  piMax: { ...num, description: 'Maximum word score %, or -1 if not reported' },
  score90: { ...num, description: 'Score % at 90 dB HL, or -1 if not reported' },
  dataPoints: list({ level: num, score: num }),
});
const immittanceEars = list({
  ear: enm(['right', 'left'], 'The probe ear'),
  tympType: enm(['unknown', 'A', 'As', 'Ad', 'B', 'C']),
  measures: list({ measure: enm(['peakAdmittance', 'TPP', 'ECV']), value: num }),
  reflexes: list({
    type: enm(['ipsi', 'contra'], 'contra = stimulus in the opposite ear to this probe ear'),
    freqHz: intNote('500, 1000 or 2000'),
    present: bool,
    dbHL: { ...int, description: 'Reflex threshold; 0 when absent' },
  }),
});
const dpoaePoints = list({ ear, f2Hz: int, present: bool });

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
  paediatric: obj({
    gestationalAge: str,
    birthWeight: str,
    nicuAdmission: bool,
    newbornScreeningResult: str,
    newbornScreeningTechnology: enm(['', 'AABR', 'TEOAE', 'AABR + TEOAE', 'unknown', 'not done']),
    b4SchoolCheckResult: str,
    speechLanguageSummary: str,
    developmentSummary: str,
    functionalImpactSummary: str,
  }),
  otoscopy: obj({ description: str, findings: str }),
  audiogram: thresholds,
  speech: speechEars,
  immittance: immittanceEars,
  dpoae: dpoaePoints,
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

const SCHEMA_TEXT = JSON.stringify(EXTRACT_SCHEMA);

// ─── prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You help an audiology educator turn clinical source material into a fictional teaching case for a set of student simulators (history taking with an AI patient, otoscopy, pure-tone/play audiometry, speech testing, immittance, DPOAEs, ABR).

Privacy comes first. The documents should already be anonymised, but check anyway:
- Never copy a real person's name, NHI or other ID numbers, date of birth, address, phone, email, clinic or clinician names into the case. Use a plausible pseudonym for the patient, and keep ages approximate.
- List in possibleIdentifiers every identifying detail you notice in the documents, described by type and location (e.g. "NHI number in the page 1 header", "clinician's name in the signature"). Do not repeat the identifier itself. Use an empty list if there are none.

How to fill the case:
- Test results (audiogram, speech, immittance, DPOAE, ABR) must come from the documents or from explicit guidance, never guessed. List only what was actually tested; leave a list empty when a test wasn't done. Audiogram thresholds are dB HL on a 5 dB grid, one entry per ear/conduction/frequency; for "no response" give the maximum level tested with noResponse true. Right ear = red O / < symbols, left ear = blue X / > symbols. Masked and unmasked BC are both just BC here. For speech, use -1 for a PI max or 90 dB score that isn't reported. For immittance, "ear" is the probe ear; a contra reflex has its stimulus in the other ear; list absent reflexes with present false and dbHL 0. If the case is not paediatric, leave the paediatric fields empty.
- The history is spoken by the AI patient (or caregiver for a child). Write details in plain first-hand facts, not clinical shorthand. Hold back secondary details behind "[ASK: topic]" tags so students must ask for them, e.g. "Noticed it about 5 years ago. [ASK: which ear is worse] The left is worse." Keep the history consistent with the test results.
- ${'{{INVENT}}'}
- Record in provenance which parts came from the documents and which were invented, and note anything uncertain (e.g. an unreadable scan).
- caseTitle: a short teaching title without the pseudonym, e.g. "Sudden left SNHL, noise exposure".`;

const INVENT_ON = 'Where the documents and guidance are silent about the history, invent plausible, internally consistent details that suit the teaching goal (and list them in provenance.invented). Never invent test results.';
const INVENT_OFF = 'Do not invent anything: leave history fields empty ("" / false / []) when the documents and guidance do not cover them.';

// The reply is plain JSON (a structured-output grammar for this schema is too
// large for the API), so normalise() enforces the schema here: fixed choices
// are matched case-insensitively (unknown -> first choice, or dropped from
// lists), missing or mistyped fields get safe defaults, numeric strings are
// converted, and list entries missing a required number are dropped.
export function normalise(schema, data) {
  const allowed = ENUMS.get(schema);
  if (allowed) {
    if (typeof data !== 'string') return allowed[0];
    return allowed.find((v) => v === data) ?? allowed.find((v) => v.toLowerCase() === data.trim().toLowerCase()) ?? allowed[0];
  }
  switch (schema.type) {
    case 'string': return typeof data === 'string' ? data : (data == null || typeof data === 'object' ? '' : String(data));
    case 'boolean': return data === true || data === 'true';
    case 'number':
    case 'integer': {
      const n = typeof data === 'number' ? data : (typeof data === 'string' && data.trim() !== '' ? Number(data) : NaN);
      if (Number.isFinite(n)) return schema.type === 'integer' ? Math.round(n) : n;
      return /-1/.test(schema.description || '') ? -1 : NaN;
    }
    case 'array': {
      if (!Array.isArray(data)) return [];
      const items = schema.items;
      const itemEnum = ENUMS.get(items);
      const kept = itemEnum ? data.filter((d) => typeof d === 'string' && itemEnum.some((v) => v.toLowerCase() === d.trim().toLowerCase())) : data;
      const out = kept.map((d) => normalise(items, d));
      return items.type === 'object'
        ? out.filter((o) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v)))
        : out;
    }
    case 'object': {
      const src = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      return Object.fromEntries(Object.keys(schema.properties).map((k) => [k, normalise(schema.properties[k], src[k])]));
    }
    default: return data;
  }
}

// Pull the JSON object out of the reply text (tolerates code fences or stray prose).
export function parseReply(text) {
  const t = text.replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object');
  return JSON.parse(t.slice(a, b + 1));
}

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
    system: `${SYSTEM.replace('{{INVENT}}', invent ? INVENT_ON : INVENT_OFF)}

Reply with only one JSON object that matches this JSON Schema: no other text, no code fences. Fields described as "One of: …" must use exactly one of the listed values.
<schema>
${SCHEMA_TEXT}
</schema>`,
    messages: [{ role: 'user', content }],
    // Medium effort keeps a multi-page read to around a minute; thinking counts toward max_tokens.
    output_config: { effort: 'medium' },
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
  // The worker answers a wrong code with plain "Unauthorised"; a JSON 401 is
  // Anthropic rejecting the worker's own API key.
  if (res.status === 401 && !text.trim().startsWith('{')) throw new AiError('The access code was not accepted by the Claude service.');
  if (res.status === 401) throw new AiError('The Claude service’s API key was rejected by Anthropic – the worker’s ANTHROPIC_API_KEY secret needs updating.');
  let data;
  try { data = JSON.parse(text); } catch { throw new AiError(`Unexpected reply (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok) throw new AiError(`Claude API error (HTTP ${res.status}): ${data.error?.message || text.slice(0, 200)}`);
  if (data.stop_reason === 'refusal') throw new AiError('Claude declined this request. Check the documents are anonymised and suitable, then try again.');
  if (data.stop_reason === 'max_tokens') throw new AiError('The reply was cut off before the case was finished. Try again, or split the documents into two runs.');
  const text2 = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!text2.trim()) throw new AiError('The reply had no case data.');
  let parsed;
  try {
    parsed = parseReply(text2);
  } catch {
    throw new AiError('Claude’s reply couldn’t be read as case data. Try again.');
  }
  return { result: normalise(EXTRACT_SCHEMA, parsed), usage: data.usage, model: data.model };
}
