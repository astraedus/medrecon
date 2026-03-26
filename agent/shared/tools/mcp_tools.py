"""
MCP tool wrappers for MedRecon agent.

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
