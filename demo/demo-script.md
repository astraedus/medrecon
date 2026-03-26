# MedRecon Demo Video Script

**Duration**: 2:55 (under 3 minutes)
**Voice**: en-US-JennyNeural (female, edge-tts)
**Recording**: OBS screen capture + narration overlay
**Frontend URL**: https://frontend-eta-flax-63.vercel.app

---

## 0:00 - 0:28 | THE PROBLEM

### Screen Direction
Dark background with white text statistics fading in one at a time. Clinical, minimal. No stock photos. Just typography and numbers.

**Stat 1** (0:00 - 0:06): "7,000 - 9,000 deaths per year from medication errors" (source: FDA)
**Stat 2** (0:06 - 0:12): "30% of hospital readmissions involve medication discrepancies" (source: AHRQ)
**Stat 3** (0:12 - 0:18): "25% of medication lists contain errors at care transitions" (source: Joint Commission)
**Transition** (0:18 - 0:28): Cut to brief graphic showing three disconnected data silos: Hospital EHR, Pharmacy, Primary Care. Each with different medication lists for the same patient.

### Narration (0:00 - 0:28)

> Every time a patient moves between care settings, their medication list has to be rebuilt from scratch. The hospital has one version. The pharmacy has another. The primary care office has a third. A clinician has to manually compare all of them, line by line, looking for discrepancies, missed drugs, and dangerous interactions. It takes 30 to 60 minutes per patient. And when it fails, people die.

---

## 0:28 - 0:34 | INTRO

### Screen Direction
Cut to MedRecon logo and tagline on dark background: "MedRecon: Intelligent Medication Reconciliation. A 3-agent A2A network with 8 MCP clinical tools."

### Narration (0:28 - 0:34)

> MedRecon automates this process using three AI agents that coordinate via Google's A2A protocol, backed by eight clinical safety tools.

---

## 0:34 - 2:12 | LIVE DEMO

### Screen Direction (0:34 - 0:42)
Cut to MedRecon frontend dashboard. Full Pipeline mode is already selected (the toggle shows "Full Pipeline" highlighted). The demo patient presets are visible across the top of the input card.

Mouse cursor clicks on "Dorothy Johnson" in the demo patient row. The Patient ID field populates with 131494601.

### Narration (0:34 - 0:42)

> Here is our dashboard. We will reconcile medications for Dorothy Johnson, an 81-year-old woman with coronary artery disease, CKD stage 3, depression, and chronic pain. She is on 12 active medications.

---

### Screen Direction (0:42 - 0:48)
Mouse clicks "Reconcile" button. The button changes to show a spinner with "Processing." The progress bar begins filling. The pipeline visualizer appears below the input card, showing four steps: Source Collector, Interaction Checker, Report Assembly, Done.

The first step, Source Collector, shows a spinning loader icon and blue text. The label below reads "Source Collector gathering medications from 3 FHIR sources..."

### Narration (0:42 - 0:48)

> When we click Reconcile, the Orchestrator agent dispatches the Source Collector. It queries three separate FHIR R4 endpoints, simulating a hospital EHR, a pharmacy system, and a primary care office.

---

### Screen Direction (0:48 - 0:56)
The Source Collector step completes (green checkmark). The Interaction Checker step activates (spinning loader, blue text). Progress bar advances. Label reads "Interaction Checker running safety analysis..."

### Narration (0:48 - 0:56)

> The Source Collector merges medication data from all three sources with full provenance tracking. Now the Interaction Checker takes over, running every drug pair through our clinical safety tools.

---

### Screen Direction (0:56 - 1:02)
The Interaction Checker step completes (green checkmark). Report Assembly activates. Label reads "Orchestrator assembling reconciliation report..."

### Narration (0:56 - 1:02)

> The Interaction Checker calls MCP tools for drug interaction analysis, allergy cross-referencing, and dose validation. The Orchestrator now assembles the final report.

---

### Screen Direction (1:02 - 1:10)
All four pipeline steps show green checkmarks. The Reconciliation Report panel slides in below the pipeline visualizer. It is a dark card with a "Reconciliation Report" header and "3-agent pipeline" label.

The report content is visible: a structured markdown document with headers, a medication table, and a safety analysis section.

### Narration (1:02 - 1:10)

> The full pipeline completes. We get a comprehensive reconciliation report assembled by the Orchestrator from data gathered by both downstream agents. Let's look at what it found.

---

### Screen Direction (1:10 - 1:40)
Slow scroll through the report. Pause on key sections:

**First pause** (1:12 - 1:20): The Patient Information section showing Dorothy's demographics and conditions list (CAD, hypertension, hyperlipidemia, depression, insomnia, low back pain, CKD stage 3). Her allergies to Codeine and Sulfonamide are listed.

**Second pause** (1:20 - 1:28): The Medication List section showing all 12 medications in a table with columns for drug name, dose, frequency, and source attribution.

**Third pause** (1:28 - 1:40): The Safety Analysis section. Two interactions are highlighted in red text:

1. **SEVERE: Simvastatin + Clarithromycin** - "Clarithromycin is a strong CYP3A4 inhibitor that dramatically increases simvastatin levels. Risk of rhabdomyolysis, acute kidney injury. Contraindicated combination."

2. **SEVERE: Sertraline + Tramadol** - "Both drugs increase serotonin levels. Risk of serotonin syndrome: agitation, hyperthermia, tachycardia, neuromuscular abnormalities. Potentially life-threatening."

### Narration (1:10 - 1:40)

> The report shows Dorothy's full clinical picture. 12 medications across cardiac, psychiatric, pain management, and GI categories. But here is what matters. The safety analysis flagged two SEVERE interactions. First: Simvastatin combined with Clarithromycin. Clarithromycin is a strong CYP3A4 inhibitor. It can raise simvastatin levels to the point of rhabdomyolysis, which is skeletal muscle breakdown that can cause acute kidney injury. This combination is contraindicated. Second: Sertraline combined with Tramadol. Both are serotonergic. Together they risk serotonin syndrome, a potentially fatal condition with hyperthermia, tachycardia, and neuromuscular instability. For a patient with CKD stage 3, both of these interactions carry elevated risk.

---

### Screen Direction (1:40 - 1:52)
Quick cut: switch to "Quick Scan" mode using the toggle at the top. Click Reconcile again for the same patient. Show the structured two-panel layout: Medication List on the left (12 items in cards with source badges), Interaction cards on the right. The SEVERE interactions show red left-border cards with pulsing red severity badges.

### Narration (1:40 - 1:52)

> Quick Scan mode gives the same clinical data in a structured card layout. Medications on the left with source attribution. Interaction alerts on the right, sorted by severity. Each SEVERE interaction is visually flagged for immediate clinician attention.

---

### Screen Direction (1:52 - 2:12)
Switch back to Full Pipeline mode (show the completed report still there). Mouse clicks "Generate FHIR Bundle" button at the bottom. Button shows spinner, then changes to green "Download FHIR Bundle" with a resource count label: "22 resources, 14.2 KB" (approximate).

Click "Download FHIR Bundle." A file downloads. Quick cut to the downloaded JSON file open in a code viewer. Show the top-level Bundle structure: resourceType "Bundle", type "collection". Scroll briefly to show a MedicationStatement resource with proper FHIR R4 structure, then a Provenance resource linked to it.

### Narration (1:52 - 2:12)

> The reconciled output is not just a report. MedRecon generates a FHIR R4 compliant Bundle. Each medication becomes a MedicationStatement resource. Each is paired with a Provenance resource documenting where the data came from and which agent processed it. This bundle can be imported directly into any FHIR-compliant EHR system. That is the difference between a report that gets read once and a data artifact that integrates into the clinical workflow.

---

## 2:12 - 2:42 | ARCHITECTURE

### Screen Direction
Cut to an architecture diagram. Clean Mermaid-rendered diagram (pre-rendered to PNG) showing:

```
User/Frontend
    |
    v
Orchestrator Agent (A2A)
    |          |
    v          v
Source         Interaction
Collector      Checker
Agent (A2A)    Agent (A2A)
    |          |
    +----+-----+
         |
    MedRecon MCP Server
    (8 clinical tools)
         |
    +----+----+----+
    |    |    |    |
  HAPI  OpenFDA RxNorm  Curated
  FHIR  API    API     Interaction DB
  (R4)
```

Arrows and agent nodes labeled clearly. The MCP tools listed along the bottom: get_medications, check_interactions, lookup_drug_info, check_allergies, find_alternatives, validate_dose, reconcile_lists, generate_fhir_output.

### Narration (2:12 - 2:42)

> Under the hood. Three agents communicate via Google's Agent-to-Agent protocol. The Orchestrator coordinates. The Source Collector gathers medications from FHIR endpoints. The Interaction Checker runs safety analysis. Both downstream agents call our MCP server, which exposes eight clinical tools: medication retrieval, drug interaction checking, allergy cross-referencing, dose validation, therapeutic alternatives, and FHIR output generation. Drug interaction data comes from a curated database of 48 clinically validated interaction pairs, with OpenFDA as a fallback for broader coverage. All patient data flows as FHIR R4 resources. No proprietary formats. No data lock-in.

---

## 2:42 - 2:55 | IMPACT + CLOSE

### Screen Direction
Return to the MedRecon dashboard showing the completed report with the two SEVERE interactions highlighted in red. Then fade to dark background with three closing points in white text:

1. "Every SEVERE interaction detected is a potential adverse event prevented."
2. "FHIR-native output feeds directly back into EHR systems."
3. "Open source. Deployable today."

Final frame: MedRecon logo, GitHub URL, tagline.

### Narration (2:42 - 2:55)

> Manual medication reconciliation misses interactions like these every day. MedRecon catches them in under a minute. Every SEVERE interaction flagged is a potential hospitalization prevented, or a life saved. The output is FHIR-native, so it integrates into existing clinical workflows. This is open source and deployable today. MedRecon. Intelligent medication reconciliation.

---

## Production Notes

### Timing Budget
| Section | Duration | Cumulative |
|---------|----------|------------|
| Problem | 0:28 | 0:28 |
| Intro | 0:06 | 0:34 |
| Live Demo | 1:38 | 2:12 |
| Architecture | 0:30 | 2:42 |
| Impact/Close | 0:13 | 2:55 |

### Recording Checklist
- [ ] Frontend loaded with Full Pipeline mode default
- [ ] Dorothy Johnson (131494601) pre-selected or ready to click
- [ ] Backend agents running (Cloud Run URLs or local)
- [ ] Test run the full pipeline once before recording to warm up agents
- [ ] Screen resolution: 1920x1080
- [ ] Browser: Chrome, dark mode, no bookmarks bar, clean URL bar
- [ ] FHIR Bundle download tested and JSON viewer ready
- [ ] Architecture diagram pre-rendered as PNG

### Voice Direction
- Pace: measured, not rushed. Clinical conference presentation tone.
- No filler words, no hedging ("sort of", "kind of", "basically").
- Pronounce medical terms correctly:
  - Rhabdomyolysis: rab-doe-my-OL-ih-sis
  - Serotonin: ser-oh-TOE-nin
  - Simvastatin: sim-vah-STAT-in
  - Clarithromycin: klah-RITH-row-my-sin
  - CYP3A4: "sip-three-A-four"
  - Tramadol: TRAM-ah-doll
  - Sertraline: SER-truh-leen

### Key Constraints
- No em dashes in narration (edge-tts compatibility)
- Under 3 minutes total
- Must show the product functioning (live frontend, not mockups)
- Address judges as clinical peers (use proper terminology, no oversimplification)
