import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { registerClockifyTools } from "./tools/register.js";

export function createClockifyMcpServer(config: AppConfig): McpServer {
  const server = new McpServer(
    {
      name: "@lewinnovation/clockify-mcp-server",
      version: "0.1.0",
    },
    {
      instructions:
        "Clockify time tracking: use get_current_user and list_workspaces to discover IDs. Time entry listing uses workspace + user paths from the Clockify API. Set CLOCKIFY_API_KEY in the environment.",
    },
  );

  registerClockifyTools(server, config);
  return server;
}
