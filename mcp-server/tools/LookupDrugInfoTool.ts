import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import axios from "axios";
import https from "https";
import { IMcpTool } from "../types.js";
import { McpUtilities } from "../mcp-utilities.js";

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

/**
 * Force IPv4 for RxNorm requests.
 * NLM servers advertise IPv6 AAAA records but IPv6 connectivity
 * may not be available, causing ETIMEDOUT errors in Node.js.
 */
const ipv4Agent = new https.Agent({ family: 4 });

/**
 * Look up the RxCUI for a drug name via RxNorm.
 */
async function lookupRxCui(
  drugName: string,
): Promise<{ rxcui: string; name: string } | null> {
  try {
    const response = await axios.get(`${RXNORM_BASE}/rxcui.json`, {
      params: { name: drugName },
      timeout: 10000,
      httpsAgent: ipv4Agent,
    });

    const group = response.data?.idGroup;
    if (group?.rxnormId?.length > 0) {
      return {
        rxcui: group.rxnormId[0],
        name: group.name || drugName,
      };
    }

    // Try approximate match if exact fails
    const approxResponse = await axios.get(
      `${RXNORM_BASE}/approximateTerm.json`,
      {
        params: { term: drugName, maxEntries: 1 },
        timeout: 10000,
        httpsAgent: ipv4Agent,
      },
    );

    const candidates =
      approxResponse.data?.approximateGroup?.candidate;
    if (candidates?.length > 0) {
      return {
        rxcui: candidates[0].rxcui,
        name: candidates[0].name || drugName,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch all related concepts for a given RxCUI.
 * Returns drug class, brand names, generic names, and dosage forms.
 */
async function fetchRelatedInfo(rxcui: string): Promise<{
  drugClasses: string[];
  brandNames: string[];
  genericNames: string[];
  dosageForms: string[];
}> {
  const result = {
    drugClasses: [] as string[],
    brandNames: [] as string[],
    genericNames: [] as string[],
    dosageForms: [] as string[],
  };

  try {
    const response = await axios.get(
      `${RXNORM_BASE}/rxcui/${rxcui}/allrelated.json`,
      { timeout: 10000, httpsAgent: ipv4Agent },
    );

    const groups =
      response.data?.allRelatedGroup?.conceptGroup || [];

    for (const group of groups) {
      const concepts = group.conceptProperties || [];
      const names = concepts.map((c: any) => c.name).filter(Boolean);

      switch (group.tty) {
        case "BN": // Brand Name
          result.brandNames.push(...names);
          break;
        case "IN": // Ingredient (generic)
        case "MIN": // Multiple Ingredients
          result.genericNames.push(...names);
          break;
        case "DF": // Dose Form
        case "DFG": // Dose Form Group
          result.dosageForms.push(...names);
          break;
      }
    }
  } catch {
    // Non-fatal: related info is supplementary
  }

  // Fetch drug class separately via rxclass
  try {
    const classResponse = await axios.get(
      `${RXNORM_BASE}/../REST/rxclass/class/byRxcui.json`,
      {
        params: { rxcui, relaSource: "ATC" },
        timeout: 10000,
        httpsAgent: ipv4Agent,
      },
    );

    const classEntries =
      classResponse.data?.rxclassDrugInfoList?.rxclassDrugInfo || [];
    for (const entry of classEntries) {
      const className = entry.rxclassMinConceptItem?.className;
      if (className && !result.drugClasses.includes(className)) {
        result.drugClasses.push(className);
      }
    }
  } catch {
    // ATC class lookup is optional
  }

  return result;
}

class LookupDrugInfoTool implements IMcpTool {
  registerTool(server: McpServer, _req: Request) {
    server.registerTool(
      "lookup_drug_info",
      {
        description:
          "Looks up drug information using the RxNorm API. " +
          "Returns RxCUI identifier, drug class (ATC), brand/generic names, and dosage forms. " +
          "Useful for drug identification, classification, and finding equivalent formulations.",
        inputSchema: {
          drug_name: z
            .string()
            .describe(
              "The name of the drug to look up. Can be a brand name or generic name. " +
              'Example: "metformin" or "Lipitor"',
            ),
        },
      },
      async ({ drug_name }) => {
        if (!drug_name || drug_name.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No drug name provided. Please provide a drug name to look up.",
            { isError: true },
          );
        }

        const trimmedName = drug_name.trim();

        // Step 1: Look up RxCUI
        const rxcuiResult = await lookupRxCui(trimmedName);

        if (!rxcuiResult) {
          return McpUtilities.createJsonResponse({
            status: "not_found",
            drug_name: trimmedName,
            message: `No RxNorm entry found for "${trimmedName}". Check spelling or try a different name form (generic/brand).`,
          });
        }

        // Step 2: Fetch related information
        const related = await fetchRelatedInfo(rxcuiResult.rxcui);

        return McpUtilities.createJsonResponse({
          status: "success",
          drug_name: trimmedName,
          rxcui: rxcuiResult.rxcui,
          normalized_name: rxcuiResult.name,
          drug_classes: related.drugClasses,
          brand_names: related.brandNames.slice(0, 10),
          generic_names: related.genericNames.slice(0, 5),
          dosage_forms: related.dosageForms.slice(0, 10),
          source: "RxNorm (NLM)",
          disclaimer:
            "Drug information is sourced from NLM RxNorm. " +
            "Verify all clinical details with authoritative drug references.",
        });
      },
    );
  }
}

export const LookupDrugInfoToolInstance = new LookupDrugInfoTool();
