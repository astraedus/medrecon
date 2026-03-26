"""
MedRecon Agent -- A2A application entry point.

Start the server with:
    uvicorn medrecon_agent.app:a2a_app --host 0.0.0.0 --port 8001

The agent card is served at:
    GET http://localhost:8001/.well-known/agent-card.json
"""
import os
import sys

# Ensure parent directory is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from a2a.types import AgentSkill
from shared.app_factory import create_a2a_app

from .agent import root_agent

a2a_app = create_a2a_app(
    agent=root_agent,
    name="medrecon_agent",
    description=(
        "Intelligent medication reconciliation agent. Retrieves patient medication lists "
        "from FHIR servers, checks for drug-drug interactions, identifies discrepancies, "
        "and produces reconciled medication reports with clinical safety alerts."
    ),
    url=os.getenv(
        "MEDRECON_AGENT_URL",
        os.getenv("BASE_URL", "http://localhost:8001"),
    ),
    port=8001,
    fhir_extension_uri=f"{os.getenv('PO_PLATFORM_BASE_URL', 'http://localhost:5139')}/schemas/a2a/v1/fhir-context",
    skills=[
        AgentSkill(
            id="medication-list",
            name="medication-list",
            description="Retrieve a patient's medication list from their FHIR health record.",
            tags=["medications", "fhir", "reconciliation"],
        ),
        AgentSkill(
            id="drug-interactions",
            name="drug-interactions",
            description="Check for drug-drug interactions in a medication list.",
            tags=["interactions", "safety", "clinical-decision-support"],
        ),
        AgentSkill(
            id="medication-reconciliation",
            name="medication-reconciliation",
            description="Perform full medication reconciliation: retrieve medications, check interactions, and produce a reconciled report.",
            tags=["reconciliation", "safety", "report"],
        ),
    ],
)
