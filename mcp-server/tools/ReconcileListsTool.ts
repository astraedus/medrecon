import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import { IMcpTool } from "../types.js";
import { McpUtilities } from "../mcp-utilities.js";

/**
 * A medication entry from one source.
 */
type MedicationEntry = {
  name: string;
  dose?: string;
};

/**
 * A source list containing medications from one provider/system.
 */
type SourceList = {
  source: string;
  medications: MedicationEntry[];
};

/**
 * Normalize a drug name for comparison across sources.
 * Strips dose info, salt forms, route, and frequency.
 */
function normalizeDrugName(name: string): string {
  return name
    .toLowerCase()
    // Remove dose info like "5mg", "81mg daily", "500 mg"
    .replace(/\s*\d+\.?\d*\s*(mg|mcg|g|ml|l|units?|iu)\b.*/i, "")
    // Remove route abbreviations
    .replace(/\s+(iv|im|sq|sc|po|pr|sl|td|top|inh|neb)\b.*/i, "")
    // Remove frequency terms
    .replace(
      /\s+(bid|tid|qid|qd|daily|prn|qhs|qam|qpm|once|twice)\b.*/i,
      "",
    )
    // Remove salt forms
    .replace(
      /\s+(sodium|potassium|hydrochloride|hcl|sulfate|acetate|tartrate|succinate|besylate|maleate|fumarate|mesylate|calcium|citrate|phosphate)\b/gi,
      "",
    )
    .trim();
}

/**
 * Reconciliation result for a single drug.
 */
type ReconciledDrug = {
  normalized_name: string;
  sources: {
    source: string;
    original_name: string;
    dose: string | undefined;
  }[];
  present_in_all: boolean;
  missing_from: string[];
  dose_discrepancy: boolean;
  dose_details: string | undefined;
  flag:
    | "MATCH"
    | "MISSING"
    | "DOSE_MISMATCH"
    | "MISSING_AND_DOSE_MISMATCH";
};

class ReconcileListsTool implements IMcpTool {
  registerTool(server: McpServer, _req: Request) {
    server.registerTool(
      "reconcile_lists",
      {
        description:
          "Reconciles medication lists from multiple sources (e.g. hospital, pharmacy, patient self-report). " +
          "Normalizes drug names, groups by medication, and flags discrepancies: " +
          "drugs missing from some sources, dose differences between sources. " +
          "Essential for safe care transitions.",
        inputSchema: {
          lists_json: z
            .string()
            .describe(
              "JSON string containing an array of medication lists from different sources. " +
              'Format: [{"source": "Hospital EHR", "medications": [{"name": "metformin 500mg", "dose": "500mg BID"}]}, ...]. ' +
              "Each source must have a 'source' label and 'medications' array with 'name' and optional 'dose'.",
            ),
        },
      },
      async ({ lists_json }) => {
        if (!lists_json || lists_json.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No lists_json provided. Please provide a JSON array of medication lists.",
            { isError: true },
          );
        }

        // Parse the input JSON
        let sourceLists: SourceList[];
        try {
          sourceLists = JSON.parse(lists_json);
        } catch {
          return McpUtilities.createTextResponse(
            "Error: Invalid JSON in lists_json. Expected a JSON array of " +
              '{source: string, medications: [{name: string, dose?: string}]}.',
            { isError: true },
          );
        }

        if (!Array.isArray(sourceLists) || sourceLists.length < 2) {
          return McpUtilities.createTextResponse(
            "Error: At least 2 source lists are required for reconciliation. " +
              `Received ${Array.isArray(sourceLists) ? sourceLists.length : 0} list(s).`,
            { isError: true },
          );
        }

        // Validate structure
        for (const list of sourceLists) {
          if (!list.source || !Array.isArray(list.medications)) {
            return McpUtilities.createTextResponse(
              "Error: Each source list must have a 'source' string and 'medications' array. " +
                `Invalid list: ${JSON.stringify(list).substring(0, 200)}`,
              { isError: true },
            );
          }
        }

        const allSources = sourceLists.map((l) => l.source);

        // Group medications by normalized name
        const drugMap = new Map<
          string,
          {
            source: string;
            original_name: string;
            dose: string | undefined;
          }[]
        >();

        for (const list of sourceLists) {
          for (const med of list.medications) {
            const normalized = normalizeDrugName(med.name);
            if (!normalized) continue;

            const entries = drugMap.get(normalized) || [];
            entries.push({
              source: list.source,
              original_name: med.name,
              dose: med.dose,
            });
            drugMap.set(normalized, entries);
          }
        }

        // Reconcile each drug
        const reconciled: ReconciledDrug[] = [];
        let matchCount = 0;
        let missingCount = 0;
        let doseMismatchCount = 0;

        for (const [normalizedName, entries] of drugMap) {
          const presentSources = new Set(entries.map((e) => e.source));
          const missingFrom = allSources.filter(
            (s) => !presentSources.has(s),
          );
          const presentInAll = missingFrom.length === 0;

          // Check dose discrepancy
          const dosesWithValues = entries
            .filter((e) => e.dose)
            .map((e) => ({
              source: e.source,
              dose: e.dose!.toLowerCase().trim(),
            }));

          let doseDiscrepancy = false;
          let doseDetails: string | undefined;

          if (dosesWithValues.length >= 2) {
            const uniqueDoses = new Set(
              dosesWithValues.map((d) => d.dose),
            );
            if (uniqueDoses.size > 1) {
              doseDiscrepancy = true;
              doseDetails = dosesWithValues
                .map((d) => `${d.source}: ${d.dose}`)
                .join(" vs ");
            }
          }

          let flag: ReconciledDrug["flag"];
          if (presentInAll && !doseDiscrepancy) {
            flag = "MATCH";
            matchCount++;
          } else if (!presentInAll && doseDiscrepancy) {
            flag = "MISSING_AND_DOSE_MISMATCH";
            missingCount++;
            doseMismatchCount++;
          } else if (!presentInAll) {
            flag = "MISSING";
            missingCount++;
          } else {
            flag = "DOSE_MISMATCH";
            doseMismatchCount++;
          }

          reconciled.push({
            normalized_name: normalizedName,
            sources: entries,
            present_in_all: presentInAll,
            missing_from: missingFrom,
            dose_discrepancy: doseDiscrepancy,
            dose_details: doseDetails,
            flag,
          });
        }

        // Sort: discrepancies first, then matches
        const flagOrder: Record<string, number> = {
          MISSING_AND_DOSE_MISMATCH: 0,
          MISSING: 1,
          DOSE_MISMATCH: 2,
          MATCH: 3,
        };

        reconciled.sort(
          (a, b) =>
            (flagOrder[a.flag] ?? 99) - (flagOrder[b.flag] ?? 99),
        );

        const hasDiscrepancies =
          missingCount > 0 || doseMismatchCount > 0;

        return McpUtilities.createJsonResponse({
          status: "success",
          sources: allSources,
          total_unique_medications: drugMap.size,
          summary: {
            matching: matchCount,
            missing_from_source: missingCount,
            dose_mismatches: doseMismatchCount,
            has_discrepancies: hasDiscrepancies,
          },
          reconciled_list: reconciled,
          disclaimer:
            "Medication reconciliation is a clinical process. " +
            "This tool identifies potential discrepancies but does not determine which list is correct. " +
            "All flagged items should be reviewed by a healthcare professional with the patient.",
        });
      },
    );
  }
}

export const ReconcileListsToolInstance = new ReconcileListsTool();
