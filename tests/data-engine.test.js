const assert = require('assert');
const { loadClinicalData } = require('../lib/data');
const { extractLocalDrugs } = require('../lib/normalizer');
const { localParseQuestion } = require('../lib/parser');
const { retrieveEvidence } = require('../lib/engines');

const data = loadClinicalData();
assert(Object.keys(data.monographs).length > 0, 'No drug records loaded');
assert(data.interactions.length > 0, 'No interactions loaded');
assert(data.clinicalRules.length > 0, 'No clinical rules loaded');

assert(extractLocalDrugs('كومادين', data).includes('warfarin'), 'Arabic/brand alias failed');

const question = `J.P. is a 57-year-old male with extensive small cell lung cancer.
The plan is LUSCPE. Weight: 87 kg Height: 160 cm. ANC 6.2.`;
const parsed = localParseQuestion({ text: question, mode: 'case_analysis', data });
const evidence = retrieveEvidence(parsed, data, question);

assert.strictEqual(parsed.patientFactors.age, 57, 'Age parsing failed');
assert.strictEqual(parsed.patientFactors.weightKg, 87, 'Weight parsing failed');
assert.strictEqual(parsed.patientFactors.heightCm, 160, 'Height parsing failed');
assert.strictEqual(evidence.calculations.calculated_bsa_m2, 1.97, 'Deterministic BSA failed');
assert.strictEqual(evidence.protocols[0]?.protocol_code, 'LUSCPE', 'Protocol retrieval failed');
assert(evidence.sources.some(source => source.id === 'bccancer_luscpe_case_study'), 'Source resolution failed');

console.log('Atom v5.20 data-engine tests passed.');
