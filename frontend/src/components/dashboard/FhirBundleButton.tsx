"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileJson, Download, Loader2 } from "lucide-react";
import { Medication, FhirMedicationInput, FhirOutputResponse } from "@/lib/types";

type FhirBundleButtonProps = {
  patientId: string;
  medications: Medication[];
  fhirUrl?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Transform frontend Medication objects into the format expected by
 * the generate_fhir_output MCP tool.
 */
function toFhirInput(medications: Medication[]): FhirMedicationInput[] {
  return medications.map((med) => ({
    name: med.name,
    dose: med.dose,
    frequency: med.frequency,
    rxcui: med.rxcui,
    sources: med.source ? [med.source] : ["HAPI FHIR"],
    flag: "MATCH" as const,
  }));
}

export function FhirBundleButton({
  patientId,
  medications,
  fhirUrl,
}: FhirBundleButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [bundleJson, setBundleJson] = useState<string>("");
  const [entryCount, setEntryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setBundle(null);

    try {
      const fhirMeds = toFhirInput(medications);

      const res = await fetch("/api/fhir-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          medications: fhirMeds,
          fhirUrl,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error || `FHIR generation failed (${res.status})`
        );
      }

      const data: FhirOutputResponse = await res.json();
      const bundleStr = JSON.stringify(data.bundle, null, 2);
      setBundle(data.bundle);
      setBundleJson(bundleStr);
      setEntryCount(data.bundle_entry_count);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate FHIR bundle";
      setError(message);
    } finally {
      setGenerating(false);
    }
  }, [patientId, medications, fhirUrl]);

  const handleDownload = useCallback(() => {
    if (!bundleJson) return;
    const blob = new Blob([bundleJson], { type: "application/fhir+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medrecon-bundle-${patientId}.fhir.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bundleJson, patientId]);

  if (medications.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {!bundle ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileJson className="mr-2 h-3.5 w-3.5" />
              Generate FHIR Bundle
            </>
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
        >
          <Download className="mr-2 h-3.5 w-3.5" />
          Download FHIR Bundle
        </Button>
      )}

      {bundle && (
        <span className="text-[11px] text-muted-foreground">
          {entryCount} resources, {formatBytes(new Blob([bundleJson]).size)}
        </span>
      )}

      {error && (
        <span className="text-[11px] text-red-400">{error}</span>
      )}
    </div>
  );
}
