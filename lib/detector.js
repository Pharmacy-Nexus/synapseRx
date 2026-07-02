const { extractLocalDrugs } = require('./normalizer');

function isShortGreeting(text = '') {
  const t = String(text || '').trim().toLowerCase();
  return /^(hi|hello|hey|السلام عليكم|اهلا|أهلا|ازيك|عامل ايه|هاي|هلا|صباح الخير|مساء الخير)[!.؟\s]*$/.test(t);
}

function greetingReply() {
  return 'Hi 👋 I’m Nexus. Tell me what you need and I’ll keep it clear.';
}

function isVagueHumanQuestion(text = '') {
  const t = String(text || '').toLowerCase();
  const humanMention = /\b(person|someone|somebody|patient|friend|man|woman)\b|شخص|واحد|حد|صاحبي|صاحبتي|معايا|قدامي/.test(t);
  const needsAction = /what should i do|what do i do|help|should i|اعمل ايه|أعمل ايه|اتصرف|مفروض|الحق|اسعف|اسعاف/.test(t);
  return humanMention && needsAction;
}

function vagueHumanClarificationReply() {
  return `I need a little more detail so I do not guess.

Please add the age/sex if known, what happened, the main symptom, whether the person is conscious and breathing normally, and any current medicines or known diseases.

> [!WARNING] If there is loss of consciousness, severe breathing difficulty, heavy bleeding, chest pain, seizure, severe allergic swelling, or major trauma, seek emergency help immediately.`;
}

function isGeneralKnowledgeQuestion(text = '') {
  const t = String(text).toLowerCase();
  return /what is|explain|difference between|define|meaning|active ingredient|excipient|manufactur|formulation|herb|plant|mechanism of action|class of|ما هي|ما هو|يعني ايه|اشرح|الفرق|المادة الفعالة|مادة فعالة|مادة اضافية|مادة إضافية|سواغ|تصنيع|تركيبة|نبتة|نبات|استخدام/.test(t);
}

function detectModeFromText(text = '', data) {
  const t = String(text).toLowerCase();
  const hasDrug = extractLocalDrugs(text, data).length > 0;

  if (/reverse|quiz|train|scenario|clue|guess|interactive|عكس|تدريب|اختبرني|اختبار/.test(t)) return 'drug_reverse';
  if (isVagueHumanQuestion(text)) return 'case_analysis';

  const explicitInteraction = /\b(interaction|interact|contraindication|combine|together|safe with|with)\b|\+|مع بعض|ينفع مع|تداخل|تفاعل|يتعارض|تعارض/.test(t);
  if (hasDrug && explicitInteraction) return 'drug_interaction';

  const clearCase = /patient|case|year-old|y\/o|male|female|serum|creatinine|egfr|potassium\s*[=:]?\s*\d|sodium|bp\s*[=:]|hr\s*[=:]|labs|diagnosis|symptoms|pregnan|مريض|حالة|تحاليل|كرياتينين|ضغطه|سكره|حامل|الأعراض|اعراض/.test(t);
  if (clearCase) return 'case_analysis';

  return 'general_chat';
}

function hasMedicalSignal(text = '', data) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (isShortGreeting(t)) return true;
  if (extractLocalDrugs(text, data).length) return true;
  const medicalTerms = [
    'emergency', 'urgent', 'first aid', 'trauma', 'bleeding', 'fainted', 'unconscious', 'seizure', 'breathing difficulty', 'chest pain',
    'drug', 'drugs', 'medicine', 'medicines', 'medication', 'medications', 'pill', 'tablet', 'capsule', 'dose', 'dosage', 'side effect', 'adverse', 'interaction', 'contraindication', 'pharmacy', 'pharmacology', 'pharmacist', 'clinical', 'patient', 'case', 'lab', 'labs', 'diagnosis', 'symptom', 'symptoms', 'treatment', 'therapy', 'monitoring', 'pregnancy', 'pregnant', 'renal', 'hepatic', 'kidney', 'liver', 'blood pressure', 'glucose', 'insulin', 'warfarin', 'antibiotic', 'analgesic', 'guideline', 'study pharmacology', 'active ingredient', 'excipient', 'formulation', 'manufacturing', 'otc', 'rx', 'prescription', 'contraindicated', 'safe', 'safety', 'toxicity', 'toxic', 'clinical trial',
    'دواء', 'ادوية', 'أدوية', 'دوا', 'علاج', 'أقراص', 'اقراص', 'كبسول', 'حقن', 'شراب', 'جرعة', 'اعراض', 'أعراض', 'عرض جانبي', 'اثار جانبية', 'آثار جانبية', 'تفاعل', 'تداخل', 'صيدلة', 'صيدلي', 'مريض', 'حالة', 'تحاليل', 'تحليل', 'تشخيص', 'مضاد', 'مسكن', 'حامل', 'حمل', 'ضغط', 'سكر', 'كلى', 'كلية', 'كبد', 'حساسية', 'موانع', 'متابعة', 'مذاكرة فارما', 'فارما', 'كلينيكال', 'طبي', 'ميديكال', 'مادة فعالة', 'مادة إضافية', 'مادة اضافية', 'سواغ', 'تصنيع', 'تركيبة', 'طوارئ', 'اسعاف', 'إسعاف', 'نزيف', 'اغماء', 'إغماء', 'تشنج', 'اختناق', 'حادث', 'وقعة', 'كسر', 'جرح', 'بيتنفس', 'مش بيتنفس', 'ينفع', 'آمن', 'امن', 'خطر', 'ضرر', 'اضرار', 'أضرار', 'فوائد', 'بديل', 'يتاخد', 'يتاخد مع', 'معاه', 'معاها'
  ];
  return medicalTerms.some(term => t.includes(term));
}

function isLikelyFollowUp(text = '') {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (t.length <= 90 && /^(why|how|and|so|ok|okay|then|what about|what if|explain more|continue|ليه|ازاي|إزاي|طب|طيب|تمام|كمل|وضح|اشرح|يعني|وبعدين|والبديل|البديل|ينفع|امتى|مينفعش|معاه|معاها|ده|دي|دول|هو|هي|كده|اها|اه)$/.test(t.replace(/[؟?!.]+$/g, '').trim())) return true;
  return t.length <= 140 && /(ليه|ازاي|إزاي|طب|طيب|يعني|كمل|وضح|اشرح|ينفع|مينفعش|بديل|معاه|معاها|ده|دي|دول|what about|what if|why|how)/.test(t);
}

function isClearlyNonMedical(text = '') {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  const nonMedicalPatterns = [
    /\b(football|soccer|match score|premier league|champions league|stock price|crypto|bitcoin|weather forecast|restaurant|hotel booking|flight ticket|recipe|game walkthrough)\b/,
    /\b(write|debug|fix|compile)\b.*\b(html|css|javascript|python|react|node|sql|api)\b/,
    /\b(car|motorcycle|real estate|mortgage|tax return|legal contract)\b/,
    /ماتش|كورة|الدوري|سعر الدولار|بيتكوين|طقس|مطعم|حجز فندق|تذكرة طيران|وصفة طبخ|لعبة|سيارة|عربية|عقار|ضرايب/
  ];
  return nonMedicalPatterns.some(pattern => pattern.test(t));
}

function isMedicalInScope(text = '', data, contextText = '') {
  const latest = String(text || '');
  const context = String(contextText || '');
  const combined = `${context}\n${latest}`;

  if (hasMedicalSignal(latest, data)) return true;
  if (isLikelyFollowUp(latest) && hasMedicalSignal(combined, data)) return true;
  if (isVagueHumanQuestion(latest)) return true;

  // Scope guard is intentionally soft. Ambiguous user messages should reach the model,
  // because the model can ask for clarification; hard-blocking them makes Nexus feel broken.
  if (!isClearlyNonMedical(latest)) return true;

  // Even a non-medical-looking follow-up can belong to an active clinical discussion.
  if (hasMedicalSignal(context, data)) return true;

  return false;
}

function outOfScopeReply(text = '') {
  if (isShortGreeting(text)) return greetingReply();
  return `I’m built mainly for medical, pharmacy, drug-safety, pharmacology, formulation, and patient-case discussions.

This looks outside that workspace. If it connects to a medicine, symptom, patient case, formulation, or clinical decision, send that context and I’ll help.`;
}

module.exports = { isShortGreeting, greetingReply, isVagueHumanQuestion, vagueHumanClarificationReply, isGeneralKnowledgeQuestion, detectModeFromText, isMedicalInScope, outOfScopeReply };
