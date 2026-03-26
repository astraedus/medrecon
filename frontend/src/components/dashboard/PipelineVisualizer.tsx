"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { PipelineMode } from "@/lib/types";

type Step = {
  id: string;
  label: string;
  description: string;
};

const PIPELINE_STEPS: Step[] = [
  {
    id: "collecting",
    label: "Source Collector",
    description: "Gathering medications from 3 FHIR sources",
  },
  {
    id: "analyzing",
    label: "Interaction Checker",
    description: "Running safety analysis",
  },
  {
    id: "assembling",
    label: "Report Assembly",
    description: "Assembling reconciliation report",
  },
  {
    id: "done",
    label: "Done",
    description: "Pipeline complete",
  },
];

const DIRECT_STEPS: Step[] = [
  {
    id: "fetching_meds",
    label: "Fetch Medications",
    description: "Query FHIR server for patient medication data",
  },
  {
    id: "checking_interactions",
    label: "Check Interactions",
    description: "Analyze drug-drug interaction pairs",
  },
  {
    id: "done",
    label: "Reconciliation Complete",
    description: "Review results and clinical recommendations",
  },
];

type PipelineVisualizerProps = {
  currentStep: string;
  loading: boolean;
  mode?: PipelineMode;
};

function getStepState(
  stepId: string,
  currentStep: string,
  loading: boolean,
  steps: Step[]
): "completed" | "active" | "pending" {
  const stepOrder = steps.map((s) => s.id);
  const currentIdx = stepOrder.indexOf(currentStep);
  const stepIdx = stepOrder.indexOf(stepId);

  if (currentStep === "idle") return "pending";
  if (currentStep === "done") return "completed";

  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return loading ? "active" : "completed";
  return "pending";
}

export function PipelineVisualizer({
  currentStep,
  loading,
  mode = "direct",
}: PipelineVisualizerProps) {
  if (currentStep === "idle") return null;

  const steps = mode === "pipeline" ? PIPELINE_STEPS : DIRECT_STEPS;

  return (
    <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
      {steps.map((step, idx) => {
        const state = getStepState(step.id, currentStep, loading, steps);

        return (
          <div key={step.id} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {state === "completed" && (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              )}
              {state === "active" && (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              )}
              {state === "pending" && (
                <Circle className="h-4 w-4 text-muted-foreground/40" />
              )}
              <span
                className={`text-xs font-medium ${
                  state === "completed"
                    ? "text-green-400"
                    : state === "active"
                      ? "text-primary"
                      : "text-muted-foreground/40"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-px w-8 ${
                  state === "completed"
                    ? "bg-green-400/50"
                    : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
