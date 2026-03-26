import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import axios from "axios";
import { IMcpTool, DrugInteraction } from "../types.js";
import { McpUtilities } from "../mcp-utilities.js";

/**
 * Known critical drug-drug interactions database.
 * This is a curated subset of clinically significant interactions for demo purposes.
 * In production, this would be replaced by a full drug interaction database.
 *
 * Sources: FDA drug labels, clinical pharmacology references.
 * Format: normalized lowercase drug names -> interaction details.
 */
const KNOWN_INTERACTIONS: {
  drugs: [string, string];
  severity: string;
  description: string;
}[] = [
  {
    drugs: ["warfarin", "ibuprofen"],
    severity: "SEVERE",
    description:
      "Concurrent use increases bleeding risk significantly. NSAIDs inhibit platelet function and may increase warfarin levels. Can cause serious GI bleeding.",
  },
  {
    drugs: ["warfarin", "aspirin"],
    severity: "SEVERE",
    description:
      "Increased risk of bleeding. Aspirin inhibits platelet aggregation and can displace warfarin from protein binding sites.",
  },
  {
    drugs: ["warfarin", "naproxen"],
    severity: "SEVERE",
    description:
      "NSAIDs increase bleeding risk with warfarin. Naproxen inhibits platelet function and may potentiate anticoagulant effect.",
  },
  {
    drugs: ["warfarin", "amiodarone"],
    severity: "SEVERE",
    description:
      "Amiodarone significantly increases warfarin levels by inhibiting CYP2C9. Dose reduction of warfarin by 30-50% is typically needed.",
  },
  {
    drugs: ["warfarin", "fluconazole"],
    severity: "SEVERE",
    description:
      "Fluconazole inhibits CYP2C9 and CYP3A4, significantly increasing warfarin levels and bleeding risk.",
  },
  {
    drugs: ["metformin", "lisinopril"],
    severity: "MODERATE",
    description:
      "ACE inhibitors may enhance hypoglycemic effect of metformin. Monitor blood glucose levels, particularly when starting or adjusting doses.",
  },
  {
    drugs: ["lisinopril", "potassium"],
    severity: "SEVERE",
    description:
      "ACE inhibitors reduce aldosterone secretion, which can cause hyperkalemia. Concurrent potassium supplementation increases risk of dangerous hyperkalemia.",
  },
  {
    drugs: ["lisinopril", "spironolactone"],
    severity: "SEVERE",
    description:
      "Both ACE inhibitors and spironolactone can increase potassium levels. Combined use significantly increases hyperkalemia risk.",
  },
  {
    drugs: ["metoprolol", "verapamil"],
    severity: "SEVERE",
    description:
      "Concurrent use can cause severe bradycardia, heart block, and heart failure. Both drugs depress cardiac conduction.",
  },
  {
    drugs: ["metoprolol", "amlodipine"],
    severity: "MODERATE",
    description:
      "Combined use may cause additive hypotension and bradycardia. Monitor blood pressure and heart rate closely.",
  },
  {
    drugs: ["amlodipine", "simvastatin"],
    severity: "MODERATE",
    description:
      "Amlodipine increases simvastatin levels via CYP3A4 inhibition. Simvastatin dose should not exceed 20mg daily when used with amlodipine.",
  },
  {
    drugs: ["metformin", "contrast dye"],
    severity: "SEVERE",
    description:
      "Iodinated contrast media can cause acute kidney injury, which impairs metformin clearance and can cause lactic acidosis. Hold metformin 48 hours before and after contrast administration.",
  },
  {
    drugs: ["clopidogrel", "omeprazole"],
    severity: "MODERATE",
    description:
      "Omeprazole inhibits CYP2C19, reducing the activation of clopidogrel and its antiplatelet effect. Consider using pantoprazole instead.",
  },
  {
    drugs: ["digoxin", "amiodarone"],
    severity: "SEVERE",
    description:
      "Amiodarone increases digoxin levels by 70-100%. Reduce digoxin dose by 50% when starting amiodarone and monitor levels.",
  },
  {
    drugs: ["lithium", "ibuprofen"],
    severity: "SEVERE",
    description:
      "NSAIDs reduce renal clearance of lithium, potentially causing lithium toxicity. Monitor lithium levels closely.",
  },
  {
    drugs: ["ssri", "tramadol"],
    severity: "SEVERE",
    description:
      "Combined use increases risk of serotonin syndrome. Symptoms include agitation, hyperthermia, tachycardia, and muscle rigidity.",
  },
  {
    drugs: ["sertraline", "tramadol"],
    severity: "SEVERE",
    description:
      "Combined use increases risk of serotonin syndrome due to additive serotonergic effects.",
  },
  {
    drugs: ["fluoxetine", "tramadol"],
    severity: "SEVERE",
    description:
      "Combined use increases risk of serotonin syndrome and may lower seizure threshold.",
  },
  {
    drugs: ["methotrexate", "trimethoprim"],
    severity: "SEVERE",
    description:
      "Both drugs inhibit dihydrofolate reductase. Combined use increases risk of bone marrow suppression and pancytopenia.",
  },
  {
    drugs: ["ciprofloxacin", "theophylline"],
    severity: "SEVERE",
    description:
      "Ciprofloxacin inhibits CYP1A2, significantly increasing theophylline levels. Risk of theophylline toxicity (seizures, arrhythmias).",
  },
  {
    drugs: ["apixaban", "aspirin"],
    severity: "MODERATE",
    description:
      "Concurrent use of apixaban with aspirin increases bleeding risk. Assess risk-benefit carefully. Dual therapy may be appropriate post-ACS but monitor closely.",
  },
  {
    drugs: ["apixaban", "ibuprofen"],
    severity: "SEVERE",
    description:
      "NSAIDs increase bleeding risk with apixaban. Avoid concurrent use if possible. If necessary, use the lowest effective NSAID dose for the shortest duration.",
  },
  {
    drugs: ["apixaban", "naproxen"],
    severity: "SEVERE",
    description:
      "NSAIDs increase bleeding risk with direct oral anticoagulants including apixaban.",
  },
  {
    drugs: ["metronidazole", "warfarin"],
    severity: "SEVERE",
    description:
      "Metronidazole inhibits CYP2C9, increasing warfarin levels and bleeding risk. Monitor INR closely and consider warfarin dose reduction.",
  },
  {
    drugs: ["atorvastatin", "amlodipine"],
    severity: "MODERATE",
    description:
      "Amlodipine may increase atorvastatin exposure via CYP3A4 inhibition. Atorvastatin dose should not exceed 80mg daily.",
  },
  {
    drugs: ["digoxin", "verapamil"],
    severity: "SEVERE",
    description:
      "Verapamil increases digoxin levels by 50-75% and both drugs slow AV conduction. Combined use can cause severe bradycardia, heart block, and digoxin toxicity.",
  },
  {
    drugs: ["fluoxetine", "monoamine oxidase inhibitor"],
    severity: "SEVERE",
    description:
      "Contraindicated. Combined SSRI + MAOI can cause fatal serotonin syndrome. At least 5 weeks washout required after stopping fluoxetine before starting an MAOI.",
  },
  {
    drugs: ["sertraline", "monoamine oxidase inhibitor"],
    severity: "SEVERE",
    description:
      "Contraindicated. SSRI + MAOI combination can cause fatal serotonin syndrome. At least 2 weeks washout required.",
  },
  {
    drugs: ["morphine", "benzodiazepine"],
    severity: "SEVERE",
    description:
      "FDA black box warning. Concurrent opioid and benzodiazepine use increases risk of respiratory depression, sedation, coma, and death.",
  },
  {
    drugs: ["morphine", "diazepam"],
    severity: "SEVERE",
    description:
      "FDA black box warning. Concurrent opioid and benzodiazepine use increases risk of respiratory depression, sedation, coma, and death.",
  },
  {
    drugs: ["morphine", "lorazepam"],
    severity: "SEVERE",
    description:
      "FDA black box warning. Concurrent opioid and benzodiazepine use increases risk of respiratory depression, sedation, coma, and death.",
  },
  {
    drugs: ["fentanyl", "benzodiazepine"],
    severity: "SEVERE",
    description:
      "FDA black box warning. Concurrent opioid and benzodiazepine use increases risk of respiratory depression, sedation, coma, and death.",
  },
  {
    drugs: ["ceftriaxone", "calcium"],
    severity: "SEVERE",
    description:
      "Ceftriaxone and calcium-containing IV solutions can form insoluble precipitates. Contraindicated in neonates. In adults, do not administer simultaneously through the same IV line.",
  },
  {
    drugs: ["methotrexate", "nsaid"],
    severity: "SEVERE",
    description:
      "NSAIDs reduce renal clearance of methotrexate, potentially causing fatal methotrexate toxicity with bone marrow suppression and renal failure.",
  },
  {
    drugs: ["methotrexate", "naproxen"],
    severity: "SEVERE",
    description:
      "Naproxen reduces renal clearance of methotrexate, potentially causing fatal toxicity with bone marrow suppression and renal failure. All NSAIDs carry this risk.",
  },
  {
    drugs: ["simvastatin", "clarithromycin"],
    severity: "SEVERE",
    description:
      "Clarithromycin is a strong CYP3A4 inhibitor that dramatically increases simvastatin levels. Risk of rhabdomyolysis (muscle breakdown), acute kidney injury. Contraindicated combination.",
  },
  {
    drugs: ["lithium", "lisinopril"],
    severity: "MODERATE",
    description:
      "ACE inhibitors reduce renal lithium clearance, potentially increasing lithium levels by 25-35%. Monitor lithium levels closely and adjust dose if needed.",
  },
  {
    drugs: ["lithium", "naproxen"],
    severity: "SEVERE",
    description:
      "NSAIDs reduce renal clearance of lithium, potentially causing lithium toxicity. Naproxen can increase lithium levels by 15-30%.",
  },
  {
    drugs: ["carbidopa", "metoclopramide"],
    severity: "SEVERE",
    description:
      "Metoclopramide is a dopamine antagonist that directly opposes the therapeutic effect of levodopa/carbidopa. Can worsen Parkinson's symptoms and cause extrapyramidal effects.",
  },
  {
    drugs: ["levodopa", "metoclopramide"],
    severity: "SEVERE",
    description:
      "Metoclopramide blocks dopamine receptors, directly antagonizing levodopa's mechanism of action. Contraindicated in Parkinson's disease.",
  },
  {
    drugs: ["prednisone", "naproxen"],
    severity: "MODERATE",
    description:
      "Concurrent corticosteroid and NSAID use significantly increases risk of GI bleeding and peptic ulceration. Add GI protection if combination is necessary.",
  },
  {
    drugs: ["prednisone", "ibuprofen"],
    severity: "MODERATE",
    description:
      "Combined corticosteroid and NSAID therapy increases risk of GI bleeding. Consider adding a proton pump inhibitor for GI protection.",
  },
  {
    drugs: ["valproic acid", "lamotrigine"],
    severity: "MODERATE",
    description:
      "Valproic acid inhibits lamotrigine glucuronidation, doubling lamotrigine levels. Lamotrigine dose must be reduced by 50% when adding valproic acid. Risk of Stevens-Johnson syndrome with elevated levels.",
  },
  {
    drugs: ["warfarin", "clopidogrel"],
    severity: "SEVERE",
    description:
      "Triple antithrombotic therapy (warfarin + clopidogrel + aspirin) dramatically increases major bleeding risk. Reassess need for all three agents.",
  },
  {
    drugs: ["sertraline", "trazodone"],
    severity: "MODERATE",
    description:
      "Both drugs have serotonergic activity. Combined use may increase risk of serotonin syndrome. Monitor for agitation, confusion, tachycardia.",
  },
];

/**
 * Normalize drug name for matching.
 * Strips dose info, route, frequency, common suffixes. Converts to lowercase.
 */
function normalizeDrugName(name: string): string {
  return name
    .toLowerCase()
    // Remove dose info like "5mg", "81mg daily", "500 mg", "1mg IV", "1L IV"
    .replace(/\s*\d+\.?\d*\s*(mg|mcg|g|ml|l|units?|iu)\b.*/i, "")
    // Remove route abbreviations
    .replace(/\s+(iv|im|sq|sc|po|pr|sl|td|top|inh|neb)\b.*/i, "")
    // Remove frequency terms
    .replace(/\s+(bid|tid|qid|qd|daily|prn|qhs|qam|qpm|once|twice)\b.*/i, "")
    // Remove salt forms
    .replace(/\s+(sodium|potassium|hydrochloride|hcl|sulfate|acetate|tartrate|succinate|besylate|maleate|fumarate|mesylate|calcium)\b/gi, "")
    .trim();
}

/**
 * Check the curated interaction database for matches.
 */
function checkKnownInteractions(drugNames: string[]): DrugInteraction[] {
  const normalized = drugNames.map(normalizeDrugName);
  const interactions: DrugInteraction[] = [];

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const drug1 = normalized[i];
      const drug2 = normalized[j];

      for (const known of KNOWN_INTERACTIONS) {
        const [kd1, kd2] = known.drugs;
        if (
          (drug1.includes(kd1) && drug2.includes(kd2)) ||
          (drug1.includes(kd2) && drug2.includes(kd1))
        ) {
          interactions.push({
            drug1: drugNames[i],
            drug2: drugNames[j],
            severity: known.severity,
            description: known.description,
            source: "MedRecon Clinical Database",
          });
        }
      }
    }
  }

  return interactions;
}

/**
 * Query OpenFDA for drug interaction information.
 * Searches drug label data for interaction text mentioning both drugs.
 */
async function checkOpenFdaInteractions(
  drug1: string,
  drug2: string,
): Promise<DrugInteraction | null> {
  try {
    const response = await axios.get(
      "https://api.fda.gov/drug/label.json",
      {
        params: {
          search: `drug_interactions:"${drug1}" AND drug_interactions:"${drug2}"`,
          limit: 1,
        },
        timeout: 10000,
      },
    );

    if (
      response.data?.results?.[0]?.drug_interactions?.[0]
    ) {
      const interactionText = response.data.results[0].drug_interactions[0];
      // Extract a relevant snippet (first 500 chars)
      const snippet = interactionText.substring(0, 500);

      return {
        drug1,
        drug2,
        severity: "CHECK",
        description: snippet,
        source: "OpenFDA Drug Label",
      };
    }

    return null;
  } catch {
    return null;
  }
}

class CheckInteractionsTool implements IMcpTool {
  registerTool(server: McpServer, req: Request) {
    server.registerTool(
      "check_interactions",
      {
        description:
          "Checks for drug-drug interactions in a list of medications. " +
          "Uses a curated clinical interaction database and OpenFDA drug labels. " +
          "Returns interaction pairs with severity levels (SEVERE, MODERATE, MILD) and descriptions.",
        inputSchema: {
          drug_names: z
            .string()
            .describe(
              "Comma-separated list of drug names to check for interactions. " +
              'Example: "warfarin, ibuprofen, lisinopril, metformin"',
            ),
          include_openfda: z
            .string()
            .describe(
              "Whether to also search OpenFDA drug labels for additional interactions. " +
              "'true' or 'false'. Defaults to 'true'. Set to 'false' for faster results.",
            )
            .optional(),
        },
      },
      async ({ drug_names, include_openfda }) => {
        if (!drug_names || drug_names.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No drug names provided. Please provide a comma-separated list of drug names.",
            { isError: true },
          );
        }

        const drugs = drug_names
          .split(",")
          .map((d: string) => d.trim())
          .filter((d: string) => d.length > 0);

        if (drugs.length < 2) {
          return McpUtilities.createTextResponse(
            "Error: At least 2 drugs are required to check for interactions. " +
              `Only received: ${drugs.join(", ")}`,
            { isError: true },
          );
        }

        // Check curated database first
        const knownInteractions = checkKnownInteractions(drugs);

        // Optionally check OpenFDA for additional interactions
        const fdaInteractions: DrugInteraction[] = [];
        const shouldCheckFda =
          include_openfda !== "false";

        if (shouldCheckFda) {
          // Check pairs not already found in known interactions
          const checkedPairs = new Set(
            knownInteractions.map(
              (i) =>
                `${normalizeDrugName(i.drug1)}|${normalizeDrugName(i.drug2)}`,
            ),
          );

          const promises: Promise<DrugInteraction | null>[] = [];
          for (let i = 0; i < drugs.length && i < 10; i++) {
            for (let j = i + 1; j < drugs.length && j < 10; j++) {
              const pairKey = `${normalizeDrugName(drugs[i])}|${normalizeDrugName(drugs[j])}`;
              const reversePairKey = `${normalizeDrugName(drugs[j])}|${normalizeDrugName(drugs[i])}`;
              if (
                !checkedPairs.has(pairKey) &&
                !checkedPairs.has(reversePairKey)
              ) {
                promises.push(checkOpenFdaInteractions(drugs[i], drugs[j]));
              }
            }
          }

          const results = await Promise.allSettled(promises);
          for (const result of results) {
            if (
              result.status === "fulfilled" &&
              result.value
            ) {
              fdaInteractions.push(result.value);
            }
          }
        }

        const allInteractions = [
          ...knownInteractions,
          ...fdaInteractions,
        ];

        // Sort by severity
        const severityOrder: Record<string, number> = {
          SEVERE: 0,
          MODERATE: 1,
          CHECK: 2,
          MILD: 3,
        };

        allInteractions.sort(
          (a, b) =>
            (severityOrder[a.severity] ?? 99) -
            (severityOrder[b.severity] ?? 99),
        );

        const severeCount = allInteractions.filter(
          (i) => i.severity === "SEVERE",
        ).length;
        const moderateCount = allInteractions.filter(
          (i) => i.severity === "MODERATE",
        ).length;

        return McpUtilities.createJsonResponse({
          status: "success",
          drugs_checked: drugs,
          total_pairs_checked: (drugs.length * (drugs.length - 1)) / 2,
          interactions_found: allInteractions.length,
          severe_count: severeCount,
          moderate_count: moderateCount,
          interactions: allInteractions,
          disclaimer:
            "This is a clinical decision support tool. All interactions should be reviewed by a qualified healthcare professional. " +
            "This tool does not replace clinical judgment.",
        });
      },
    );
  }
}

export const CheckInteractionsToolInstance =
  new CheckInteractionsTool();
