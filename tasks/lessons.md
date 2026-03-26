# MedRecon - Lessons Learned

## Week 1

### RxNav Drug Interaction API is deprecated (2026-03-26)
- The RxNav REST interaction endpoints (`/REST/interaction/list.json`, `/REST/interaction/interaction.json`) return 404
- The base RxNav API works fine (`/REST/version`, `/REST/rxcui.json`)
- Workaround: Use curated clinical interaction database + OpenFDA drug label search
- The curated DB approach is actually better for demo purposes -- we control the data quality and can ensure the most clinically significant interactions are caught
- OpenFDA drug label API works but returns unstructured text, not severity-graded interaction data

### Drug name normalization is critical
- FHIR medication names include dose info (e.g., "Apixaban 5mg BID", "Aspirin 81mg daily", "Ceftriaxone IV")
- Must strip dose, route, and frequency info before matching against interaction database
- Regex patterns needed: dose amounts, route abbreviations (IV, IM, PO), frequency (BID, TID, daily, PRN)
- Also strip salt forms (sodium, hydrochloride, etc.)

### google-genai Part.from_text() API
- `Part.from_text(test_prompt)` fails -- positional argument not accepted
- Use `Part.from_text(text=test_prompt)` with keyword argument

### MCP server per-request model
- po-community-mcp creates a new McpServer instance per HTTP request
- This means each request is a standalone session -- no persistent state between requests
- Tool calls work via `tools/call` method without needing a separate initialize call in the same session

### RxNorm/RxClass APIs require IPv4 in Node.js (2026-03-26)
- NLM servers (rxnav.nlm.nih.gov) advertise IPv6 AAAA records
- Node.js tries IPv6 first by default; if IPv6 connectivity is broken, axios calls ETIMEDOUT silently
- `curl` works fine because it falls back to IPv4 automatically
- Fix: create `new https.Agent({ family: 4 })` and pass as `httpsAgent` to all axios requests to NLM
- This applies to all RxNorm, RxClass, and potentially other NLM API calls
- The `try/catch` in helper functions swallows the error and returns null/empty, making it look like "not found" instead of a network error

### HAPI FHIR public server for testing
- Patient 131283452 has 11 active medications including good interaction pairs
- MedicationRequest resources work well, MedicationStatement may not exist for all patients
- The public server can be slow (3-5s per request) -- acceptable for development
- For demo, consider running Docker HAPI FHIR locally for speed and reliability

### MCP StreamableHTTP with sessionIdGenerator: undefined (2026-03-26)
- When the MCP server uses `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, sessions are disabled
- This means `tools/call` can be sent directly as a standalone POST without `initialize` first
- Each POST creates a fresh McpServer instance with all tools registered
- The response format is SSE: `event: message\ndata: {JSON-RPC response}\n`
- Parse by finding lines starting with `data: ` and extracting JSON
- Tool results are in `result.content[0].text` as a JSON string that needs a second parse

### Frontend shadcn v2.4.0 with Tailwind v3 (2026-03-26)
- Next.js 14 ships with Tailwind v3; shadcn latest (v4+) targets Tailwind v4 = BROKEN
- Use `npx shadcn@2.4.0 add <component> --yes` for compatibility
- Must manually create components.json with `"style": "new-york"` and Tailwind v3 paths
- lucide-react does NOT export a `Github` icon -- use inline SVG for GitHub logo

## Week 3

### A2A response structure from google-adk to_a2a (2026-03-26)
- ADK agents put their final response in `result.artifacts[0].parts[0].text`, NOT in `result.status.message`
- The status message may be empty or just contain the task state
- History array contains all messages (user + agent) but artifacts are the canonical output
- When building A2A client tools, check artifacts first, then status message, then history
- The response text is often wrapped in markdown code blocks (```json ... ```)

### A2A message/send protocol (2026-03-26)
- Method is `message/send` (not `task/send` or `tasks/send`)
- The message needs `messageId`, `role: "user"`, and `parts` array with `{kind: "text", text: "..."}`
- Response returns a Task object with `id`, `contextId`, `status`, `artifacts`, `history`
- Task states: submitted, working, completed, failed, canceled
- For sync calls, the response waits until the task is completed

### gcloud builds submit for Cloud Run deployment (2026-03-26)
- `gcloud run deploy --source` does NOT support custom Dockerfile names (no --dockerfile flag)
- Workaround: swap the desired Dockerfile to `Dockerfile` before `gcloud builds submit`, then restore
- Or use `gcloud builds submit --tag` which uses the default `Dockerfile` in the context directory
- Cloud Run env vars set via `--set-env-vars` override anything in the container's environment
- Never include .env files in Docker images -- use Cloud Run env vars instead

### Multi-agent timeout considerations (2026-03-26)
- Orchestrator -> Source Collector -> Interaction Checker pipeline takes 30-60s total
- Source Collector: ~15-20s (3 FHIR queries + Gemini reasoning)
- Interaction Checker: ~15-20s (4 MCP tool calls + Gemini reasoning)
- Orchestrator: ~10s own reasoning + waiting for both sub-agents
- Cloud Run default timeout is 300s -- set explicitly with --timeout flag
- A2A client timeout should be at least 120s for individual agent calls
