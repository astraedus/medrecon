import { NextRequest, NextResponse } from "next/server";
import { callMcpTool } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const patientId = searchParams.get("patientId");
  const fhirUrl = searchParams.get("fhirUrl") || undefined;
  const status = searchParams.get("status") || "active";

  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 }
    );
  }

  try {
    const args: Record<string, string> = {
      patient_id: patientId,
      status,
    };
    if (fhirUrl) {
      args.fhir_url = fhirUrl;
    }

    const result = await callMcpTool("get_medications", args);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching medications:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch medications: ${message}` },
      { status: 500 }
    );
  }
}
