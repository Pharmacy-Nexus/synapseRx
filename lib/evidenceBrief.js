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
    mandatoryActions.push('Use only the resolved Sources used entries supplied in the Evidence Brief; do not invent citation titles.');
  }

  for (const interaction of evidence.interactions || []) {
    if (['high', 'moderate_to_high', 'contraindicated', 'major'].includes(interaction.severity)) {
      flags.push(`high_risk_interaction:${interaction.id}`);
      mandatoryActions.push(`For ${interaction.drugs.join(' + ')}: mention ${interaction.risk}, required monitoring, and avoid reassuring language.`);
    }
  }

  for (const protocol of evidence.protocols || []) {
    flags.push(`matched_protocol:${protocol.id}`);
    mandatoryActions.push(`Protocol ${protocol.protocol_code}: use only its supplied structured facts for protocol-specific status, eligibility, or monitoring. Do not infer missing protocol details.`);
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
  if ((evidence.protocols || []).length > 1) {
    notes.push('More than one protocol matched. Prefer the exact protocol-code match and state ambiguity if scores are close.');
  }
  return { notes };
}

function addAll(target, values = []) {
  for (const value of values || []) if (value) target.add(String(value));
}

function buildShadowCheck({ parsed = {}, evidence = {}, triage = {} } = {}) {
  const hiddenRisks = new Set();
  const missedData = new Set(parsed.missingCriticalInfo || []);
  const urgencyChangers = new Set();
  const pharmacistTraps = new Set();
  const monitoringFocus = new Set();

  if (triage.level === 'emergency') {
    hiddenRisks.add('The question should be treated as urgent, not as a routine interaction check.');
  }
  addAll(urgencyChangers, (triage.emergencyHits || []).map(hit => `Emergency trigger detected: ${hit}`));
  addAll(urgencyChangers, (triage.highHits || []).slice(0, 5).map(hit => `High-risk context: ${hit}`));

  for (const interaction of evidence.interactions || []) {
    const label = (interaction.drugs || []).join(' + ') || interaction.id;
    if (interaction.risk) hiddenRisks.add(`${label}: ${interaction.risk}`);
    addAll(monitoringFocus, interaction.monitoring || []);
    addAll(missedData, (interaction.required_fields || []).map(field => String(field).replace(/_/g, ' ')));
    addAll(urgencyChangers, interaction.urgency_changers || []);
    addAll(pharmacistTraps, interaction.pharmacist_traps || []);
    if (interaction.patient_factor_amplifiers?.length) {
      pharmacistTraps.add(`${label}: check amplifiers such as ${interaction.patient_factor_amplifiers.join(', ')}.`);
    }
  }

  for (const rule of evidence.clinicalRules || []) {
    const label = rule.name || rule.id;
    if (rule.risk) hiddenRisks.add(`${label}: ${rule.risk}`);
    addAll(missedData, rule.required_info || []);
    addAll(missedData, (rule.required_fields || []).map(field => String(field).replace(/_/g, ' ')));
    addAll(monitoringFocus, rule.monitoring || []);
    addAll(urgencyChangers, rule.urgency_changers || []);
    addAll(pharmacistTraps, rule.pharmacist_traps || []);
    if (rule.safety_action) pharmacistTraps.add(`${label}: ${rule.safety_action}`);
  }

  for (const protocol of evidence.protocols || []) {
    const label = protocol.protocol_code || protocol.id;
    hiddenRisks.add(`${label}: protocol-specific facts must come from the matched structured protocol, not general model memory.`);
    addAll(missedData, protocol.baseline_requirements || []);
    pharmacistTraps.add(`${label}: do not invent dose modifications, thresholds, benefit status, or eligibility not present in the matched protocol record.`);
  }

  if (evidence.calculations?.calculated_bsa_m2 != null) {
    monitoringFocus.add(`Validated BSA: ${evidence.calculations.calculated_bsa_m2} m² by Mosteller.`);
    pharmacistTraps.add('Use the deterministic BSA value; do not recalculate it in free text or derive a chemotherapy dose without a verified protocol dose field.');
  }

  return {
    enabled: ['case_analysis', 'drug_interaction'].includes(parsed.intent) || triage.level !== 'low' || hiddenRisks.size > 0,
    hidden_risks: Array.from(hiddenRisks).slice(0, 8),
    missing_or_blind_spot_data: Array.from(missedData).slice(0, 10),
    urgency_changers: Array.from(urgencyChangers).slice(0, 8),
    pharmacist_traps: Array.from(pharmacistTraps).slice(0, 8),
    monitoring_focus: Array.from(monitoringFocus).slice(0, 8)
  };
}

function compactSource(source = {}) {
  return {
    id: source.id,
    title: source.title,
    publisher: source.publisher,
    source_type: source.source_type,
    version_date: source.version_date || null,
    url: source.url || null,
    license_status: source.license_status || null
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
    deterministic_calculations: evidence.calculations || {},
    missing_critical_info: parsed.missingCriticalInfo,
    risk_triage: triage,
    evidence: {
      drug_monographs: (evidence.monographs || []).map(m => ({
        generic: m.generic,
        aliases: m.aliases,
        class: m.class,
        core_uses: m.core_uses,
        key_warnings: m.key_warnings,
        monitoring: m.monitoring,
        source_ids: m.source_ids
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
        source_ids: i.source_ids
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
        required_fields: r.required_fields,
        safety_action: r.safety_action,
        monitoring: r.monitoring,
        urgency_changers: r.urgency_changers,
        pharmacist_traps: r.pharmacist_traps,
        source_ids: r.source_ids
      })),
      matched_protocols: (evidence.protocols || []).map(p => ({
        id: p.id,
        protocol_code: p.protocol_code,
        name: p.name,
        organization: p.organization,
        match_score: p.match_score,
        match_reasons: p.match_reasons,
        regimen_drugs: p.regimen_drugs,
        facts: p.facts,
        baseline_requirements: p.baseline_requirements,
        source_ids: p.source_ids,
        last_reviewed: p.last_reviewed
      })),
      source_ids: evidence.sourceIds || [],
      resolved_sources: (evidence.sources || []).map(compactSource)
    },
    conflict_resolution: conflictResolver,
    safety_validation: validation,
    shadow_check: shadowCheck,
    instructions_to_composer: [
      'Use the Evidence Brief as the primary source of truth when it matches the request.',
      'Treat deterministic_calculations as locked numeric facts. Never recalculate BSA/BMI or derive a chemotherapy dose from memory.',
      'When matched_protocols contains an exact protocol match, use only its structured protocol facts. Do not invent missing benefit status, eligibility, thresholds, dosing, or dose modifications.',
      'Cite only resolved_sources supplied here. Do not create or rename sources.',
      'Do not claim a patient-specific decision is safe when critical data are missing.',
      'No ASCII diagrams, terminal blocks, or code blocks in clinical answers unless explicitly requested.',
      'For General Chat, avoid clinical-case headings unless the user asks for a structured assessment.',
      'Follow exact output constraints such as “answer only” or a requested line count; do not add Sources/Confidence unless clinically required by the request.',
      'Do not generate Suggested next questions or Related questions; the frontend handles contextual chips.',
      'In complex cases, prioritize urgent medication-related problems first instead of listing all interactions equally.',
      'Use prescriber-directed wording for medication holds/stops unless the user explicitly works under a local protocol.',
      'For hyperkalemia, refer to local hyperkalemia protocols and potassium-shifting/removal therapy as appropriate; do not make one resin the default.',
      'If shadow_check.enabled is true, include a concise Atom Shadow Check only when it adds new safety value.'
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
