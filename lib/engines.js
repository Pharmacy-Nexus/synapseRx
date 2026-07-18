const { getDrugClass } = require('./normalizer');
const { collectRecordSourceIds, resolveSourceIds } = require('./data');

function makePairs(items = []) {
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) pairs.push([items[i], items[j]]);
  }
  return pairs;
}

function sameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(item => set.has(item));
}

function includesAll(haystack = [], needles = []) {
  const set = new Set(haystack);
  return needles.every(item => set.has(item));
}

function runInteractionEngine(parsed, data) {
  const drugs = parsed.drugs || [];
  const matches = [];
  for (const record of data.interactions || []) {
    if (record.enabled === false) continue;
    if (includesAll(drugs, record.drugs || [])) matches.push(record);
  }
  const pairwise = makePairs(drugs).map(pair => ({
    pair,
    interaction: (data.interactions || []).find(record => record.enabled !== false && sameSet(record.drugs || [], pair)) || null
  }));
  return { matches, pairwise };
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termMatchesText(text = '', term = '') {
  const source = String(text || '').toLowerCase();
  const needle = String(term || '').toLowerCase().trim();
  if (!needle) return false;
  if (['blood', 'patient', 'pain'].includes(needle)) return false;
  const asciiWordish = /^[a-z0-9+\-\s/]+$/i.test(needle);
  if (asciiWordish) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'i');
    return pattern.test(source);
  }
  return source.includes(needle);
}

function normalizeRuleTrigger(rule = {}) {
  const trigger = rule.trigger || {};
  return {
    drugs: trigger.drugs || trigger.required_drugs || rule.trigger_drugs || [],
    drugClasses: trigger.drug_classes || trigger.required_drug_classes || rule.trigger_drug_classes || [],
    terms: trigger.terms || trigger.terms_any || rule.trigger_terms || [],
    allDrugs: trigger.all_drugs || rule.trigger_all_drugs || [],
    allDrugGroups: trigger.all_drug_groups || rule.trigger_all_drug_groups || [],
    allClassGroups: trigger.all_class_groups || rule.trigger_all_class_groups || [],
    requireTermsWithDrugGate: Boolean(trigger.require_terms_with_drug_gate || rule.require_terms_with_drug_gate),
    allowTermOnly: Boolean(trigger.allow_term_only || rule.allow_term_only)
  };
}

function ruleDrugHit(rule, drugs = []) {
  const triggerDrugs = normalizeRuleTrigger(rule).drugs;
  if (!triggerDrugs.length) return false;
  const set = new Set(drugs);
  return triggerDrugs.some(drug => set.has(drug));
}

function triggerClinicalRules(parsed, data, latestUserText = '') {
  const drugs = parsed.drugs || [];
  const drugSet = new Set(drugs);
  const monographs = drugs.map(drug => data.monographs?.[drug]).filter(Boolean);
  const classSet = new Set(monographs.map(m => m.class).filter(Boolean));

  return (data.clinicalRules || []).filter(rule => {
    if (rule.enabled === false) return false;
    const trigger = normalizeRuleTrigger(rule);
    const termHit = trigger.terms.some(term => termMatchesText(latestUserText, term));

    const anyClassHit = trigger.drugClasses.some(cls => classSet.has(cls));
    const anyDrugHit = trigger.drugs.some(drug => drugSet.has(drug));
    const allDrugsHit = !trigger.allDrugs.length || trigger.allDrugs.every(drug => drugSet.has(drug));
    const allDrugGroupsHit = !trigger.allDrugGroups.length || trigger.allDrugGroups.every(group =>
      (group || []).some(drug => drugSet.has(drug))
    );
    const allClassGroupsHit = !trigger.allClassGroups.length || trigger.allClassGroups.every(group =>
      (group || []).some(cls => classSet.has(cls))
    );

    const hasAnyGate = trigger.drugs.length > 0 || trigger.drugClasses.length > 0;
    const hasAllGate = trigger.allDrugs.length > 0 || trigger.allDrugGroups.length > 0 || trigger.allClassGroups.length > 0;
    const anyGateHit = !hasAnyGate || anyDrugHit || anyClassHit;
    const drugAndClassGateHit = anyGateHit && allDrugsHit && allDrugGroupsHit && allClassGroupsHit;

    if (hasAnyGate || hasAllGate) {
      if (!drugAndClassGateHit) return trigger.allowTermOnly && termHit;
      if (trigger.requireTermsWithDrugGate) return termHit;
      return true;
    }
    return termHit;
  });
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calculateMostellerBsa(weightKg, heightCm) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0 || weightKg > 500 || heightCm > 250) return null;
  return round(Math.sqrt((heightCm * weightKg) / 3600), 2);
}

function calculateBmi(weightKg, heightCm) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0 || weightKg > 500 || heightCm > 250) return null;
  const heightM = heightCm / 100;
  return round(weightKg / (heightM ** 2), 1);
}

function runDeterministicCalculations(parsed = {}) {
  const weightKg = Number(parsed.patientFactors?.weightKg);
  const heightCm = Number(parsed.patientFactors?.heightCm);
  const bsa = calculateMostellerBsa(weightKg, heightCm);
  const bmi = calculateBmi(weightKg, heightCm);

  if (bsa == null && bmi == null) return {};
  return {
    calculated_bsa_m2: bsa,
    calculated_bmi_kg_m2: bmi,
    inputs: { weight_kg: weightKg, height_cm: heightCm },
    formulas: {
      bsa: 'Mosteller: sqrt((height_cm × weight_kg) / 3600)',
      bmi: 'weight_kg / height_m²'
    },
    calculation_status: 'deterministic_code_calculation',
    safety_note: 'Use the validated numeric result. Do not ask the language model to recalculate chemotherapy doses.'
  };
}

function exactPhraseMatch(text = '', phrase = '') {
  const source = String(text || '').toLowerCase();
  const needle = String(phrase || '').trim().toLowerCase();
  if (!needle) return false;
  return termMatchesText(source, needle);
}

function scoreProtocol(protocol, parsed, latestUserText = '') {
  if (!protocol || protocol.enabled === false) return { score: 0, reasons: [] };
  const text = String(latestUserText || '').toLowerCase();
  const reasons = [];
  let score = 0;

  const code = String(protocol.protocol_code || '').trim();
  if (code && exactPhraseMatch(text, code)) {
    score += 100;
    reasons.push('exact_protocol_code');
  }

  const aliases = [protocol.name, ...(protocol.aliases || [])].filter(Boolean);
  if (aliases.some(alias => exactPhraseMatch(text, alias))) {
    score += 80;
    reasons.push('protocol_name_or_alias');
  }

  const diseaseHits = (protocol.disease_terms || []).filter(term => exactPhraseMatch(text, term));
  if (diseaseHits.length) {
    score += Math.min(30, diseaseHits.length * 15);
    reasons.push('disease_match');
  }

  const detectedDrugs = new Set(parsed.drugs || []);
  const regimenDrugs = protocol.regimen_drugs || [];
  const drugOverlap = regimenDrugs.filter(drug => detectedDrugs.has(drug));
  if (drugOverlap.length) {
    score += Math.min(40, drugOverlap.length * 20);
    reasons.push(`regimen_drug_overlap:${drugOverlap.length}`);
  }

  return { score, reasons };
}

function retrieveProtocols(parsed, data, latestUserText = '') {
  return (data.protocols || [])
    .map(protocol => {
      const match = scoreProtocol(protocol, parsed, latestUserText);
      return { ...protocol, match_score: match.score, match_reasons: match.reasons };
    })
    .filter(protocol => protocol.match_score >= Number(protocol.match_threshold || 60))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3);
}

function getFieldValue(field, parsed = {}) {
  const labs = parsed.labs || {};
  const factors = parsed.patientFactors || {};
  const drugs = new Set(parsed.drugs || []);
  const map = {
    serum_potassium: labs.serumPotassium,
    serum_creatinine: labs.serumCreatinine,
    egfr: labs.eGFR,
    renal_function: labs.eGFR ?? labs.serumCreatinine,
    inr: labs.INR,
    blood_glucose: labs.glucose,
    bleeding_symptoms: factors.bleedingSymptoms === true ? true : null,
    hydration_status: factors.dehydration === true ? 'dehydration_signal_present' : null,
    heart_failure_status: factors.heartFailure,
    liver_disease_history: factors.liverDisease !== 'unknown' ? factors.liverDisease : null,
    gestational_age: factors.gestationalAge,
    current_medicines: drugs.size ? Array.from(drugs) : null,
    concurrent_nsaid_or_potassium_sparing_diuretic: Array.from(drugs).some(drug => ['diclofenac', 'ibuprofen', 'spironolactone'].includes(drug)) ? true : null,
    concurrent_acei_arb_diuretic: Array.from(drugs).some(drug => ['ramipril', 'losartan'].includes(drug)) && Array.from(drugs).some(drug => ['furosemide', 'hydrochlorothiazide'].includes(drug)) ? true : null,
    new_interacting_medicines: drugs.size > 1 ? Array.from(drugs) : null,
    pregnancy_symptoms: null,
    fetal_movement_status: null,
    recent_dose_changes: null,
    warfarin_dose: null,
    insulin_type: null,
    dose_timing: null,
    last_meal: null,
    hypoglycemia_symptoms: null
  };
  return Object.prototype.hasOwnProperty.call(map, field) ? map[field] : null;
}

function humanizeField(field = '') {
  return String(field).replace(/_/g, ' ');
}

function collectMissingRequiredInfo(records = [], parsed = {}) {
  const missing = [];
  for (const record of records) {
    for (const field of record.required_fields || []) {
      const value = getFieldValue(field, parsed);
      if (value == null || value === false || value === '') missing.push(humanizeField(field));
    }
  }
  return Array.from(new Set(missing));
}

function retrieveEvidence(parsed, data, latestUserText = '') {
  const drugs = parsed.drugs || [];
  const monographs = drugs.map(drug => data.monographs?.[drug]).filter(Boolean);
  const interactionEngine = runInteractionEngine(parsed, data);
  const clinicalRules = triggerClinicalRules(parsed, data, latestUserText);
  const protocols = retrieveProtocols(parsed, data, latestUserText);
  const calculations = runDeterministicCalculations(parsed);
  const sourceIds = collectRecordSourceIds([
    ...monographs,
    ...interactionEngine.matches,
    ...clinicalRules,
    ...protocols
  ]);
  const sources = resolveSourceIds(sourceIds, data.sourcesRegistry || {});
  const missingRequiredInfo = collectMissingRequiredInfo([
    ...interactionEngine.matches,
    ...clinicalRules
  ], parsed);

  return {
    monographs,
    interactions: interactionEngine.matches,
    pairwise: interactionEngine.pairwise,
    clinicalRules,
    protocols,
    calculations,
    missingRequiredInfo,
    sourceIds,
    sources
  };
}

function triageRisk(parsed, evidence, text = '', data) {
  const lower = String(text).toLowerCase();
  const emergencyHits = (data.riskKeywords.emergency || []).filter(k => lower.includes(String(k).toLowerCase()));
  const highHits = (data.riskKeywords.high || []).filter(k => lower.includes(String(k).toLowerCase()));
  const moderateHits = (data.riskKeywords.moderate || []).filter(k => lower.includes(String(k).toLowerCase()));
  const severeInteractions = (evidence.interactions || []).filter(i => ['high', 'contraindicated', 'major', 'moderate_to_high'].includes(i.severity));
  const labs = parsed.labs || {};
  if (typeof labs.serumPotassium === 'number' && labs.serumPotassium >= 6) emergencyHits.push('serum potassium >= 6');
  if (typeof labs.serumPotassium === 'number' && labs.serumPotassium >= 5.5) highHits.push('hyperkalemia range potassium');
  if (typeof labs.eGFR === 'number' && labs.eGFR < 30) highHits.push('eGFR < 30');
  const akiOrOliguria = /oliguria|reduced urine|low urine|poor oral intake|dehydration|creatinine\s*(?:increased|rose|↑|up)|aki|acute kidney|قلة بول|قلة البول|جفاف/i.test(String(text));
  if (typeof labs.serumPotassium === 'number' && labs.serumPotassium >= 5.5 && akiOrOliguria) {
    emergencyHits.push('hyperkalemia with AKI/oliguria/dehydration context');
  }
  if (parsed.patientFactors?.pregnancy === true) highHits.push('pregnancy');
  let level = 'low';
  if (moderateHits.length) level = 'moderate';
  if (highHits.length || severeInteractions.length) level = 'high';
  if (emergencyHits.length) level = 'emergency';
  return {
    level,
    emergencyHits: Array.from(new Set(emergencyHits)),
    highHits: Array.from(new Set(highHits)),
    moderateHits: Array.from(new Set(moderateHits)),
    severeInteractions: severeInteractions.map(i => i.id)
  };
}

module.exports = {
  makePairs,
  sameSet,
  includesAll,
  runInteractionEngine,
  triggerClinicalRules,
  calculateMostellerBsa,
  calculateBmi,
  runDeterministicCalculations,
  scoreProtocol,
  retrieveProtocols,
  collectMissingRequiredInfo,
  retrieveEvidence,
  triageRisk
};
