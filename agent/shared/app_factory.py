"""
A2A application factory for MedRecon agents.

Based on po-adk-python shared/app_factory.py pattern.
"""
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentExtension,
    AgentSkill,
    SecurityScheme,
)
from google.adk.a2a.utils.agent_to_a2a import to_a2a


def create_a2a_app(
    agent,
    name: str,
    description: str,
    url: str,
    port: int = 8001,
    version: str = "1.0.0",
    fhir_extension_uri: str | None = None,
    require_api_key: bool = False,
    skills: list[AgentSkill] | None = None,
):
    """
    Build and return an A2A ASGI application for the given ADK agent.

    For Week 1, we skip API key enforcement (require_api_key=False by default)
    to simplify local testing. Will be enabled for production.
    """
    extensions = []
    if fhir_extension_uri:
        extensions = [
            AgentExtension(
                uri=fhir_extension_uri,
                description="FHIR R4 context -- allows the agent to query the patient's FHIR server.",
                required=True,
            )
        ]

    agent_card = AgentCard(
        name=name,
        description=description,
        url=url,
        version=version,
        defaultInputModes=["text/plain"],
        defaultOutputModes=["text/plain"],
        capabilities=AgentCapabilities(
            streaming=True,
            pushNotifications=False,
            stateTransitionHistory=True,
            extensions=extensions,
        ),
        skills=skills or [],
    )

    app = to_a2a(agent, port=port, agent_card=agent_card)
    return app
