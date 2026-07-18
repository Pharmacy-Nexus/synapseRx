# Atom v5.20 — Structured Data Engine

This build migrates Atom from flat clinical JSON files to a scalable folder-based data layer while preserving backward compatibility with the old flat files.

## Main changes

- One drug per file under `data/drugs/`, including its aliases and monograph in the same record.
- One interaction and one clinical rule per file.
- Global `risk_keywords.json` remains at the data root.
- Canonical `sources_registry.json` with `source_ids` in clinical records.
- Protocol retrieval engine with scored matching. Exact protocol-code matches have the highest priority.
- Deterministic BSA and BMI calculations in JavaScript. The language model receives locked numeric results and is instructed not to recalculate or derive chemotherapy doses from memory.
- Protocols and calculations are included in the Evidence Brief.
- Hardcoded drug-specific Shadow Check branches were removed; Shadow Check now reads risks, required data, monitoring, urgency changers, and traps from structured records.
- Side Ask logic is shared by `/api/chat` and `/api/side-ask` through `lib/sideAskHandler.js`.
- Continue/resume turns keep the existing conversation mode instead of being forced into Case Analysis.
- Explicitly selected UI modes are respected using `modeSource: "manual"`.
- Vercel serves filesystem/API routes before the SPA fallback.

## Data layout

```text
data/
├── drugs/
├── interactions/
├── clinical_rules/
├── protocols/
├── sources_registry.json
├── risk_keywords.json
└── SCHEMA.md
```

## Backward compatibility

`lib/data.js` prefers folder records when present. If a folder is absent or empty, it falls back to:

- `drug_monographs.json`
- `drug_aliases.json`
- `interactions.json`
- `clinical_rules.json`
- `protocols.json`

This allows gradual migration. Once the folder version has been tested, the old flat files can be deleted.

## Deployment

Recommended Vercel environment variables:

```text
NVIDIA_API_KEY=...
NVIDIA_MODEL=google/gemma-4-31b-it
NEXUS_SIDE_MODEL=google/gemma-4-31b-it
NEXUS_COMPOSER_TIMEOUT_MS=55000
NVIDIA_MAX_TOKENS=2200
NVIDIA_TEMPERATURE=0.2
NVIDIA_TOP_P=0.9
```

Do not include quotation marks around environment variable values.

## Verification

Run locally with Node:

```bash
node tests/data-engine.test.js
```

After deployment, open:

```text
/api/debug-env
```

The response now includes loaded counts for drugs, aliases, interactions, rules, protocols, sources, and validation warnings.

## Protocol safety

Only protocol facts present in the matched structured record are passed as protocol truth. Dose thresholds and modifications should not be added until verified against a current authoritative protocol. The included LUSCPE record contains only the stable official facts used for retrieval testing and benefit-status questions.
