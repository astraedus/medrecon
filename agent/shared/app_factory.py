"""
A2A application factory for MedRecon agents.

Each agent's app.py calls create_a2a_app() with its own name, description,
URL, and optional FHIR extension URI. The factory handles the AgentCard
boilerplate, wires up the A2A transport, and optionally attaches API key
middleware.

Security modes
--------------
  require_api_key=True  (default)
      Agent card advertises X-API-Key as required.
      All requests except /.well-known/agent-card.json are blocked without a
      valid key. Use this for agents that handle sensitive data (e.g. FHIR).

  require_api_key=False
      Agent card declares no security scheme -- any caller can send requests
      without a key. The agent card itself makes this discoverable so Prompt
      Opinion and other callers know no key is needed.

Usage:
    from shared.app_factory import create_a2a_app
    from .agent import root_agent

    a2a_app = create_a2a_app(
        agent=root_agent,
        name="medrecon_orchestrator",
        description="...",
        url="http://localhost:8003",
        port=8003,
        fhir_extension_uri="https://.../schemas/a2a/v1/fhir-context",
        require_api_key=True,
    )
"""
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentExtension,
    AgentSkill,
    APIKeySecurityScheme,
    In,
    SecurityScheme,
)
from google.adk.a2a.utils.agent_to_a2a import to_a2a

from shared.middleware import ApiKeyMiddleware


def create_a2a_app(
    agent,
    name: str,
    description: str,
    url: str,
    port: int = 8001,
    version: str = "1.0.0",
    fhir_extension_uri: str | None = None,
    require_api_key: bool = True,
    skills: list[AgentSkill] | None = None,
):
    """
    Build and return an A2A ASGI application for the given ADK agent.

    Args:
        agent:               The ADK Agent instance (root_agent from agent.py).
        name:                Agent name shown in the agent card and Prompt Opinion UI.
        description:         Short description of what this agent does.
        url:                 Public base URL where this agent is reachable.
        port:                Port the agent listens on (used by to_a2a).
        version:             Semver string, e.g. "1.0.0".
        fhir_extension_uri:  If provided, advertises FHIR context support in the
                             agent card. Callers use this URI as the metadata key
                             when sending FHIR credentials. Omit for non-FHIR agents.
        require_api_key:     If True (default), the agent card declares X-API-Key as
                             required and ApiKeyMiddleware is attached -- all requests
                             without a valid key are rejected with 401/403.
                             If False, no security scheme is declared and no middleware
                             is attached -- the agent is publicly accessible.

    Returns:
        A Starlette ASGI application ready to be served with uvicorn.
    """
    # Optional FHIR extension -- only included when the agent supports it.
    extensions = []
    if fhir_extension_uri:
        extensions = [
            AgentExtension(
                uri=fhir_extension_uri,
                description="FHIR R4 context -- allows the agent to query the patient's FHIR server.",
                required=True,
            )
        ]

    # Security scheme -- advertised in the agent card so callers know what to send.
    if require_api_key:
        security_schemes = {
            "apiKey": SecurityScheme(
                root=APIKeySecurityScheme(
                    type="apiKey",
                    name="X-API-Key",
                    in_=In.header,
                    description="API key required to access this agent.",
                )
            )
        }
        security = [{"apiKey": []}]
    else:
        # No security scheme -- agent is publicly accessible.
        # Empty values tell callers (including Prompt Opinion) that no
        # authentication is required.
        security_schemes = None
        security = None

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
        securitySchemes=security_schemes,
        security=security,
    )

    app = to_a2a(agent, port=port, agent_card=agent_card)

    # Only attach the key-enforcement middleware for authenticated agents.
    if require_api_key:
        app.add_middleware(ApiKeyMiddleware)

    return app
