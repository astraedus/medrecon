# Plan: Generate Synthea Patients and Load to HAPI FHIR

## Goal
Generate 250 synthetic patients using Synthea, load the ones with medications to HAPI FHIR public server, and save a summary JSON.

## Steps
- [x] Read playbook + CLAUDE.md + lessons.md
- [x] Check Java, Python, httpx availability
- [x] Clone Synthea to /tmp/synthea
- [x] Build Synthea with Gradle (skip tests)
- [x] Generate 287 patients (250 alive + 37 dead) with FHIR R4 export enabled
- [x] Write load-synthea-patients.py script
- [x] Run load script against HAPI FHIR (281 patients with medications loaded)
- [x] Save synthea-patients.json with patient IDs and medication counts
- [x] Commit and report

## Decisions made
- Use httpx with 30s timeout and 1 req/sec rate limiting to respect HAPI FHIR public server
- Filter for patients with MedicationRequest resources only
- Skip failed bundles gracefully, continue with rest
- Save logs to scripts/synthea-load.log for verification
