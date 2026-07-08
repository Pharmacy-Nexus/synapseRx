function buildSafetyValidation(parsed, evidence, triage) {
  const flags = [];
  const mandatoryActions = [];
  const missing = parsed.missingCriticalInfo || [];

  if (triage.level === 'emergency') {
    flags.push('emergency_triage');
    mandatoryActions.push('Clearly advise urgent medical assessment for the emergency red flags detected. Do not present the case as routine.');
  }

  if (triage.level === 'high' && ((triage.highHits || []).length >= 2 || (triage.severeInteractions || []).length >= 2)) {
    flags.push('complex_high_risk_case');
    mandatoryActions.push('This appears to be a complex high-risk case. Prioritize urgent problems first, then explain secondary risks.');
  }

  if ((evidence.sources || []).length) {
    mandatoryActions.push('Always include a concise Sources used section from the provided local sources and a Confidence line at the end.');
  }

  for (const interaction of evidence.interactions || []) {
    if (['high', 'moderate_to_high', 'contraindicated', 'major'].includes(interaction.severity)) {
      flags.push(`high_risk_interaction:${interaction.id}`);
      mandatoryActions.push(`For ${interaction.drugs.join(' + ')}: mention ${interaction.risk}, required monitoring, and avoid reassuring language.`);
    }
  }

  if (missing.length) {
    flags.push('missing_critical_info');
    mandatoryActions.push(`Do not give a definitive patient-specific recommendation until missing critical data are addressed: ${missing.join(', ')}.`);
  }

  return { flags: Array.from(new Set(flags)), mandatoryActions: Array.from(new Set(mandatoryActions)) };
}

function resolveConflicts(evidence) {
  const notes = [];
  const severities = (evidence.interactions || []).map(i => i.severity).filter(Boolean);
  if (severities.includes('high') && severities.includes('low')) {
    notes.push('When evidence severity differs, use the more conservative severity for safety.');
  }
  return { notes };
}

function includesAny(text = '', patterns = []) {
  const source = String(text || '').toLowerCase();
  return patterns.some(pattern => source.includes(String(pattern).toLowerCase()));
}

function buildShadowCheck({ parsed = {}, evidence = {}, triage = {}, latestUserText = '' } = {}) {
  const hiddenRisks = [];
  const missedData = new Set(parsed.missingCriticalInfo || []);
  const urgencyChangers = [];
  const pharmacistTraps = [];
  const monitoringFocus = new Set();
  const drugs = parsed.drugs || [];
  const labs = parsed.labs || {};
  const lower = String(latestUserText || '').toLowerCase();

  if (triage.level === 'emergency') {
    hiddenRisks.push('The question should be treated as urgent, not as a routine interaction check.');
  }

  if ((triage.emergencyHits || []).length) {
    urgencyChangers.push(...triage.emergencyHits.map(hit => `Emergency trigger detected: ${hit}`));
  }
  if ((triage.highHits || []).length) {
    urgencyChangers.push(...triage.highHits.slice(0, 4).map(hit => `High-risk context: ${hit}`));
  }

  for (const interaction of evidence.interactions || []) {
    const drugNames = (interaction.drugs || []).join(' + ');
    if (interaction.severity && ['high', 'major', 'contraindicated', 'moderate_to_high'].includes(interaction.severity)) {
      hiddenRisks.push(`${drugNames}: ${interaction.risk || 'high-risk interaction may be underestimated if treated as pairwise only.'}`);
    }
    if (interaction.monitoring) monitoringFocus.add(`${drugNames}: ${interaction.monitoring}`);
    if (interaction.patient_factor_amplifiers?.length) {
      pharmacistTraps.push(`${drugNames}: check amplifiers such as ${interaction.patient_factor_amplifiers.join(', ')}.`);
    }
  }

  for (const rule of evidence.clinicalRules || []) {
    if (rule.risk) hiddenRisks.push(`${rule.name || rule.id}: ${rule.risk}`);
    for (const item of rule.required_info || []) missedData.add(item);
    if (rule.safety_action) pharmacistTraps.push(`${rule.name || rule.id}: ${rule.safety_action}`);
  }

  const hasAceOrArb = drugs.some(d => ['ramipril', 'losartan'].includes(d));
  const hasMra = drugs.includes('spironolactone');
  const hasNsaid = drugs.includes('diclofenac');
  const hasDiuretic = drugs.includes('furosemide');
  const hasWarfarin = drugs.includes('warfarin');
  const hasAmiodarone = drugs.includes('amiodarone');
  const hasMetformin = drugs.includes('metformin');

  if (hasAceOrArb && hasMra) {
    hiddenRisks.push('RAAS blocker + spironolactone can convert mild renal impairment into clinically important hyperkalemia risk.');
    missedData.add('serum potassium trend');
    missedData.add('renal function trend');
    monitoringFocus.add('K+, SCr/eGFR, urine output, BP');
  }

  if (hasAceOrArb && hasDiuretic && hasNsaid) {
    hiddenRisks.push('Triple-whammy AKI cluster: ACEI/ARB + diuretic + NSAID should be handled as one renal-risk cluster, not as separate minor interactions.');
    urgencyChangers.push('Rising creatinine, reduced urine output, dehydration, hypotension, or CKD increases urgency.');
    monitoringFocus.add('SCr/eGFR, urine output, BP, hydration status, K+');
  }

  if (hasWarfarin && hasAmiodarone) {
    hiddenRisks.push('Warfarin + amiodarone risk can intensify after the initial few days, so a normal early INR would not fully reassure.');
    missedData.add('baseline INR before amiodarone');
    missedData.add('warfarin dose and indication');
    missedData.add('active bleeding symptoms');
    urgencyChangers.push('Melena, hematuria, hematemesis, severe headache, syncope, or hemodynamic instability would make this urgent.');
    monitoringFocus.add('INR and bleeding assessment');
  }

  if (hasMetformin && typeof labs.eGFR === 'number' && labs.eGFR < 30) {
    hiddenRisks.push('Metformin risk is not only renal dosing; AKI, dehydration, hypoxia, or sepsis can raise lactic acidosis concern.');
    urgencyChangers.push('Acute illness, poor oral intake, hypoxia, or worsening renal function changes the recommendation.');
  }

  if (typeof labs.serumPotassium === 'number' && labs.serumPotassium >= 5.5) {
    missedData.add('ECG changes');
    missedData.add('muscle weakness / palpitations');
    monitoringFocus.add('Repeat potassium and ECG according to local protocol');
  }

  if (typeof labs.INR === 'number' && labs.INR > 4) {
    missedData.add('active bleeding signs');
    missedData.add('recent missed/extra warfarin doses');
    urgencyChangers.push('Any active bleeding changes the case from dose-adjustment to urgent bleeding assessment.');
  }

  if (includesAny(lower, ['dizzy', 'دوخة', 'دوخه', 'faint', 'syncope', 'اغماء', 'إغماء'])) {
    missedData.add('BP and heart rate');
    missedData.add('orthostatic symptoms');
    urgencyChangers.push('Syncope, chest pain, severe hypotension, or neurologic symptoms escalates urgency.');
  }

  return {
    enabled: ['case_analysis', 'drug_interaction'].includes(parsed.intent) || triage.level !== 'low' || hiddenRisks.length > 0,
    hidden_risks: Array.from(new Set(hiddenRisks)).slice(0, 7),
    missing_or_blind_spot_data: Array.from(missedData).slice(0, 8),
    urgency_changers: Array.from(new Set(urgencyChangers)).slice(0, 7),
    pharmacist_traps: Array.from(new Set(pharmacistTraps)).slice(0, 6),
    monitoring_focus: Array.from(monitoringFocus).slice(0, 6)
  };
}

function compactPipelineContext({ mode, parsed, evidence, triage, validation, conflictResolver, shadowCheck }) {
  return {
    mode,
    detected_intent: parsed.intent,
    parser: parsed.parser,
    parser_confidence: parsed.confidence,
    patient_context: parsed.patientFactors,
    labs: parsed.labs,
    detected_drugs: parsed.drugs,
    missing_critical_info: parsed.missingCriticalInfo,
    risk_triage: triage,
    evidence: {
      drug_monographs: (evidence.monographs || []).map(m => ({
        generic: m.generic,
        class: m.class,
        key_warnings: m.key_warnings,
        monitoring: m.monitoring,
        source: m.source
      })),
      matched_interactions: (evidence.interactions || []).map(i => ({
        id: i.id,
        drugs: i.drugs,
        severity: i.severity,
        risk: i.risk,
        mechanism: i.mechanism,
        recommendation: i.recommendation,
        monitoring: i.monitoring,
        patient_factor_amplifiers: i.patient_factor_amplifiers,
        source: i.source
      })),
      pairwise_matrix_seed: (evidence.pairwise || []).map(p => ({
        pair: p.pair,
        severity: p.interaction?.severity || 'none_known',
        id: p.interaction?.id || null,
        risk: p.interaction?.risk || null
      })),
      clinical_rules: (evidence.clinicalRules || []).map(r => ({
        id: r.id,
        name: r.name,
        risk: r.risk,
        required_info: r.required_info,
        safety_action: r.safety_action,
        source: r.source
      })),
      sources: evidence.sources || []
    },
    conflict_resolution: conflictResolver,
    safety_validation: validation,
    shadow_check: shadowCheck,
    instructions_to_composer: [
      'Use the evidence brief above as the primary source of truth.',
      'Do not claim a patient-specific decision is safe when critical data are missing.',
      'No ASCII diagrams, terminal blocks, or code blocks in clinical answers.',
      'For General Chat, avoid clinical-case headings unless the user asks for a structured assessment.',
      'Do not end with a generic question like “Would you like more details?”. Do not generate Suggested next questions or Related questions; the frontend handles contextual chips.',
      'In complex cases, prioritize urgent medication-related problems first instead of listing all interactions equally.',
      'Use prescriber-directed wording for medication holds/stops unless the user explicitly works under a local protocol.',
      'For hyperkalemia, refer to local hyperkalemia protocols and potassium-shifting/removal therapy as appropriate; do not make one resin the default.',
      'Always include Sources used and Confidence for clinical, interaction, and case answers.',
      'If shadow_check.enabled is true, include a concise Atom Shadow Check section with Hidden risks, Missing/blind-spot data, Urgency changers, and Pharmacist traps. Do not repeat the whole answer; focus on what the user could miss.'
    ]
  };
}

function buildEvidenceBrief(args) {
  const validation = buildSafetyValidation(args.parsed, args.evidence, args.triage);
  const conflictResolver = resolveConflicts(args.evidence);
  const shadowCheck = buildShadowCheck({
    parsed: args.parsed,
    evidence: args.evidence,
    triage: args.triage,
    latestUserText: args.latestUserText || ''
  });
  const pipelineContext = compactPipelineContext({
    mode: args.mode,
    parsed: args.parsed,
    evidence: args.evidence,
    triage: args.triage,
    validation,
    conflictResolver,
    shadowCheck
  });
  return { validation, conflictResolver, shadowCheck, pipelineContext };
}

module.exports = { buildSafetyValidation, resolveConflicts, buildShadowCheck, compactPipelineContext, buildEvidenceBrief };
