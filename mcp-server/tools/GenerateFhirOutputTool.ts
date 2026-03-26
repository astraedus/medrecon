import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import { IMcpTool } from "../types.js";
import { McpUtilities } from "../mcp-utilities.js";
import { randomUUID } from "crypto";

/**
 * A reconciled medication entry passed in as JSON by the caller.
 */
interface ReconciledMedication {
  name: string;
  dose?: string;
  frequency?: string;
  rxcui?: string;
  sources: string[];
  flag: "MATCH" | "MISSING" | "DOSE_MISMATCH";
}

/**
 * Build a FHIR R4 MedicationStatement resource from a reconciled medication.
 */
function buildMedicationStatement(
  med: ReconciledMedication,
  patientId: string,
  statementId: string,
  fhirUrl: string,
  dateAsserted: string,
): object {
  const coding: object[] = [];

  if (med.rxcui) {
    coding.push({
      system: "http://www.nlm.nih.gov/research/umls/rxnorm",
      code: med.rxcui,
      display: med.name,
    });
  }

  const dosageText =
    med.dose && med.frequency
      ? `${med.dose} ${med.frequency}`
      : med.dose || med.frequency || "Not specified";

  const sourceText =
    med.sources.length > 0
      ? `Sources: ${med.sources.join(", ")}`
      : "Source: unknown";

  const baseUrl = fhirUrl.replace(/\/$/, "");

  return {
    resourceType: "MedicationStatement",
    id: statementId,
    meta: {
      profile: [
        "http://hl7.org/fhir/StructureDefinition/MedicationStatement",
      ],
    },
    text: {
      status: "generated",
      div: `<div xmlns="http://www.w3.org/1999/xhtml">MedicationStatement for ${med.name}</div>`,
    },
    extension: [
      {
        url: "http://medrecon.ai/fhir/StructureDefinition/reconciliation-flag",
        valueCode: med.flag,
      },
    ],
    status: "active",
    medicationCodeableConcept: {
      coding: coding.length > 0 ? coding : undefined,
      text: med.name,
    },
    subject: {
      reference: `Patient/${patientId}`,
    },
    dateAsserted,
    dosage: [
      {
        text: dosageText,
      },
    ],
    note: [
      {
        text: sourceText,
      },
    ],
  };
}

/**
 * Build a FHIR R4 Provenance resource that records the reconciliation activity.
 */
function buildProvenance(
  statementId: string,
  provenanceId: string,
  recorded: string,
): object {
  return {
    resourceType: "Provenance",
    id: provenanceId,
    target: [
      {
        reference: `MedicationStatement/${statementId}`,
      },
    ],
    recorded,
    agent: [
      {
        who: {
          display: "MedRecon AI Reconciliation System",
        },
      },
    ],
    reason: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/v3-ActReason",
            code: "TREAT",
            display: "treatment",
          },
        ],
      },
    ],
  };
}

class GenerateFhirOutputTool implements IMcpTool {
  registerTool(server: McpServer, _req: Request) {
    server.registerTool(
      "generate_fhir_output",
      {
        description:
          "Generates FHIR R4 MedicationStatement resources from reconciled medication data. " +
          "Returns a FHIR Bundle (type: collection) containing one MedicationStatement and one " +
          "Provenance resource per medication. The bundle can be posted to an EHR system to " +
          "record the reconciled medication list with full source attribution and reconciliation flags.",
        inputSchema: {
          patient_id: z
            .string()
            .describe("The FHIR Patient resource ID."),
          medications: z
            .string()
            .describe(
              "JSON string of reconciled medications array. Each item must include: " +
                "name (string), sources (string[]), flag ('MATCH'|'MISSING'|'DOSE_MISMATCH'). " +
                "Optional fields: dose (string), frequency (string), rxcui (string).",
            ),
          fhir_url: z
            .string()
            .describe(
              "FHIR server base URL used for resource references. " +
                "Defaults to the HAPI FHIR public server.",
            )
            .optional(),
        },
      },
      async ({ patient_id, medications, fhir_url }) => {
        const baseUrl =
          fhir_url ||
          process.env["FHIR_SERVER_URL"] ||
          "https://hapi.fhir.org/baseR4";

        // Parse and validate the medications JSON
        let medList: ReconciledMedication[];
        try {
          const parsed = JSON.parse(medications);
          if (!Array.isArray(parsed)) {
            return McpUtilities.createTextResponse(
              "Error: 'medications' must be a JSON array.",
              { isError: true },
            );
          }
          medList = parsed as ReconciledMedication[];
        } catch {
          return McpUtilities.createTextResponse(
            "Error: 'medications' is not valid JSON. " +
              "Expected a JSON array of reconciled medication objects.",
            { isError: true },
          );
        }

        if (medList.length === 0) {
          return McpUtilities.createTextResponse(
            "Error: 'medications' array is empty. At least one medication is required.",
            { isError: true },
          );
        }

        // Validate each medication entry has the required fields
        for (let i = 0; i < medList.length; i++) {
          const med = medList[i];
          if (!med.name || typeof med.name !== "string") {
            return McpUtilities.createTextResponse(
              `Error: medication at index ${i} is missing required field 'name'.`,
              { isError: true },
            );
          }
          if (!Array.isArray(med.sources)) {
            return McpUtilities.createTextResponse(
              `Error: medication at index ${i} is missing required field 'sources' (must be an array).`,
              { isError: true },
            );
          }
          const validFlags = ["MATCH", "MISSING", "DOSE_MISMATCH"];
          if (!validFlags.includes(med.flag)) {
            return McpUtilities.createTextResponse(
              `Error: medication at index ${i} has invalid 'flag' value '${med.flag}'. ` +
                "Must be one of: MATCH, MISSING, DOSE_MISMATCH.",
              { isError: true },
            );
          }
        }

        const now = new Date().toISOString();
        const bundleId = randomUUID();
        const entries: object[] = [];

        for (const med of medList) {
          const statementId = randomUUID();
          const provenanceId = randomUUID();

          const statement = buildMedicationStatement(
            med,
            patient_id,
            statementId,
            baseUrl,
            now,
          );
          const provenance = buildProvenance(statementId, provenanceId, now);

          entries.push(
            {
              fullUrl: `urn:uuid:${statementId}`,
              resource: statement,
            },
            {
              fullUrl: `urn:uuid:${provenanceId}`,
              resource: provenance,
            },
          );
        }

        const bundle = {
          resourceType: "Bundle",
          id: bundleId,
          meta: {
            lastUpdated: now,
          },
          type: "collection",
          timestamp: now,
          total: entries.length,
          entry: entries,
        };

        return McpUtilities.createJsonResponse({
          status: "success",
          patient_id,
          medication_count: medList.length,
          bundle_entry_count: entries.length,
          fhir_server: baseUrl,
          bundle,
        });
      },
    );
  }
}

export const GenerateFhirOutputToolInstance = new GenerateFhirOutputTool();
