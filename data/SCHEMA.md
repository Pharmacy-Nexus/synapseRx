# Atom structured clinical-data schema (v5.20)

## Layout

- `drugs/*.json`: one generic medicine per file; aliases live in the same record.
- `interactions/*.json`: one interaction/cluster per file.
- `clinical_rules/*.json`: data-driven safety rules; deterministic mathematics must not live here.
- `protocols/*.json`: protocol-specific facts retrieved by exact-code/name/disease+regimen scoring.
- `sources_registry.json`: canonical citation metadata keyed by `source_id`.
- `risk_keywords.json`: global triage terms.

## Core requirements

Every clinical record should have a stable `id` (or `generic` for drug records) and `source_ids`. Do not copy citation text into every record.

### Drug
```json
{
  "generic": "warfarin",
  "aliases": ["coumadin", "marevan", "كومادين"],
  "class": "vitamin K antagonist anticoagulant",
  "key_warnings": ["major bleeding"],
  "monitoring": ["INR"],
  "source_ids": ["authoritative_source_id"]
}
```

### Protocol
Use `protocol_code`, `aliases`, `disease_terms`, and `regimen_drugs`. Exact protocol-code matches receive the highest score. Keep protocol-specific thresholds only when copied into structured fields from a verified current official source.

### Calculations
BSA and BMI are calculated in `lib/engines.js`. The model receives the validated numeric result and must not recalculate chemotherapy doses.
