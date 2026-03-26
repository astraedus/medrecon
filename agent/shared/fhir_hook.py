"""
FHIR context hook for MedRecon agent.

Extracts FHIR credentials from A2A message metadata and stores them
in session state for tools to use. Credentials never appear in the prompt.

Based on po-adk-python shared/fhir_hook.py pattern.
"""
import json
import logging
import os

logger = logging.getLogger(__name__)

FHIR_CONTEXT_KEY = "fhir-context"
LOG_HOOK_RAW = os.getenv("LOG_HOOK_RAW_OBJECTS", "false").lower() == "true"


def _coerce_fhir_data(value):
    """Accept either a dict or a JSON string; return a dict or None."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _serialize(value):
    """Return a JSON-serialisable representation."""
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple, str, int, float, bool)):
        return value
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json")
        except TypeError:
            return model_dump()
        except Exception:
            return str(value)
    return str(value)


def extract_fhir_context(callback_context, llm_request):
    """
    ADK before_model_callback.

    Reads FHIR credentials from A2A message metadata and writes them into
    callback_context.state so that tools can call the FHIR server.
    """
    # Try multiple metadata sources in priority order
    metadata = {}
    sources = [
        ("callback_context.metadata", getattr(callback_context, "metadata", None)),
    ]

    # Check run_config.custom_metadata.a2a_metadata
    run_config = getattr(callback_context, "run_config", None)
    custom_metadata = getattr(run_config, "custom_metadata", None) if run_config else None
    if isinstance(custom_metadata, dict):
        sources.append(
            ("run_config.custom_metadata.a2a_metadata", custom_metadata.get("a2a_metadata"))
        )

    for source_name, candidate in sources:
        if isinstance(candidate, dict) and candidate:
            metadata = candidate
            logger.info("fhir_hook metadata_source=%s", source_name)
            break

    if not metadata:
        # No metadata found -- this is normal for direct (non-A2A) calls.
        # Fall back to environment variables.
        fhir_url = os.getenv("FHIR_SERVER_URL", "")
        if fhir_url:
            callback_context.state["fhir_url"] = fhir_url
            logger.info("fhir_hook using env FHIR_SERVER_URL=%s", fhir_url)
        return None

    # Find the FHIR entry inside the metadata dict
    fhir_data = None
    for key, value in metadata.items():
        if FHIR_CONTEXT_KEY in str(key):
            fhir_data = _coerce_fhir_data(value)
            break

    if fhir_data:
        callback_context.state["fhir_url"] = fhir_data.get("fhirUrl", "")
        callback_context.state["fhir_token"] = fhir_data.get("fhirToken", "")
        callback_context.state["patient_id"] = fhir_data.get("patientId", "")
        logger.info(
            "fhir_hook patient_id=%s fhir_url=%s token_present=%s",
            callback_context.state["patient_id"],
            callback_context.state["fhir_url"],
            bool(callback_context.state["fhir_token"]),
        )
    else:
        logger.info("fhir_hook no fhir context in metadata keys=%s", list(metadata.keys()))

    return None
