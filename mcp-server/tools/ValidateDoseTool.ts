import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import { IMcpTool } from "../types.js";
import { McpUtilities } from "../mcp-utilities.js";

/**
 * Curated dose ranges for common medications.
 * Values represent typical adult dose ranges in mg (total daily dose).
 *
 * Sources: FDA-approved labeling, clinical pharmacology references.
 * This is a subset for demonstration; production would use a full drug database.
 */
const DOSE_RANGES: Record<
  string,
  { min: number; max: number; unit: string; notes: string }
> = {
  metformin: {
    min: 500,
    max: 2550,
    unit: "mg",
    notes:
      "Typical starting dose 500mg BID; max 2550mg/day (IR) or 2000mg/day (ER)",
  },
  lisinopril: {
    min: 2.5,
    max: 40,
    unit: "mg",
    notes:
      "Start 2.5-5mg daily for heart failure, 10mg for hypertension; max 40mg/day",
  },
  atorvastatin: {
    min: 10,
    max: 80,
    unit: "mg",
    notes: "Start 10-20mg daily; high-intensity therapy 40-80mg/day",
  },
  warfarin: {
    min: 1,
    max: 10,
    unit: "mg",
    notes:
      "Highly variable; dose guided by INR. Typical maintenance 2-5mg/day",
  },
  metoprolol: {
    min: 25,
    max: 200,
    unit: "mg",
    notes: "IR: 25-100mg BID; ER (Toprol XL): 25-200mg daily",
  },
  aspirin: {
    min: 75,
    max: 325,
    unit: "mg",
    notes: "Low-dose cardioprotection 75-100mg; analgesic 325-1000mg",
  },
  apixaban: {
    min: 2.5,
    max: 10,
    unit: "mg",
    notes:
      "VTE treatment: 10mg BID x7d then 5mg BID; AF: 5mg BID (2.5mg BID if reduced dose criteria)",
  },
  amlodipine: {
    min: 2.5,
    max: 10,
    unit: "mg",
    notes:
      "Start 5mg daily; max 10mg/day. Start 2.5mg in elderly or hepatic impairment",
  },
  omeprazole: {
    min: 10,
    max: 40,
    unit: "mg",
    notes:
      "GERD: 20mg daily; erosive esophagitis: 20-40mg daily; maintenance: 10-20mg",
  },
  sertraline: {
    min: 25,
    max: 200,
    unit: "mg",
    notes:
      "Start 25-50mg daily; titrate by 25-50mg at weekly intervals; max 200mg/day",
  },
  losartan: {
    min: 25,
    max: 100,
    unit: "mg",
    notes:
      "Start 50mg daily (25mg if volume-depleted); max 100mg/day",
  },
  furosemide: {
    min: 20,
    max: 600,
    unit: "mg",
    notes:
      "Oral: 20-80mg/dose; may increase by 20-40mg; max 600mg/day in severe edema",
  },
  gabapentin: {
    min: 300,
    max: 3600,
    unit: "mg",
    notes:
      "Start 300mg day 1, titrate over days; max 3600mg/day in 3 divided doses",
  },
  amoxicillin: {
    min: 750,
    max: 3000,
    unit: "mg",
    notes:
      "250-500mg TID or 500-875mg BID; high-dose 1000mg TID for resistant infections",
  },
  prednisone: {
    min: 1,
    max: 80,
    unit: "mg",
    notes:
      "Highly variable by indication. Low-dose: 1-10mg; pulse: 40-80mg",
  },
  morphine: {
    min: 15,
    max: 200,
    unit: "mg",
    notes:
      "Oral IR: 15-30mg q4h; ER: 15-200mg q12h. Opioid-naive start low",
  },
  verapamil: {
    min: 120,
    max: 480,
    unit: "mg",
    notes: "IR: 80-120mg TID; SR: 120-480mg daily. For SVT, HTN, angina",
  },
  ceftriaxone: {
    min: 1000,
    max: 4000,
    unit: "mg",
    notes:
      "1-2g IV/IM daily; severe infections up to 4g/day. Meningitis: 2g q12h",
  },
};

/**
 * Normalize a drug name for lookup against the dose range table.
 */
function normalizeDrugName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\s+(sodium|potassium|hydrochloride|hcl|sulfate|acetate|tartrate|succinate|besylate|maleate|fumarate|mesylate|calcium|citrate|phosphate)\b/gi,
      "",
    )
    .trim();
}

/**
 * Build a validation response with dose comparison and clinical context.
 */
function buildResponse(
  originalName: string,
  matchedName: string,
  doseValue: number,
  doseUnit: string,
  range: { min: number; max: number; unit: string; notes: string },
  isPartialMatch: boolean,
) {
  // Unit conversion check
  let effectiveDose = doseValue;
  let unitWarning: string | undefined;

  if (doseUnit !== range.unit) {
    if (doseUnit === "mcg" && range.unit === "mg") {
      effectiveDose = doseValue / 1000;
      unitWarning = `Converted ${doseValue}mcg to ${effectiveDose}mg for comparison.`;
    } else if (doseUnit === "g" && range.unit === "mg") {
      effectiveDose = doseValue * 1000;
      unitWarning = `Converted ${doseValue}g to ${effectiveDose}mg for comparison.`;
    } else {
      unitWarning = `Unit mismatch: provided ${doseUnit}, expected ${range.unit}. Comparing numeric values directly.`;
    }
  }

  let result: string;
  let severity: string;

  if (effectiveDose < range.min) {
    result = "below_range";
    severity = "WARNING";
  } else if (effectiveDose > range.max) {
    result = "above_range";
    severity = "ALERT";
  } else {
    result = "within_range";
    severity = "OK";
  }

  return McpUtilities.createJsonResponse({
    status: "success",
    drug_name: originalName.trim(),
    matched_drug: matchedName,
    is_partial_match: isPartialMatch,
    dose_value: doseValue,
    dose_unit: doseUnit,
    effective_dose: effectiveDose,
    effective_unit: range.unit,
    result,
    severity,
    range: {
      min: range.min,
      max: range.max,
      unit: range.unit,
    },
    clinical_notes: range.notes,
    unit_warning: unitWarning,
    disclaimer:
      "Dose ranges are for typical adult dosing. " +
      "Pediatric, geriatric, renal/hepatic impairment, and indication-specific dosing may differ. " +
      "Always verify with current drug references and clinical judgment.",
  });
}

class ValidateDoseTool implements IMcpTool {
  registerTool(server: McpServer, _req: Request) {
    server.registerTool(
      "validate_dose",
      {
        description:
          "Validates a medication dose against known safe dose ranges. " +
          "Checks if a given dose is within, below, or above the typical adult dose range. " +
          "Covers 18 commonly prescribed medications. Returns range status and clinical notes.",
        inputSchema: {
          drug_name: z
            .string()
            .describe(
              "The name of the drug to validate the dose for. " +
              'Example: "metformin" or "lisinopril"',
            ),
          dose_value: z
            .string()
            .describe(
              "The numeric dose value to validate. " +
              'Example: "500" or "2.5"',
            ),
          dose_unit: z
            .string()
            .describe(
              "The unit of the dose. Usually 'mg'. " +
              'Example: "mg" or "mcg"',
            ),
        },
      },
      async ({ drug_name, dose_value, dose_unit }) => {
        if (!drug_name || drug_name.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No drug name provided.",
            { isError: true },
          );
        }

        if (!dose_value || dose_value.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No dose value provided.",
            { isError: true },
          );
        }

        const numericDose = parseFloat(dose_value);
        if (isNaN(numericDose) || numericDose <= 0) {
          return McpUtilities.createTextResponse(
            `Error: Invalid dose value "${dose_value}". Must be a positive number.`,
            { isError: true },
          );
        }

        const normalizedName = normalizeDrugName(drug_name);
        const unit = (dose_unit || "mg").toLowerCase().trim();

        // Look up the drug in our curated ranges
        const range = DOSE_RANGES[normalizedName];

        if (!range) {
          // Check if any key partially matches
          const partialMatch = Object.keys(DOSE_RANGES).find(
            (key) =>
              normalizedName.includes(key) || key.includes(normalizedName),
          );

          if (partialMatch) {
            const matchedRange = DOSE_RANGES[partialMatch];
            return buildResponse(
              drug_name,
              partialMatch,
              numericDose,
              unit,
              matchedRange,
              true,
            );
          }

          return McpUtilities.createJsonResponse({
            status: "unknown_drug",
            drug_name: drug_name.trim(),
            dose_value: numericDose,
            dose_unit: unit,
            result: "unknown_drug",
            message:
              `"${drug_name.trim()}" is not in the curated dose range database. ` +
              "Dose validation is available for: " +
              Object.keys(DOSE_RANGES).join(", ") +
              ".",
            disclaimer:
              "Always verify doses against current drug references and patient-specific factors.",
          });
        }

        return buildResponse(
          drug_name,
          normalizedName,
          numericDose,
          unit,
          range,
          false,
        );
      },
    );
  }
}

export const ValidateDoseToolInstance = new ValidateDoseTool();
