// History step: the history-taking simulator's case form (mirrors its clinician.html).
import { h, section, labelled, bound, multiCheck, stepHead, grid } from '../ui.js';
import { setPaediatric } from '../model.js';

const CATEGORIES = [['NIHL', 'Noise-induced hearing loss'], ['Presbycusis', 'Presbycusis'], ['Otosclerosis', 'Otosclerosis'],
  ["Meniere's", "Ménière's disease"], ['Conductive/Otitis media', 'Conductive / otitis media'], ['Sudden SNHL', 'Sudden SNHL'],
  ['Ototoxicity', 'Ototoxicity'], ['Tinnitus-predominant', 'Tinnitus-predominant'], ['Vestibular', 'Vestibular / balance'],
  ['Congenital/Genetic', 'Congenital / genetic'], ['Traumatic', 'Traumatic / head injury'], ['Undifferentiated', 'Undifferentiated']];
const DIFFICULTY = [['beginner', 'Beginner'], ['moderate', 'Moderate'], ['advanced', 'Advanced']];
const PRONOUNS = [['she/her', 'she/her'], ['he/him', 'he/him'], ['they/them', 'they/them']];
const KNOWLEDGE = [['none', 'None – everyday language'], ['basic', 'Basic – knows common terms'], ['moderate', 'Moderate – works near healthcare'], ['high', 'High – healthcare professional']];
const PERSONALITY = [['neutral', 'Neutral'], ['anxious', 'Anxious'], ['relaxed', 'Relaxed'], ['defensive', 'Defensive'], ['confused', 'Confused'], ['chatty', 'Chatty'], ['stoic', 'Stoic']];
const BETTER_EAR = [['right', 'Right'], ['left', 'Left'], ['same', 'Both the same']];
const DECLINE = [['gradual', 'Gradual'], ['sudden', 'Sudden'], ['none', 'No decline']];
const TINNITUS_LOC = [['', '—'], ['right', 'Right only'], ['left', 'Left only'], ['both', 'Both ears'], ['bothWorseRight', 'Both, worse right'],
  ['bothWorseLeft', 'Both, worse left'], ['central', 'Central / in the head'], ['bothAndCentral', 'Both ears and head']];
const SENS_LOC = [['', '—'], ['right', 'Right only'], ['left', 'Left only'], ['both', 'Both ears']];
const BALANCE = [['none', 'No concerns'], ['vertigo', 'Vertigo'], ['imbalance', 'Imbalance'], ['both', 'Vertigo & imbalance']];
const EAR_HEALTH = [['auralPressure', 'Aural pressure'], ['auralPain', 'Ear pain'], ['auralDrainage', 'Discharge'], ['earInfections', 'Ear infections'], ['earWax', 'Ear wax'], ['noConcerns', 'No concerns']];
const ENT_HISTORY = [['surgery', 'Surgery'], ['treatment', 'Treatment'], ['scans', 'Scans'], ['noneRelated', 'None related']];
const INFECTIONS = [['measles', 'Measles'], ['mumps', 'Mumps'], ['chickenPox', 'Chicken pox'], ['meningitis', 'Meningitis'], ['diabetes', 'Diabetes'],
  ['cancer', 'Cancer'], ['cardiovascular', 'Cardiovascular'], ['other', 'Other']];
const NOISE = [['occupational', 'Occupational'], ['recreational', 'Recreational'], ['none', 'None']];
const NB_TECH = [['', 'Not recorded'], ['AABR', 'AABR'], ['TEOAE', 'TEOAE'], ['AABR + TEOAE', 'AABR + TEOAE'], ['unknown', 'Unknown'], ['not done', 'Not done']];
const JCIH = [
  'Caregiver concern about hearing, speech, language, or development',
  'Family history of permanent childhood hearing loss',
  'NICU admission >5 days, or ECMO / ototoxic medications / loop diuretics / hyperbilirubinaemia requiring exchange transfusion',
  'In utero infection (CMV, herpes, rubella, syphilis, toxoplasmosis)',
  'Craniofacial anomalies including abnormal ear morphology',
  'Physical findings associated with a hearing loss syndrome',
  'Neurodegenerative disorder or sensory motor neuropathy',
  'Culture-positive postnatal infection associated with hearing loss (bacterial/viral meningitis)',
  'Head trauma, especially basal skull or temporal bone fracture',
  'Chemotherapy or radiation to head or neck',
].map((v) => [v, v]);

export function render(app) {
  const hc = app.c.history;
  const save = () => app.save();
  const re = () => app.refresh();
  const t = (obj, path, label, opts = {}, cb = save) => labelled(label, bound(obj, path, opts, cb), opts.hint);
  const area = (obj, path, label, hint) => h('div.field.wide', t(obj, path, label, { type: 'textarea', rows: 3, hint }));
  const yes = (obj, path, label) => h('label.check', bound(obj, path, { type: 'checkbox' }, re), ' ', label);
  const ASK = 'Use [ASK: topic] to hold a detail back until the student asks about that topic.';
  const hx = hc.history;
  const paed = !!hc.paediatricHistory;

  const insertAsk = h('button.btn.small', { type: 'button', title: 'Insert an [ASK: …] tag at the cursor', onmousedown: (e) => {
    e.preventDefault();
    const el = document.activeElement;
    if (!el || el.tagName !== 'TEXTAREA') return;
    const tag = '[ASK: ] ';
    el.setRangeText(tag, el.selectionStart, el.selectionEnd, 'end');
    el.selectionStart = el.selectionEnd = el.selectionStart - 2;
    el.dispatchEvent(new Event('change'));
  } }, 'Insert [ASK: ] tag');

  return h('div',
    stepHead(app, 'History', 'The AI patient answers from this. Details inside “[ASK: topic]” are only revealed when the student asks about that topic.', ['history']),

    section('Patient',
      h('div.inline', { style: { marginBottom: '12px' } },
        h('label.check', h('input', { type: 'checkbox', checked: paed, onchange: (e) => { setPaediatric(app.c, e.target.checked); re(); } }),
          ' Paediatric case (caregiver answers; adds the developmental history section)')),
      grid(
        t(hc.patient, 'name', paed ? 'Child’s name' : 'Name'),
        t(hc.patient, 'age', 'Age', { placeholder: 'e.g. 67, or 4 years', hint: 'Also sets the age for ABR, immittance and play.' }, re),
        paed ? null : t(hc.patient, 'occupation', 'Occupation'),
        t(hc.patient, 'pronoun', 'Pronouns', { options: PRONOUNS }),
        paed ? t(hc.patient, 'caregiverName', 'Caregiver name') : null,
        paed ? t(hc.patient, 'caregiverRelationship', 'Caregiver relationship', { placeholder: 'e.g. Mother' }) : null,
        t(hc.patient, 'medicalKnowledge', 'Medical knowledge', { options: KNOWLEDGE }),
        t(hc.patient, 'personality', 'Personality', { options: PERSONALITY }),
        t(hc.patient, 'chattiness', 'Chattiness (1 brief – 5 very talkative)', { type: 'number', min: 1, max: 5, step: 1 }),
        area(hc.patient, 'additionalNotes', 'Additional notes for the AI patient'))),

    section('Case details (history simulator library)',
      labelled('Categories', multiCheck(hc.meta, 'category', CATEGORIES, save)),
      h('div.grid', { style: { marginTop: '12px' } },
        t(hc.meta, 'difficulty', 'Difficulty', { options: DIFFICULTY }),
        area(hc.meta, 'clinicianNotes', 'Clinician notes'))),

    paed ? paediatric(hc.paediatricHistory, t, area, yes, save) : null,

    section(h('span', 'Presenting history'), h('div.inline', { style: { marginBottom: '8px' } }, insertAsk, h('span.hint', ASK)),
      grid(
        area(hx, 'reasonForAppointment', 'Reason for appointment'),
        h('div.field.wide', yes(hx, 'previousHearingTest.had', 'Previous hearing test')),
        hx.previousHearingTest.had ? area(hx, 'previousHearingTest.details', 'Previous test details') : null,
        t(hx, 'hearing.betterEar', 'Better ear', { options: BETTER_EAR }),
        t(hx, 'hearing.decline', 'Hearing decline', { options: DECLINE }),
        area(hx, 'hearing.declineDetails', 'Hearing difficulties / decline details'),
        h('div.field.wide', yes(hx, 'hearingAids.current', 'Currently wears hearing aids')),
        hx.hearingAids.current ? area(hx, 'hearingAids.details', 'Hearing aid details') : null,
        h('div.field.wide', yes(hx, 'tinnitus.present', 'Tinnitus')),
        hx.tinnitus.present ? t(hx, 'tinnitus.location', 'Tinnitus location', { options: TINNITUS_LOC }) : null,
        hx.tinnitus.present ? area(hx, 'tinnitus.details', 'Tinnitus details') : null,
        h('div.field.wide', yes(hx, 'soundSensitivity.present', 'Sound sensitivity')),
        hx.soundSensitivity.present ? t(hx, 'soundSensitivity.location', 'Sensitivity location', { options: SENS_LOC }) : null,
        hx.soundSensitivity.present ? area(hx, 'soundSensitivity.details', 'Sound sensitivity details') : null,
        t(hx, 'balance.concern', 'Balance', { options: BALANCE }, re),
        hx.balance.concern !== 'none' ? area(hx, 'balance.details', 'Balance details') : null)),

    section('Ear health and ENT',
      labelled('Ear health', multiCheck(hx, 'earHealth.experiences', EAR_HEALTH, save)),
      grid(area(hx, 'earHealth.details', 'Ear health details'),
        h('div.field.wide', yes(hx, 'ent.seen', 'Has seen an ENT specialist'))),
      hx.ent.seen ? h('div', labelled('ENT history', multiCheck(hx, 'ent.history', ENT_HISTORY, save)), grid(area(hx, 'ent.details', 'ENT details'))) : null),

    section('General health',
      grid(
        area(hx, 'generalHealth.hospitalizations', 'Hospitalisations / surgeries'),
        h('div.field.wide', yes(hx, 'generalHealth.headInjuries', 'Head injuries')),
        hx.generalHealth.headInjuries ? area(hx, 'generalHealth.headInjuriesDetails', 'Head injury details') : null),
      labelled('Past infections / conditions', multiCheck(hx, 'generalHealth.pastInfections', INFECTIONS, save)),
      grid(
        area(hx, 'generalHealth.pastInfectionsDetails', 'Infection / condition details'),
        area(hx, 'generalHealth.majorIllnesses', 'Major illnesses'),
        area(hx, 'generalHealth.medications', 'Medications'))),

    section('Noise, family and other',
      labelled('Noise exposure', multiCheck(hx, 'noiseHistory.type', NOISE, save)),
      grid(area(hx, 'noiseHistory.details', 'Noise details'),
        h('div.field.wide', yes(hx, 'familyHistory.has', 'Family history of hearing loss')),
        hx.familyHistory.has ? area(hx, 'familyHistory.details', 'Family history details') : null,
        area(hx, 'otherConcerns', 'Other concerns / questions the patient will raise'))),
  );
}

function paediatric(ph, t, area, yes, save) {
  return h('div',
    section('Birth and screening',
      h('div.grid',
        t(ph, 'prenatalAndPerinatal.gestationalAge', 'Gestational age'),
        t(ph, 'prenatalAndPerinatal.birthWeight', 'Birth weight'),
        t(ph, 'prenatalAndPerinatal.perinatalInfections', 'Perinatal infections'),
        t(ph, 'prenatalAndPerinatal.congenitalAnomalies', 'Congenital anomalies')),
      h('div.checks', { style: { margin: '10px 0' } },
        yes(ph, 'prenatalAndPerinatal.nicuAdmission', 'NICU admission'),
        yes(ph, 'prenatalAndPerinatal.perinatalHypoxia', 'Perinatal hypoxia'),
        yes(ph, 'prenatalAndPerinatal.jaundice', 'Jaundice'),
        yes(ph, 'prenatalAndPerinatal.ototoxicAntibiotics', 'Ototoxic antibiotics')),
      h('div.grid',
        t(ph, 'hearingScreening.newbornScreening.result', 'Newborn screen result'),
        t(ph, 'hearingScreening.newbornScreening.technology', 'Newborn screen technology', { options: NB_TECH }),
        t(ph, 'hearingScreening.newbornScreening.notes', 'Newborn screen notes'),
        t(ph, 'hearingScreening.b4SchoolCheck.result', 'B4 School Check result'),
        t(ph, 'hearingScreening.b4SchoolCheck.notes', 'B4 School Check notes'),
        t(ph, 'hearingScreening.currentDevices', 'Current devices'))),
    section('Speech, language and development',
      h('div.grid',
        t(ph, 'speechAndLanguage.firstBabble', 'First babble'),
        t(ph, 'speechAndLanguage.firstWord', 'First word'),
        t(ph, 'speechAndLanguage.twoWordCombinations', 'Two-word combinations'),
        t(ph, 'speechAndLanguage.currentVocabulary', 'Current vocabulary'),
        t(ph, 'speechAndLanguage.intelligibility', 'Intelligibility'),
        t(ph, 'speechAndLanguage.languages', 'Languages at home'),
        t(ph, 'speechAndLanguage.speechLanguageTherapy', 'Speech-language therapy'),
        area(ph, 'speechAndLanguage.receptiveExpressiveNotes', 'Receptive / expressive notes'),
        t(ph, 'generalDevelopment.grossMotor', 'Gross motor'),
        t(ph, 'generalDevelopment.fineMotor', 'Fine motor'),
        t(ph, 'generalDevelopment.cognitive', 'Cognitive'),
        t(ph, 'generalDevelopment.social', 'Social'),
        t(ph, 'generalDevelopment.earlyIntervention', 'Early intervention'),
        t(ph, 'generalDevelopment.schoolProgress', 'School / kindy progress'),
        t(ph, 'generalDevelopment.developmentalDiagnoses', 'Developmental diagnoses'))),
    section('Functional impact and risk factors',
      h('div.grid',
        t(ph, 'functionalImpact.homeImpact', 'At home'),
        t(ph, 'functionalImpact.schoolImpact', 'At school / kindy'),
        t(ph, 'functionalImpact.socialParticipation', 'Social participation'),
        t(ph, 'functionalImpact.listeningFatigue', 'Listening fatigue'),
        t(ph, 'functionalImpact.noiseExposure', 'Noise exposure'),
        t(ph, 'functionalImpact.existingSupport', 'Existing support')),
      h('h4', 'JCIH risk factors'),
      multiCheck(ph, 'jcihRiskFactors', JCIH, save)));
}
