"""Logging utilities for MedRecon agents."""
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
