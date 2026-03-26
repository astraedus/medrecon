"use client";

import { useState, useCallback } from "react";
import {
  Medication,
  DrugInteraction,
  InteractionsResponse,
  MedicationsResponse,
  OrchestratorResponse,
  PipelineMode,
} from "@/lib/types";
import { PatientInput } from "./PatientInput";
import { StatsHeader } from "./StatsHeader";
import { MedicationList } from "./MedicationList";
import { InteractionsPanel } from "./InteractionsPanel";
import { PipelineVisualizer } from "./PipelineVisualizer";
import { ReportPanel } from "./ReportPanel";
import { FhirBundleButton } from "./FhirBundleButton";

// Direct mode steps
type DirectStep = "idle" | "fetching_meds" | "checking_interactions" | "done";
// Pipeline mode steps
type PipelineStep = "idle" | "collecting" | "analyzing" | "assembling" | "done";

type Step = DirectStep | PipelineStep;

export function Dashboard() {
  const [mode, setMode] = useState<PipelineMode>("pipeline");

  // Direct mode state
  const [medications, setMedications] = useState<Medication[]>([]);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);

  // Pipeline mode state
  const [report, setReport] = useState<string>("");

  // Shared state
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentPatientId, setCurrentPatientId] = useState("");
  const [currentFhirUrl, setCurrentFhirUrl] = useState("");

  const handleModeChange = useCallback((newMode: PipelineMode) => {
    if (loading) return;
    setMode(newMode);
    // Reset all state on mode switch
    setStep("idle");
    setError(null);
    setMedications([]);
    setInteractions([]);
    setReport("");
    setCurrentPatientId("");
    setCurrentFhirUrl("");
  }, [loading]);

  /** Full pipeline: calls Orchestrator which coordinates Source Collector + Interaction Checker */
  const handlePipelineReconcile = useCallback(
    async (patientId: string, fhirUrl: string) => {
      setLoading(true);
      setError(null);
      setReport("");
      setMedications([]);
      setCurrentPatientId(patientId);
      setCurrentFhirUrl(fhirUrl);

      try {
        setStep("collecting");

        // Small artificial delay before flipping to "analyzing" to give the
        // visualizer something to show. The actual orchestrator call drives
        // both collecting + analyzing internally — we simulate the steps on
        // the frontend based on elapsed time.
        const orchestratorPromise = fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, fhirUrl }),
        });

        // After ~20s flip to analyzing, after ~40s flip to assembling
        // These are rough midpoints of the pipeline phases
        const analyzeTimer = setTimeout(() => setStep("analyzing"), 20000);
        const assembleTimer = setTimeout(() => setStep("assembling"), 40000);

        let res: Response;
        try {
          res = await orchestratorPromise;
        } finally {
          clearTimeout(analyzeTimer);
          clearTimeout(assembleTimer);
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.error || `Orchestrator pipeline failed (${res.status})`
          );
        }

        const data: OrchestratorResponse = await res.json();
        setReport(data.report || "No report content returned.");

        // Fetch structured medication list for FHIR bundle generation
        try {
          const medsParams = new URLSearchParams({ patientId, status: "active" });
          if (fhirUrl) medsParams.set("fhirUrl", fhirUrl);
          const medsRes = await fetch(`/api/medications?${medsParams}`);
          if (medsRes.ok) {
            const medsData: MedicationsResponse = await medsRes.json();
            setMedications(medsData.medications || []);
          }
        } catch {
          // Non-critical: FHIR bundle button just won't appear
          console.warn("Could not fetch medications for FHIR export");
        }

        setStep("done");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        setStep("idle");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /** Quick Scan: calls MCP tools directly (existing behavior) */
  const handleDirectReconcile = useCallback(
    async (patientId: string, fhirUrl: string) => {
      setLoading(true);
      setError(null);
      setMedications([]);
      setInteractions([]);
      setCurrentPatientId(patientId);
      setCurrentFhirUrl(fhirUrl);

      try {
        // Step 1: Fetch medications
        setStep("fetching_meds");
        const medsParams = new URLSearchParams({
          patientId,
          status: "active",
        });
        if (fhirUrl) {
          medsParams.set("fhirUrl", fhirUrl);
        }

        const medsRes = await fetch(`/api/medications?${medsParams}`);
        if (!medsRes.ok) {
          const errData = await medsRes.json().catch(() => ({}));
          throw new Error(
            errData.error || `Failed to fetch medications (${medsRes.status})`
          );
        }

        const medsData: MedicationsResponse = await medsRes.json();
        const fetchedMeds = medsData.medications || [];
        setMedications(fetchedMeds);

        // Step 2: Check interactions
        if (fetchedMeds.length >= 2) {
          setStep("checking_interactions");
          const drugNames = fetchedMeds.map((m) => m.name);

          const interactionsRes = await fetch("/api/interactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drugNames, includeOpenFda: true }),
          });

          if (interactionsRes.ok) {
            const interactionsData: InteractionsResponse =
              await interactionsRes.json();
            setInteractions(interactionsData.interactions || []);
          } else {
            console.warn(
              "Interaction check failed, continuing without interactions"
            );
          }
        }

        setStep("done");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        setStep("idle");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleReconcile = useCallback(
    (patientId: string, fhirUrl: string) => {
      if (mode === "pipeline") {
        return handlePipelineReconcile(patientId, fhirUrl);
      }
      return handleDirectReconcile(patientId, fhirUrl);
    },
    [mode, handlePipelineReconcile, handleDirectReconcile]
  );

  const hasPipelineResults = mode === "pipeline" && (step !== "idle" || report);
  const hasDirectResults =
    mode === "direct" && (step !== "idle" || medications.length > 0);

  return (
    <div className="space-y-4">
      {/* Patient Input + Mode Toggle */}
      <PatientInput
        onReconcile={handleReconcile}
        loading={loading}
        step={step}
        mode={mode}
        onModeChange={handleModeChange}
      />

      {/* Pipeline Visualizer */}
      <PipelineVisualizer
        currentStep={step}
        loading={loading}
        mode={mode}
      />

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 animate-slide-in">
          <p className="font-medium">Error</p>
          <p className="mt-1 text-xs text-red-300/80">{error}</p>
        </div>
      )}

      {/* === FULL PIPELINE MODE === */}
      {hasPipelineResults && (
        <>
          <ReportPanel
            report={report}
            loading={loading}
          />
          {step === "done" && report && currentPatientId && medications.length > 0 && (
            <FhirBundleButton
              patientId={currentPatientId}
              medications={medications}
              fhirUrl={currentFhirUrl || undefined}
            />
          )}
        </>
      )}

      {/* === QUICK SCAN MODE === */}
      {hasDirectResults && (
        <>
          <StatsHeader
            medications={medications}
            interactions={interactions}
            loading={loading}
            step={step}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <MedicationList
              medications={medications}
              loading={loading && step === "fetching_meds"}
            />
            <InteractionsPanel
              interactions={interactions}
              loading={loading && step === "checking_interactions"}
            />
          </div>
          {step === "done" && currentPatientId && medications.length > 0 && (
            <FhirBundleButton
              patientId={currentPatientId}
              medications={medications}
              fhirUrl={currentFhirUrl || undefined}
            />
          )}
        </>
      )}

      {/* Disclaimer */}
      {step === "done" && (
        <div className="rounded-lg border border-border bg-card/50 p-3 text-center text-[11px] text-muted-foreground animate-slide-in">
          This is a clinical decision support tool for demonstration purposes.
          All identified interactions and recommendations should be reviewed by a
          qualified healthcare professional. This tool does not replace clinical
          judgment.
        </div>
      )}
    </div>
  );
}
