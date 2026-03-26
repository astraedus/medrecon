#!/usr/bin/env python3
"""
Test the MedRecon Orchestrator agent (full 3-agent A2A pipeline).

Prerequisites:
  - MCP Server running on port 5000
  - Source Collector running on port 8001
  - Interaction Checker running on port 8002
  - Orchestrator running on port 8003

Usage:
  python3 scripts/test-orchestrator.py
  python3 scripts/test-orchestrator.py --patient-id 131283452
"""
import argparse
import json
import sys
import uuid

import httpx

ORCHESTRATOR_URL = "http://localhost:8003/"
SOURCE_COLLECTOR_URL = "http://localhost:8001/"
INTERACTION_CHECKER_URL = "http://localhost:8002/"
MCP_SERVER_URL = "http://localhost:5000/health"
TIMEOUT = 300  # 5 minutes for full pipeline


def check_service(name: str, url: str) -> bool:
    """Check if a service is running."""
    try:
        resp = httpx.get(url, timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def send_a2a_message(url: str, message: str) -> dict:
    """Send an A2A message and return the response."""
    message_id = str(uuid.uuid4())
    payload = {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "message/send",
        "params": {
            "message": {
                "messageId": message_id,
                "role": "user",
                "parts": [{"kind": "text", "text": message}],
            },
        },
    }

    response = httpx.post(
        url,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=TIMEOUT,
    )
    return response.json()


def extract_response_text(result: dict) -> str:
    """Extract text from an A2A response."""
    task = result.get("result", {})
    texts = []

    # Artifacts
    for artifact in task.get("artifacts", []):
        for part in artifact.get("parts", []):
            if part.get("kind") == "text" and part.get("text", "").strip():
                texts.append(part["text"])

    # Status message
    msg = task.get("status", {}).get("message", {})
    for part in msg.get("parts", []):
        if part.get("kind") == "text" and part.get("text", "").strip():
            if part["text"] not in texts:
                texts.append(part["text"])

    return "\n\n".join(texts)


def main():
    parser = argparse.ArgumentParser(description="Test MedRecon Orchestrator")
    parser.add_argument("--patient-id", default="131283452", help="FHIR Patient ID")
    parser.add_argument(
        "--fhir-url",
        default="https://hapi.fhir.org/baseR4",
        help="FHIR server URL",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("MedRecon Orchestrator Test -- 3-Agent A2A Pipeline")
    print("=" * 60)

    # Check all services
    print("\n[1/2] Checking services...")
    services = [
        ("MCP Server", MCP_SERVER_URL),
        ("Source Collector", SOURCE_COLLECTOR_URL + ".well-known/agent-card.json"),
        ("Interaction Checker", INTERACTION_CHECKER_URL + ".well-known/agent-card.json"),
        ("Orchestrator", ORCHESTRATOR_URL + ".well-known/agent-card.json"),
    ]

    all_up = True
    for name, url in services:
        up = check_service(name, url)
        status = "UP" if up else "DOWN"
        print(f"  {name}: {status}")
        if not up:
            all_up = False

    if not all_up:
        print("\nERROR: Not all services are running. Start them first.")
        sys.exit(1)

    # Send reconciliation request to Orchestrator
    print(f"\n[2/2] Sending reconciliation request to Orchestrator...")
    print(f"  Patient ID: {args.patient_id}")
    print(f"  FHIR Server: {args.fhir_url}")
    print(f"  Pipeline: Orchestrator -> Source Collector -> Interaction Checker")
    print(f"  Timeout: {TIMEOUT}s")
    print()

    message = (
        f"Perform a full medication reconciliation for patient {args.patient_id} "
        f"using the FHIR server at {args.fhir_url}."
    )

    result = send_a2a_message(ORCHESTRATOR_URL, message)

    if "error" in result:
        print(f"ERROR: {json.dumps(result['error'], indent=2)}")
        sys.exit(1)

    task = result.get("result", {})
    state = task.get("status", {}).get("state", "unknown")
    response_text = extract_response_text(result)

    print(f"Task State: {state}")
    print(f"Response Length: {len(response_text)} chars")
    print()
    print("-" * 60)
    print(response_text)
    print("-" * 60)

    if state == "completed" and len(response_text) > 100:
        print("\nRESULT: PASS -- Full 3-agent pipeline working!")
    else:
        print(f"\nRESULT: FAIL -- state={state}, response_len={len(response_text)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
