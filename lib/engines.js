const { getDrugClass } = require('./normalizer');

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
    if (includesAll(drugs, record.drugs || [])) matches.push(record);
  }
  const pairwise = makePairs(drugs).map(pair => ({
    pair,
    interaction: (data.interactions || []).find(record => sameSet(record.drugs || [], pair)) || null
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
  // Avoid extremely broad false positives such as the word "blood" matching "blood pressure".
  if (['blood', 'patient', 'pain'].includes(needle)) return false;
  const asciiWordish = /^[a-z0-9+\-\s/]+$/i.test(needle);
  if (asciiWordish) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'i');
    return pattern.test(source);
  }
  return source.includes(needle);
}

function ruleDrugHit(rule, drugs = []) {
  const triggerDrugs = rule.trigger_drugs || [];
  if (!triggerDrugs.length) return false;
  const set = new Set(drugs);
  return triggerDrugs.some(drug => set.has(drug));
}

function triggerClinicalRules(parsed, data, latestUserText = '') {
  const drugs = parsed.drugs || [];
  const monographs = drugs.map(drug => data.monographs?.[drug]).filter(Boolean);
  return (data.clinicalRules || []).filter(rule => {
    const triggerClasses = rule.trigger_drug_classes || [];
    const triggerTerms = rule.trigger_terms || [];
    const hasDrugOrClassGate = triggerClasses.length > 0 || (rule.trigger_drugs || []).length > 0;
    const classHit = triggerClasses.some(cls => monographs.some(m => m.class === cls));
    const drugHit = ruleDrugHit(rule, drugs);
    const termHit = triggerTerms.some(term => termMatchesText(latestUserText, term));

    // Precision rule: drug/class-specific rules must be gated by an actual matched
    // drug or drug class. This prevents broad terms like "renal" or "blood"
    // from surfacing unrelated ACEI/NSAID/warfarin sources in other cases.
    if (hasDrugOrClassGate) return classHit || drugHit;
    return termHit;
  });
}

function retrieveEvidence(parsed, data, latestUserText = '') {
  const drugs = parsed.drugs || [];
  const monographs = drugs.map(drug => data.monographs?.[drug]).filter(Boolean);
  const interactionEngine = runInteractionEngine(parsed, data);
  const clinicalRules = triggerClinicalRules(parsed, data, latestUserText);
  const sources = [
    ...monographs.map(m => m.source),
    ...interactionEngine.matches.map(i => i.source),
    ...clinicalRules.map(r => r.source)
  ].filter(Boolean);
  return {
    monographs,
    interactions: interactionEngine.matches,
    pairwise: interactionEngine.pairwise,
    clinicalRules,
    sources: Array.from(new Set(sources))
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

module.exports = { makePairs, sameSet, includesAll, runInteractionEngine, retrieveEvidence, triageRisk };
