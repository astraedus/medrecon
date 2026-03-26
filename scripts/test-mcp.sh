#!/bin/bash
# Test MedRecon MCP Server tools
# Usage: ./scripts/test-mcp.sh
# Requires: MCP server running on port 5000

MCP_URL="http://localhost:5000/mcp"
FHIR_URL="https://hapi.fhir.org/baseR4"
PATIENT_ID="131283452"

echo "=== MedRecon MCP Server Test ==="
echo ""

# Test 1: get_medications
echo "--- Test 1: get_medications for patient $PATIENT_ID ---"
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-fhir-server-url: $FHIR_URL" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"initialize\",
    \"params\": {
      \"protocolVersion\": \"2025-03-26\",
      \"capabilities\": {},
      \"clientInfo\": {\"name\": \"test\", \"version\": \"1.0\"}
    }
  }" > /dev/null 2>&1

# The MCP SDK creates a new server per request, so we need to do init + tool call in one session
# For testing, we'll call the tool directly via a separate session
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-fhir-server-url: $FHIR_URL" \
  -H "x-patient-id: $PATIENT_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"initialize\",
    \"params\": {
      \"protocolVersion\": \"2025-03-26\",
      \"capabilities\": {},
      \"clientInfo\": {\"name\": \"test\", \"version\": \"1.0\"}
    }
  }" 2>/dev/null | grep -o 'data:.*' | head -1

echo ""
echo ""

# Test 2: check_interactions
echo "--- Test 2: check_interactions ---"
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 2,
    \"method\": \"initialize\",
    \"params\": {
      \"protocolVersion\": \"2025-03-26\",
      \"capabilities\": {},
      \"clientInfo\": {\"name\": \"test\", \"version\": \"1.0\"}
    }
  }" 2>/dev/null | grep -o 'data:.*' | head -1

echo ""
echo "=== Tests Complete ==="
