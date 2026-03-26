import { Request } from "express";
import { FhirContext } from "./types.js";

/**
 * Header names used by SHARP on MCP for FHIR context propagation.
 * These are set by the Prompt Opinion platform when calling MCP tools.
 */
export const FHIR_HEADERS = {
  serverUrl: "x-fhir-server-url",
  accessToken: "x-fhir-access-token",
  patientId: "x-patient-id",
} as const;

/**
 * Default FHIR server URL for local development.
 * HAPI FHIR public test server.
 */
const DEFAULT_FHIR_URL = "https://hapi.fhir.org/baseR4";

/**
 * Extract FHIR context from incoming request headers.
 * Falls back to environment variable or default public HAPI server.
 */
export function getFhirContext(req: Request): FhirContext {
  const url =
    req.headers[FHIR_HEADERS.serverUrl]?.toString() ||
    process.env["FHIR_SERVER_URL"] ||
    DEFAULT_FHIR_URL;

  const token = req.headers[FHIR_HEADERS.accessToken]?.toString();
  const patientId = req.headers[FHIR_HEADERS.patientId]?.toString();

  return { url: url.replace(/\/$/, ""), token, patientId };
}
