import { NextRequest, NextResponse } from "next/server";
import { callMcpTool } from "@/lib/mcp-client";
import { Medication } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Full reconciliation pipeline:
 * 1. Fetch medications from FHIR
 * 2. Check drug interactions
 * 3. Return combined results
 *
 * This endpoint orchestrates the full workflow so the frontend
 * can show the step-by-step reconciliation process.
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

    // Step 1: Fetch medications
    const medsArgs: Record<string, string> = {
      patient_id: patientId,
      status: "active",
    };
    if (fhirUrl) {
      medsArgs.fhir_url = fhirUrl;
    }

    const medsResult = (await callMcpTool("get_medications", medsArgs)) as {
      status: string;
      patient_id: string;
      fhir_server: string;
      count: number;
      medications: Medication[];
    };

    if (!medsResult || medsResult.status !== "success") {
      return NextResponse.json(
        {
          error: "Failed to fetch medications",
          details: medsResult,
        },
        { status: 500 }
      );
    }

    const medications = medsResult.medications || [];

    // Step 2: Check interactions if we have 2+ medications
    let interactions = null;
    if (medications.length >= 2) {
      const drugNames = medications.map((m: Medication) => m.name);
      const interactionsArgs: Record<string, string> = {
        drug_names: drugNames.join(", "),
        include_openfda: "true",
      };

      try {
        interactions = await callMcpTool("check_interactions", interactionsArgs);
      } catch (error) {
        console.error("Interaction check failed (non-fatal):", error);
        // Non-fatal: we can still show meds without interactions
      }
    }

    return NextResponse.json({
      medications: medsResult,
      interactions,
    });
  } catch (error) {
    console.error("Error in reconciliation pipeline:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Reconciliation failed: ${message}` },
      { status: 500 }
    );
  }
}
