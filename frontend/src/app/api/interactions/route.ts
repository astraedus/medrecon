import { NextRequest, NextResponse } from "next/server";
import { callMcpTool } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { drugNames, includeOpenFda } = body;

    if (!drugNames || !Array.isArray(drugNames) || drugNames.length < 2) {
      return NextResponse.json(
        { error: "drugNames array with at least 2 drugs is required" },
        { status: 400 }
      );
    }

    const args: Record<string, string> = {
      drug_names: drugNames.join(", "),
    };
    if (includeOpenFda === false) {
      args.include_openfda = "false";
    }

    const result = await callMcpTool("check_interactions", args);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error checking interactions:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to check interactions: ${message}` },
      { status: 500 }
    );
  }
}
