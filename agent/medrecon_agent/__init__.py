"""MedRecon Agent -- Intelligent Medication Reconciliation."""
import sys
import os

# Ensure parent directory is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.logging_utils import configure_logging

configure_logging("medrecon_agent")
