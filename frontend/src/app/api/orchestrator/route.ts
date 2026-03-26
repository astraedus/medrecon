import { NextRequest, NextResponse } from "next/server";
import { callOrchestrator } from "@/lib/a2a-client";

export const dynamic = "force-dynamic";

/**
 * Full multi-agent reconciliation pipeline via the Orchestrator.
 *
 * Flow: Orchestrator -> Source Collector -> Interaction Checker -> Report
 *
 * This endpoint calls the MedRecon Orchestrator agent via A2A protocol.
 * The Orchestrator coordinates:
 * 1. Source Collector: gathers meds from multiple FHIR sources
 * 2. Interaction Checker: runs safety analysis (interactions, allergies, doses)
 * 3. Assembles comprehensive reconciliation report
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, fhirUrl } = body;

    if (!patientId) {
      return NextResponse.json(
        { error: "patientId is required" },
        { status: 400 }
      );
    }

    const result = await callOrchestrator(patientId, fhirUrl);

    return NextResponse.json({
      state: result.state,
      report: result.report,
      pipeline: "orchestrator",
      agents: ["source_collector", "interaction_checker", "orchestrator"],
    });
  } catch (error) {
    console.error("Orchestrator pipeline error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Orchestrator pipeline failed: ${message}` },
      { status: 500 }
    );
  }
}
