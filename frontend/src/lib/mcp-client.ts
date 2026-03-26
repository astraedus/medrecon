const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ||
  "https://medrecon-mcp-93135657352.us-central1.run.app";

/**
 * Parse SSE response from MCP server.
 * The server returns data in Server-Sent Events format:
 *   event: message
 *   data: {"result": ..., "jsonrpc": "2.0", "id": N}
 */
function parseSSEResponse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const jsonStr = line.slice(6);
      try {
        return JSON.parse(jsonStr);
      } catch {
        // Continue to next data line
      }
    }
  }
  // Fallback: try plain JSON
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse MCP response: ${text.substring(0, 200)}`);
  }
}

type McpResponse = {
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
  jsonrpc: string;
  id: number;
};

/**
 * Call an MCP tool on the MedRecon MCP server.
 *
 * The server creates a new McpServer instance per request with all tools
 * already registered, so we can call tools/call directly without initialize.
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, string>
): Promise<unknown> {
  const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `MCP server returned ${res.status}: ${errorText.substring(0, 300)}`
    );
  }

  const responseText = await res.text();
  const parsed = parseSSEResponse(responseText) as McpResponse;

  if (parsed.error) {
    throw new Error(`MCP error [${parsed.error.code}]: ${parsed.error.message}`);
  }

  if (parsed.result?.isError) {
    // Tool returned an error response
    const errorContent = parsed.result.content?.find((c) => c.type === "text");
    throw new Error(errorContent?.text || "MCP tool returned an error");
  }

  // Extract the text content from MCP tool response
  const content = parsed.result?.content;
  if (content && Array.isArray(content)) {
    for (const item of content) {
      if (item.type === "text" && item.text) {
        try {
          return JSON.parse(item.text);
        } catch {
          return item.text;
        }
      }
    }
  }

  return parsed.result;
}
