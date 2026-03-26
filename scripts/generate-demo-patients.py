#!/usr/bin/env python3
"""
Generate demo patients with complex medication profiles and load them into HAPI FHIR.

Creates FHIR transaction bundles with:
- Patient resource
- Multiple MedicationRequest resources (5-15 per patient)
- AllergyIntolerance resources
- Condition resources (to justify medications)

Each patient has clinically interesting drug interactions and allergy cross-reactivity.
"""

import json
import sys
import time
import uuid
from datetime import date, timedelta

import httpx

FHIR_BASE = "https://hapi.fhir.org/baseR4"
TIMEOUT = 30

# ──────────────────────────────────────────────────────────────
# Demo Patient Profiles
# ──────────────────────────────────────────────────────────────

DEMO_PATIENTS = [
    {
        "name": {"given": ["Margaret", "Ann"], "family": "Chen"},
        "gender": "female",
        "birthDate": "1958-07-22",
        "allergies": [
            {
                "code": "7980",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Penicillin V",
                "category": "medication",
                "reaction_display": "Anaphylaxis",
                "reaction_severity": "severe",
            },
            {
                "code": "1191",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Aspirin",
                "category": "medication",
                "reaction_display": "Urticaria",
                "reaction_severity": "moderate",
            },
        ],
        "conditions": [
            ("I48.91", "Atrial fibrillation"),
            ("I10", "Essential hypertension"),
            ("E78.5", "Hyperlipidemia"),
            ("I50.9", "Heart failure, unspecified"),
            ("E11.9", "Type 2 diabetes"),
        ],
        "medications": [
            # SEVERE: metoprolol + verapamil (bradycardia, heart block)
            {"drug": "Metoprolol Succinate", "rxcui": "866924", "dose": "50 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Verapamil HCl", "rxcui": "897718", "dose": "120 mg", "freq": "twice daily", "route": "oral"},
            # SEVERE: warfarin + amiodarone (bleeding risk)
            {"drug": "Warfarin Sodium", "rxcui": "855332", "dose": "5 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Amiodarone HCl", "rxcui": "834061", "dose": "200 mg", "freq": "once daily", "route": "oral"},
            # Other cardiac
            {"drug": "Lisinopril", "rxcui": "314076", "dose": "20 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Atorvastatin Calcium", "rxcui": "259255", "dose": "40 mg", "freq": "once daily at bedtime", "route": "oral"},
            {"drug": "Furosemide", "rxcui": "310429", "dose": "40 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Digoxin", "rxcui": "197604", "dose": "0.125 mg", "freq": "once daily", "route": "oral"},
            # Diabetes
            {"drug": "Metformin HCl", "rxcui": "861007", "dose": "1000 mg", "freq": "twice daily", "route": "oral"},
            {"drug": "Glipizide", "rxcui": "310488", "dose": "5 mg", "freq": "once daily before breakfast", "route": "oral"},
            # Supplement (interaction with ACE inhibitor)
            {"drug": "Potassium Chloride", "rxcui": "628953", "dose": "20 mEq", "freq": "once daily", "route": "oral"},
        ],
    },
    {
        "name": {"given": ["Robert", "James"], "family": "Williams"},
        "gender": "male",
        "birthDate": "1965-11-03",
        "allergies": [
            {
                "code": "723",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Amoxicillin",
                "category": "medication",
                "reaction_display": "Rash, hives",
                "reaction_severity": "moderate",
            },
        ],
        "conditions": [
            ("M06.9", "Rheumatoid arthritis"),
            ("I10", "Essential hypertension"),
            ("M81.0", "Osteoporosis"),
            ("K21.0", "GERD"),
            ("G43.909", "Migraine"),
        ],
        "medications": [
            # SEVERE: methotrexate + NSAIDs (renal toxicity, bone marrow suppression)
            {"drug": "Methotrexate", "rxcui": "105586", "dose": "15 mg", "freq": "once weekly", "route": "oral"},
            {"drug": "Naproxen Sodium", "rxcui": "849727", "dose": "500 mg", "freq": "twice daily", "route": "oral"},
            # MODERATE: prednisone + NSAIDs (GI bleeding)
            {"drug": "Prednisone", "rxcui": "312617", "dose": "10 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Hydroxychloroquine Sulfate", "rxcui": "979092", "dose": "200 mg", "freq": "twice daily", "route": "oral"},
            # Cardiac
            {"drug": "Amlodipine Besylate", "rxcui": "329528", "dose": "5 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Losartan Potassium", "rxcui": "979467", "dose": "50 mg", "freq": "once daily", "route": "oral"},
            # GI
            {"drug": "Omeprazole", "rxcui": "198053", "dose": "20 mg", "freq": "once daily before breakfast", "route": "oral"},
            # Osteoporosis
            {"drug": "Alendronate Sodium", "rxcui": "996241", "dose": "70 mg", "freq": "once weekly", "route": "oral"},
            {"drug": "Calcium Carbonate", "rxcui": "318076", "dose": "600 mg", "freq": "twice daily", "route": "oral"},
            # Migraine
            {"drug": "Sumatriptan Succinate", "rxcui": "313164", "dose": "50 mg", "freq": "as needed", "route": "oral"},
            # Folic acid (for methotrexate)
            {"drug": "Folic Acid", "rxcui": "316956", "dose": "1 mg", "freq": "once daily", "route": "oral"},
        ],
    },
    {
        "name": {"given": ["Dorothy", "Mae"], "family": "Johnson"},
        "gender": "female",
        "birthDate": "1945-03-18",
        "allergies": [
            {
                "code": "2670",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Codeine",
                "category": "medication",
                "reaction_display": "Nausea, vomiting, respiratory depression",
                "reaction_severity": "severe",
            },
            {
                "code": "36437",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Sulfonamide",
                "category": "medication",
                "reaction_display": "Stevens-Johnson syndrome",
                "reaction_severity": "severe",
            },
        ],
        "conditions": [
            ("I25.10", "Coronary artery disease"),
            ("I10", "Essential hypertension"),
            ("E78.5", "Hyperlipidemia"),
            ("F32.1", "Major depressive disorder"),
            ("G47.00", "Insomnia"),
            ("M54.5", "Low back pain"),
            ("N18.3", "CKD stage 3"),
        ],
        "medications": [
            # SEVERE: simvastatin + clarithromycin (rhabdomyolysis)
            {"drug": "Simvastatin", "rxcui": "36567", "dose": "40 mg", "freq": "once daily at bedtime", "route": "oral"},
            {"drug": "Clarithromycin", "rxcui": "197516", "dose": "500 mg", "freq": "twice daily", "route": "oral"},
            # SEVERE: sertraline + tramadol (serotonin syndrome)
            {"drug": "Sertraline HCl", "rxcui": "312940", "dose": "100 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Tramadol HCl", "rxcui": "835603", "dose": "50 mg", "freq": "every 6 hours as needed", "route": "oral"},
            # Cardiac
            {"drug": "Aspirin", "rxcui": "318272", "dose": "81 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Clopidogrel Bisulfate", "rxcui": "309362", "dose": "75 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Metoprolol Tartrate", "rxcui": "866508", "dose": "25 mg", "freq": "twice daily", "route": "oral"},
            {"drug": "Lisinopril", "rxcui": "314076", "dose": "10 mg", "freq": "once daily", "route": "oral"},
            # Insomnia
            {"drug": "Trazodone HCl", "rxcui": "312827", "dose": "50 mg", "freq": "at bedtime", "route": "oral"},
            # GI protection
            {"drug": "Pantoprazole Sodium", "rxcui": "261257", "dose": "40 mg", "freq": "once daily", "route": "oral"},
            # Thyroid
            {"drug": "Levothyroxine Sodium", "rxcui": "966222", "dose": "75 mcg", "freq": "once daily on empty stomach", "route": "oral"},
            # CKD supplement
            {"drug": "Calcium Acetate", "rxcui": "197552", "dose": "667 mg", "freq": "with meals", "route": "oral"},
        ],
    },
    {
        "name": {"given": ["James", "Michael"], "family": "Rivera"},
        "gender": "male",
        "birthDate": "1972-09-14",
        "allergies": [
            {
                "code": "7980",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Penicillin",
                "category": "medication",
                "reaction_display": "Angioedema",
                "reaction_severity": "severe",
            },
        ],
        "conditions": [
            ("F31.9", "Bipolar disorder"),
            ("E11.65", "Type 2 diabetes with hyperglycemia"),
            ("I10", "Essential hypertension"),
            ("G40.909", "Epilepsy"),
            ("E66.01", "Morbid obesity"),
        ],
        "medications": [
            # SEVERE: lithium + NSAIDs (lithium toxicity)
            {"drug": "Lithium Carbonate", "rxcui": "197877", "dose": "300 mg", "freq": "three times daily", "route": "oral"},
            {"drug": "Ibuprofen", "rxcui": "310965", "dose": "600 mg", "freq": "three times daily", "route": "oral"},
            # MODERATE: lithium + lisinopril (lithium level increase)
            {"drug": "Lisinopril", "rxcui": "314076", "dose": "20 mg", "freq": "once daily", "route": "oral"},
            # Bipolar
            {"drug": "Quetiapine Fumarate", "rxcui": "312819", "dose": "300 mg", "freq": "at bedtime", "route": "oral"},
            {"drug": "Valproic Acid", "rxcui": "11118", "dose": "500 mg", "freq": "twice daily", "route": "oral"},
            # Epilepsy (interaction with valproic acid)
            {"drug": "Lamotrigine", "rxcui": "114953", "dose": "100 mg", "freq": "twice daily", "route": "oral"},
            # Diabetes
            {"drug": "Insulin Glargine", "rxcui": "261551", "dose": "30 units", "freq": "once daily at bedtime", "route": "subcutaneous"},
            {"drug": "Metformin HCl", "rxcui": "861007", "dose": "1000 mg", "freq": "twice daily", "route": "oral"},
            {"drug": "Empagliflozin", "rxcui": "1545653", "dose": "25 mg", "freq": "once daily", "route": "oral"},
            # Hypertension
            {"drug": "Amlodipine Besylate", "rxcui": "329528", "dose": "10 mg", "freq": "once daily", "route": "oral"},
            # GI
            {"drug": "Omeprazole", "rxcui": "198053", "dose": "40 mg", "freq": "once daily", "route": "oral"},
        ],
    },
    {
        "name": {"given": ["Sarah", "Elizabeth"], "family": "Patel"},
        "gender": "female",
        "birthDate": "1950-01-28",
        "allergies": [
            {
                "code": "2670",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Codeine",
                "category": "medication",
                "reaction_display": "Severe nausea and vomiting",
                "reaction_severity": "moderate",
            },
            {
                "code": "7980",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Penicillin",
                "category": "medication",
                "reaction_display": "Hives, throat swelling",
                "reaction_severity": "severe",
            },
            {
                "code": "4337",
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "display": "Fluoroquinolone",
                "category": "medication",
                "reaction_display": "Tendon rupture",
                "reaction_severity": "severe",
            },
        ],
        "conditions": [
            ("I48.0", "Paroxysmal atrial fibrillation"),
            ("I10", "Essential hypertension"),
            ("E78.5", "Hyperlipidemia"),
            ("M81.0", "Osteoporosis"),
            ("G20", "Parkinson's disease"),
            ("F03.90", "Dementia"),
            ("J45.20", "Mild persistent asthma"),
        ],
        "medications": [
            # SEVERE: warfarin + fluconazole (massive INR increase, bleeding)
            {"drug": "Warfarin Sodium", "rxcui": "855332", "dose": "3 mg", "freq": "once daily", "route": "oral"},
            {"drug": "Fluconazole", "rxcui": "197696", "dose": "150 mg", "freq": "once daily", "route": "oral"},
            # MODERATE: warfarin + aspirin (additive bleeding)
            {"drug": "Aspirin", "rxcui": "318272", "dose": "81 mg", "freq": "once daily", "route": "oral"},
            # Parkinson's (SEVERE: carbidopa/levodopa + metoclopramide = antagonism)
            {"drug": "Carbidopa-Levodopa", "rxcui": "197746", "dose": "25/100 mg", "freq": "three times daily", "route": "oral"},
            {"drug": "Metoclopramide HCl", "rxcui": "311700", "dose": "10 mg", "freq": "three times daily before meals", "route": "oral"},
            # Cardiac
            {"drug": "Diltiazem HCl", "rxcui": "830837", "dose": "120 mg", "freq": "twice daily", "route": "oral"},
            {"drug": "Rosuvastatin Calcium", "rxcui": "859751", "dose": "10 mg", "freq": "once daily", "route": "oral"},
            # Asthma
            {"drug": "Montelukast Sodium", "rxcui": "997488", "dose": "10 mg", "freq": "once daily at bedtime", "route": "oral"},
            {"drug": "Albuterol Sulfate", "rxcui": "745679", "dose": "90 mcg/actuation", "freq": "as needed", "route": "inhalation"},
            # Osteoporosis
            {"drug": "Alendronate Sodium", "rxcui": "996241", "dose": "70 mg", "freq": "once weekly", "route": "oral"},
            # Dementia
            {"drug": "Donepezil HCl", "rxcui": "997221", "dose": "10 mg", "freq": "once daily at bedtime", "route": "oral"},
            # GI
            {"drug": "Famotidine", "rxcui": "310271", "dose": "20 mg", "freq": "twice daily", "route": "oral"},
            # Vitamin D
            {"drug": "Cholecalciferol", "rxcui": "636671", "dose": "2000 IU", "freq": "once daily", "route": "oral"},
        ],
    },
]


def build_bundle(patient_profile: dict) -> dict:
    """Build a FHIR transaction Bundle for a patient profile."""
    entries = []

    # Patient resource
    patient_entry = {
        "resource": {
            "resourceType": "Patient",
            "name": [patient_profile["name"]],
            "gender": patient_profile["gender"],
            "birthDate": patient_profile["birthDate"],
            "active": True,
        },
        "request": {"method": "POST", "url": "Patient"},
        "fullUrl": "urn:uuid:patient-1",
    }
    entries.append(patient_entry)

    # AllergyIntolerance resources
    for allergy in patient_profile.get("allergies", []):
        allergy_entry = {
            "resource": {
                "resourceType": "AllergyIntolerance",
                "patient": {"reference": "urn:uuid:patient-1"},
                "clinicalStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                            "code": "active",
                            "display": "Active",
                        }
                    ]
                },
                "verificationStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                            "code": "confirmed",
                            "display": "Confirmed",
                        }
                    ]
                },
                "type": "allergy",
                "category": [allergy.get("category", "medication")],
                "criticality": (
                    "high"
                    if allergy["reaction_severity"] == "severe"
                    else "low"
                ),
                "code": {
                    "coding": [
                        {
                            "system": allergy["system"],
                            "code": allergy["code"],
                            "display": allergy["display"],
                        }
                    ],
                    "text": allergy["display"],
                },
                "reaction": [
                    {
                        "manifestation": [
                            {
                                "coding": [
                                    {
                                        "system": "http://snomed.info/sct",
                                        "display": allergy["reaction_display"],
                                    }
                                ],
                                "text": allergy["reaction_display"],
                            }
                        ],
                        "severity": allergy["reaction_severity"],
                    }
                ],
            },
            "request": {"method": "POST", "url": "AllergyIntolerance"},
        }
        entries.append(allergy_entry)

    # Condition resources
    for icd_code, display in patient_profile.get("conditions", []):
        condition_entry = {
            "resource": {
                "resourceType": "Condition",
                "subject": {"reference": "urn:uuid:patient-1"},
                "clinicalStatus": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                            "code": "active",
                            "display": "Active",
                        }
                    ]
                },
                "code": {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/sid/icd-10-cm",
                            "code": icd_code,
                            "display": display,
                        }
                    ],
                    "text": display,
                },
            },
            "request": {"method": "POST", "url": "Condition"},
        }
        entries.append(condition_entry)

    # MedicationRequest resources
    authored = (date.today() - timedelta(days=30)).isoformat()
    for med in patient_profile["medications"]:
        med_entry = {
            "resource": {
                "resourceType": "MedicationRequest",
                "status": "active",
                "intent": "order",
                "subject": {"reference": "urn:uuid:patient-1"},
                "authoredOn": authored,
                "medicationCodeableConcept": {
                    "coding": [
                        {
                            "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                            "code": med["rxcui"],
                            "display": med["drug"],
                        }
                    ],
                    "text": med["drug"],
                },
                "dosageInstruction": [
                    {
                        "text": f"{med['dose']} {med['freq']}",
                        "route": {
                            "coding": [
                                {
                                    "system": "http://snomed.info/sct",
                                    "display": med["route"],
                                }
                            ]
                        },
                        "doseAndRate": [
                            {
                                "doseQuantity": {
                                    "value": _parse_dose_value(med["dose"]),
                                    "unit": _parse_dose_unit(med["dose"]),
                                }
                            }
                        ],
                    }
                ],
            },
            "request": {"method": "POST", "url": "MedicationRequest"},
        }
        entries.append(med_entry)

    return {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": entries,
    }


def _parse_dose_value(dose_str: str) -> float:
    """Extract numeric value from dose string like '50 mg'."""
    parts = dose_str.split()
    try:
        return float(parts[0].replace(",", ""))
    except (ValueError, IndexError):
        return 0


def _parse_dose_unit(dose_str: str) -> str:
    """Extract unit from dose string like '50 mg'."""
    parts = dose_str.split()
    if len(parts) >= 2:
        return parts[1]
    return "mg"


def post_bundle(bundle: dict) -> dict:
    """POST a transaction bundle to HAPI FHIR server."""
    response = httpx.post(
        FHIR_BASE,
        json=bundle,
        headers={
            "Content-Type": "application/fhir+json",
            "Accept": "application/fhir+json",
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def extract_patient_id(response_bundle: dict) -> str:
    """Extract the created Patient ID from the transaction response."""
    for entry in response_bundle.get("entry", []):
        location = entry.get("response", {}).get("location", "")
        if location.startswith("Patient/"):
            # Format: Patient/12345/_history/1
            return location.split("/")[1]
    return "unknown"


def main():
    print("=" * 60)
    print("MedRecon Demo Patient Generator")
    print("=" * 60)
    print(f"Target FHIR server: {FHIR_BASE}")
    print(f"Patients to create: {len(DEMO_PATIENTS)}")
    print()

    created = []

    for i, profile in enumerate(DEMO_PATIENTS):
        name = f"{' '.join(profile['name']['given'])} {profile['name']['family']}"
        med_count = len(profile["medications"])
        allergy_count = len(profile.get("allergies", []))
        condition_count = len(profile.get("conditions", []))

        print(f"[{i+1}/{len(DEMO_PATIENTS)}] Creating {name}...")
        print(f"  Medications: {med_count}, Allergies: {allergy_count}, Conditions: {condition_count}")

        bundle = build_bundle(profile)
        total_entries = len(bundle["entry"])
        print(f"  Bundle entries: {total_entries}")

        try:
            result = post_bundle(bundle)
            patient_id = extract_patient_id(result)
            print(f"  SUCCESS: Patient ID = {patient_id}")
            created.append({
                "name": name,
                "patient_id": patient_id,
                "medications": med_count,
                "allergies": allergy_count,
                "conditions": condition_count,
                "key_interactions": _get_key_interactions(profile),
            })
        except httpx.HTTPStatusError as e:
            print(f"  FAILED: {e.response.status_code}")
            try:
                error_body = e.response.json()
                issues = error_body.get("issue", [])
                for issue in issues[:3]:
                    print(f"    {issue.get('severity')}: {issue.get('diagnostics', '')[:100]}")
            except Exception:
                print(f"    {e.response.text[:200]}")
        except Exception as e:
            print(f"  FAILED: {e}")

        # Small delay between requests
        if i < len(DEMO_PATIENTS) - 1:
            time.sleep(1)

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Created: {len(created)}/{len(DEMO_PATIENTS)} patients")
    print()

    if created:
        print("Demo Patient IDs (save these!):")
        print("-" * 60)
        for p in created:
            print(f"  {p['patient_id']}  {p['name']}")
            print(f"    {p['medications']} meds, {p['allergies']} allergies, {p['conditions']} conditions")
            for interaction in p["key_interactions"]:
                print(f"    >> {interaction}")
            print()

        # Save to file
        output = {
            "fhir_server": FHIR_BASE,
            "generated_at": date.today().isoformat(),
            "patients": created,
        }
        with open("scripts/demo-patients.json", "w") as f:
            json.dump(output, f, indent=2)
        print(f"Patient data saved to scripts/demo-patients.json")


def _get_key_interactions(profile: dict) -> list[str]:
    """Return human-readable key interactions for this patient."""
    meds = {m["drug"].lower() for m in profile["medications"]}
    interactions = []

    checks = [
        ({"metoprolol"}, {"verapamil"}, "SEVERE: Metoprolol + Verapamil (bradycardia/heart block)"),
        ({"warfarin"}, {"amiodarone"}, "SEVERE: Warfarin + Amiodarone (increased bleeding risk)"),
        ({"warfarin"}, {"fluconazole"}, "SEVERE: Warfarin + Fluconazole (massive INR elevation)"),
        ({"methotrexate"}, {"naproxen", "ibuprofen"}, "SEVERE: Methotrexate + NSAID (renal/bone marrow toxicity)"),
        ({"simvastatin"}, {"clarithromycin"}, "SEVERE: Simvastatin + Clarithromycin (rhabdomyolysis)"),
        ({"sertraline"}, {"tramadol"}, "SEVERE: Sertraline + Tramadol (serotonin syndrome)"),
        ({"lithium"}, {"ibuprofen", "naproxen"}, "SEVERE: Lithium + NSAID (lithium toxicity)"),
        ({"carbidopa"}, {"metoclopramide"}, "SEVERE: Levodopa + Metoclopramide (dopamine antagonism)"),
        ({"warfarin"}, {"aspirin"}, "MODERATE: Warfarin + Aspirin (additive bleeding risk)"),
        ({"lithium"}, {"lisinopril"}, "MODERATE: Lithium + ACE inhibitor (lithium level increase)"),
    ]

    for drug_set_a, drug_set_b, desc in checks:
        med_lower = " ".join(meds)
        a_found = any(d in med_lower for d in drug_set_a)
        b_found = any(d in med_lower for d in drug_set_b)
        if a_found and b_found:
            interactions.append(desc)

    return interactions


if __name__ == "__main__":
    main()
