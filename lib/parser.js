const { extractLocalDrugs, normalizeDrugList } = require('./normalizer');

function extractNumberAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function extractHeightCm(text = '') {
  const cm = extractNumberAfter(text, [
    /(?:height|ht|الطول|طول)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:cm|centimet(?:er|re)s?|سم)\b/i,
    /\b(\d{2,3}(?:\.\d+)?)\s*(?:cm|centimet(?:er|re)s?|سم)\b/i
  ]);
  if (cm != null && cm >= 80 && cm <= 250) return cm;

  const metres = extractNumberAfter(text, [
    /(?:height|ht|الطول|طول)\s*[:=]?\s*(\d(?:\.\d{1,2})?)\s*(?:m|meter|metre|متر)\b/i
  ]);
  if (metres != null && metres >= 0.8 && metres <= 2.5) return metres * 100;
  return null;
}

function extractWeightKg(text = '') {
  const kg = extractNumberAfter(text, [
    /(?:weight|wt|الوزن|وزن)\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(?:kg|kilograms?|كجم|كيلو(?:غرام)?)\b/i,
    /\b(\d{1,3}(?:\.\d+)?)\s*(?:kg|kilograms?|كجم)\b/i
  ]);
  return kg != null && kg >= 1 && kg <= 500 ? kg : null;
}

function detectSex(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/\b(male|man|gentleman)\b|\bmr\.?\b|رجل|ذكر/.test(lower)) return 'male';
  if (/\b(female|woman|lady)\b|\bmrs?\.?\b|\bms\.?\b|امرأة|انثى|أنثى/.test(lower)) return 'female';
  return null;
}

function hasBleedingSymptoms(text = '') {
  return /melena|black stool|dark stool|blood in stool|hematemesis|vomiting blood|hematuria|active bleeding|نزيف|براز أسود|براز اسود|دم في البراز|قيء دموي/i.test(String(text || ''));
}

function inferMissingInfo(parsed) {
  const missing = new Set();
  if (parsed.patientFactors?.pregnancy === true && parsed.patientFactors?.gestationalAge == null) {
    missing.add('gestational age');
  }
  return Array.from(missing);
}

function localParseQuestion({ text = '', mode = 'general_chat', data }) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const drugs = normalizeDrugList(extractLocalDrugs(source, data), data);

  const age = extractNumberAfter(source, [
    /(\d{1,3})\s*(?:[-‐‑–—]\s*)?(?:years?(?:[-‐‑–—]old)?|yrs?|yo|y\/o|سنة|عام)/i,
    /(?:age|العمر)\s*[:=]?\s*(\d{1,3})/i
  ]);
  const weightKg = extractWeightKg(source);
  const heightCm = extractHeightCm(source);
  const sex = detectSex(source);

  const eGFR = extractNumberAfter(source, [/(?:egfr|e-gfr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const serumCreatinine = extractNumberAfter(source, [
    /(?:scr|serum creatinine|creatinine|cr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    /(?:كرياتينين)\s*[:=]?\s*(\d+(?:\.\d+)?)/i
  ]);
  const baselineCreatinine = extractNumberAfter(source, [/(?:baseline\s+(?:serum\s+)?creatinine|baseline\s+scr|baseline\s+cr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const serumPotassium = extractNumberAfter(source, [
    /(?:k\+?|potassium|serum potassium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    /(?:بوتاسيوم)\s*[:=]?\s*(\d+(?:\.\d+)?)/i
  ]);
  const serumSodium = extractNumberAfter(source, [/(?:na\+?|sodium|serum sodium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const magnesium = extractNumberAfter(source, [/(?:mg2\+|mg\+\+|magnesium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const bicarbonate = extractNumberAfter(source, [/(?:hco3|hco₃|bicarbonate)\s*[-⁻]?\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const glucose = extractNumberAfter(source, [/(?:glucose|blood sugar|sugar|سكر)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const INR = extractNumberAfter(source, [/(?:inr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const ANC = extractNumberAfter(source, [/(?:anc)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const platelets = extractNumberAfter(source, [/(?:platelets?|plt)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const hemoglobin = extractNumberAfter(source, [/(?:hgb|hb|hemoglobin)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const digoxinLevel = extractNumberAfter(source, [/(?:digoxin(?:\s+level)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const QTc = extractNumberAfter(source, [/(?:qtc)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const systolicBp = extractNumberAfter(source, [/(?:bp|blood pressure|ضغط)\s*[:=]?\s*(\d{2,3})\s*\/\s*\d{2,3}/i]);
  const diastolicMatch = source.match(/(?:bp|blood pressure|ضغط)\s*[:=]?\s*\d{2,3}\s*\/\s*(\d{2,3})/i);

  const pregnancy = /pregnan|حامل|حمل/.test(lower) ? true : null;
  const renalDisease = /ckd|renal|kidney|كلى|كلية|قصور كلوي/.test(lower) || (eGFR !== null && eGFR < 60) ? 'possible_or_present' : 'unknown';
  const liverDisease = /liver|hepatic|كبد/.test(lower) ? 'possible_or_present' : 'unknown';
  const diabetes = /diabetes|diabetic|سكر|سكري/.test(lower) ? true : null;
  const hypertension = /hypertension|ضغط|blood pressure|bp/.test(lower) ? true : null;
  const heartFailure = /heart failure|hfr?ef|فشل القلب|هبوط القلب/.test(lower) ? true : null;
  const dehydration = /dehydrat|poor oral intake|reduced appetite|vomit|diarrhea|جفاف|قيء|اسهال|إسهال/.test(lower) ? true : null;

  const parsed = {
    intent: mode,
    userTask: source.slice(0, 1000),
    drugs,
    rawDrugMentions: [],
    patientFactors: {
      age,
      sex,
      weightKg,
      heightCm,
      pregnancy,
      renalDisease,
      liverDisease,
      diabetes,
      hypertension,
      heartFailure,
      dehydration,
      bleedingSymptoms: hasBleedingSymptoms(source)
    },
    labs: {
      serumPotassium,
      serumSodium,
      magnesium,
      bicarbonate,
      serumCreatinine,
      baselineCreatinine,
      eGFR,
      glucose,
      INR,
      ANC,
      platelets,
      hemoglobin,
      digoxinLevel,
      QTc,
      bloodPressure: systolicBp ? `${systolicBp}/${diastolicMatch?.[1] || '?'}` : null
    },
    missingCriticalInfo: [],
    confidence: drugs.length || weightKg || heightCm ? 0.84 : 0.6,
    parser: 'local_tool_layer_v5_20'
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
    || /\b(current|recent|latest|baseline|monitor|monitoring|symptoms|bleeding|inr|dose|labs|renal|creatinine|egfr|potassium|aki|ckd|qtc|hb|hemoglobin|bsa|weight|height|protocol|ضغط|الضغط|تحاليل|اعراض|أعراض|نزيف|جرعة|متابعة|كرياتينين|بوتاسيوم|وزن|طول|بروتوكول)\b/i.test(t);
}

function inheritContextIfNeeded({ parsed, latestUserText, messages, data }) {
  if (!isContextFollowUp(latestUserText)) return parsed;
  const contextText = getRecentContextText(messages, 8);

  if (!(parsed.drugs || []).length) {
    const contextDrugs = normalizeDrugList(extractLocalDrugs(contextText, data), data);
    if (contextDrugs.length) parsed.drugs = contextDrugs;
  }

  const contextParsed = localParseQuestion({ text: contextText, mode: parsed.intent, data });
  const patientKeys = ['age', 'sex', 'weightKg', 'heightCm', 'pregnancy', 'renalDisease', 'liverDisease', 'diabetes', 'hypertension', 'heartFailure', 'dehydration', 'bleedingSymptoms'];
  for (const key of patientKeys) {
    if (parsed.patientFactors?.[key] == null || parsed.patientFactors?.[key] === 'unknown') {
      const inherited = contextParsed.patientFactors?.[key];
      if (inherited != null && inherited !== 'unknown') parsed.patientFactors[key] = inherited;
    }
  }
  for (const [key, value] of Object.entries(contextParsed.labs || {})) {
    if (parsed.labs?.[key] == null && value != null) parsed.labs[key] = value;
  }

  parsed.context_inherited = true;
  parsed.parser = `${parsed.parser || 'parser'}+context_inheritance`;
  parsed.missingCriticalInfo = Array.from(new Set([...(parsed.missingCriticalInfo || []), ...inferMissingInfo(parsed)]));
  return parsed;
}

module.exports = {
  extractNumberAfter,
  extractHeightCm,
  extractWeightKg,
  localParseQuestion,
  inferMissingInfo,
  getRecentContextText,
  isContextFollowUp,
  inheritContextIfNeeded
};
