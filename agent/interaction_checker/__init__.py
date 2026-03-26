"""Interaction Checker Agent -- Safety analysis on medication lists."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.logging_utils import configure_logging

configure_logging("interaction_checker")
