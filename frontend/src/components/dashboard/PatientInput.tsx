"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FHIR_SERVERS, PipelineMode } from "@/lib/types";
import { Search, Loader2, Server, Zap, Network, Users } from "lucide-react";

const DEMO_PATIENTS = [
  { id: "131494564", name: "Margaret Chen", desc: "11 meds, cardiac + diabetes" },
  { id: "131494601", name: "Dorothy Johnson", desc: "12 meds, CAD + CKD + depression" },
  { id: "131494641", name: "Sarah Patel", desc: "13 meds, AFib + Parkinson's" },
  { id: "131494583", name: "Robert Williams", desc: "11 meds, RA + osteoporosis" },
  { id: "131494623", name: "James Rivera", desc: "11 meds, bipolar + epilepsy" },
];

type PatientInputProps = {
  onReconcile: (patientId: string, fhirUrl: string) => void;
  loading: boolean;
  step: string;
  mode: PipelineMode;
  onModeChange: (mode: PipelineMode) => void;
};

const DIRECT_STEP_LABELS: Record<string, string> = {
  idle: "Ready",
  fetching_meds: "Fetching medications from FHIR...",
  checking_interactions: "Checking drug interactions...",
  reconciling: "Running reconciliation...",
  done: "Complete",
};

const PIPELINE_STEP_LABELS: Record<string, string> = {
  idle: "Ready",
  collecting: "Source Collector gathering medications from 3 FHIR sources...",
  analyzing: "Interaction Checker running safety analysis...",
  assembling: "Orchestrator assembling reconciliation report...",
  done: "Complete",
};

/** Progress bar dot indices for each mode */
const DIRECT_STEPS = ["fetching_meds", "checking_interactions", "done"];
const PIPELINE_STEPS_ORDER = ["collecting", "analyzing", "assembling", "done"];

function getStepIndex(step: string, steps: string[]): number {
  const idx = steps.indexOf(step);
  return idx === -1 ? -1 : idx;
}

export function PatientInput({
  onReconcile,
  loading,
  step,
  mode,
  onModeChange,
}: PatientInputProps) {
  const [patientId, setPatientId] = useState("131494564");
  const [selectedServer, setSelectedServer] = useState(0);
  const [customUrl, setCustomUrl] = useState("");

  const fhirUrl =
    selectedServer < FHIR_SERVERS.length - 1
      ? FHIR_SERVERS[selectedServer].url
      : customUrl;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim()) return;
    onReconcile(patientId.trim(), fhirUrl);
  };

  const stepLabels = mode === "pipeline" ? PIPELINE_STEP_LABELS : DIRECT_STEP_LABELS;
  const progressSteps = mode === "pipeline" ? PIPELINE_STEPS_ORDER : DIRECT_STEPS;
  const currentStepIdx = getStepIndex(step, progressSteps);

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-4 pb-4">
        {/* Mode toggle */}
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-background p-1 w-fit">
          <button
            type="button"
            onClick={() => onModeChange("pipeline")}
            disabled={loading}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              mode === "pipeline"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Network className="h-3 w-3" />
            Full Pipeline
          </button>
          <button
            type="button"
            onClick={() => onModeChange("direct")}
            disabled={loading}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              mode === "direct"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Zap className="h-3 w-3" />
            Quick Scan
          </button>
        </div>

        {/* Mode description */}
        <p className="mb-3 text-[11px] text-muted-foreground">
          {mode === "pipeline"
            ? "3-agent A2A pipeline: Source Collector + Interaction Checker + Orchestrator. ~30-60s."
            : "Direct MCP tool calls. Faster but single-source only."}
        </p>

        {/* Demo patient presets */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">Demo Patients</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_PATIENTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPatientId(p.id)}
                disabled={loading}
                className={`rounded-md border px-2 py-1 text-[11px] transition-all ${
                  patientId === p.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
                title={p.desc}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Patient ID */}
            <div className="flex-1">
              <label
                htmlFor="patient-id"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Patient ID
              </label>
              <Input
                id="patient-id"
                type="text"
                placeholder="Enter FHIR Patient ID"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="bg-background border-border text-sm"
                disabled={loading}
              />
            </div>

            {/* FHIR Server */}
            <div className="flex-1">
              <label
                htmlFor="fhir-server"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                <Server className="inline h-3 w-3 mr-1" />
                FHIR Server
              </label>
              <select
                id="fhir-server"
                value={selectedServer}
                onChange={(e) => setSelectedServer(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading}
              >
                {FHIR_SERVERS.map((server, idx) => (
                  <option key={idx} value={idx}>
                    {server.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom URL (shown when Custom is selected) */}
            {selectedServer === FHIR_SERVERS.length - 1 && (
              <div className="flex-1">
                <label
                  htmlFor="custom-url"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Custom FHIR URL
                </label>
                <Input
                  id="custom-url"
                  type="url"
                  placeholder="https://your-fhir-server.com/baseR4"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="bg-background border-border text-sm"
                  disabled={loading}
                />
              </div>
            )}

            {/* Reconcile Button */}
            <Button
              type="submit"
              disabled={loading || !patientId.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 min-w-[140px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Reconcile
                </>
              )}
            </Button>
          </div>

          {/* Progress indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <div className="flex gap-1">
                {progressSteps.map((s, i) => (
                  <div
                    key={s}
                    className={`h-1.5 w-8 rounded-full transition-colors ${
                      i <= currentStepIdx ? "bg-primary" : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <span>{stepLabels[step] || step}</span>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
