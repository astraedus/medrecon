#!/usr/bin/env python3
"""
Test script for MedRecon Agent.
Runs the agent locally with a test prompt to verify end-to-end functionality.

Usage:
    cd agent && python3 ../scripts/test-agent.py

Requires:
    - MCP server running on port 5000
    - GOOGLE_API_KEY set in .env
"""
import asyncio
import os
import sys

# Add agent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent", ".env"))

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# Import the agent
from medrecon_agent.agent import root_agent


async def test_agent():
    """Run a test conversation with the MedRecon agent."""
    print("=" * 70)
    print("MedRecon Agent End-to-End Test")
    print("=" * 70)
    print()

    # Create a session service and runner
    session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        app_name="medrecon_test",
        session_service=session_service,
    )

    # Create a session with FHIR context pre-loaded
    session = await session_service.create_session(
        app_name="medrecon_test",
        user_id="test-user",
        state={
            "fhir_url": "https://hapi.fhir.org/baseR4",
            "patient_id": "131283452",
        },
    )

    # Test prompt
    test_prompt = (
        "What medications is patient 131283452 on? "
        "Check for any drug interactions and give me a reconciliation report."
    )

    print(f"User: {test_prompt}")
    print()
    print("Agent response:")
    print("-" * 70)

    # Run the agent
    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=test_prompt)],
    )

    full_response = ""
    async for event in runner.run_async(
        user_id="test-user",
        session_id=session.id,
        new_message=content,
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    print(part.text, end="", flush=True)
                    full_response += part.text
                elif hasattr(part, "function_call") and part.function_call:
                    fn = part.function_call
                    print(f"\n[Tool Call: {fn.name}({fn.args})]", flush=True)
                elif hasattr(part, "function_response") and part.function_response:
                    fr = part.function_response
                    print(f"\n[Tool Result: {fr.name} returned]", flush=True)

    print()
    print("-" * 70)
    print()

    if full_response:
        print("SUCCESS: Agent produced a response")
    else:
        print("WARNING: Agent produced no text response (check for errors above)")


if __name__ == "__main__":
    asyncio.run(test_agent())
