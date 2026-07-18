const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'data');

function readJsonFile(relativePath, fallback) {
  try {
    const filePath = path.join(DATA_ROOT, relativePath);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[Atom data] Could not load ${relativePath}:`, error.message);
    return fallback;
  }
}

function readJsonDirectory(directoryName) {
  const directoryPath = path.join(DATA_ROOT, directoryName);
  if (!fs.existsSync(directoryPath)) return [];

  const records = [];
  for (const fileName of fs.readdirSync(directoryPath).sort()) {
    if (!fileName.endsWith('.json') || fileName.startsWith('.') || fileName.startsWith('_')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(directoryPath, fileName), 'utf8'));
      if (Array.isArray(parsed)) records.push(...parsed);
      else if (parsed && typeof parsed === 'object') records.push(parsed);
    } catch (error) {
      console.warn(`[Atom data] Could not load ${directoryName}/${fileName}:`, error.message);
    }
  }
  return records;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function normalizeSourceIds(record = {}) {
  const explicit = uniqueStrings([
    ...(Array.isArray(record.source_ids) ? record.source_ids : []),
    record.source_id
  ]);
  // Backward compatibility for legacy flat records that stored citation text
  // directly in `source`. New folder records should always use source_ids.
  return explicit.length ? explicit : uniqueStrings([record.source]);
}

function buildDrugIndexes(folderRecords, legacyMonographs, legacyAliases) {
  const records = folderRecords.length
    ? folderRecords
    : Object.entries(legacyMonographs || {}).map(([generic, record]) => ({
        generic,
        aliases: legacyAliases?.[generic] || [],
        ...record
      }));

  const monographs = {};
  const aliases = {};

  for (const rawRecord of records) {
    const generic = String(rawRecord?.generic || rawRecord?.id || '').trim().toLowerCase();
    if (!generic) {
      console.warn('[Atom data] Skipped drug record without generic/id.');
      continue;
    }
    const record = {
      ...rawRecord,
      generic,
      aliases: uniqueStrings([generic, ...(rawRecord.aliases || [])]),
      source_ids: normalizeSourceIds(rawRecord)
    };
    monographs[generic] = record;
    aliases[generic] = record.aliases;
  }

  return { monographs, aliases };
}

function normalizeArrayRecords(folderName, legacyFileName) {
  const folderRecords = readJsonDirectory(folderName);
  const legacyRecords = readJsonFile(legacyFileName, []);
  const records = folderRecords.length ? folderRecords : legacyRecords;
  return (records || [])
    .filter(record => record && typeof record === 'object')
    .map(record => ({ ...record, source_ids: normalizeSourceIds(record) }));
}

function validateClinicalData(data) {
  const warnings = [];

  for (const [generic, record] of Object.entries(data.monographs || {})) {
    if (!record.class) warnings.push(`Drug ${generic} has no class.`);
    if (!Array.isArray(record.aliases) || !record.aliases.length) warnings.push(`Drug ${generic} has no aliases.`);
  }

  for (const interaction of data.interactions || []) {
    if (!interaction.id) warnings.push('Interaction record has no id.');
    if (!Array.isArray(interaction.drugs) || interaction.drugs.length < 2) warnings.push(`Interaction ${interaction.id || '(unknown)'} needs at least two drugs.`);
  }

  for (const rule of data.clinicalRules || []) {
    if (!rule.id) warnings.push('Clinical rule has no id.');
    const hasTrigger = (rule.trigger_drugs || []).length || (rule.trigger_drug_classes || []).length || (rule.trigger_terms || []).length || rule.trigger;
    if (!hasTrigger) warnings.push(`Clinical rule ${rule.id || '(unknown)'} has no trigger.`);
  }

  for (const protocol of data.protocols || []) {
    if (!protocol.id || !protocol.protocol_code) warnings.push(`Protocol ${protocol.id || '(unknown)'} needs id and protocol_code.`);
  }

  if (warnings.length) console.warn('[Atom data] Validation warnings:', warnings);
  return warnings;
}

function resolveSourceIds(sourceIds = [], registry = {}) {
  return uniqueStrings(sourceIds).map(id => {
    const source = registry?.[id];
    if (source) return { id, ...source };
    return {
      id,
      title: id,
      publisher: 'Unresolved source id',
      source_type: 'unresolved',
      url: null
    };
  });
}

function collectRecordSourceIds(records = []) {
  return uniqueStrings(records.flatMap(record => normalizeSourceIds(record || {})));
}

function loadClinicalData() {
  const legacyAliases = readJsonFile('drug_aliases.json', {});
  const legacyMonographs = readJsonFile('drug_monographs.json', {});
  const drugs = buildDrugIndexes(readJsonDirectory('drugs'), legacyMonographs, legacyAliases);

  const data = {
    aliases: drugs.aliases,
    monographs: drugs.monographs,
    interactions: normalizeArrayRecords('interactions', 'interactions.json'),
    clinicalRules: normalizeArrayRecords('clinical_rules', 'clinical_rules.json'),
    protocols: normalizeArrayRecords('protocols', 'protocols.json'),
    sourcesRegistry: readJsonFile('sources_registry.json', {}),
    riskKeywords: readJsonFile('risk_keywords.json', { emergency: [], high: [], moderate: [] })
  };

  data.validationWarnings = validateClinicalData(data);
  return data;
}

module.exports = {
  DATA_ROOT,
  readJsonFile,
  readJsonDirectory,
  normalizeSourceIds,
  collectRecordSourceIds,
  resolveSourceIds,
  validateClinicalData,
  loadClinicalData
};
