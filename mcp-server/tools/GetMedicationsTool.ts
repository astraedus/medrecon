import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import { IMcpTool, NormalizedMedication } from "../types.js";
import { getFhirContext } from "../fhir-context.js";
import { fhirClient } from "../fhir-client.js";
import { McpUtilities } from "../mcp-utilities.js";

/**
 * Extract display text from FHIR CodeableConcept codings.
 */
function codingDisplay(codings: any[]): string {
  for (const c of codings || []) {
    if (c.display) return c.display;
  }
  return "Unknown";
}

/**
 * Extract RxNorm code (RxCUI) from FHIR codings if present.
 */
function extractRxCui(codings: any[]): string | undefined {
  for (const c of codings || []) {
    if (
      c.system === "http://www.nlm.nih.gov/research/umls/rxnorm" &&
      c.code
    ) {
      return c.code;
    }
  }
  return undefined;
}

/**
 * Parse a FHIR MedicationRequest resource into a normalized medication.
 */
function parseMedicationRequest(resource: any): NormalizedMedication {
  const medConcept = resource.medicationCodeableConcept || {};
  const codings = medConcept.coding || [];

  const name =
    medConcept.text ||
    codingDisplay(codings) ||
    resource.medicationReference?.display ||
    "Unknown medication";

  const dosageInstructions = resource.dosageInstruction || [];
  const dosageText =
    dosageInstructions.length > 0
      ? dosageInstructions[0].text || "Not specified"
      : "Not specified";

  // Try to extract dose and frequency from structured dosage
  let dose: string | undefined;
  let frequency: string | undefined;

  if (dosageInstructions.length > 0) {
    const dosage = dosageInstructions[0];

    // Dose quantity
    const doseQuantity =
      dosage.doseAndRate?.[0]?.doseQuantity || dosage.doseQuantity;
    if (doseQuantity) {
      dose = `${doseQuantity.value} ${doseQuantity.unit || doseQuantity.code || ""}`.trim();
    }

    // Timing/frequency
    const timing = dosage.timing;
    if (timing?.code?.text) {
      frequency = timing.code.text;
    } else if (timing?.repeat) {
      const repeat = timing.repeat;
      if (repeat.frequency && repeat.period && repeat.periodUnit) {
        frequency = `${repeat.frequency} time(s) per ${repeat.period} ${repeat.periodUnit}`;
      }
    }

    // If no structured data, use the text
    if (!dose && !frequency) {
      dose = dosageText;
    }
  }

  return {
    name,
    dose: dose || dosageText,
    frequency,
    status: resource.status,
    prescriber: resource.requester?.display,
    authoredOn: resource.authoredOn,
    rxcui: extractRxCui(codings),
    source: "MedicationRequest",
  };
}

/**
 * Parse a FHIR MedicationStatement resource into a normalized medication.
 */
function parseMedicationStatement(resource: any): NormalizedMedication {
  const medConcept = resource.medicationCodeableConcept || {};
  const codings = medConcept.coding || [];

  const name =
    medConcept.text ||
    codingDisplay(codings) ||
    resource.medicationReference?.display ||
    "Unknown medication";

  const dosageList = resource.dosage || [];
  const dosageText =
    dosageList.length > 0
      ? dosageList[0].text || "Not specified"
      : "Not specified";

  return {
    name,
    dose: dosageText,
    status: resource.status,
    rxcui: extractRxCui(codings),
    source: "MedicationStatement",
  };
}

/**
 * Follow FHIR Bundle pagination to get all entries.
 */
async function getAllBundleEntries(
  ctx: any,
  initialBundle: any,
): Promise<any[]> {
  const entries: any[] = [...(initialBundle.entry || [])];

  let nextUrl = initialBundle.link?.find(
    (l: any) => l.relation === "next",
  )?.url;

  // Follow up to 5 pages to avoid runaway pagination
  let pageCount = 0;
  while (nextUrl && pageCount < 5) {
    try {
      const response = await fhirClient.read<any>(
        { url: "", token: ctx.token },
        nextUrl,
      );
      if (response?.entry) {
        entries.push(...response.entry);
      }
      nextUrl = response?.link?.find(
        (l: any) => l.relation === "next",
      )?.url;
      pageCount++;
    } catch {
      break;
    }
  }

  return entries;
}

class GetMedicationsTool implements IMcpTool {
  registerTool(server: McpServer, req: Request) {
    server.registerTool(
      "get_medications",
      {
        description:
          "Retrieves the medication list for a patient from a FHIR R4 server. " +
          "Queries both MedicationRequest and MedicationStatement resources. " +
          "Returns a normalized list with drug name, dose, frequency, prescriber, and status.",
        inputSchema: {
          patient_id: z
            .string()
            .describe(
              "The FHIR Patient resource ID. Optional if patient context is provided via headers.",
            )
            .optional(),
          fhir_url: z
            .string()
            .describe(
              "The base URL of the FHIR R4 server. Optional - defaults to the server in context or HAPI public.",
            )
            .optional(),
          status: z
            .string()
            .describe(
              "Filter by medication status (e.g. 'active', 'completed', 'stopped'). Defaults to 'active'.",
            )
            .optional(),
        },
      },
      async ({ patient_id, fhir_url, status }) => {
        // Resolve FHIR context: tool args > request headers > defaults
        const headerCtx = getFhirContext(req);
        const resolvedUrl = fhir_url || headerCtx.url;
        const resolvedPatientId = patient_id || headerCtx.patientId;

        if (!resolvedPatientId) {
          return McpUtilities.createTextResponse(
            "Error: No patient_id provided and no patient context available. " +
              "Please provide a patient_id parameter or ensure FHIR patient context is set.",
            { isError: true },
          );
        }

        const ctx = {
          url: resolvedUrl,
          token: headerCtx.token,
          patientId: resolvedPatientId,
        };
        const medicationStatus = status || "active";

        const medications: NormalizedMedication[] = [];

        // Query MedicationRequest resources
        try {
          const mrBundle = await fhirClient.search(
            ctx,
            "MedicationRequest",
            {
              patient: ctx.patientId!,
              status: medicationStatus,
              _count: "100",
            },
          );

          if (mrBundle) {
            const entries = await getAllBundleEntries(ctx, mrBundle);
            for (const entry of entries) {
              if (entry.resource?.resourceType === "MedicationRequest") {
                medications.push(parseMedicationRequest(entry.resource));
              }
            }
          }
        } catch (error: any) {
          console.error("Error fetching MedicationRequest:", error.message);
          // Continue to try MedicationStatement
        }

        // Query MedicationStatement resources
        try {
          const msBundle = await fhirClient.search(
            ctx,
            "MedicationStatement",
            {
              patient: ctx.patientId!,
              status: medicationStatus,
              _count: "100",
            },
          );

          if (msBundle) {
            const entries = await getAllBundleEntries(ctx, msBundle);
            for (const entry of entries) {
              if (entry.resource?.resourceType === "MedicationStatement") {
                medications.push(parseMedicationStatement(entry.resource));
              }
            }
          }
        } catch (error: any) {
          // MedicationStatement may not be supported by all servers
          console.log(
            "MedicationStatement query skipped:",
            error.message,
          );
        }

        if (medications.length === 0) {
          return McpUtilities.createJsonResponse({
            status: "success",
            patient_id: ctx.patientId,
            fhir_server: ctx.url,
            count: 0,
            medications: [],
            message: `No ${medicationStatus} medications found for patient ${ctx.patientId}.`,
          });
        }

        return McpUtilities.createJsonResponse({
          status: "success",
          patient_id: ctx.patientId,
          fhir_server: ctx.url,
          count: medications.length,
          medications,
        });
      },
    );
  }
}

export const GetMedicationsToolInstance = new GetMedicationsTool();
