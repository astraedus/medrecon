import * as tools from "./tools/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IMcpTool } from "./types.js";
import express from "express";
import cors from "cors";

const port = process.env["PORT"] || 5000;

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    name: "MedRecon MCP Server",
    version: "1.0.0",
    tools: [
      "get_medications",
      "check_interactions",
      "lookup_drug_info",
      "check_allergies",
      "find_alternatives",
      "validate_dose",
      "reconcile_lists",
      "generate_fhir_output",
    ],
  });
});

// MCP endpoint - creates a new server instance per request
// following the po-community-mcp pattern
app.post("/mcp", async (req, res) => {
  try {
    const server = new McpServer(
      {
        name: "MedRecon Clinical Tools",
        version: "1.0.0",
      },
      {
        capabilities: {
          experimental: {
            fhir_context_required: {
              value: true,
            },
          },
        },
      },
    );

    // Register all tools with the server
    for (const tool of Object.values<IMcpTool>(tools as Record<string, IMcpTool>)) {
      tool.registerTool(server, req);
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.listen(port, () => {
  console.log(`MedRecon MCP Server listening on port ${port}`);
  console.log(`  Health: http://localhost:${port}/health`);
  console.log(`  MCP:    http://localhost:${port}/mcp`);
});
