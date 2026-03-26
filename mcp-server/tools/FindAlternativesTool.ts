import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";
import { z } from "zod";
import axios from "axios";
import https from "https";
import { IMcpTool } from "../types.js";
import { McpUtilities } from "../mcp-utilities.js";

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";

/**
 * Force IPv4 for RxNorm/RxClass requests.
 * NLM servers advertise IPv6 AAAA records but IPv6 connectivity
 * may not be available, causing ETIMEDOUT errors in Node.js.
 */
const ipv4Agent = new https.Agent({ family: 4 });

/**
 * Look up the ATC therapeutic class(es) for a drug name via RxClass.
 * Returns class IDs that can be used to find other members.
 */
async function getTherapeuticClasses(
  drugName: string,
): Promise<{ classId: string; className: string }[]> {
  try {
    const response = await axios.get(
      `${RXNAV_BASE}/../REST/rxclass/class/byDrugName.json`,
      {
        params: { drugName, relaSource: "ATC" },
        timeout: 10000,
        httpsAgent: ipv4Agent,
      },
    );

    const entries =
      response.data?.rxclassDrugInfoList?.rxclassDrugInfo || [];
    const seen = new Set<string>();
    const classes: { classId: string; className: string }[] = [];

    for (const entry of entries) {
      const item = entry.rxclassMinConceptItem;
      if (item?.classId && !seen.has(item.classId)) {
        seen.add(item.classId);
        classes.push({
          classId: item.classId,
          className: item.className,
        });
      }
    }

    return classes;
  } catch {
    return [];
  }
}

/**
 * Get drugs that belong to a given ATC class.
 * Returns up to `limit` drug names (excluding the original drug).
 */
async function getClassMembers(
  classId: string,
  excludeDrug: string,
  limit: number,
): Promise<string[]> {
  try {
    const response = await axios.get(
      `${RXNAV_BASE}/../REST/rxclass/classMembers.json`,
      {
        params: { classId, relaSource: "ATC" },
        timeout: 10000,
        httpsAgent: ipv4Agent,
      },
    );

    const members =
      response.data?.drugMemberGroup?.drugMember || [];
    const normalizedExclude = excludeDrug.toLowerCase();
    const names: string[] = [];
    const seen = new Set<string>();

    for (const member of members) {
      const name = member.minConcept?.name;
      if (!name) continue;

      const normalizedName = name.toLowerCase();
      if (
        normalizedName === normalizedExclude ||
        normalizedName.includes(normalizedExclude) ||
        normalizedExclude.includes(normalizedName)
      ) {
        continue;
      }

      if (!seen.has(normalizedName)) {
        seen.add(normalizedName);
        names.push(name);
      }

      if (names.length >= limit) break;
    }

    return names;
  } catch {
    return [];
  }
}

class FindAlternativesTool implements IMcpTool {
  registerTool(server: McpServer, _req: Request) {
    server.registerTool(
      "find_alternatives",
      {
        description:
          "Finds therapeutic alternatives for a drug using RxNorm ATC classification. " +
          "Identifies drugs in the same therapeutic class that could serve as substitutes. " +
          "Useful for allergy-safe alternatives, formulary substitutions, or cost-effective options.",
        inputSchema: {
          drug_name: z
            .string()
            .describe(
              "The name of the drug to find alternatives for. " +
              'Example: "atorvastatin" or "Lipitor"',
            ),
          max_results: z
            .string()
            .describe(
              "Maximum number of alternatives to return. Defaults to '10'. Max '25'.",
            )
            .optional(),
        },
      },
      async ({ drug_name, max_results }) => {
        if (!drug_name || drug_name.trim().length === 0) {
          return McpUtilities.createTextResponse(
            "Error: No drug name provided. Please provide a drug name to find alternatives for.",
            { isError: true },
          );
        }

        const trimmedName = drug_name.trim();
        const limit = Math.min(
          Math.max(parseInt(max_results || "10", 10) || 10, 1),
          25,
        );

        // Step 1: Find therapeutic classes
        const classes = await getTherapeuticClasses(trimmedName);

        if (classes.length === 0) {
          return McpUtilities.createJsonResponse({
            status: "no_class_found",
            drug_name: trimmedName,
            alternatives: [],
            message: `No ATC therapeutic class found for "${trimmedName}". ` +
              "Try using the generic drug name.",
          });
        }

        // Step 2: Get members from each class (use first 3 classes max)
        const alternativesByClass: {
          class_name: string;
          class_id: string;
          alternatives: string[];
        }[] = [];

        const classesToCheck = classes.slice(0, 3);
        const promises = classesToCheck.map((cls) =>
          getClassMembers(cls.classId, trimmedName, limit),
        );

        const results = await Promise.allSettled(promises);

        for (let i = 0; i < classesToCheck.length; i++) {
          const cls = classesToCheck[i];
          const result = results[i];
          const members =
            result.status === "fulfilled" ? result.value : [];

          if (members.length > 0) {
            alternativesByClass.push({
              class_name: cls.className,
              class_id: cls.classId,
              alternatives: members.slice(0, limit),
            });
          }
        }

        // Flatten unique alternatives across all classes
        const allAlternatives = new Set<string>();
        for (const group of alternativesByClass) {
          for (const alt of group.alternatives) {
            allAlternatives.add(alt);
          }
        }

        return McpUtilities.createJsonResponse({
          status: "success",
          drug_name: trimmedName,
          therapeutic_classes: classes.map((c) => c.className),
          total_alternatives_found: allAlternatives.size,
          alternatives_by_class: alternativesByClass,
          all_unique_alternatives: [...allAlternatives].slice(0, limit),
          source: "RxNorm ATC Classification (NLM)",
          disclaimer:
            "Therapeutic alternatives are based on ATC drug classification. " +
            "Clinical equivalence must be assessed by a healthcare professional. " +
            "Dosing, contraindications, and patient-specific factors must be considered.",
        });
      },
    );
  }
}

export const FindAlternativesToolInstance = new FindAlternativesTool();
