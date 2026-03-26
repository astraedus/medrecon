"""
Security middleware -- API key authentication for MedRecon agents.

Every request is blocked unless it carries a valid X-API-Key header.
The only public endpoint is /.well-known/agent-card.json, which callers
need to discover the agent before they can authenticate.

API keys are loaded from the MEDRECON_API_KEY environment variable.
The default dev key is 'medrecon-dev-key-2026' for local testing.
"""
import json
import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from shared.fhir_hook import extract_fhir_from_payload
from shared.logging_utils import redact_headers, safe_pretty_json, token_fingerprint

logger = logging.getLogger(__name__)

LOG_FULL_PAYLOAD = os.getenv("LOG_FULL_PAYLOAD", "true").lower() == "true"

# Load valid API keys from environment.
# MEDRECON_API_KEY can be a single key or a comma-separated list.
_env_key = os.getenv("MEDRECON_API_KEY", "medrecon-dev-key-2026")
VALID_API_KEYS: set = {k.strip() for k in _env_key.split(",") if k.strip()}


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that enforces X-API-Key authentication.

    Logs every incoming request (with headers redacted) and bridges FHIR
    metadata from params.message.metadata up to params.metadata so the ADK
    before_model_callback (fhir_hook.extract_fhir_context) can find it
    regardless of where the caller placed it.
    """

    async def dispatch(self, request: Request, call_next):
        # Read and parse the body so we can log it and inspect metadata.
        body_bytes = await request.body()
        body_text = body_bytes.decode("utf-8", errors="replace")
        parsed = {}
        try:
            parsed = json.loads(body_text) if body_text else {}
            pretty_body = safe_pretty_json(parsed)
        except json.JSONDecodeError:
            pretty_body = body_text

        if LOG_FULL_PAYLOAD:
            logger.info(
                "incoming_http_request path=%s method=%s headers=%s\npayload=\n%s",
                request.url.path,
                request.method,
                safe_pretty_json(redact_headers(dict(request.headers))),
                pretty_body,
            )

        # Bridge FHIR metadata from message.metadata -> params.metadata so that
        # the ADK before_model_callback (fhir_hook.extract_fhir_context) can
        # find it regardless of where the caller placed it.
        fhir_key, fhir_data = extract_fhir_from_payload(parsed)
        if isinstance(parsed, dict):
            params = parsed.get("params")
            if isinstance(params, dict):
                if fhir_key and fhir_data and not params.get("metadata"):
                    params["metadata"] = {fhir_key: fhir_data}
                    body_bytes = json.dumps(parsed, ensure_ascii=False).encode("utf-8")
                    # Mutate Starlette's cached body directly.
                    # BaseHTTPMiddleware captures `wrapped_receive` from the original
                    # _CachedRequest object; call_next() reads from that, not from any
                    # cloned Request we might create.  Setting request._body is the only
                    # way to make the modified bytes visible to the downstream handler.
                    request._body = body_bytes  # type: ignore[attr-defined]
                    logger.info(
                        "FHIR_METADATA_BRIDGED source=message.metadata target=params.metadata key=%s",
                        fhir_key,
                    )
                if fhir_data:
                    logger.info("FHIR_URL_FOUND value=%s", fhir_data.get("fhirUrl", "[EMPTY]"))
                    logger.info(
                        "FHIR_TOKEN_FOUND fingerprint=%s",
                        token_fingerprint(fhir_data.get("fhirToken", "")),
                    )
                    logger.info("FHIR_PATIENT_FOUND value=%s", fhir_data.get("patientId", "[EMPTY]"))
                else:
                    logger.info(
                        "FHIR_NOT_FOUND_IN_PAYLOAD keys_checked=params.metadata,message.metadata"
                    )

        # Agent-card endpoint is intentionally public -- it tells callers that
        # an API key IS required before they start authenticating.
        if request.url.path == "/.well-known/agent-card.json":
            return await call_next(request)

        api_key = request.headers.get("X-API-Key")

        if not api_key:
            logger.warning(
                "security_rejected_missing_api_key path=%s method=%s",
                request.url.path,
                request.method,
            )
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "detail": "X-API-Key header is required"},
            )

        if api_key not in VALID_API_KEYS:
            logger.warning(
                "security_rejected_invalid_api_key path=%s method=%s key_prefix=%s",
                request.url.path,
                request.method,
                api_key[:6] if len(api_key) >= 6 else api_key,
            )
            return JSONResponse(
                status_code=403,
                content={"error": "Forbidden", "detail": "Invalid API key"},
            )

        logger.info(
            "security_authorized path=%s method=%s key_prefix=%s",
            request.url.path,
            request.method,
            api_key[:6] if len(api_key) >= 6 else api_key,
        )
        return await call_next(request)
