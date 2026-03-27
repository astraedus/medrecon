# MedRecon Demo Video Script

**Duration**: 2:55 (under 3 minutes)
**Voice**: en-US-JennyNeural (female, edge-tts)
**Recording**: OBS screen capture + narration overlay
**Frontend URL**: https://frontend-eta-flax-63.vercel.app
**Target narration**: ~420 words at 150 wpm = 2:48 speaking time + pauses

---

## 0:00 - 0:24 | THE PROBLEM

### Screen Direction
Dark background with white text statistics fading in one at a time. Clinical, minimal. No stock photos. Just typography and numbers.

**Stat 1** (0:00 - 0:05): "7,000 - 9,000 deaths per year from medication errors" (source: FDA)
**Stat 2** (0:05 - 0:10): "30% of hospital readmissions involve medication discrepancies" (source: AHRQ)
**Stat 3** (0:10 - 0:15): "25% of medication lists contain errors at care transitions" (source: Joint Commission)
**Transition** (0:15 - 0:24): Brief graphic showing three disconnected data silos labeled Hospital EHR, Pharmacy, Primary Care. Each shows a different medication list for the same patient.

### Narration (0:00 - 0:24)

> Every time a patient moves between care settings, their medication list has to be rebuilt from scratch. The hospital has one version. The pharmacy has another. Primary care has a third. Clinicians compare them manually, line by line. It takes 30 to 60 minutes per patient. And when it fails, people die.

**[66 words]**

---

## 0:24 - 0:30 | INTRO

### Screen Direction
Cut to MedRecon logo on dark background with tagline: "Intelligent Medication Reconciliation. 3 A2A agents. 8 MCP clinical tools."

### Narration (0:24 - 0:30)

> MedRecon automates this process using three AI agents coordinating via Google's A2A protocol, backed by eight clinical safety tools.

**[19 words]**

---

## 0:30 - 2:08 | LIVE DEMO

### Screen Direction (0:30 - 0:38)
Cut to MedRecon frontend dashboard. Full Pipeline mode is already selected. Demo patient presets visible. Mouse clicks "Dorothy Johnson" in the demo patient row. Patient ID field populates with 131494601.

### Narration (0:30 - 0:38)

> Here is our dashboard. We select Dorothy Johnson, an 81-year-old with coronary artery disease, CKD stage 3, depression, and chronic pain. Twelve active medications.

**[27 words]**

---

### Screen Direction (0:38 - 0:50)
Mouse clicks "Reconcile." Button shows spinner with "Processing." Pipeline visualizer appears with four steps: Source Collector, Interaction Checker, Report Assembly, Done. Source Collector activates (spinning loader, blue text). Label: "Source Collector gathering medications from 3 FHIR sources..."

After a few seconds, Source Collector completes (green check). Interaction Checker activates. Then completes. Report Assembly activates and completes. All four steps show green checkmarks.

### Narration (0:38 - 0:50)

> The Orchestrator dispatches the Source Collector, which queries three FHIR R4 endpoints simulating a hospital EHR, pharmacy, and primary care office. It merges medication data with source attribution. The Interaction Checker then runs every drug pair through our clinical safety tools.

**[42 words]**

---

### Screen Direction (0:50 - 0:56)
The Reconciliation Report panel slides in below the pipeline visualizer. Dark card with "Reconciliation Report" header and "3-agent pipeline" label. Report content visible: structured markdown with headers, medication table, safety analysis.

### Narration (0:50 - 0:56)

> The Orchestrator assembles a comprehensive reconciliation report from both downstream agents.

**[12 words]**

---

### Screen Direction (0:56 - 1:36)
Slow scroll through the report. Pause on key sections:

**First pause** (0:56 - 1:04): Patient Information section. Dorothy's conditions listed (CAD, hypertension, hyperlipidemia, depression, insomnia, low back pain, CKD stage 3). Allergies to Codeine and Sulfonamide.

**Second pause** (1:04 - 1:12): Medication List table showing all 12 medications with drug name, dose, frequency, and source columns.

**Third pause** (1:12 - 1:36): Safety Analysis section. Two interactions highlighted in red:
1. **SEVERE: Simvastatin + Clarithromycin** - rhabdomyolysis risk, contraindicated
2. **SEVERE: Sertraline + Tramadol** - serotonin syndrome risk

### Narration (0:56 - 1:36)

> Twelve medications across cardiac, psychiatric, pain, and GI categories. Two known allergies. Seven active conditions. Here is what matters. The safety analysis caught two SEVERE interactions. First: Simvastatin with Clarithromycin. Clarithromycin is a strong CYP3A4 inhibitor that can raise simvastatin to levels causing rhabdomyolysis and acute kidney injury. This is a contraindicated combination. Second: Sertraline with Tramadol. Both are serotonergic. Together they risk serotonin syndrome, a potentially fatal condition. For a patient already in CKD stage 3, both interactions carry elevated risk.

**[85 words]**

---

### Screen Direction (1:36 - 1:46)
Quick cut: toggle to "Quick Scan" mode. Click Reconcile for the same patient. Show the structured two-panel layout: Medication List on the left (12 items with source badges), Interaction cards on the right. SEVERE interactions show red left-border cards with pulsing severity badges.

### Narration (1:36 - 1:46)

> Quick Scan mode presents the same data as structured cards. Medications with source attribution on the left. Interaction alerts sorted by severity on the right.

**[25 words]**

---

### Screen Direction (1:46 - 2:08)
Switch back to Full Pipeline mode. Mouse clicks "Generate FHIR Bundle" button. Button shows spinner, then changes to green "Download FHIR Bundle" with resource count: "22 resources" (approximate).

Click "Download FHIR Bundle." File downloads. Quick cut to JSON file open in a code viewer showing top-level Bundle structure: resourceType "Bundle", type "collection". Brief scroll to a MedicationStatement resource, then a Provenance resource linked to it.

### Narration (1:46 - 2:08)

> The output is not just a report. MedRecon generates a FHIR R4 Bundle with MedicationStatement and Provenance resources for every reconciled medication. This bundle imports directly into any FHIR-compliant EHR. A data artifact that enters the clinical workflow, not a PDF that gets filed away.

**[46 words]**

---

## 2:08 - 2:40 | ARCHITECTURE

### Screen Direction
Cut to a clean architecture diagram (pre-rendered Mermaid PNG):

```
User/Frontend
    |
    v
Orchestrator Agent (A2A)
    |              |
    v              v
Source Collector   Interaction Checker
Agent (A2A)       Agent (A2A)
    |              |
    +------+-------+
           |
    MedRecon MCP Server
    (8 clinical tools)
           |
    +------+------+------+
    |      |      |      |
  HAPI   OpenFDA  RxNorm  Curated
  FHIR   API     API     Interaction DB
  (R4)
```

Tool names listed: get_medications, check_interactions, lookup_drug_info, check_allergies, find_alternatives, validate_dose, reconcile_lists, generate_fhir_output.

### Narration (2:08 - 2:40)

> The architecture. Three agents communicate via Google's A2A protocol. The Orchestrator coordinates the Source Collector and Interaction Checker. Both downstream agents call our MCP server, which exposes eight tools for medication retrieval, interaction checking, allergy cross-referencing, dose validation, therapeutic alternatives, and FHIR output generation. Drug interactions come from 48 curated clinical pairs with OpenFDA as a fallback. All data flows as FHIR R4 resources end to end. No proprietary formats.

**[70 words]**

---

## 2:40 - 2:55 | IMPACT + CLOSE

### Screen Direction
Return to the MedRecon dashboard showing the completed report with SEVERE interactions in red. Fade to dark background with three closing points in white text:

1. "Every SEVERE interaction detected = a potential adverse event prevented."
2. "FHIR-native output integrates into EHR systems."
3. "Open source. Deployable today."

Final frame: MedRecon logo, GitHub URL.

### Narration (2:40 - 2:55)

> Manual reconciliation misses interactions like these every day. MedRecon catches them in under a minute. Every SEVERE flag is a potential life saved. The output is FHIR-native. It integrates into existing clinical systems. Open source and deployable today. MedRecon.

**[40 words]**

---

## Word Count Summary

| Section | Words | Duration | WPM |
|---------|-------|----------|-----|
| Problem | 66 | 0:24 | 165 |
| Intro | 19 | 0:06 | 190 |
| Demo: Patient select | 27 | 0:08 | 203 |
| Demo: Pipeline running | 42 | 0:12 | 210 |
| Demo: Report arrives | 12 | 0:06 | 120 |
| Demo: Report walkthrough | 85 | 0:40 | 128 |
| Demo: Quick Scan | 25 | 0:10 | 150 |
| Demo: FHIR Bundle | 46 | 0:22 | 125 |
| Architecture | 70 | 0:32 | 131 |
| Close | 40 | 0:15 | 160 |
| **TOTAL** | **432** | **2:55** | **~148** |

---

## Production Notes

### Timing Budget
| Section | Duration | Cumulative |
|---------|----------|------------|
| Problem | 0:24 | 0:24 |
| Intro | 0:06 | 0:30 |
| Live Demo | 1:38 | 2:08 |
| Architecture | 0:32 | 2:40 |
| Impact/Close | 0:15 | 2:55 |

### Recording Checklist
- [ ] Frontend loaded with Full Pipeline mode default
- [ ] Dorothy Johnson (131494601) pre-selected or ready to click
- [ ] Backend agents running (Cloud Run URLs or local)
- [ ] Test run the full pipeline once before recording to warm up agents
- [ ] Screen resolution: 1920x1080
- [ ] Browser: Chrome, dark mode, no bookmarks bar, clean URL bar
- [ ] FHIR Bundle download tested and JSON viewer ready
- [ ] Architecture diagram pre-rendered as PNG from Mermaid
- [ ] JSON viewer (VS Code) ready for FHIR Bundle display

### Voice Direction
- Pace: measured, not rushed. Clinical conference presentation tone.
- No filler words, no hedging ("sort of", "kind of", "basically").
- Slightly slower on medical terms and interaction descriptions.
- Let the visuals breathe during the report walkthrough section.
- Pronounce medical terms correctly:
  - Rhabdomyolysis: rab-doe-my-OL-ih-sis
  - Serotonin: ser-oh-TOE-nin
  - Simvastatin: sim-vah-STAT-in
  - Clarithromycin: klah-RITH-row-my-sin
  - CYP3A4: "sip-three-A-four"
  - Tramadol: TRAM-ah-doll
  - Sertraline: SER-truh-leen
  - Serotonergic: ser-oh-toe-NER-jik
  - Provenance: PROV-eh-nence

### Key Constraints
- No em dashes in narration (edge-tts compatibility)
- Under 3 minutes total
- Must show the product functioning (live frontend, not mockups)
- Address judges as clinical peers (use proper medical terminology)
- The pipeline takes 30-60 seconds in reality. Plan for this in the recording. Can speed up 2x in post if needed, or use pre-recorded pipeline run.

### Edge-TTS Command (for narration generation)
```bash
# Extract narration text, then:
edge-tts --voice en-US-JennyNeural --rate="-5%" --file narration.txt --write-media narration.mp3
```

### Narration Text File (copy all blockquote lines)
Save as `demo/narration.txt` for edge-tts input. Separate sections with 1.5s pauses (insert "[pause]" markers, split into segments if edge-tts does not support pause markers).
