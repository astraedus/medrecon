import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Helper to create standardized MCP tool responses.
 */
export const McpUtilities = {
  /**
   * Create a text response for an MCP tool call.
   */
  createTextResponse(
    text: string,
    options: { isError: boolean } = { isError: false },
  ): CallToolResult {
    return {
      content: [{ type: "text", text }],
      isError: options.isError,
    };
  },

  /**
   * Create a JSON response for an MCP tool call.
   * Serializes the data to a formatted JSON string.
   */
  createJsonResponse(
    data: unknown,
    options: { isError: boolean } = { isError: false },
  ): CallToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      isError: options.isError,
    };
  },
};
