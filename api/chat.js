const fs = require("fs");
const path = require("path");

const API_URL = process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = process.env.NVIDIA_MODEL || "moonshotai/kimi-k2.6";

const MODE_LABELS = {
  general_chat: "General Chat",
  case_analysis: "Case Analysis",
  drug_interaction: "Drug Interaction",
  drug_reverse: "Drug Reverse Interactive Training"
};

const DATA = loadClinicalData();

function loadClinicalData() {
  return {
    aliases: readJson("drug_aliases.json", {}),
    monographs: readJson("drug_monographs.json", {}),
    interactions: readJson("interactions.json", []),
    clinicalRules: readJson("clinical_rules.json", []),
    riskKeywords: readJson("risk_keywords.json", { emergency: [], high: [], moderate: [] })
  };
}

function readJson(fileName, fallback) {
  try {
    const filePath = path.join(__dirname, "..", "data", fileName);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`Could not load ${fileName}:`, error.message);
    return fallback;
  }
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === "string") {
        try { return resolve(JSON.parse(req.body)); }
        catch (error) { return reject(error); }
      }
      return resolve(req.body);
    }

    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getLatestUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return String(messages[i].content || "");
  }
  return "";
}

function normalizeMessages(messages = []) {
  return messages
    .filter(message => message && (message.role === "user" || message.role === "assistant") && String(message.content || "").trim())
    .map(message => ({ role: message.role, content: String(message.content || "") }));
}

function detectModeFromText(text = "") {
  const t = String(text).toLowerCase();
  if (/reverse|quiz|train|scenario|clue|guess|interactive|عكس|تدريب|اختبرني/.test(t)) return "drug_reverse";
  if (/interaction|interact|contraindication|combine|together|safe with|warfarin|amiodarone|safety|تداخل|تفاعل|مع بعض|ينفع مع/.test(t)) return "drug_interaction";
  if (/patient|case|year-old|y\/o|male|female|serum|creatinine|egfr|potassium|sodium|bp|hr|labs|مريض|حالة|تحاليل|ضغطه|سكره/.test(t)) return "case_analysis";
  return "general_chat";
}

function attachmentContext(messages = []) {
  const blocks = [];
  messages.forEach((message, index) => {
    const files = Array.isArray(message.attachments) ? message.attachments : [];
    if (!files.length) return;
    const fileText = files.map(file => {
      const header = `File: ${file.name || "untitled"} | Type: ${file.type || "unknown"} | Size: ${file.size || 0} bytes`;
      if (file.text) return `${header}\nContent:\n${file.text}`;
      return `${header}\nContent not extracted. Ask the user to paste text from this file if clinical details are needed.`;
    }).join("\n\n");
    blocks.push(`Attachments linked to message ${index + 1}:\n${fileText}`);
  });
  return blocks.length ? `\n\nAttachment context:\n${blocks.join("\n\n---\n\n")}` : "";
}

function getAliasIndex() {
  const index = [];
  for (const [generic, aliases] of Object.entries(DATA.aliases || {})) {
    [generic, ...(aliases || [])].forEach(alias => {
      if (!alias) return;
      index.push({ generic, alias: String(alias).toLowerCase() });
    });
  }
  index.sort((a, b) => b.alias.length - a.alias.length);
  return index;
}

function containsLoose(text, phrase) {
  const lower = String(text || "").toLowerCase();
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ascii = /^[a-z0-9\-\s]+$/i.test(phrase);
  if (ascii) return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(lower);
  return lower.includes(phrase.toLowerCase());
}

function extractLocalDrugs(text = "") {
  const found = new Set();
  for (const item of getAliasIndex()) {
    if (containsLoose(text, item.alias)) found.add(item.generic);
  }
  return Array.from(found);
}

function extractNumberAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function localParseQuestion(text = "", mode = "general_chat") {
  const lower = String(text).toLowerCase();
  const drugs = extractLocalDrugs(text);
  const age = extractNumberAfter(text, [/(\d{1,3})\s*(?:years?|yrs?|yo|y\/o|سنة|عام)/i, /(?:age|العمر)\s*[:=]?\s*(\d{1,3})/i]);
  const eGFR = extractNumberAfter(text, [/(?:egfr|e-gfr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const serumCreatinine = extractNumberAfter(text, [/(?:scr|creatinine|serum creatinine|cr)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /(?:كرياتينين)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const serumPotassium = extractNumberAfter(text, [/(?:k\+?|potassium|serum potassium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /(?:بوتاسيوم)\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const systolicBp = extractNumberAfter(text, [/(?:bp|blood pressure|ضغط)\s*[:=]?\s*(\d{2,3})\s*\/\s*\d{2,3}/i]);
  const diastolicMatch = String(text).match(/(?:bp|blood pressure|ضغط)\s*[:=]?\s*\d{2,3}\s*\/\s*(\d{2,3})/i);

  const pregnancy = /pregnan|حامل|حمل/.test(lower) ? true : null;
  const renalDisease = /ckd|renal|kidney|كلى|كلية|قصور كلوي/.test(lower) || (eGFR !== null && eGFR < 60) ? "possible_or_present" : "unknown";
  const liverDisease = /liver|hepatic|كبد/.test(lower) ? "possible_or_present" : "unknown";
  const diabetes = /diabetes|diabetic|سكر|سكري/.test(lower) ? true : null;
  const hypertension = /hypertension|ضغط|blood pressure|bp/.test(lower) ? true : null;

  const missingCriticalInfo = inferMissingInfo({
    drugs,
    patientFactors: { age, pregnancy, renalDisease, liverDisease, diabetes, hypertension },
    labs: { serumPotassium, serumCreatinine, eGFR, bloodPressure: systolicBp ? `${systolicBp}/${diastolicMatch?.[1] || "?"}` : null }
  });

  return {
    intent: mode,
    userTask: String(text).slice(0, 500),
    drugs,
    patientFactors: { age, pregnancy, renalDisease, liverDisease, diabetes, hypertension },
    labs: { serumPotassium, serumCreatinine, eGFR, bloodPressure: systolicBp ? `${systolicBp}/${diastolicMatch?.[1] || "?"}` : null },
    missingCriticalInfo,
    confidence: drugs.length ? 0.76 : 0.52,
    parser: "local_fallback"
  };
}

function inferMissingInfo(parsed) {
  const drugs = parsed.drugs || [];
  const missing = new Set();
  const hasAceOrArb = drugs.some(d => ["ramipril", "losartan"].includes(d));
  const hasK = drugs.includes("potassium chloride");
  const hasNsaid = drugs.includes("diclofenac");
  const hasWarfarin = drugs.includes("warfarin");
  const hasInsulin = drugs.includes("insulin");

  if ((hasAceOrArb && hasK) || (hasAceOrArb && hasNsaid)) {
    if (parsed.labs?.serumPotassium == null) missing.add("serum potassium");
    if (parsed.labs?.serumCreatinine == null) missing.add("serum creatinine");
    if (parsed.labs?.eGFR == null) missing.add("eGFR / renal function");
  }
  if (hasWarfarin) {
    missing.add("current INR");
    missing.add("bleeding symptoms");
    missing.add("recent warfarin dose changes");
  }
  if (hasInsulin) {
    missing.add("current blood glucose reading");
    missing.add("insulin type and timing");
    missing.add("last meal timing");
  }
  if (parsed.patientFactors?.pregnancy === true) {
    missing.add("gestational age");
    missing.add("pregnancy symptoms / red flags");
  }
  return Array.from(missing);
}

async function parseQuestionWithAI({ text, mode, attachments }) {
  const fallback = localParseQuestion(text, mode);
  if (!process.env.NVIDIA_API_KEY) return fallback;

  const system = `You are a strict clinical question parser. Return ONLY valid compact JSON. No Markdown.
Schema:
{
  "intent":"general_chat|case_analysis|drug_interaction|drug_reverse|drug_info|report",
  "userTask":"short task summary",
  "drugs":["generic names only when known"],
  "rawDrugMentions":["as written"],
  "patientFactors":{"age":number|null,"sex":string|null,"pregnancy":boolean|null,"renalDisease":"present|absent|unknown|possible_or_present","liverDisease":"present|absent|unknown|possible_or_present","diabetes":boolean|null,"hypertension":boolean|null},
  "labs":{"serumPotassium":number|null,"serumCreatinine":number|null,"eGFR":number|null,"bloodPressure":string|null,"glucose":number|null,"INR":number|null},
  "missingCriticalInfo":["..."],
  "confidence":number
}
Rules:
- Do not invent values.
- If the user mentions multiple drugs, include all drugs.
- For interactions, extract all pairwise drug candidates.
- Use null/unknown when not provided.`;

  const user = `Question:\n${text}\n${attachments ? `\nAttachment summary:\n${attachments.slice(0, 6000)}` : ""}`;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_tokens: 700,
        temperature: 0,
        top_p: 0.8,
        stream: false
      })
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(extractJson(raw));
    if (!parsed || typeof parsed !== "object") return fallback;

    return mergeParsed(fallback, parsed, mode);
  } catch (error) {
    console.warn("Parser AI failed:", error.message);
    return fallback;
  }
}

function extractJson(text = "") {
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function safeParseJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function mergeParsed(local, ai, mode) {
  const aiDrugs = Array.isArray(ai.drugs) ? ai.drugs : [];
  const localDrugs = Array.isArray(local.drugs) ? local.drugs : [];
  const drugs = normalizeDrugList([...aiDrugs, ...localDrugs, ...(ai.rawDrugMentions || [])]);
  const merged = {
    intent: ai.intent || mode || local.intent,
    userTask: ai.userTask || local.userTask,
    drugs,
    rawDrugMentions: Array.isArray(ai.rawDrugMentions) ? ai.rawDrugMentions : [],
    patientFactors: { ...local.patientFactors, ...(ai.patientFactors || {}) },
    labs: { ...local.labs, ...(ai.labs || {}) },
    missingCriticalInfo: Array.from(new Set([...(local.missingCriticalInfo || []), ...((Array.isArray(ai.missingCriticalInfo) && ai.missingCriticalInfo) || [])])),
    confidence: typeof ai.confidence === "number" ? Math.max(Math.min(ai.confidence, 1), 0) : local.confidence,
    parser: "ai_plus_local"
  };
  merged.missingCriticalInfo = Array.from(new Set([...merged.missingCriticalInfo, ...inferMissingInfo(merged)]));
  return merged;
}

function normalizeDrugList(items = []) {
  const found = new Set();
  const aliasIndex = getAliasIndex();
  for (const value of items) {
    const text = String(value || "").toLowerCase().trim();
    if (!text) continue;
    if (DATA.monographs[text]) {
      found.add(text);
      continue;
    }
    const exact = aliasIndex.find(item => item.alias === text);
    if (exact) {
      found.add(exact.generic);
      continue;
    }
    const loose = aliasIndex.find(item => text.includes(item.alias) || item.alias.includes(text));
    if (loose) found.add(loose.generic);
  }
  return Array.from(found);
}

function makePairs(items = []) {
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      pairs.push([items[i], items[j]]);
    }
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

function runInteractionEngine(parsed) {
  const drugs = parsed.drugs || [];
  const matches = [];
  for (const record of DATA.interactions || []) {
    if (includesAll(drugs, record.drugs || [])) matches.push(record);
  }

  const pairwise = makePairs(drugs).map(pair => ({
    pair,
    interaction: (DATA.interactions || []).find(record => sameSet(record.drugs || [], pair)) || null
  }));

  return { matches, pairwise };
}

function getDrugClass(generic) {
  return DATA.monographs?.[generic]?.class || "";
}

function retrieveEvidence(parsed, latestUserText = "") {
  const drugs = parsed.drugs || [];
  const monographs = drugs.map(drug => DATA.monographs?.[drug]).filter(Boolean);
  const interactionEngine = runInteractionEngine(parsed);
  const lower = String(latestUserText).toLowerCase();

  const triggeredRules = (DATA.clinicalRules || []).filter(rule => {
    const classHit = (rule.trigger_drug_classes || []).some(cls => monographs.some(m => m.class === cls));
    const termHit = (rule.trigger_terms || []).some(term => lower.includes(String(term).toLowerCase()));
    return classHit || termHit;
  });

  const sources = [
    ...monographs.map(m => m.source),
    ...interactionEngine.matches.map(i => i.source),
    ...triggeredRules.map(r => r.source)
  ].filter(Boolean);

  return {
    monographs,
    interactions: interactionEngine.matches,
    pairwise: interactionEngine.pairwise,
    clinicalRules: triggeredRules,
    sources: Array.from(new Set(sources))
  };
}

function triageRisk(parsed, evidence, text = "") {
  const lower = String(text).toLowerCase();
  const emergencyHits = (DATA.riskKeywords.emergency || []).filter(k => lower.includes(String(k).toLowerCase()));
  const highHits = (DATA.riskKeywords.high || []).filter(k => lower.includes(String(k).toLowerCase()));
  const moderateHits = (DATA.riskKeywords.moderate || []).filter(k => lower.includes(String(k).toLowerCase()));

  const severeInteractions = (evidence.interactions || []).filter(i => ["high", "contraindicated", "major", "moderate_to_high"].includes(i.severity));
  const labs = parsed.labs || {};
  if (typeof labs.serumPotassium === "number" && labs.serumPotassium >= 6) emergencyHits.push("serum potassium >= 6");
  if (typeof labs.serumPotassium === "number" && labs.serumPotassium >= 5.5) highHits.push("hyperkalemia range potassium");
  if (typeof labs.eGFR === "number" && labs.eGFR < 30) highHits.push("eGFR < 30");
  if (parsed.patientFactors?.pregnancy === true) highHits.push("pregnancy");

  let level = "low";
  if (moderateHits.length) level = "moderate";
  if (highHits.length || severeInteractions.length) level = "high";
  if (emergencyHits.length) level = "emergency";

  return {
    level,
    emergencyHits: Array.from(new Set(emergencyHits)),
    highHits: Array.from(new Set(highHits)),
    moderateHits: Array.from(new Set(moderateHits)),
    severeInteractions: severeInteractions.map(i => i.id)
  };
}

function buildSafetyValidation(parsed, evidence, triage) {
  const flags = [];
  const mandatory = [];
  const missing = parsed.missingCriticalInfo || [];

  if (triage.level === "emergency") {
    flags.push("emergency_triage");
    mandatory.push("Clearly advise urgent medical assessment for the emergency red flags detected. Do not present the case as routine.");
  }

  for (const interaction of evidence.interactions || []) {
    if (["high", "moderate_to_high", "contraindicated", "major"].includes(interaction.severity)) {
      flags.push(`high_risk_interaction:${interaction.id}`);
      mandatory.push(`For ${interaction.drugs.join(" + ")}: mention ${interaction.risk}, required monitoring, and avoid reassuring language.`);
    }
  }

  if (missing.length) {
    flags.push("missing_critical_info");
    mandatory.push(`Explicitly list missing critical info: ${missing.join(", ")}.`);
  }

  for (const rule of evidence.clinicalRules || []) {
    mandatory.push(rule.safety_action);
  }

  return {
    flags: Array.from(new Set(flags)),
    mandatoryActions: Array.from(new Set(mandatory)),
    validationStatus: flags.length ? "needs_guardrails" : "standard"
  };
}

function resolveConflicts(evidence) {
  return {
    policy: "Priority order: local safety rules and interaction records > local drug monographs > model background knowledge > conversation memory/style.",
    notes: evidence.sources?.length ? [] : ["No local medical evidence matched; answer should be conservative and clearly state uncertainty."]
  };
}

function compactPipelineContext({ mode, parsed, evidence, triage, validation, conflictResolver }) {
  return {
    pipeline_version: "v4-clinical-brain-mvp",
    active_mode: mode,
    parser: parsed,
    risk_triage: triage,
    retrieved_evidence: {
      monographs: evidence.monographs,
      interactions: evidence.interactions,
      pairwise_checked: evidence.pairwise,
      clinical_rules: evidence.clinicalRules,
      sources: evidence.sources
    },
    conflict_resolver: conflictResolver,
    safety_validation: validation
  };
}

function buildComposerSystemPrompt(mode, modeInstruction = "") {
  const label = MODE_LABELS[mode] || MODE_LABELS.general_chat;
  const base = `You are Nexus Clinical Pharmacist AI.
Active mode: ${label}.

You are receiving a PIPELINE CONTEXT created by a clinical reasoning backend. Use it as the primary source of truth.

Global rules:
- Reply in the same language as the user unless requested otherwise.
- Do not invent patient data, labs, doses, references, or sources.
- Use the retrieved local evidence and explicitly mention uncertainty when evidence is incomplete.
- Memory/conversation style never overrides retrieved safety rules.
- For clinical content, be practical, conservative, and pharmacist-focused.
- Use Markdown. Tables are allowed when useful.
- Use callouts exactly like: > [!WARNING] text, > [!IMPORTANT] text, > [!INFO] text.
- If safety_validation.mandatoryActions contains actions, you must satisfy them.
- End clinical answers with: Sources used + Confidence.
- The product is educational decision support, not a substitute for clinician judgement/local protocols.`;

  const modePrompts = {
    general_chat: `For General Chat: answer naturally. If no clinical issue exists, do not force clinical headings.`,
    case_analysis: `For Case Analysis, prefer headings: Case Summary, Key Risks, Missing Information, Recommendations, Monitoring / Follow-up, Counseling, Sources used, Confidence.`,
    drug_interaction: `For Drug Interaction, prefer headings: Interaction Summary, Severity, Mechanism, Clinical Risk, What to Check, Recommendation, Counseling, Sources used, Confidence. Always handle all detected pairwise interactions.`,
    drug_reverse: `For Drug Reverse Interactive Training: keep it interactive. Do not reveal everything at once. Use the pipeline evidence to create one focused clue/question, then wait for the user's answer.`
  };

  return `${base}\n\n${modePrompts[mode] || modePrompts.general_chat}\n\n${modeInstruction ? `User-selected mode instruction:\n${modeInstruction}` : ""}`;
}

async function callFinalModel({ mode, modeInstruction, messages, pipelineContext, attachments, shouldStream }) {
  const contextText = JSON.stringify(pipelineContext, null, 2);
  const apiMessages = [
    { role: "system", content: buildComposerSystemPrompt(mode, modeInstruction) },
    { role: "system", content: `PIPELINE CONTEXT JSON:\n${contextText}${attachments}` },
    ...normalizeMessages(messages)
  ];

  return fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
      Accept: shouldStream ? "text/event-stream" : "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: apiMessages,
      max_tokens: Number(process.env.NVIDIA_MAX_TOKENS || 2200),
      temperature: Number(process.env.NVIDIA_TEMPERATURE || 0.2),
      top_p: Number(process.env.NVIDIA_TOP_P || 0.9),
      stream: shouldStream
    })
  });
}

async function relayNvidiaStream(upstream, res) {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        res.end();
        return;
      }
      try {
        const json = JSON.parse(data);
        const token = json?.choices?.[0]?.delta?.content || "";
        if (token) res.write(token);
      } catch {
        // Ignore malformed SSE fragments.
      }
    }
  }

  res.end();
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.NVIDIA_API_KEY) return res.status(500).json({ error: "Missing NVIDIA_API_KEY environment variable." });

  try {
    const body = await parseRequestBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const latestUserText = getLatestUserText(messages);
    if (!latestUserText) return res.status(400).json({ error: "No user message found." });

    const detectedMode = detectModeFromText(latestUserText);
    const selectedMode = MODE_LABELS[body.mode] ? body.mode : detectedMode;
    const mode = body.mode === "general_chat" && detectedMode !== "general_chat" ? detectedMode : selectedMode;
    const attachments = attachmentContext(messages);

    const parsed = await parseQuestionWithAI({ text: latestUserText, mode, attachments });
    parsed.drugs = normalizeDrugList(parsed.drugs || []);
    parsed.missingCriticalInfo = Array.from(new Set([...(parsed.missingCriticalInfo || []), ...inferMissingInfo(parsed)]));

    const evidence = retrieveEvidence(parsed, latestUserText);
    const triage = triageRisk(parsed, evidence, latestUserText);
    const validation = buildSafetyValidation(parsed, evidence, triage);
    const conflictResolver = resolveConflicts(evidence);
    const pipelineContext = compactPipelineContext({ mode, parsed, evidence, triage, validation, conflictResolver });

    const shouldStream = body.stream !== false;
    const upstream = await callFinalModel({
      mode,
      modeInstruction: body.modeInstruction,
      messages,
      pipelineContext,
      attachments,
      shouldStream
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({
        error: `NVIDIA API failed (${upstream.status})`,
        details: safeParseJson(errorText) || errorText.slice(0, 500),
        pipeline: process.env.NEXUS_DEBUG_PIPELINE === "true" ? pipelineContext : undefined
      });
    }

    res.setHeader("X-Nexus-Mode", mode);
    res.setHeader("X-Nexus-Risk", triage.level);

    if (shouldStream && upstream.body) return relayNvidiaStream(upstream, res);

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content || "No response returned from the model.";
    return res.status(200).json({ mode, risk: triage.level, reply, pipeline: process.env.NEXUS_DEBUG_PIPELINE === "true" ? pipelineContext : undefined });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
};
