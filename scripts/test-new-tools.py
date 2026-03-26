#!/usr/bin/env python3
"""
Test script for the 5 new MedRecon MCP Server tools.
Tests: lookup_drug_info, check_allergies, find_alternatives, validate_dose, reconcile_lists

Usage:
    python3 scripts/test-new-tools.py

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


def extract_tool_result(result: dict) -> dict | None:
    """Extract parsed JSON from an MCP tool call result."""
    if "result" in result:
        content = result["result"].get("content", [])
        if content and content[0].get("type") == "text":
            try:
                return json.loads(content[0]["text"])
            except json.JSONDecodeError:
                return {"raw_text": content[0]["text"]}
    return None


def test_lookup_drug_info():
    """Test lookup_drug_info tool."""
    print("=" * 60)
    print("TEST 1: lookup_drug_info")
    print("=" * 60)

    # Test with a well-known generic drug
    print("\n--- Looking up 'metformin' ---")
    result = mcp_call("tools/call", {
        "name": "lookup_drug_info",
        "arguments": {"drug_name": "metformin"},
    })
    data = extract_tool_result(result)
    if data:
        print(f"  Status: {data.get('status')}")
        print(f"  RxCUI: {data.get('rxcui')}")
        print(f"  Normalized: {data.get('normalized_name')}")
        print(f"  Drug classes: {data.get('drug_classes', [])[:3]}")
        print(f"  Brand names: {data.get('brand_names', [])[:5]}")
        print(f"  Dosage forms: {data.get('dosage_forms', [])[:5]}")
        assert data.get("status") == "success", f"Expected success, got {data.get('status')}"
        assert data.get("rxcui"), "Expected rxcui"
        print("  PASSED")
    else:
        print(f"  FAILED: {json.dumps(result, indent=2)[:300]}")
        return False

    # Test with a nonexistent drug
    print("\n--- Looking up 'zzzznotadrug' ---")
    result = mcp_call("tools/call", {
        "name": "lookup_drug_info",
        "arguments": {"drug_name": "zzzznotadrug"},
    })
    data = extract_tool_result(result)
    if data:
        print(f"  Status: {data.get('status')}")
        assert data.get("status") == "not_found", f"Expected not_found, got {data.get('status')}"
        print("  PASSED")
    else:
        print(f"  FAILED: {json.dumps(result, indent=2)[:300]}")
        return False

    print()
    return True


def test_check_allergies():
    """Test check_allergies tool."""
    print("=" * 60)
    print("TEST 2: check_allergies")
    print("=" * 60)

    print(f"\n--- Checking allergies for patient {PATIENT_ID} against drugs ---")
    result = mcp_call(
        "tools/call",
        {
            "name": "check_allergies",
            "arguments": {
                "patient_id": PATIENT_ID,
                "drug_names": "amoxicillin, ibuprofen, lisinopril, penicillin",
                "fhir_url": FHIR_URL,
            },
        },
        headers={"x-fhir-server-url": FHIR_URL, "x-patient-id": PATIENT_ID},
    )
    data = extract_tool_result(result)
    if data:
        print(f"  Status: {data.get('status')}")
        print(f"  Allergies on record: {data.get('allergies_on_record', 0)}")
        print(f"  All allergies: {data.get('all_allergies', [])}")
        print(f"  Drugs checked: {data.get('drugs_checked', [])}")
        print(f"  Matches found: {data.get('matches_found', 0)}")
        for match in data.get("matches", []):
            print(f"    [{match['match_type']}] {match['drug_name']} <-> {match['allergy_substance']} (severity: {match['severity']})")
        # Success even if no allergies on record -- that's valid FHIR data
        assert data.get("status") == "success", f"Expected success, got {data.get('status')}"
        print("  PASSED")
    else:
        print(f"  FAILED: {json.dumps(result, indent=2)[:300]}")
        return False

    print()
    return True


def test_find_alternatives():
    """Test find_alternatives tool."""
    print("=" * 60)
    print("TEST 3: find_alternatives")
    print("=" * 60)

    print("\n--- Finding alternatives for 'atorvastatin' ---")
    result = mcp_call("tools/call", {
        "name": "find_alternatives",
        "arguments": {"drug_name": "atorvastatin"},
    })
    data = extract_tool_result(result)
    if data:
        print(f"  Status: {data.get('status')}")
        print(f"  Therapeutic classes: {data.get('therapeutic_classes', [])[:3]}")
        print(f"  Total alternatives: {data.get('total_alternatives_found', 0)}")
        alts = data.get("all_unique_alternatives", [])
        for alt in alts[:5]:
            print(f"    - {alt}")
        if len(alts) > 5:
            print(f"    ... and {len(alts) - 5} more")
        assert data.get("status") == "success", f"Expected success, got {data.get('status')}"
        print("  PASSED")
    else:
        print(f"  FAILED: {json.dumps(result, indent=2)[:300]}")
        return False

    print()
    return True


def test_validate_dose():
    """Test validate_dose tool."""
    print("=" * 60)
    print("TEST 4: validate_dose")
    print("=" * 60)

    # Test within range
    print("\n--- Validating metformin 1000mg (should be within range) ---")
    result = mcp_call("tools/call", {
        "name": "validate_dose",
        "arguments": {"drug_name": "metformin", "dose_value": "1000", "dose_unit": "mg"},
    })
    data = extract_tool_result(result)
    if data:
        dose_result = data.get("result", data.get("status"))
        print(f"  Status: {data.get('status')}")
        print(f"  Result: {dose_result}")
        print(f"  Range: {data.get('range', {})}")
        print(f"  Notes: {str(data.get('clinical_notes', data.get('clinical_note', '')))[:120]}")
        assert dose_result == "within_range", f"Expected within_range, got {dose_result}"
        print("  PASSED")
    else:
        print(f"  FAILED: {json.dumps(result, indent=2)[:300]}")
        return False

    # Test above range
    print("\n--- Validating metformin 5000mg (should be above range) ---")
    result = mcp_call("tools/call", {
        "name": "validate_dose",
        "arguments": {"drug_name": "metformin", "dose_value": "5000", "dose_unit": "mg"},
    })
    data = extract_tool_result(result)
    if data:
        dose_result = data.get("result", data.get("status"))
        print(f"  Result: {dose_result}")
        assert dose_result == "above_range", f"Expected above_range, got {dose_result}"
        print("  PASSED")
    else:
        print(f"  FAILED")
        return False

    # Test below range
    print("\n--- Validating lisinopril 0.5mg (should be below range) ---")
    result = mcp_call("tools/call", {
        "name": "validate_dose",
        "arguments": {"drug_name": "lisinopril", "dose_value": "0.5", "dose_unit": "mg"},
    })
    data = extract_tool_result(result)
    if data:
        dose_result = data.get("result", data.get("status"))
        print(f"  Result: {dose_result}")
        assert dose_result == "below_range", f"Expected below_range, got {dose_result}"
        print("  PASSED")
    else:
        print(f"  FAILED")
        return False

    # Test unknown drug
    print("\n--- Validating unknowndrug 100mg (should be unknown) ---")
    result = mcp_call("tools/call", {
        "name": "validate_dose",
        "arguments": {"drug_name": "unknowndrug", "dose_value": "100", "dose_unit": "mg"},
    })
    data = extract_tool_result(result)
    if data:
        dose_result = data.get("result", data.get("status"))
        print(f"  Result: {dose_result}")
        assert dose_result == "unknown_drug", f"Expected unknown_drug, got {dose_result}"
        print("  PASSED")
    else:
        print(f"  FAILED")
        return False

    print()
    return True


def test_reconcile_lists():
    """Test reconcile_lists tool -- THE CORE TOOL."""
    print("=" * 60)
    print("TEST 5: reconcile_lists (CORE TOOL)")
    print("=" * 60)

    lists = [
        {
            "source": "Hospital EHR",
            "medications": [
                {"name": "metformin", "dose": "500mg", "frequency": "BID"},
                {"name": "lisinopril", "dose": "10mg", "frequency": "daily"},
                {"name": "atorvastatin", "dose": "40mg", "frequency": "daily"},
                {"name": "aspirin", "dose": "81mg", "frequency": "daily"},
            ],
        },
        {
            "source": "Pharmacy Records",
            "medications": [
                {"name": "metformin", "dose": "1000mg", "frequency": "BID"},  # Dose discrepancy!
                {"name": "lisinopril", "dose": "10mg", "frequency": "daily"},
                {"name": "atorvastatin", "dose": "40mg", "frequency": "daily"},
                {"name": "omeprazole", "dose": "20mg", "frequency": "daily"},  # Missing from EHR!
            ],
        },
        {
            "source": "Patient Self-Report",
            "medications": [
                {"name": "metformin", "dose": "500mg", "frequency": "twice daily"},
                {"name": "lisinopril", "dose": "10mg", "frequency": "once daily"},
                {"name": "baby aspirin", "dose": "81mg", "frequency": "daily"},
                # Missing atorvastatin!
            ],
        },
    ]

    print(f"\n--- Reconciling 3 sources ({sum(len(l['medications']) for l in lists)} total entries) ---")

    result = mcp_call("tools/call", {
        "name": "reconcile_lists",
        "arguments": {"lists_json": json.dumps(lists)},
    })
    data = extract_tool_result(result)
    if data:
        print(f"  Status: {data.get('status')}")
        print(f"  Sources: {data.get('sources')}")
        summary = data.get("summary", {})
        print(f"  Unique medications: {data.get('total_unique_medications')}")
        # Handle both possible field names from original and linter-modified versions
        consistent = summary.get("consistent", summary.get("matching", 0))
        discrepancies = summary.get("with_discrepancies", summary.get("dose_mismatches", 0))
        missing = summary.get("missing_from_at_least_one_source", summary.get("missing_from_source", 0))
        print(f"  Consistent/Matching: {consistent}")
        print(f"  Dose discrepancies: {discrepancies}")
        print(f"  Missing from source: {missing}")
        print()
        # Handle both response formats
        reconciled_meds = data.get("reconciled_medications", data.get("reconciled_list", []))
        for med in reconciled_meds:
            flag = med.get("flag", med.get("status", "?"))
            status_icon = {"MATCH": "OK", "consistent": "OK", "DOSE_MISMATCH": "WARN", "discrepancy": "WARN", "MISSING": "MISS", "missing_from_source": "MISS", "MISSING_AND_DOSE_MISMATCH": "WARN+MISS"}.get(flag, "?")
            print(f"  [{status_icon}] {med['normalized_name']}")
            sources = med.get("sources_present", [s["source"] for s in med.get("sources", [])])
            print(f"       Sources: {sources}")
            missing_from = med.get("sources_missing", med.get("missing_from", []))
            if missing_from:
                print(f"       Missing: {missing_from}")
            for d in med.get("discrepancies", []):
                print(f"       >> {d}")
            dose_detail = med.get("dose_details")
            if dose_detail:
                print(f"       >> Dose: {dose_detail}")

        assert data.get("status") == "success", f"Expected success, got {data.get('status')}"
        assert data.get("total_unique_medications", 0) >= 4, "Expected at least 4 unique meds"
        assert discrepancies > 0 or missing > 0, "Expected at least 1 discrepancy or missing"
        print("\n  PASSED")
    else:
        print(f"  FAILED: {json.dumps(result, indent=2)[:300]}")
        return False

    print()
    return True


def main():
    print()
    print("MedRecon MCP Server - New Tools Test Suite")
    print("=" * 60)
    print()

    results = {}

    # Test 1: Drug info lookup
    try:
        results["lookup_drug_info"] = test_lookup_drug_info()
    except Exception as e:
        print(f"  FAILED with exception: {e}")
        results["lookup_drug_info"] = False

    # Test 2: Allergy check
    try:
        results["check_allergies"] = test_check_allergies()
    except Exception as e:
        print(f"  FAILED with exception: {e}")
        results["check_allergies"] = False

    # Test 3: Find alternatives
    try:
        results["find_alternatives"] = test_find_alternatives()
    except Exception as e:
        print(f"  FAILED with exception: {e}")
        results["find_alternatives"] = False

    # Test 4: Validate dose
    try:
        results["validate_dose"] = test_validate_dose()
    except Exception as e:
        print(f"  FAILED with exception: {e}")
        results["validate_dose"] = False

    # Test 5: Reconcile lists
    try:
        results["reconcile_lists"] = test_reconcile_lists()
    except Exception as e:
        print(f"  FAILED with exception: {e}")
        results["reconcile_lists"] = False

    # Summary
    print("=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    for name, passed_flag in results.items():
        status = "PASS" if passed_flag else "FAIL"
        print(f"  {name}: {status}")
    print(f"\n  {passed}/{total} tests passed")

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
