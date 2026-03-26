import axios, { AxiosRequestConfig, isAxiosError } from "axios";
import { FhirContext } from "./types.js";

const FHIR_TIMEOUT = 15000; // 15 seconds

/**
 * Lightweight FHIR REST client.
 * Attaches Bearer token if present in context.
 */
class FhirClient {
  /**
   * Read a single FHIR resource by path (e.g. "Patient/123").
   */
  async read<T>(ctx: FhirContext, path: string): Promise<T | null> {
    return this.request<T>(ctx, {
      method: "get",
      url: `${ctx.url}/${path.replace(/^\//, "")}`,
    });
  }

  /**
   * Search FHIR resources with query parameters.
   * Returns the Bundle resource.
   */
  async search(
    ctx: FhirContext,
    resourceType: string,
    params: Record<string, string>,
  ): Promise<any> {
    const searchParams = new URLSearchParams(params).toString();
    return this.request(ctx, {
      method: "get",
      url: `${ctx.url}/${resourceType}?${searchParams}`,
    });
  }

  private async request<T>(
    ctx: FhirContext,
    config: AxiosRequestConfig,
  ): Promise<T | null> {
    const headers: Record<string, string> = {
      Accept: "application/fhir+json",
    };

    if (ctx.token) {
      headers["Authorization"] = `Bearer ${ctx.token}`;
    }

    config.headers = { ...config.headers, ...headers };
    config.timeout = FHIR_TIMEOUT;

    try {
      const response = await axios(config);
      return response.data as T;
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null;
        }
        console.error(
          `FHIR request failed: ${error.response?.status} ${error.response?.statusText}`,
          error.response?.data,
        );
      } else {
        console.error("FHIR request error:", error);
      }
      throw error;
    }
  }
}

export const fhirClient = new FhirClient();
