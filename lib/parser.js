const { extractLocalDrugs, normalizeDrugList } = require('./normalizer');

function extractNumberAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function inferMissingInfo(parsed) {
  const drugs = parsed.drugs || [];
  const missing = new Set();
  const hasAceOrArb = drugs.some(d => ['ramipril', 'losartan'].includes(d));
  const hasK = drugs.includes('potassium chloride');
  const hasNsaid = drugs.includes('diclofenac');
  const hasWarfarin = drugs.includes('warfarin');
  const hasInsulin = drugs.includes('insulin');

  if ((hasAceOrArb && hasK) || (hasAceOrArb && hasNsaid)) {
    if (parsed.labs?.serumPotassium == null) missing.add('serum potassium');
    if (parsed.labs?.serumCreatinine == null) missing.add('serum creatinine');
    if (parsed.labs?.eGFR == null) missing.add('eGFR / renal function');
  }
  if (hasWarfarin) {
    missing.add('current INR');
    missing.add('bleeding symptoms');
    missing.add('recent warfarin dose changes');
  }
  if (hasInsulin) {
    missing.add('current blood glucose reading');
    missing.add('insulin type and timing');
    missing.add('last meal timing');
  }
  if (parsed.patientFactors?.pregnancy === true) {
    missing.add('gestational age');
    missing.add('pregnancy symptoms / red flags');
  }
  return Array.from(missing);
}

function localParseQuestion({ text = '', mode = 'general_chat', data }) {
  const lower = String(text).toLowerCase();
  const drugs = normalizeDrugList(extractLocalDrugs(text, data), data);
  const age = extractNumberAfter(text, [/(\d{1,3})\s*(?:years?|yrs?|yo|y\/o|سنة|عام)/i, /(?:age|العمر)\s*[:=]?\s*(\d{1,3})/i]);
  const eGFR = extractNumberAfter(text, [/(?:egfr|e-gfr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const serumCreatinine = extractNumberAfter(text, [/(?:scr|creatinine|serum creatinine|cr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /(?:كرياتينين)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const serumPotassium = extractNumberAfter(text, [/(?:k\+?|potassium|serum potassium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /(?:بوتاسيوم)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const glucose = extractNumberAfter(text, [/(?:glucose|blood sugar|sugar|سكر)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const INR = extractNumberAfter(text, [/(?:inr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const systolicBp = extractNumberAfter(text, [/(?:bp|blood pressure|ضغط)\s*[:=]?\s*(\d{2,3})\s*\/\s*\d{2,3}/i]);
  const diastolicMatch = String(text).match(/(?:bp|blood pressure|ضغط)\s*[:=]?\s*\d{2,3}\s*\/\s*(\d{2,3})/i);

  const pregnancy = /pregnan|حامل|حمل/.test(lower) ? true : null;
  const renalDisease = /ckd|renal|kidney|كلى|كلية|قصور كلوي/.test(lower) || (eGFR !== null && eGFR < 60) ? 'possible_or_present' : 'unknown';
  const liverDisease = /liver|hepatic|كبد/.test(lower) ? 'possible_or_present' : 'unknown';
  const diabetes = /diabetes|diabetic|سكر|سكري/.test(lower) ? true : null;
  const hypertension = /hypertension|ضغط|blood pressure|bp/.test(lower) ? true : null;

  const parsed = {
    intent: mode,
    userTask: String(text).slice(0, 500),
    drugs,
    rawDrugMentions: [],
    patientFactors: { age, pregnancy, renalDisease, liverDisease, diabetes, hypertension },
    labs: { serumPotassium, serumCreatinine, eGFR, glucose, INR, bloodPressure: systolicBp ? `${systolicBp}/${diastolicMatch?.[1] || '?'}` : null },
    missingCriticalInfo: [],
    confidence: drugs.length ? 0.82 : 0.58,
    parser: 'local_tool_layer'
  };
  parsed.missingCriticalInfo = inferMissingInfo(parsed);
  return parsed;
}

function getRecentContextText(messages = [], limit = 8) {
  return (messages || [])
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .slice(-limit)
    .map(message => `${message.role}: ${String(message.content || '').slice(0, 2500)}`)
    .join('\n\n');
}

function isContextFollowUp(text = '') {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  const continuation = /\b(continue|resume|finish|complete|stopped at|cut off|truncated)\b/i.test(t)
    || /(كمل|كمله|كمّل|اكمل|أكمل|استكمل|فين تكملة|فين تكمله|وقف عند|اتقطع|مكملتش|باقي الكلام|باقى الكلام)/.test(t);
  return continuation
    || /^(what|which|how|when|why|هل|ايه|إيه|ما|متى|ازاي|كيف|طب|طيب)\b/.test(t)
    || /\b(current|recent|latest|baseline|monitor|monitoring|symptoms|bleeding|inr|dose|labs|renal|creatinine|egfr|potassium|aki|ckd|qtc|hb|hemoglobin|nephrotoxin|nephrotoxins|fluid|fluids|hypotension|bradycardia|melena|stools|apixaban|amiodarone|metformin|ramipril|spironolactone|diclofenac|furosemide|clarithromycin|ضغط|الضغط|تحاليل|اعراض|أعراض|نزيف|جرعة|متابعة|كرياتينين|بوتاسيوم|رسم قلب|براز|سيولة)\b/i.test(t);
}

function inheritContextIfNeeded({ parsed, latestUserText, messages, data }) {
  if ((parsed.drugs || []).length || !isContextFollowUp(latestUserText)) return parsed;
  const contextDrugs = normalizeDrugList(extractLocalDrugs(getRecentContextText(messages, 8), data), data);
  if (contextDrugs.length) {
    parsed.drugs = contextDrugs;
    parsed.context_inherited = true;
    parsed.parser = `${parsed.parser || 'parser'}+context_drug_inheritance`;
    parsed.missingCriticalInfo = Array.from(new Set([...(parsed.missingCriticalInfo || []), ...inferMissingInfo(parsed)]));
  }
  return parsed;
}

module.exports = { localParseQuestion, inferMissingInfo, getRecentContextText, isContextFollowUp, inheritContextIfNeeded };
