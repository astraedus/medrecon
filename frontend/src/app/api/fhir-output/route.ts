import { NextRequest, NextResponse } from "next/server";
import { callMcpTool } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientId, medications, fhirUrl } = body;

    if (!patientId || typeof patientId !== "string") {
      return NextResponse.json(
        { error: "patientId is required" },
        { status: 400 }
      );
    }

    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return NextResponse.json(
        { error: "medications array with at least 1 medication is required" },
        { status: 400 }
      );
    }

    const args: Record<string, string> = {
      patient_id: patientId,
      medications: JSON.stringify(medications),
    };

    if (fhirUrl && typeof fhirUrl === "string") {
      args.fhir_url = fhirUrl;
    }

    const result = await callMcpTool("generate_fhir_output", args);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating FHIR output:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate FHIR output: ${message}` },
      { status: 500 }
    );
  }
}
