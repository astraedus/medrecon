"""
A2A client tools for the Orchestrator agent.

These tools call the Source Collector and Interaction Checker agents
via the A2A protocol. The Orchestrator never calls MCP tools directly --
it delegates to specialist agents.
"""
import asyncio
import json
import logging
import os
import uuid

import httpx
from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)

A2A_TIMEOUT = 120  # seconds -- agents need time to reason + call MCP tools


def _get_source_collector_url() -> str:
    """Get the Source Collector agent URL."""
    return os.getenv("SOURCE_COLLECTOR_URL", "http://localhost:8001")


def _get_interaction_checker_url() -> str:
    """Get the Interaction Checker agent URL."""
    return os.getenv("INTERACTION_CHECKER_URL", "http://localhost:8002")


def _send_a2a_message(agent_url: str, message_text: str) -> dict:
    """
    Send a message to an A2A agent and return the response.

    Uses the JSON-RPC 2.0 A2A protocol: method "message/send".
    The agent processes the message and returns a Task with status and results.
    """
    rpc_url = agent_url.rstrip("/") + "/"
    message_id = str(uuid.uuid4())

    payload = {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "message/send",
        "params": {
            "message": {
                "messageId": message_id,
                "role": "user",
                "parts": [
                    {"kind": "text", "text": message_text}
                ],
            },
        },
    }

    try:
        response = httpx.post(
            rpc_url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=A2A_TIMEOUT,
        )
        response.raise_for_status()
        result = response.json()

        if "error" in result:
            return {
                "status": "error",
                "error_message": result["error"].get("message", "Unknown A2A error"),
                "error_code": result["error"].get("code"),
            }

        # Extract the task result
        task = result.get("result", {})
        task_status = task.get("status", {})
        state = task_status.get("state", "unknown")

        # Get the agent's response from status message AND artifacts.
        # ADK agents typically put their final response in artifacts,
        # while status message may be empty or a brief summary.
        response_parts = []

        # Check status message
        agent_message = task_status.get("message", {})
        for part in agent_message.get("parts", []):
            if part.get("kind") == "text" and part.get("text", "").strip():
                response_parts.append(part["text"])

        # Check artifacts (this is where ADK agents put structured output)
        artifacts = task.get("artifacts", [])
        for artifact in artifacts:
            for part in artifact.get("parts", []):
                if part.get("kind") == "text" and part.get("text", "").strip():
                    response_parts.append(part["text"])

        # Also check history for the last agent message
        history = task.get("history", [])
        for msg in reversed(history):
            if msg.get("role") == "agent":
                for part in msg.get("parts", []):
                    if part.get("kind") == "text" and part.get("text", "").strip():
                        text = part["text"]
                        if text not in response_parts:
                            response_parts.append(text)
                break  # only check the last agent message

        response_text = "\n\n".join(response_parts) if response_parts else ""

        return {
            "status": "success",
            "task_state": state,
            "task_id": task.get("id", ""),
            "response_text": response_text,
        }

    except httpx.ConnectError:
        return {
            "status": "error",
            "error_message": f"Could not connect to agent at {agent_url}. Is it running?",
        }
    except httpx.TimeoutException:
        return {
            "status": "error",
            "error_message": f"Agent at {agent_url} timed out after {A2A_TIMEOUT}s",
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": f"A2A call failed: {e}",
        }


def collect_medications(
    patient_id: str,
    fhir_url: str = "",
    tool_context: ToolContext = None,
) -> dict:
    """
    Collects medications from multiple FHIR sources via the Source Collector agent.

    Sends a task to the Source Collector agent via A2A protocol. The Source Collector
    queries multiple FHIR endpoints (simulating hospital EHR, pharmacy, and PCP office)
    and returns a merged medication list with source attribution and discrepancy detection.

    Args:
        patient_id: The FHIR Patient resource ID. Required.
        fhir_url: The base URL of the FHIR R4 server. Defaults to HAPI public server.

    Returns:
        A dict containing the merged medication list from multiple sources,
        with source attribution and flagged discrepancies.
    """
    if not patient_id:
        return {
            "status": "error",
            "error_message": "No patient_id provided.",
        }

    resolved_fhir_url = fhir_url or os.getenv("FHIR_SERVER_URL", "https://hapi.fhir.org/baseR4")

    message = (
        f"Collect medications for patient {patient_id} from the FHIR server at {resolved_fhir_url}. "
        f"Query the server 3 times to simulate 3 different healthcare sources:\n"
        f"1. Hospital EHR: Call get_medications with patient_id='{patient_id}' and fhir_url='{resolved_fhir_url}'\n"
        f"2. Pharmacy System: Call get_medications again with the same parameters (simulates pharmacy records)\n"
        f"3. Primary Care Office: Call get_medications again with the same parameters (simulates PCP records)\n\n"
        f"Label each result with its source name. Then merge all medications into a unified list, "
        f"noting which sources each medication appears in. Flag any discrepancies between sources. "
        f"Return the result as a structured JSON object."
    )

    logger.info(
        "collect_medications -> Source Collector: patient_id=%s fhir_url=%s",
        patient_id,
        resolved_fhir_url,
    )

    result = _send_a2a_message(_get_source_collector_url(), message)

    if result.get("status") == "error":
        logger.error("Source Collector error: %s", result.get("error_message"))
    else:
        logger.info(
            "Source Collector response: state=%s text_len=%d",
            result.get("task_state"),
            len(result.get("response_text", "")),
        )

    return result


def check_safety(
    patient_id: str,
    medication_list: str,
    tool_context: ToolContext = None,
) -> dict:
    """
    Performs comprehensive safety analysis on a medication list via the Interaction Checker agent.

    Sends a task to the Interaction Checker agent via A2A protocol. The Interaction Checker
    runs drug-drug interaction checks, allergy cross-referencing, dose validation, and
    suggests alternatives for problematic medications.

    Args:
        patient_id: The FHIR Patient resource ID. Required for allergy checks.
        medication_list: Description of medications to analyze. Should include drug names
                         and doses. Can be a comma-separated list or a structured description.

    Returns:
        A dict containing interaction alerts, allergy warnings, dose validations,
        suggested alternatives, and an overall risk assessment.
    """
    if not medication_list:
        return {
            "status": "error",
            "error_message": "No medication list provided.",
        }

    message = (
        f"Perform a comprehensive safety analysis on the following medications "
        f"for patient {patient_id}:\n\n"
        f"{medication_list}\n\n"
        f"Steps:\n"
        f"1. Extract all drug names from the medication list and call check_interactions "
        f"with the comma-separated drug names.\n"
        f"2. Call check_allergies with patient_id='{patient_id}' and the drug names.\n"
        f"3. For each medication with a dose value, call validate_dose.\n"
        f"4. For any drug with a SEVERE interaction or allergy match, call find_alternatives.\n"
        f"5. Return a structured JSON safety report."
    )

    logger.info(
        "check_safety -> Interaction Checker: patient_id=%s meds_len=%d",
        patient_id,
        len(medication_list),
    )

    result = _send_a2a_message(_get_interaction_checker_url(), message)

    if result.get("status") == "error":
        logger.error("Interaction Checker error: %s", result.get("error_message"))
    else:
        logger.info(
            "Interaction Checker response: state=%s text_len=%d",
            result.get("task_state"),
            len(result.get("response_text", "")),
        )

    return result
