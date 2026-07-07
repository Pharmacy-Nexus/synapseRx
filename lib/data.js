const fs = require('fs');
const path = require('path');

function readJson(fileName, fallback) {
  try {
    const filePath = path.join(__dirname, '..', 'data', fileName);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`[Atom data] Could not load ${fileName}:`, error.message);
    return fallback;
  }
}

function loadClinicalData() {
  return {
    aliases: readJson('drug_aliases.json', {}),
    monographs: readJson('drug_monographs.json', {}),
    interactions: readJson('interactions.json', []),
    clinicalRules: readJson('clinical_rules.json', []),
    riskKeywords: readJson('risk_keywords.json', { emergency: [], high: [], moderate: [] })
  };
}

module.exports = { loadClinicalData };
