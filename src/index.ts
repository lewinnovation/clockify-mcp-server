#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createClockifyMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createClockifyMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "@lewinnovation/clockify-mcp-server listening on stdio (Clockify base: %s)",
    config.baseUrl,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("clockify-mcp-server failed to start:", message);
  process.exitCode = 1;
});
