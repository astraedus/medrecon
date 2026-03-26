# MedRecon - Intelligent Medication Reconciliation

## Architecture

```
User -> MedRecon Agent (Python/ADK/A2A, port 8001)
             |
             v
        MedRecon MCP Server (TypeScript, port 5000)
             |
        +----+----+
        |         |
   FHIR Server   Drug APIs
   (HAPI R4)     (OpenFDA, curated DB)
```

## Project Structure

- `mcp-server/` - TypeScript MCP server with clinical tools
  - `tools/GetMedicationsTool.ts` - Queries FHIR for patient medications
  - `tools/CheckInteractionsTool.ts` - Drug interaction checking
  - `tools/LookupDrugInfoTool.ts` - Drug info lookup via RxNorm
  - `tools/CheckAllergiesTool.ts` - Patient allergy cross-reference via FHIR
  - `tools/FindAlternativesTool.ts` - Therapeutic alternatives via RxClass ATC
  - `tools/ValidateDoseTool.ts` - Dose range validation (18 common drugs)
  - `tools/ReconcileListsTool.ts` - Medication list reconciliation (core tool)
  - `index.ts` - Express + MCP server entry point
- `agent/` - Python A2A agent using Google ADK
  - `medrecon_agent/agent.py` - Agent definition with Gemini 2.5 Flash
  - `medrecon_agent/app.py` - A2A application entry point
  - `shared/tools/mcp_tools.py` - MCP tool wrappers
  - `shared/fhir_hook.py` - FHIR context extraction from A2A metadata
- `scripts/` - Test and utility scripts

## Running Locally

```bash
# Terminal 1: MCP Server
cd mcp-server && npm install && npm start

# Terminal 2: Agent
cd agent && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Set GOOGLE_API_KEY in .env
uvicorn medrecon_agent.app:a2a_app --host 0.0.0.0 --port 8001

# Test end-to-end
cd agent && source venv/bin/activate && python3 ../scripts/test-agent.py
```

## Key Dependencies

- MCP Server: @modelcontextprotocol/sdk, express, axios, zod
- Agent: google-adk, a2a-sdk, httpx, google-genai (Gemini)
- FHIR: HAPI FHIR public server (hapi.fhir.org/baseR4)
- Drug interactions: Curated clinical DB + OpenFDA API

## Test Patient

Patient ID `131283452` on HAPI FHIR public server has 11 active medications
including a SEVERE interaction (metoprolol + verapamil).

## Week 1 Status

- [x] MCP server with 7 clinical tools (get_medications, check_interactions, lookup_drug_info, check_allergies, find_alternatives, validate_dose, reconcile_lists)
- [x] Agent with Gemini 2.5 Flash, calls MCP tools
- [x] End-to-end working: agent pulls meds from live FHIR, checks interactions
- [ ] HAPI FHIR Docker (using public server for now)
- [ ] Synthea patient data loading
- [ ] Deploy to Prompt Opinion platform

## Hackathon

Agents Assemble Healthcare AI Hackathon. Deadline: May 11, 2026.
Full plan: /home/astraedus/ops/exec-plans/active/agents-assemble-hackathon.md
