import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Request } from "express";

/**
 * Interface that all MCP tools must implement.
 * Following the po-community-mcp pattern.
 */
export interface IMcpTool {
  registerTool: (server: McpServer, req: Request) => void;
}

/**
 * FHIR context extracted from request headers.
 * The Prompt Opinion platform sends these via SHARP on MCP headers.
 */
export type FhirContext = {
  url: string;
  token?: string;
  patientId?: string;
};

/**
 * Normalized medication entry from FHIR sources.
 */
export type NormalizedMedication = {
  name: string;
  dose?: string;
  frequency?: string;
  status?: string;
  prescriber?: string;
  authoredOn?: string;
  rxcui?: string;
  source?: string;
};

/**
 * Drug interaction result from external APIs.
 */
export type DrugInteraction = {
  drug1: string;
  drug2: string;
  severity: string;
  description: string;
  source: string;
};
