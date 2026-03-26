"""Logging utilities for MedRecon agents."""
import hashlib
import json
import logging


class _AnsiColorFormatter(logging.Formatter):
    LEVEL_COLORS = {
        logging.DEBUG: "\x1b[36m",
        logging.INFO: "\x1b[32m",
        logging.WARNING: "\x1b[33m",
        logging.ERROR: "\x1b[31m",
        logging.CRITICAL: "\x1b[35m",
    }
    RESET = "\x1b[0m"

    def format(self, record):
        color = self.LEVEL_COLORS.get(record.levelno, "")
        original = record.levelname
        record.levelname = f"{color}{original}{self.RESET}" if color else original
        try:
            return super().format(record)
        finally:
            record.levelname = original


def configure_logging(package_name: str):
    """Configure a named package logger with an ANSI-colour handler."""
    pkg = logging.getLogger(package_name)
    if pkg.handlers:
        return
    pkg.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(
        _AnsiColorFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    pkg.addHandler(handler)
    pkg.propagate = False


def safe_pretty_json(value) -> str:
    """Serialize *value* to an indented JSON string, falling back to str()."""
    try:
        return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def serialize_for_log(value):
    """Return a JSON-serialisable representation of *value* (Pydantic-aware)."""
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


def redact_headers(headers: dict) -> dict:
    """Return a copy of *headers* with sensitive values replaced by [REDACTED]."""
    if not isinstance(headers, dict):
        return headers
    redacted = dict(headers)
    sensitive = {"x-api-key", "authorization", "cookie", "set-cookie"}
    for key in list(redacted.keys()):
        if str(key).lower() in sensitive:
            redacted[key] = f"[REDACTED len={len(str(redacted[key]))}]"
    return redacted


def token_fingerprint(token: str) -> str:
    """Return a non-sensitive fingerprint of a bearer/FHIR token for log output."""
    if not token:
        return "empty"
    digest = hashlib.sha256(token.encode()).hexdigest()[:12]
    return f"len={len(token)} sha256={digest}"
