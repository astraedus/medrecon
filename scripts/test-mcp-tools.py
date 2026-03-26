#!/usr/bin/env python3
"""
Test script for MedRecon MCP Server tools.
Tests get_medications and check_interactions via direct HTTP/SSE.

Usage:
    python3 scripts/test-mcp-tools.py

Requires: MCP server running on port 5000
"""
import json
import sys
import requests

MCP_URL = "http://localhost:5000/mcp"
FHIR_URL = "https://hapi.fhir.org/baseR4"
PATIENT_ID = "131283452"


def parse_sse_response(response_text: str) -> list[dict]:
    """Parse SSE response into list of JSON objects."""
    results = []
    for line in response_text.strip().split("\n"):
        if line.startswith("data: "):
            try:
                results.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return results


def mcp_call(method: str, params: dict, headers: dict | None = None) -> dict:
    """Make a single MCP JSON-RPC call and parse the SSE response."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    req_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if headers:
        req_headers.update(headers)

    resp = requests.post(MCP_URL, json=payload, headers=req_headers, timeout=30)
    messages = parse_sse_response(resp.text)
    return messages[-1] if messages else {"error": "No response", "raw": resp.text}


def test_get_medications():
    """Test get_medications tool via MCP."""
    print("=" * 60)
    print("TEST: get_medications")
    print("=" * 60)
    print(f"Patient: {PATIENT_ID}")
    print(f"FHIR Server: {FHIR_URL}")
    print()

    # Initialize
    init_result = mcp_call(
        "initialize",
        {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"},
        },
        headers={"x-fhir-server-url": FHIR_URL, "x-patient-id": PATIENT_ID},
    )
    print(f"Init: {json.dumps(init_result, indent=2)[:200]}")
    print()

    # Call tool -- the per-request server model means we need to init + call in same request
    # Since po-community-mcp creates a new server per request, each request is independent.
    # We need to use the tools/call method.
    result = mcp_call(
        "tools/call",
        {
            "name": "get_medications",
            "arguments": {
                "patient_id": PATIENT_ID,
                "fhir_url": FHIR_URL,
            },
        },
        headers={"x-fhir-server-url": FHIR_URL, "x-patient-id": PATIENT_ID},
    )

    if "result" in result:
        content = result["result"].get("content", [])
        if content and content[0].get("type") == "text":
            data = json.loads(content[0]["text"])
            print(f"Status: {data.get('status')}")
            print(f"Medications found: {data.get('count', 0)}")
            for med in data.get("medications", []):
                print(f"  - {med['name']} | Dose: {med.get('dose', 'N/A')} | Status: {med.get('status', 'N/A')}")
            print()
            return data.get("medications", [])
    else:
        print(f"Error: {json.dumps(result, indent=2)}")
        print()
        return []


def test_check_interactions(drug_names: list[str] | None = None):
    """Test check_interactions tool via MCP."""
    print("=" * 60)
    print("TEST: check_interactions")
    print("=" * 60)

    if not drug_names:
        drug_names = ["warfarin", "ibuprofen", "metoprolol", "verapamil", "lisinopril", "aspirin"]

    drugs_str = ", ".join(drug_names)
    print(f"Drugs: {drugs_str}")
    print()

    result = mcp_call(
        "tools/call",
        {
            "name": "check_interactions",
            "arguments": {
                "drug_names": drugs_str,
                "include_openfda": "false",
            },
        },
    )

    if "result" in result:
        content = result["result"].get("content", [])
        if content and content[0].get("type") == "text":
            data = json.loads(content[0]["text"])
            print(f"Status: {data.get('status')}")
            print(f"Interactions found: {data.get('interactions_found', 0)}")
            print(f"  Severe: {data.get('severe_count', 0)}")
            print(f"  Moderate: {data.get('moderate_count', 0)}")
            for interaction in data.get("interactions", []):
                print(
                    f"  [{interaction['severity']}] {interaction['drug1']} + {interaction['drug2']}: "
                    f"{interaction['description'][:120]}..."
                )
    else:
        print(f"Error: {json.dumps(result, indent=2)}")

    print()


def main():
    print()
    print("MedRecon MCP Server Test Suite")
    print("=" * 60)
    print()

    # Test 1: Get medications
    try:
        medications = test_get_medications()
    except Exception as e:
        print(f"FAILED: {e}")
        medications = []

    # Test 2: Check interactions with known drugs
    try:
        test_check_interactions()
    except Exception as e:
        print(f"FAILED: {e}")

    # Test 3: If we got medications, check interactions between them
    if medications:
        med_names = [m["name"] for m in medications if m.get("name") != "Unknown medication"]
        if len(med_names) >= 2:
            print("=" * 60)
            print("TEST: check_interactions with actual patient medications")
            print("=" * 60)
            try:
                test_check_interactions(med_names[:8])  # Limit to 8 drugs
            except Exception as e:
                print(f"FAILED: {e}")

    print("All tests complete.")


if __name__ == "__main__":
    main()
