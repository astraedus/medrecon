// Matches the MCP server's NormalizedMedication type
export type Medication = {
  name: string;
  dose?: string;
  frequency?: string;
  status?: string;
  prescriber?: string;
  authoredOn?: string;
  rxcui?: string;
  source?: string;
};

// Matches the MCP server's DrugInteraction type
export type DrugInteraction = {
  drug1: string;
  drug2: string;
  severity: string;
  description: string;
  source: string;
};

// API response from get_medications
export type MedicationsResponse = {
  status: string;
  patient_id: string;
  fhir_server: string;
  count: number;
  medications: Medication[];
  message?: string;
};

// API response from check_interactions
export type InteractionsResponse = {
  status: string;
  drugs_checked: string[];
  total_pairs_checked: number;
  interactions_found: number;
  severe_count: number;
  moderate_count: number;
  interactions: DrugInteraction[];
  disclaimer: string;
};

// Reconciliation types
export type ReconciledDrug = {
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
  flag: "MATCH" | "MISSING" | "DOSE_MISMATCH" | "MISSING_AND_DOSE_MISMATCH";
};

export type ReconcileResponse = {
  status: string;
  sources: string[];
  total_unique_medications: number;
  summary: {
    matching: number;
    missing_from_source: number;
    dose_mismatches: number;
    has_discrepancies: boolean;
  };
  reconciled_list: ReconciledDrug[];
  disclaimer: string;
};

// Dashboard state
export type ReconciliationState = {
  medications: Medication[];
  interactions: DrugInteraction[];
  reconciliation: ReconcileResponse | null;
  loading: boolean;
  error: string | null;
  step: "idle" | "fetching_meds" | "checking_interactions" | "reconciling" | "done";
};

// Pipeline mode toggle
export type PipelineMode = "pipeline" | "direct";

// Orchestrator API response
export type OrchestratorResponse = {
  state: string;
  report: string;
  pipeline: string;
  agents: string[];
};

// FHIR output types
export type FhirMedicationInput = {
  name: string;
  dose?: string;
  frequency?: string;
  rxcui?: string;
  sources: string[];
  flag: "MATCH" | "MISSING" | "DOSE_MISMATCH";
};

export type FhirOutputResponse = {
  status: string;
  patient_id: string;
  medication_count: number;
  bundle_entry_count: number;
  fhir_server: string;
  bundle: Record<string, unknown>;
};

// FHIR server options
export type FhirServer = {
  label: string;
  url: string;
};

export const FHIR_SERVERS: FhirServer[] = [
  { label: "HAPI FHIR (Public)", url: "https://hapi.fhir.org/baseR4" },
  { label: "SmartHealthIT (Public)", url: "https://r4.smarthealthit.org" },
  { label: "Custom", url: "" },
];
