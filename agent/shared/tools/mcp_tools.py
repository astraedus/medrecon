"""
MCP tool wrappers for MedRecon agents.

These tools call the MedRecon MCP Server's tools via HTTP.
They use the MCP JSON-RPC protocol over HTTP/SSE.

The agent calls these as regular ADK tools. Under the hood,
each tool makes an HTTP request to the MCP server.
"""
import json
import logging
import os

import httpx
from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)

MCP_TIMEOUT = 30  # seconds


def _get_mcp_url() -> str:
    """Get the MCP server URL from environment or default."""
    return os.getenv("MCP_SERVER_URL", "http://localhost:5000/mcp")


def _get_fhir_url(tool_context: ToolContext) -> str:
    """Get the FHIR server URL from state, environment, or default."""
    return (
        tool_context.state.get("fhir_url", "")
        or os.getenv("FHIR_SERVER_URL", "")
        or "https://hapi.fhir.org/baseR4"
    )


def _get_patient_id(tool_context: ToolContext) -> str:
    """Get the patient ID from state."""
    return tool_context.state.get("patient_id", "")


def _parse_sse_response(text: str) -> list[dict]:
    """Parse SSE response into list of JSON objects."""
    results = []
    for line in text.strip().split("\n"):
        if line.startswith("data: "):
            try:
                results.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return results


def _call_mcp_tool(
    tool_name: str,
    arguments: dict,
    headers: dict | None = None,
) -> dict:
    """
    Call an MCP tool via JSON-RPC over HTTP/SSE.

    Returns the parsed tool result or an error dict.
    """
    mcp_url = _get_mcp_url()
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }

    req_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if headers:
        req_headers.update(headers)

    try:
        response = httpx.post(
            mcp_url,
            json=payload,
            headers=req_headers,
            timeout=MCP_TIMEOUT,
        )
        response.raise_for_status()

        messages = _parse_sse_response(response.text)
        if not messages:
            return {"status": "error", "error_message": "No response from MCP server"}

        last_msg = messages[-1]
        if "result" in last_msg:
            content = last_msg["result"].get("content", [])
            if content and content[0].get("type") == "text":
                try:
                    return json.loads(content[0]["text"])
                except json.JSONDecodeError:
                    return {"status": "success", "text": content[0]["text"]}
            return {"status": "success", "result": last_msg["result"]}
        elif "error" in last_msg:
            return {
                "status": "error",
                "error_message": last_msg["error"].get("message", "Unknown error"),
            }
        return {"status": "error", "error_message": "Unexpected response format"}

    except httpx.ConnectError:
        return {
            "status": "error",
            "error_message": f"Could not connect to MCP server at {mcp_url}. Is it running?",
        }
    except httpx.TimeoutException:
        return {
            "status": "error",
            "error_message": f"MCP server at {mcp_url} timed out after {MCP_TIMEOUT}s",
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": f"MCP call failed: {e}",
        }


# ---- ADK Tool Functions ----


def get_medications(
    patient_id: str,
    fhir_url: str = "",
    status: str = "active",
    tool_context: ToolContext = None,
) -> dict:
    """
    Retrieves the medication list for a patient from a FHIR R4 server.

    Queries both MedicationRequest and MedicationStatement resources via the
    MedRecon MCP Server. Returns a normalized list with drug name, dose,
    frequency, prescriber, and status.

    Args:
        patient_id: The FHIR Patient resource ID. Required.
        fhir_url: The base URL of the FHIR R4 server.
                   Defaults to the server in session context or HAPI public.
        status: Filter by medication status. Defaults to 'active'.
                Other values: 'completed', 'stopped', 'entered-in-error'.

    Returns:
        A dict with status, count, and a list of normalized medications.
    """
    resolved_fhir_url = fhir_url
    resolved_patient_id = patient_id

    if tool_context:
        if not resolved_fhir_url:
            resolved_fhir_url = _get_fhir_url(tool_context)
        if not resolved_patient_id:
            resolved_patient_id = _get_patient_id(tool_context)

    if not resolved_patient_id:
        return {
            "status": "error",
            "error_message": "No patient_id provided. Please specify a patient ID.",
        }

    logger.info(
        "get_medications patient_id=%s fhir_url=%s status=%s",
        resolved_patient_id,
        resolved_fhir_url or "(default)",
        status,
    )

    arguments = {"patient_id": resolved_patient_id, "status": status}
    if resolved_fhir_url:
        arguments["fhir_url"] = resolved_fhir_url

    headers = {}
    if resolved_fhir_url:
        headers["x-fhir-server-url"] = resolved_fhir_url

    return _call_mcp_tool("get_medications", arguments, headers)


def check_interactions(
    drug_names: str,
    include_openfda: str = "true",
    tool_context: ToolContext = None,
) -> dict:
    """
    Checks for drug-drug interactions in a list of medications.

    Uses a curated clinical interaction database and optionally OpenFDA drug labels.
    Returns interaction pairs with severity levels (SEVERE, MODERATE, MILD)
    and descriptions.

    Args:
        drug_names: Comma-separated list of drug names to check.
                    Example: "warfarin, ibuprofen, lisinopril, metformin"
        include_openfda: Whether to also search OpenFDA drug labels.
                         'true' or 'false'. Defaults to 'true'.

    Returns:
        A dict with interactions found, severity counts, and detailed interaction info.
    """
    if not drug_names or not drug_names.strip():
        return {
            "status": "error",
            "error_message": "No drug names provided. Please provide a comma-separated list.",
        }

    logger.info("check_interactions drugs=%s", drug_names)

    return _call_mcp_tool(
        "check_interactions",
        {"drug_names": drug_names, "include_openfda": include_openfda},
    )


def check_allergies(
    drug_names: str,
    patient_id: str = "",
    fhir_url: str = "",
    tool_context: ToolContext = None,
) -> dict:
    """
    Cross-references a patient's documented allergies against a list of drug names.

    Queries FHIR AllergyIntolerance resources and performs fuzzy matching including
    drug class cross-reactivity (e.g., penicillin allergy flags amoxicillin).
    Returns matching allergies with severity, reactions, and clinical notes.

    Args:
        drug_names: Comma-separated list of drug names to check against patient allergies.
                    Example: "amoxicillin, ibuprofen, lisinopril"
        patient_id: The FHIR Patient resource ID. Uses session context if not provided.
        fhir_url: The base URL of the FHIR R4 server. Defaults to context or HAPI public.

    Returns:
        A dict with allergy matches, severity, reactions, and cross-reactivity info.
    """
    resolved_fhir_url = fhir_url
    resolved_patient_id = patient_id

    if tool_context:
        if not resolved_fhir_url:
            resolved_fhir_url = _get_fhir_url(tool_context)
        if not resolved_patient_id:
            resolved_patient_id = _get_patient_id(tool_context)

    if not resolved_patient_id:
        return {
            "status": "error",
            "error_message": "No patient_id provided. Please specify a patient ID.",
        }

    logger.info(
        "check_allergies patient_id=%s drugs=%s",
        resolved_patient_id,
        drug_names,
    )

    arguments = {"drug_names": drug_names, "patient_id": resolved_patient_id}
    if resolved_fhir_url:
        arguments["fhir_url"] = resolved_fhir_url

    headers = {}
    if resolved_fhir_url:
        headers["x-fhir-server-url"] = resolved_fhir_url

    return _call_mcp_tool("check_allergies", arguments, headers)


def validate_dose(
    drug_name: str,
    dose_value: str,
    dose_unit: str = "mg",
    tool_context: ToolContext = None,
) -> dict:
    """
    Validates a medication dose against known safe dose ranges.

    Checks if a given dose is within, below, or above the typical adult dose range.
    Covers 18 commonly prescribed medications. Returns range status and clinical notes.

    Args:
        drug_name: The name of the drug to validate the dose for.
                   Example: "metformin" or "lisinopril"
        dose_value: The numeric dose value to validate.
                    Example: "500" or "2.5"
        dose_unit: The unit of the dose. Usually 'mg'. Example: "mg" or "mcg"

    Returns:
        A dict with validation result (within_range, below_range, above_range),
        severity (OK, WARNING, ALERT), and clinical notes.
    """
    if not drug_name or not drug_name.strip():
        return {"status": "error", "error_message": "No drug name provided."}

    if not dose_value or not dose_value.strip():
        return {"status": "error", "error_message": "No dose value provided."}

    logger.info("validate_dose drug=%s dose=%s%s", drug_name, dose_value, dose_unit)

    return _call_mcp_tool(
        "validate_dose",
        {"drug_name": drug_name, "dose_value": dose_value, "dose_unit": dose_unit},
    )


def find_alternatives(
    drug_name: str,
    max_results: str = "10",
    tool_context: ToolContext = None,
) -> dict:
    """
    Finds therapeutic alternatives for a drug using RxNorm ATC classification.

    Identifies drugs in the same therapeutic class that could serve as substitutes.
    Useful for allergy-safe alternatives, formulary substitutions, or cost-effective options.

    Args:
        drug_name: The name of the drug to find alternatives for.
                   Example: "atorvastatin" or "Lipitor"
        max_results: Maximum number of alternatives to return. Defaults to '10'. Max '25'.

    Returns:
        A dict with therapeutic classes, alternatives by class, and unique alternatives list.
    """
    if not drug_name or not drug_name.strip():
        return {"status": "error", "error_message": "No drug name provided."}

    logger.info("find_alternatives drug=%s max=%s", drug_name, max_results)

    return _call_mcp_tool(
        "find_alternatives",
        {"drug_name": drug_name, "max_results": max_results},
    )


def lookup_drug_info(
    drug_name: str,
    tool_context: ToolContext = None,
) -> dict:
    """
    Looks up detailed drug information using RxNorm.

    Returns RxCUI identifier, drug class, ingredients, available dose forms,
    and related brand/generic names for a given drug.

    Args:
        drug_name: The name of the drug to look up. Can be brand or generic name.
                   Example: "metformin" or "Glucophage"

    Returns:
        A dict with drug details including RxCUI, name, class info, dose forms.
    """
    if not drug_name or not drug_name.strip():
        return {"status": "error", "error_message": "No drug name provided."}

    logger.info("lookup_drug_info drug=%s", drug_name)

    return _call_mcp_tool("lookup_drug_info", {"drug_name": drug_name})


def generate_fhir_output(
    patient_id: str,
    medications: str,
    fhir_url: str = "",
    tool_context: ToolContext = None,
) -> dict:
    """
    Generates FHIR R4 MedicationStatement resources from reconciled medication data.

    Converts a list of reconciled medications into a proper FHIR R4 Bundle containing
    paired MedicationStatement and Provenance resources. The output can be posted
    directly to a FHIR server to persist the reconciliation results.

    Args:
        patient_id: The FHIR Patient resource ID. Required.
        medications: JSON string of reconciled medications array. Each item should have:
                     name (string), dose (string), frequency (string), rxcui (string),
                     sources (string array), flag ("MATCH"|"MISSING"|"DOSE_MISMATCH").
        fhir_url: The base FHIR server URL for resource references. Optional.

    Returns:
        A FHIR R4 Bundle (type: collection) containing MedicationStatement and
        Provenance resources for each reconciled medication.
    """
    resolved_patient_id = patient_id
    resolved_fhir_url = fhir_url

    if tool_context:
        if not resolved_patient_id:
            resolved_patient_id = _get_patient_id(tool_context)
        if not resolved_fhir_url:
            resolved_fhir_url = _get_fhir_url(tool_context)

    if not resolved_patient_id:
        return {"status": "error", "error_message": "No patient_id provided."}
    if not medications or not medications.strip():
        return {"status": "error", "error_message": "No medications provided."}

    logger.info("generate_fhir_output patient_id=%s", resolved_patient_id)

    arguments = {"patient_id": resolved_patient_id, "medications": medications}
    if resolved_fhir_url:
        arguments["fhir_url"] = resolved_fhir_url

    return _call_mcp_tool("generate_fhir_output", arguments)
