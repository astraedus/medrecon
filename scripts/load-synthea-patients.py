#!/usr/bin/env python3
"""
Load Synthea-generated FHIR bundles to HAPI FHIR public server.

Strategy:
  1. Slim full Synthea bundles to Patient + MedicationRequest + Medication only
     (full bundles with Claims/EOBs/Observations get 413 rejected by HAPI FHIR).
  2. Strip unresolvable references from MedicationRequest (encounter, requester, etc.)
     that cause HAPI FHIR to reject with 400.
  3. For very large slim bundles (>300KB), post the Patient first, then batch
     MedicationRequests in groups of 50 per transaction.

Usage:
    python3 scripts/load-synthea-patients.py

Output:
    scripts/synthea-patients.json  -- summary of loaded patients with medication counts
    scripts/synthea-load.log       -- full run log for verification
"""

import copy
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FHIR_BASE = "https://hapi.fhir.org/baseR4"
SYNTHEA_OUTPUT_DIR = Path("/tmp/synthea/output/fhir")
SCRIPT_DIR = Path(__file__).parent
OUTPUT_JSON = SCRIPT_DIR / "synthea-patients.json"
LOG_FILE = SCRIPT_DIR / "synthea-load.log"
REQUEST_TIMEOUT = 60        # seconds (HAPI can be slow)
RATE_LIMIT_SECONDS = 1.0    # 1 request per second max (be polite to public server)
BATCH_BUNDLE_SIZE_KB = 100  # if slim bundle is larger than this, upload in batches
MED_BATCH_SIZE = 50         # MedicationRequest resources per batch transaction

# Resource types to keep when slimming a bundle.
# We only keep Patient and MedicationRequest.
# Medication resources (standalone) are NOT included to avoid HAPI-2840 duplicate
# errors on re-runs. Instead, medicationReference in MedRequests is inlined into
# medicationCodeableConcept using inline_medication_references() before upload.
KEEP_RESOURCE_TYPES = {
    "Patient",
    "MedicationRequest",
}

# Fields to remove from MedicationRequest to avoid unresolvable reference errors.
# HAPI-0541: urn:uuid encounter refs not in bundle
# HAPI-2282: Practitioner?identifier=... conditional refs not supported
MED_REQ_FIELDS_TO_STRIP = {
    "encounter",
    "recorder",
    "performer",
    "reasonReference",
    "requester",
    "eventHistory",
    "detectedIssue",
    "basedOn",
    "priorPrescription",
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
# Reset log file on each run
if LOG_FILE.exists():
    LOG_FILE.unlink()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bundle manipulation helpers
# ---------------------------------------------------------------------------

def build_medication_index(bundle: dict) -> dict[str, dict]:
    """
    Build a map from Medication fullUrl -> Medication resource, so we can inline
    medicationReference fields in MedicationRequest as medicationCodeableConcept.
    """
    index: dict[str, dict] = {}
    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        if resource.get("resourceType") == "Medication":
            full_url = entry.get("fullUrl", "")
            if full_url:
                index[full_url] = resource
    return index


def inline_medication_references(med_req: dict, medication_index: dict[str, dict]) -> dict:
    """
    If a MedicationRequest uses medicationReference (pointing to a Medication resource),
    replace it with medicationCodeableConcept inlined from the Medication resource.

    This eliminates the need to upload Medication resources separately, avoiding
    HAPI-2840 duplicate errors and simplifying the bundle.
    """
    if "medicationReference" not in med_req:
        return med_req

    ref = med_req["medicationReference"].get("reference", "")
    medication = medication_index.get(ref)

    if medication is None:
        # Can't inline - leave as-is (HAPI may reject it, but we'll try)
        return med_req

    result = copy.deepcopy(med_req)
    del result["medicationReference"]

    # Use the Medication resource's code as the inline codeable concept
    med_code = medication.get("code", {})
    if med_code:
        result["medicationCodeableConcept"] = med_code
    else:
        # Fallback: create a minimal codeable concept with the resource ID
        result["medicationCodeableConcept"] = {
            "text": f"Medication/{medication.get('id', 'unknown')}"
        }

    return result


def slim_entry(entry: dict) -> dict:
    """Return a slim copy of a bundle entry with stripped refs and request block.

    Always use PUT (upsert semantics) for resources with an ID, so re-running
    the script does not fail with duplicate-resource errors (HAPI-2840).
    """
    resource = entry.get("resource", {})
    rt = resource.get("resourceType", "")

    cleaned = copy.deepcopy(resource)
    if rt == "MedicationRequest":
        for field in MED_REQ_FIELDS_TO_STRIP:
            cleaned.pop(field, None)

    entry_out: dict = {
        "fullUrl": entry.get("fullUrl", ""),
        "resource": cleaned,
    }

    res_id = resource.get("id", "")
    if res_id:
        # Use PUT so re-runs do upsert instead of failing with HAPI-2840 duplicates
        entry_out["request"] = {"method": "PUT", "url": f"{rt}/{res_id}"}
    else:
        entry_out["request"] = {"method": "POST", "url": rt}

    return entry_out


def build_slim_bundle(entries: list[dict]) -> dict:
    """Wrap a list of slim entries in a transaction Bundle."""
    return {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": entries,
    }


def bundle_size_kb(bundle: dict) -> float:
    return len(json.dumps(bundle)) / 1024


# ---------------------------------------------------------------------------
# Patient / medication extraction helpers
# ---------------------------------------------------------------------------

def extract_patient_info(bundle: dict) -> dict | None:
    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        if resource.get("resourceType") == "Patient":
            name_obj = resource.get("name", [{}])[0]
            family = name_obj.get("family", "Unknown")
            given = " ".join(name_obj.get("given", []))
            full_name = f"{given} {family}".strip()
            return {
                "name": full_name,
                "birthDate": resource.get("birthDate", ""),
                "gender": resource.get("gender", "unknown"),
            }
    return None


def count_medication_requests(bundle: dict) -> int:
    return sum(
        1
        for entry in bundle.get("entry", [])
        if entry.get("resource", {}).get("resourceType") == "MedicationRequest"
    )


def extract_medication_names(bundle: dict, limit: int = 15) -> list[str]:
    """Extract unique medication display names (up to limit) from MedicationRequests."""
    meds: list[str] = []
    seen: set[str] = set()
    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        if resource.get("resourceType") == "MedicationRequest":
            med_cc = resource.get("medicationCodeableConcept", {})
            display = med_cc.get("text") or (
                med_cc.get("coding", [{}])[0].get("display", "")
                if med_cc.get("coding")
                else ""
            )
            if display and display not in seen:
                seen.add(display)
                meds.append(display)
                if len(meds) >= limit:
                    break
    return meds


# ---------------------------------------------------------------------------
# FHIR HTTP helpers
# ---------------------------------------------------------------------------

def post_bundle(client: httpx.Client, bundle: dict) -> dict | None:
    """POST a FHIR transaction bundle. Returns response JSON or None on error."""
    try:
        resp = client.post(
            FHIR_BASE,
            json=bundle,
            headers={"Content-Type": "application/fhir+json"},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.TimeoutException:
        log.warning("Request timed out after %ds", REQUEST_TIMEOUT)
        return None
    except httpx.HTTPStatusError as e:
        log.warning("HTTP %d: %s", e.response.status_code, e.response.text[:400])
        return None
    except Exception as e:
        log.warning("Unexpected error: %s", e)
        return None


def extract_patient_id_from_response(response: dict) -> str | None:
    """Find the Patient ID in a HAPI FHIR transaction response bundle."""
    for entry in response.get("entry", []):
        location = entry.get("response", {}).get("location", "")
        if location.startswith("Patient/"):
            parts = location.split("/")
            if len(parts) >= 2:
                return parts[1]
    return None


# ---------------------------------------------------------------------------
# Main upload logic
# ---------------------------------------------------------------------------

def upload_bundle_file(client: httpx.Client, bundle_file: Path) -> dict | None:
    """
    Load a Synthea FHIR bundle file, slim it, and upload to HAPI FHIR.

    Returns a patient dict (patient_id, name, medication_count, ...) or None on failure.
    Rate-limiting is handled by the caller.
    """
    try:
        with open(bundle_file) as f:
            full_bundle = json.load(f)
    except Exception as e:
        log.warning("Failed to read %s: %s", bundle_file.name, e)
        return None

    med_count = count_medication_requests(full_bundle)
    if med_count == 0:
        return None  # Caller will count this as skipped_no_meds

    patient_info = extract_patient_info(full_bundle)
    med_names = extract_medication_names(full_bundle)

    # Build index of Medication resources for inlining references
    medication_index = build_medication_index(full_bundle)

    # Build slim entries (Patient + MedicationRequest only)
    patient_entries: list[dict] = []
    med_req_entries: list[dict] = []

    for entry in full_bundle.get("entry", []):
        resource = entry.get("resource", {})
        rt = resource.get("resourceType", "")
        if rt == "Patient":
            patient_entries.append(slim_entry(entry))
        elif rt == "MedicationRequest":
            # Inline any medicationReference before slimming
            inlined = inline_medication_references(resource, medication_index)
            inlined_entry = dict(entry)
            inlined_entry["resource"] = inlined
            med_req_entries.append(slim_entry(inlined_entry))

    if not patient_entries:
        log.warning("No Patient resource in %s, skipping", bundle_file.name)
        return None

    # Try posting everything in one go first
    all_entries = patient_entries + med_req_entries
    single_bundle = build_slim_bundle(all_entries)
    size_kb = bundle_size_kb(single_bundle)

    if size_kb <= BATCH_BUNDLE_SIZE_KB:
        log.info(
            "  -> Uploading as single bundle (%.0fKB, %d resources, %d meds)...",
            size_kb,
            len(all_entries),
            len(med_req_entries),
        )
        response = post_bundle(client, single_bundle)
        time.sleep(RATE_LIMIT_SECONDS)

        if response is None:
            log.warning("  -> Upload FAILED")
            return None

        patient_id = extract_patient_id_from_response(response)
        if not patient_id:
            log.warning("  -> Could not extract Patient ID from response")
            return None

        log.info(
            "  -> SUCCESS: Patient ID = %s, name = %s, meds = %d",
            patient_id,
            patient_info["name"] if patient_info else "Unknown",
            len(med_req_entries),
        )

    else:
        # Bundle too large: post Patient first, then batches of MedicationRequests
        log.info(
            "  -> Bundle too large (%.0fKB), posting in batches...",
            size_kb,
        )

        # Step 1: Upload Patient
        patient_bundle = build_slim_bundle(patient_entries)
        response = post_bundle(client, patient_bundle)
        time.sleep(RATE_LIMIT_SECONDS)

        if response is None:
            log.warning("  -> Patient upload FAILED")
            return None

        patient_id = extract_patient_id_from_response(response)
        if not patient_id:
            log.warning("  -> Could not extract Patient ID from patient upload response")
            return None

        log.info("  -> Patient ID = %s, now uploading MedRequests in batches...", patient_id)

        # Rewrite subject reference in MedicationRequests to use server-assigned ID
        # (the patient is now at Patient/<patient_id>, not urn:uuid)
        original_patient_uuid = patient_entries[0].get("fullUrl", "")

        def fix_subject(entries: list[dict]) -> list[dict]:
            fixed = []
            for e in entries:
                e2 = copy.deepcopy(e)
                subj = e2.get("resource", {}).get("subject", {})
                if subj.get("reference") == original_patient_uuid:
                    e2["resource"]["subject"] = {"reference": f"Patient/{patient_id}"}
                fixed.append(e2)
            return fixed

        med_req_with_fixed_subject = fix_subject(med_req_entries)

        # Step 2: Upload MedicationRequests in batches
        total_uploaded = 0
        for batch_start in range(0, len(med_req_with_fixed_subject), MED_BATCH_SIZE):
            batch = med_req_with_fixed_subject[batch_start: batch_start + MED_BATCH_SIZE]
            batch_bundle = build_slim_bundle(batch)
            batch_resp = post_bundle(client, batch_bundle)
            time.sleep(RATE_LIMIT_SECONDS)

            if batch_resp is None:
                log.warning(
                    "  -> Batch %d-%d FAILED (continuing)",
                    batch_start,
                    batch_start + len(batch) - 1,
                )
            else:
                total_uploaded += len(batch)
                log.info(
                    "  -> Batch %d-%d OK (%d meds uploaded so far)",
                    batch_start,
                    batch_start + len(batch) - 1,
                    total_uploaded,
                )

        log.info(
            "  -> DONE (batched): Patient ID = %s, %d/%d meds uploaded",
            patient_id,
            total_uploaded,
            len(med_req_entries),
        )

    return {
        "patient_id": patient_id,
        "name": patient_info["name"] if patient_info else "Unknown",
        "birth_date": patient_info["birthDate"] if patient_info else "",
        "gender": patient_info["gender"] if patient_info else "unknown",
        "medication_count": med_count,
        "medications": med_names,
        "source_file": bundle_file.name,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    log.info("=" * 60)
    log.info("Synthea FHIR Patient Loader")
    log.info("Started: %s", datetime.now().isoformat())
    log.info("FHIR server: %s", FHIR_BASE)
    log.info("Synthea output dir: %s", SYNTHEA_OUTPUT_DIR)
    log.info("=" * 60)

    if not SYNTHEA_OUTPUT_DIR.exists():
        log.error("Synthea output dir not found: %s", SYNTHEA_OUTPUT_DIR)
        sys.exit(1)

    bundle_files = sorted(SYNTHEA_OUTPUT_DIR.glob("*.json"))
    bundle_files = [
        f for f in bundle_files
        if not f.name.startswith("hospitalInformation")
        and not f.name.startswith("practitionerInformation")
    ]
    log.info("Found %d patient bundle files", len(bundle_files))

    loaded_patients: list[dict] = []
    skipped_no_meds = 0
    skipped_errors = 0

    with httpx.Client() as client:
        for i, bundle_file in enumerate(bundle_files):
            log.info("[%d/%d] %s", i + 1, len(bundle_files), bundle_file.name)

            # Quick pre-check: does this bundle have medications?
            try:
                with open(bundle_file) as f:
                    peek = json.load(f)
            except Exception as e:
                log.warning("Cannot read file: %s", e)
                skipped_errors += 1
                continue

            if count_medication_requests(peek) == 0:
                log.info("  -> No medications, skipping")
                skipped_no_meds += 1
                continue

            result = upload_bundle_file(client, bundle_file)

            if result is None:
                skipped_errors += 1
            else:
                loaded_patients.append(result)

    # Save summary JSON
    summary = {
        "fhir_server": FHIR_BASE,
        "generated_at": datetime.now().isoformat(),
        "synthea_output_dir": str(SYNTHEA_OUTPUT_DIR),
        "stats": {
            "total_bundle_files": len(bundle_files),
            "loaded_with_medications": len(loaded_patients),
            "skipped_no_medications": skipped_no_meds,
            "skipped_errors": skipped_errors,
        },
        "patients": loaded_patients,
    }

    with open(OUTPUT_JSON, "w") as f:
        json.dump(summary, f, indent=2)

    log.info("=" * 60)
    log.info("DONE")
    log.info("  Total bundles: %d", len(bundle_files))
    log.info("  Loaded (with meds): %d", len(loaded_patients))
    log.info("  Skipped (no meds): %d", skipped_no_meds)
    log.info("  Skipped (errors): %d", skipped_errors)
    log.info("  Output: %s", OUTPUT_JSON)
    log.info("  Log: %s", LOG_FILE)
    log.info("=" * 60)

    if loaded_patients:
        log.info("Sample patient IDs (first 10):")
        for p in loaded_patients[:10]:
            log.info(
                "  ID=%-12s | %-35s | %d meds",
                p["patient_id"],
                p["name"],
                p["medication_count"],
            )


if __name__ == "__main__":
    main()
