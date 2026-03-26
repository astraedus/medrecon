import { randomUUID } from "crypto";

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ||
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  "https://medrecon-orchestrator-93135657352.us-central1.run.app";

type A2ATask = {
  id: string;
  contextId: string;
  status: {
    state: string;
    message?: {
      parts: Array<{ kind: string; text?: string }>;
    };
  };
  artifacts?: Array<{
    artifactId: string;
    parts: Array<{ kind: string; text?: string }>;
  }>;
  history?: Array<{
    role: string;
    parts: Array<{ kind: string; text?: string }>;
  }>;
};

type A2AResponse = {
  jsonrpc: string;
  id: string;
  result?: A2ATask;
  error?: { code: number; message: string };
};

/**
 * Extract all text from an A2A task response.
 * Checks artifacts, status message, and history in priority order.
 */
function extractResponseText(task: A2ATask): string {
  const texts: string[] = [];

  // Artifacts (primary output from ADK agents)
  for (const artifact of task.artifacts || []) {
    for (const part of artifact.parts) {
      if (part.kind === "text" && part.text?.trim()) {
        texts.push(part.text);
      }
    }
  }

  // Status message
  if (task.status?.message?.parts) {
    for (const part of task.status.message.parts) {
      if (part.kind === "text" && part.text?.trim() && !texts.includes(part.text)) {
        texts.push(part.text);
      }
    }
  }

  return texts.join("\n\n");
}

/**
 * Send a reconciliation request to the Orchestrator agent via A2A protocol.
 *
 * The Orchestrator will:
 * 1. Call Source Collector to gather medications from multiple FHIR sources
 * 2. Call Interaction Checker for safety analysis
 * 3. Assemble a comprehensive reconciliation report
 */
export async function callOrchestrator(
  patientId: string,
  fhirUrl?: string
): Promise<{ state: string; report: string }> {
  const messageId = randomUUID();
  const resolvedFhirUrl = fhirUrl || "https://hapi.fhir.org/baseR4";

  const payload = {
    jsonrpc: "2.0",
    id: messageId,
    method: "message/send",
    params: {
      message: {
        messageId,
        role: "user",
        parts: [
          {
            kind: "text",
            text: `Perform a full medication reconciliation for patient ${patientId} using the FHIR server at ${resolvedFhirUrl}.`,
          },
        ],
      },
    },
  };

  const res = await fetch(`${ORCHESTRATOR_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Orchestrator returned ${res.status}: ${errorText.substring(0, 300)}`
    );
  }

  const result = (await res.json()) as A2AResponse;

  if (result.error) {
    throw new Error(
      `A2A error [${result.error.code}]: ${result.error.message}`
    );
  }

  if (!result.result) {
    throw new Error("No task returned from Orchestrator");
  }

  const task = result.result;
  const report = extractResponseText(task);

  return {
    state: task.status?.state || "unknown",
    report,
  };
}
