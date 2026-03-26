"""
Source Collector Agent -- A2A application entry point.

Start the server with:
    uvicorn source_collector.app:a2a_app --host 0.0.0.0 --port 8001

The agent card is served at:
    GET http://localhost:8001/.well-known/agent-card.json
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
    name="source_collector_agent",
    description=(
        "Medication source collector agent. Queries multiple FHIR endpoints "
        "to retrieve patient medication lists from different healthcare sources "
        "(hospital EHR, pharmacy, primary care) and produces a merged list "
        "with source attribution and discrepancy detection."
    ),
    url=os.getenv(
        "SOURCE_COLLECTOR_URL",
        os.getenv("BASE_URL", "http://localhost:8001"),
    ),
    port=8001,
    fhir_extension_uri=f"{os.getenv('PO_PLATFORM_BASE_URL', 'http://localhost:5139')}/schemas/a2a/v1/fhir-context",
    require_api_key=True,
    skills=[
        AgentSkill(
            id="collect-medications",
            name="collect-medications",
            description="Collect medication lists from multiple FHIR sources for a patient and merge them with source attribution.",
            tags=["medications", "fhir", "multi-source", "collection"],
        ),
    ],
)
