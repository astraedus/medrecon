"""
Interaction Checker Agent -- A2A application entry point.

Start the server with:
    uvicorn interaction_checker.app:a2a_app --host 0.0.0.0 --port 8002

The agent card is served at:
    GET http://localhost:8002/.well-known/agent-card.json
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
    name="interaction_checker_agent",
    description=(
        "Medication safety analysis agent. Checks for drug-drug interactions, "
        "cross-references patient allergies, validates doses, and suggests "
        "therapeutic alternatives for problematic medications."
    ),
    url=os.getenv(
        "INTERACTION_CHECKER_URL",
        os.getenv("BASE_URL", "http://localhost:8002"),
    ),
    port=8002,
    fhir_extension_uri=f"{os.getenv('PO_PLATFORM_BASE_URL', 'http://localhost:5139')}/schemas/a2a/v1/fhir-context",
    skills=[
        AgentSkill(
            id="check-safety",
            name="check-safety",
            description="Perform comprehensive medication safety analysis: drug interactions, allergy cross-reference, dose validation, and alternative suggestions.",
            tags=["interactions", "allergies", "safety", "clinical-decision-support"],
        ),
    ],
)
