import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import { IMcpTool } from "../types.js";
import { getFhirContext } from "../fhir-context.js";
import { fhirClient } from "../fhir-client.js";
import { McpUtilities } from "../mcp-utilities.js";

/**
 * Result of a single allergy-drug match.
 */
type AllergyMatch = {
  drug_name: string;
  allergy_substance: string;
  match_type: "exact" | "partial";
  severity: string;
  clinical_status: string;
  verification_status: string;
  reactions: string[];
  note: string;
};

/**
 * Normalize a substance name for fuzzy matching.
 * Strips common suffixes, salt forms, and converts to lowercase.
 */
function normalizeSubstance(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\s+(sodium|potassium|hydrochloride|hcl|sulfate|acetate|tartrate|succinate|besylate|maleate|fumarate|mesylate|calcium|citrate|phosphate)\b/gi,
      "",
    )
    .replace(/\s*\d+\.?\d*\s*(mg|mcg|g|ml|units?|iu)\b.*/i, "")
    .trim();
}

/**
 * Check if two substance names match (exact or fuzzy).
 * Returns match type or null if no match.
 */
function matchSubstances(
  allergySubstance: string,
  drugName: string,
): "exact" | "partial" | null {
  const normAllergy = normalizeSubstance(allergySubstance);
  const normDrug = normalizeSubstance(drugName);

  if (normAllergy === normDrug) {
    return "exact";
  }

  // Check if one contains the other (e.g., "penicillin" matches "amoxicillin" via class,
  // or "aspirin" matches "aspirin 81mg daily")
  if (normDrug.includes(normAllergy) || normAllergy.includes(normDrug)) {
    return "partial";
  }

  // Check common drug class cross-reactivity groups
  const crossReactivityGroups: string[][] = [
    ["penicillin", "amoxicillin", "ampicillin", "piperacillin", "nafcillin", "oxacillin"],
    ["sulfa", "sulfamethoxazole", "sulfasalazine", "trimethoprim-sulfamethoxazole"],
    ["cephalosporin", "cefazolin", "ceftriaxone", "cephalexin", "cefepime", "cefuroxime"],
    ["nsaid", "ibuprofen", "naproxen", "aspirin", "diclofenac", "indomethacin", "ketorolac", "meloxicam", "celecoxib"],
    ["statin", "atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"],
    ["ace inhibitor", "lisinopril", "enalapril", "ramipril", "captopril", "benazepril"],
    ["opioid", "morphine", "hydrocodone", "oxycodone", "codeine", "fentanyl", "tramadol"],
  ];

  for (const group of crossReactivityGroups) {
    const allergyInGroup = group.some(
      (g) => normAllergy.includes(g) || g.includes(normAllergy),
    );
    const drugInGroup = group.some(
      (g) => normDrug.includes(g) || g.includes(normDrug),
    );
    if (allergyInGroup && drugInGroup) {
      return "partial";
    }
  }

  return null;
}

/**
 * Extract allergy data from a FHIR AllergyIntolerance resource.
 */
function parseAllergyResource(resource: any): {
  substance: string;
  severity: string;
  clinicalStatus: string;
  verificationStatus: string;
  reactions: string[];
  note: string;
} {
  const codeConcept = resource.code || {};
  const substance =
    codeConcept.text ||
    codeConcept.coding?.[0]?.display ||
    "Unknown substance";

  const severity =
    resource.reaction?.[0]?.severity ||
    resource.criticality ||
    "unknown";

  const clinicalStatus =
    resource.clinicalStatus?.coding?.[0]?.code || "unknown";
  const verificationStatus =
    resource.verificationStatus?.coding?.[0]?.code || "unknown";

  const reactions: string[] = [];
  for (const reaction of resource.reaction || []) {
    for (const manifestation of reaction.manifestation || []) {
      const display =
        manifestation.coding?.[0]?.display ||
        manifestation.text ||
        null;
      if (display) {
        reactions.push(display);
      }
    }
  }

  const notes = (resource.note || [])
    .map((n: any) => n.text)
    .filter(Boolean)
    .join("; ");

  return {
    substance,
    severity,
    clinicalStatus,
    verificationStatus,
    reactions,
    note: notes || "No clinical notes",
  };
}

class CheckAllergiesTool implements IMcpTool {
  registerTool(server: McpServer, req: Request) {
    server.registerTool(
      "check_allergies",
      {
        description:
          "Cross-references a patient's documented allergies against a list of drug names. " +
          "Queries FHIR AllergyIntolerance resources and performs fuzzy matching including drug class cross-reactivity. " +
          "Returns matching allergies with severity, reactions, and clinical notes.",
        inputSchema: {
          patient_id: z
            .string()
            .describe(
              "The FHIR Patient resource ID. Optional if patient context is provided via headers.",
            )
            .optional(),
          drug_names: z
            .string()
            .describe(
              "Comma-separated list of drug names to check against patient allergies. " +
              'Example: "amoxicillin, ibuprofen, lisinopril"',
            ),
          fhir_url: z
            .string()
            .describe(
              "The base URL of the FHIR R4 server. Optional - defaults to context or HAPI public.",
            )
            .optional(),
        },
      },
      async ({ patient_id, drug_names, fhir_url }) => {
        if (!drug_names || drug_names.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No drug names provided. Please provide a comma-separated list of drug names.",
            { isError: true },
          );
        }

        // Resolve FHIR context
        const headerCtx = getFhirContext(req);
        const resolvedUrl = fhir_url || headerCtx.url;
        const resolvedPatientId = patient_id || headerCtx.patientId;

        if (!resolvedPatientId) {
          return McpUtilities.createTextResponse(
            "Error: No patient_id provided and no patient context available. " +
            "Please provide a patient_id parameter.",
            { isError: true },
          );
        }

        const ctx = {
          url: resolvedUrl,
          token: headerCtx.token,
          patientId: resolvedPatientId,
        };

        const drugs = drug_names
          .split(",")
          .map((d: string) => d.trim())
          .filter((d: string) => d.length > 0);

        // Query FHIR for allergies
        let allergyBundle: any;
        try {
          allergyBundle = await fhirClient.search(
            ctx,
            "AllergyIntolerance",
            {
              patient: ctx.patientId!,
              _count: "100",
            },
          );
        } catch (error: any) {
          return McpUtilities.createTextResponse(
            `Error querying FHIR for allergies: ${error.message}`,
            { isError: true },
          );
        }

        const entries = allergyBundle?.entry || [];
        if (entries.length === 0) {
          return McpUtilities.createJsonResponse({
            status: "success",
            patient_id: ctx.patientId,
            fhir_server: ctx.url,
            allergies_on_record: 0,
            drugs_checked: drugs,
            matches: [],
            message: `No allergies documented for patient ${ctx.patientId}. ` +
              "Note: absence of allergy records does not mean no allergies exist.",
          });
        }

        // Parse allergies and cross-reference
        const matches: AllergyMatch[] = [];
        const allAllergies: string[] = [];

        for (const entry of entries) {
          if (entry.resource?.resourceType !== "AllergyIntolerance") {
            continue;
          }

          const allergy = parseAllergyResource(entry.resource);
          allAllergies.push(allergy.substance);

          for (const drug of drugs) {
            const matchType = matchSubstances(allergy.substance, drug);
            if (matchType) {
              matches.push({
                drug_name: drug,
                allergy_substance: allergy.substance,
                match_type: matchType,
                severity: allergy.severity,
                clinical_status: allergy.clinicalStatus,
                verification_status: allergy.verificationStatus,
                reactions: allergy.reactions,
                note: allergy.note,
              });
            }
          }
        }

        const hasExactMatch = matches.some((m) => m.match_type === "exact");

        return McpUtilities.createJsonResponse({
          status: "success",
          patient_id: ctx.patientId,
          fhir_server: ctx.url,
          allergies_on_record: allAllergies.length,
          all_allergies: allAllergies,
          drugs_checked: drugs,
          matches_found: matches.length,
          has_exact_match: hasExactMatch,
          matches,
          disclaimer:
            "Allergy cross-referencing includes drug class cross-reactivity patterns. " +
            "Partial matches indicate potential cross-reactivity and should be reviewed by a clinician. " +
            "This tool does not replace clinical allergy assessment.",
        });
      },
    );
  }
}

export const CheckAllergiesToolInstance =
  new CheckAllergiesTool();
