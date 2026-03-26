"""
Orchestrator Agent -- A2A application entry point.

Start the server with:
    uvicorn orchestrator.app:a2a_app --host 0.0.0.0 --port 8003

The agent card is served at:
    GET http://localhost:8003/.well-known/agent-card.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from a2a.types import AgentSkill
from shared.app_factory import create_a2a_app

from .agent import root_agent

a2a_app = create_a2a_app(
    agent=root_agent,
    name="medrecon_orchestrator",
    description=(
        "MedRecon Orchestrator -- coordinates a multi-agent medication reconciliation "
        "workflow. Dispatches Source Collector (multi-FHIR source gathering) and "
        "Interaction Checker (safety analysis) agents via A2A protocol, then assembles "
        "a comprehensive reconciliation report with discrepancies, interactions, "
        "allergy alerts, and clinical recommendations."
    ),
    url=os.getenv(
        "ORCHESTRATOR_URL",
        os.getenv("BASE_URL", "http://localhost:8003"),
    ),
    port=8003,
    fhir_extension_uri=f"{os.getenv('PO_PLATFORM_BASE_URL', 'http://localhost:5139')}/schemas/a2a/v1/fhir-context",
    require_api_key=True,
    skills=[
        AgentSkill(
            id="medication-reconciliation",
            name="medication-reconciliation",
            description="Perform full medication reconciliation: collect medications from multiple FHIR sources, run safety analysis, and produce a comprehensive report.",
            tags=["reconciliation", "safety", "report", "multi-agent", "a2a"],
        ),
        AgentSkill(
            id="collect-medications",
            name="collect-medications",
            description="Collect medication lists from multiple FHIR sources for a patient (delegates to Source Collector agent).",
            tags=["medications", "fhir", "multi-source"],
        ),
        AgentSkill(
            id="check-safety",
            name="check-safety",
            description="Perform medication safety analysis including interactions, allergies, dose validation (delegates to Interaction Checker agent).",
            tags=["interactions", "allergies", "safety"],
        ),
    ],
)
