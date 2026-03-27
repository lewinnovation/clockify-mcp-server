import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import {
  clockifyPassthroughRequest,
  createClockifyOpenApiClient,
  readLastPageHeader,
  requireClockifyData,
  type ClockifyClient,
} from "./clockify/client.js";

const optionalId = z.string().min(1).optional();

function jsonResult(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function resolveUserId(
  client: ClockifyClient,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const raw = await client.GET("/v1/user", {});
  const { data } = await requireClockifyData("GET /v1/user", raw);
  if (!data.id) {
    throw new Error("Clockify user payload did not include an id field.");
  }
  return data.id;
}

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

  const client = createClockifyOpenApiClient(config);

  server.registerTool(
    "get_current_user",
    {
      description:
        "Returns the currently authenticated Clockify user (from the API key).",
      inputSchema: z.object({
        include_memberships: z
          .boolean()
          .optional()
          .describe("When true, include workspace memberships on the user object."),
      }),
    },
    async ({ include_memberships }): Promise<CallToolResult> => {
      try {
        const res = await client.GET("/v1/user", {
          params: {
            query: {
              "include-memberships": include_memberships,
            },
          },
        });
        const { data, response } = await requireClockifyData(
          "GET /v1/user",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_workspaces",
    {
      description:
        "Lists workspaces visible to the authenticated user. For richer role filtering (multiple roles), use clockify_request.",
      inputSchema: z.object({
        role: z
          .enum(["WORKSPACE_ADMIN", "OWNER", "TEAM_MANAGER", "PROJECT_MANAGER"])
          .optional()
          .describe(
            "Optional single-role filter (matches Clockify OpenAPI typing).",
          ),
      }),
    },
    async ({ role }): Promise<CallToolResult> => {
      try {
        const res = await client.GET("/v1/workspaces", {
          params: {
            query: role ? { roles: role } : {},
          },
        });
        const { data, response } = await requireClockifyData(
          "GET /v1/workspaces",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_projects",
    {
      description: "Lists projects in a workspace (supports pagination and filters).",
      inputSchema: z.object({
        workspace_id: z.string().min(1),
        name: z.string().optional(),
        archived: z.boolean().optional(),
        billable: z.boolean().optional(),
        page: z.number().int().positive().optional(),
        page_size: z
          .number()
          .int()
          .positive()
          .max(5000)
          .optional()
          .describe("Maps to Clockify query param page-size."),
        hydrated: z.boolean().optional(),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const res = await client.GET("/v1/workspaces/{workspaceId}/projects", {
          params: {
            path: { workspaceId: args.workspace_id },
            query: {
              name: args.name,
              archived: args.archived,
              billable: args.billable,
              page: args.page,
              "page-size": args.page_size,
              hydrated: args.hydrated,
            },
          },
        });
        const { data, response } = await requireClockifyData(
          "GET /v1/workspaces/{workspaceId}/projects",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_tasks",
    {
      description: "Lists tasks for a project within a workspace.",
      inputSchema: z.object({
        workspace_id: z.string().min(1),
        project_id: z.string().min(1),
        name: z.string().optional(),
        is_active: z.boolean().optional().describe("Maps to is-active."),
        page: z.number().int().positive().optional(),
        page_size: z
          .number()
          .int()
          .positive()
          .max(5000)
          .optional()
          .describe("Maps to page-size."),
        sort_column: z.enum(["ID", "NAME"]).optional(),
        sort_order: z.enum(["ASCENDING", "DESCENDING"]).optional(),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const res = await client.GET(
          "/v1/workspaces/{workspaceId}/projects/{projectId}/tasks",
          {
            params: {
              path: {
                workspaceId: args.workspace_id,
                projectId: args.project_id,
              },
              query: {
                name: args.name,
                "is-active": args.is_active,
                page: args.page,
                "page-size": args.page_size,
                "sort-column": args.sort_column,
                "sort-order": args.sort_order,
              },
            },
          },
        );
        const { data, response } = await requireClockifyData(
          "GET .../projects/{projectId}/tasks",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_time_entries",
    {
      description:
        "Lists time entries for a user in a workspace. If user_id is omitted, the current API user is used.",
      inputSchema: z.object({
        workspace_id: z.string().min(1),
        user_id: optionalId,
        description: z.string().optional(),
        start: z
          .string()
          .optional()
          .describe("Range start (yyyy-MM-ddThh:mm:ssZ)."),
        end: z.string().optional().describe("Range end (yyyy-MM-ddThh:mm:ssZ)."),
        project: z.string().optional().describe("Filter by project id."),
        task: z.string().optional().describe("Filter by task id."),
        tags: z.array(z.string()).optional(),
        hydrated: z.boolean().optional(),
        in_progress: z
          .boolean()
          .optional()
          .describe("Maps to in-progress query flag."),
        page: z.number().int().positive().optional(),
        page_size: z.number().int().positive().max(5000).optional(),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const userId = await resolveUserId(client, args.user_id);
        const res = await client.GET(
          "/v1/workspaces/{workspaceId}/user/{userId}/time-entries",
          {
            params: {
              path: {
                workspaceId: args.workspace_id,
                userId,
              },
              query: {
                description: args.description,
                start: args.start,
                end: args.end,
                project: args.project,
                task: args.task,
                tags: args.tags,
                hydrated: args.hydrated,
                "in-progress": args.in_progress,
                page: args.page,
                "page-size": args.page_size,
              },
            },
          },
        );
        const { data, response } = await requireClockifyData(
          "GET .../user/{userId}/time-entries",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  const timeEntryBody = z.object({
    billable: z.boolean().optional(),
    description: z.string().optional(),
    start: z
      .string()
      .optional()
      .describe("ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ)."),
    end: z
      .string()
      .optional()
      .describe("ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ)."),
    project_id: z.string().optional(),
    task_id: z.string().optional(),
    tag_ids: z.array(z.string()).optional(),
    type: z.enum(["REGULAR", "BREAK"]).optional(),
  });

  server.registerTool(
    "create_time_entry",
    {
      description:
        "Creates a time entry in a workspace (POST /v1/workspaces/{workspaceId}/time-entries).",
      inputSchema: z.object({
        workspace_id: z.string().min(1),
        entry: timeEntryBody.describe("Fields for the new time entry."),
      }),
    },
    async ({ workspace_id, entry }): Promise<CallToolResult> => {
      try {
        const body = {
          billable: entry.billable,
          description: entry.description,
          start: entry.start,
          end: entry.end,
          projectId: entry.project_id,
          taskId: entry.task_id,
          tagIds: entry.tag_ids,
          type: entry.type,
        };
        const res = await client.POST("/v1/workspaces/{workspaceId}/time-entries", {
          params: { path: { workspaceId: workspace_id } },
          body,
        });
        const { data, response } = await requireClockifyData(
          "POST /v1/workspaces/{workspaceId}/time-entries",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "update_time_entry",
    {
      description:
        "Updates a time entry (PUT /v1/workspaces/{workspaceId}/time-entries/{id}). `start` is required by the Clockify API.",
      inputSchema: z.object({
        workspace_id: z.string().min(1),
        time_entry_id: z.string().min(1),
        start: z
          .string()
          .min(1)
          .describe("ISO-8601 datetime; required by Clockify for updates."),
        billable: z.boolean().optional(),
        description: z.string().optional(),
        end: z.string().optional(),
        project_id: z.string().optional(),
        task_id: z.string().optional(),
        tag_ids: z.array(z.string()).optional(),
        type: z.enum(["REGULAR", "BREAK"]).optional(),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const body = {
          start: args.start,
          billable: args.billable,
          description: args.description,
          end: args.end,
          projectId: args.project_id,
          taskId: args.task_id,
          tagIds: args.tag_ids,
          type: args.type,
        };
        const res = await client.PUT(
          "/v1/workspaces/{workspaceId}/time-entries/{id}",
          {
            params: {
              path: {
                workspaceId: args.workspace_id,
                id: args.time_entry_id,
              },
            },
            body,
          },
        );
        const { data, response } = await requireClockifyData(
          "PUT /v1/workspaces/{workspaceId}/time-entries/{id}",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "stop_running_time_entry",
    {
      description:
        "Stops the running timer for a user in a workspace (PATCH .../user/{userId}/time-entries with end time). If user_id is omitted, uses the current API user.",
      inputSchema: z.object({
        workspace_id: z.string().min(1),
        user_id: optionalId,
        end: z
          .string()
          .min(1)
          .describe("Stop time in yyyy-MM-ddThh:mm:ssZ format."),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const userId = await resolveUserId(client, args.user_id);
        const res = await client.PATCH(
          "/v1/workspaces/{workspaceId}/user/{userId}/time-entries",
          {
            params: {
              path: {
                workspaceId: args.workspace_id,
                userId,
              },
            },
            body: { end: args.end },
          },
        );
        const { data, response } = await requireClockifyData(
          "PATCH .../user/{userId}/time-entries (stop timer)",
          res,
        );
        return jsonResult({ data, lastPage: readLastPageHeader(response) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  const queryValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]);

  server.registerTool(
    "clockify_request",
    {
      description:
        "Low-level access to any documented Clockify v1 endpoint. Path must start with /v1/. Use for endpoints not covered by curated tools.",
      inputSchema: z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z
          .string()
          .min(4)
          .describe('Absolute path on the API host, e.g. "/v1/workspaces".'),
        query: z
          .record(z.string(), queryValueSchema)
          .optional()
          .describe(
            "Query parameters. Array values are repeated as multiple keys.",
          ),
        body: z.unknown().optional().describe("JSON request body when needed."),
      }),
    },
    async ({ method, path, query, body }): Promise<CallToolResult> => {
      try {
        const sp = new URLSearchParams();
        if (query) {
          for (const [k, v] of Object.entries(query)) {
            if (Array.isArray(v)) {
              for (const item of v) {
                sp.append(k, item);
              }
            } else {
              sp.append(k, String(v));
            }
          }
        }
        const result = await clockifyPassthroughRequest(config, {
          method,
          path,
          query: sp,
          body,
        });
        return jsonResult(result);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  return server;
}
