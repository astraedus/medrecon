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
