# MedRecon - Intelligent Medication Reconciliation

## Architecture (3-Agent A2A Network)

```
User/Frontend -> Orchestrator (port 8003)
                      |
                      | A2A protocol
                      v
               Source Collector (port 8001)
                      | calls MCP tools
                      v
               MedRecon MCP Server (port 5000)
                      |
               +------+------+
               |      |      |
          FHIR Server Drug APIs RxNorm
          (HAPI R4)  (OpenFDA)  (NLM)

               Orchestrator
                      |
                      | A2A protocol
                      v
               Interaction Checker (port 8002)
                      | calls MCP tools
                      v
               MedRecon MCP Server (port 5000)
```

### Agent Roles
1. **Source Collector** (port 8001): Pulls medications from multiple FHIR endpoints, simulates hospital EHR / pharmacy / PCP data silos. Merges with source attribution.
2. **Interaction Checker** (port 8002): Safety analysis -- drug interactions, allergy cross-ref, dose validation, therapeutic alternatives.
3. **Orchestrator** (port 8003): Coordinates Source Collector + Interaction Checker via A2A protocol. Assembles final reconciliation report. Does NOT call MCP tools directly.

### Fallback
- `medrecon_agent/` (port 8001): Original single-agent mode. Still works independently.

## Project Structure

- `mcp-server/` - TypeScript MCP server with 7 clinical tools
  - `tools/GetMedicationsTool.ts` - Queries FHIR for patient medications
  - `tools/CheckInteractionsTool.ts` - Drug interaction checking
  - `tools/LookupDrugInfoTool.ts` - Drug info lookup via RxNorm
  - `tools/CheckAllergiesTool.ts` - Patient allergy cross-reference via FHIR
  - `tools/FindAlternativesTool.ts` - Therapeutic alternatives via RxClass ATC
  - `tools/ValidateDoseTool.ts` - Dose range validation (18 common drugs)
  - `tools/ReconcileListsTool.ts` - Medication list reconciliation (core tool)
  - `index.ts` - Express + MCP server entry point
- `agent/` - Python A2A agents using Google ADK + Gemini 2.5 Flash
  - `source_collector/` - Source Collector agent (port 8001)
  - `interaction_checker/` - Interaction Checker agent (port 8002)
  - `orchestrator/` - Orchestrator agent (port 8003)
  - `medrecon_agent/` - Original single-agent (fallback, port 8001)
  - `shared/tools/mcp_tools.py` - MCP tool wrappers (6 tools)
  - `shared/fhir_hook.py` - FHIR context extraction from A2A metadata
  - `shared/app_factory.py` - A2A app builder using google-adk to_a2a
- `scripts/` - Test and utility scripts

## Running Locally

```bash
# Start all 4 services at once:
./scripts/start-all.sh

# Or manually:
cd mcp-server && node dist/index.js                                          # port 5000
cd agent && source venv/bin/activate
uvicorn source_collector.app:a2a_app --host 0.0.0.0 --port 8001
uvicorn interaction_checker.app:a2a_app --host 0.0.0.0 --port 8002
uvicorn orchestrator.app:a2a_app --host 0.0.0.0 --port 8003

# Test full pipeline:
python3 scripts/test-orchestrator.py

# Stop all:
./scripts/start-all.sh stop
```

## Key Dependencies

- MCP Server: @modelcontextprotocol/sdk, express, axios, zod
- Agents: google-adk, a2a-sdk, httpx, python-dotenv, uvicorn
- LLM: Gemini 2.5 Flash (GOOGLE_API_KEY)
- FHIR: HAPI FHIR public server (hapi.fhir.org/baseR4)
- Drug interactions: Curated clinical DB + OpenFDA API

## Environment Variables

```
GOOGLE_API_KEY=...              # Gemini API key
FHIR_SERVER_URL=https://hapi.fhir.org/baseR4
MCP_SERVER_URL=http://localhost:5000/mcp  # or Cloud Run URL
SOURCE_COLLECTOR_URL=http://localhost:8001
INTERACTION_CHECKER_URL=http://localhost:8002
ORCHESTRATOR_URL=http://localhost:8003
GOOGLE_GENAI_USE_VERTEXAI=FALSE
```

## Test Patients

### Original Test Patient
Patient ID `131283452` on HAPI FHIR public server has 11 active medications
including a SEVERE interaction (metoprolol + verapamil).

### Demo Patients (generated 2026-03-26)
| ID | Name | Meds | Key Interactions |
|----|------|------|-----------------|
| `131494564` | Margaret Ann Chen | 11 | SEVERE: Metoprolol+Verapamil, Warfarin+Amiodarone |
| `131494583` | Robert James Williams | 11 | SEVERE: Methotrexate+NSAID |
| `131494601` | Dorothy Mae Johnson | 12 | SEVERE: Simvastatin+Clarithromycin, Sertraline+Tramadol |
| `131494623` | James Michael Rivera | 11 | SEVERE: Lithium+NSAID |
| `131494641` | Sarah Elizabeth Patel | 13 | SEVERE: Warfarin+Fluconazole, Levodopa+Metoclopramide |

All have allergies, conditions, and full FHIR MedicationRequest resources with RxNorm codes.
Script: `scripts/generate-demo-patients.py` | Data: `scripts/demo-patients.json`

## Cloud Run Deployment

- MCP Server: https://medrecon-mcp-93135657352.us-central1.run.app
- Agent (single): https://medrecon-agent-93135657352.us-central1.run.app
- Source Collector: https://medrecon-source-collector-93135657352.us-central1.run.app
- Interaction Checker: https://medrecon-interaction-checker-93135657352.us-central1.run.app
- Orchestrator: https://medrecon-orchestrator-93135657352.us-central1.run.app
- GCP Project: gen-lang-client-0492726898 (us-central1)

## Build Progress

### Week 1 (Complete)
- [x] MCP server with 7 clinical tools
- [x] Single agent with Gemini 2.5 Flash
- [x] End-to-end working: agent pulls meds from live FHIR, checks interactions
- [x] Deployed to GCP Cloud Run (MCP server + single agent)

### Week 3 (Complete)
- [x] Split into 3-agent A2A network (Source Collector, Interaction Checker, Orchestrator)
- [x] Orchestrator calls other agents via A2A protocol (JSON-RPC message/send)
- [x] Source Collector queries FHIR 3x to simulate multi-source data
- [x] Interaction Checker runs all safety tools (interactions, allergies, doses, alternatives)
- [x] Full pipeline tested locally: Orchestrator -> Source Collector -> Interaction Checker -> Report
- [x] MCP tool wrappers expanded to 6 tools (added check_allergies, validate_dose, find_alternatives, lookup_drug_info)
- [x] Deploy 3 agents to Cloud Run (all live and tested)
- [x] Update frontend to call Orchestrator

### Week 4 (In Progress)
- [x] Frontend wired to Orchestrator — dual-mode UI (Full Pipeline default + Quick Scan)
- [x] PipelineVisualizer shows 3-agent steps (Source Collector → Interaction Checker → Report)
- [x] ReportPanel renders Orchestrator markdown reports with severity highlighting
- [x] Demo patient presets (5 patients with complex polypharmacy, loaded into HAPI FHIR)
- [x] 12 new drug interactions added to curated database (simvastatin+clarithromycin, lithium+lisinopril, etc.)
- [x] Frontend deployed to Vercel, MCP server redeploying to Cloud Run
- [ ] Generate Synthea patients (200+) with automated pipeline
- [ ] FHIR MedicationStatement output (reconciled list as FHIR resource)
- [ ] FHIR Provenance resources (source tracking)

## Hackathon

Agents Assemble Healthcare AI Hackathon. Deadline: May 11, 2026.
Full plan: /home/astraedus/ops/exec-plans/active/agents-assemble-hackathon.md
