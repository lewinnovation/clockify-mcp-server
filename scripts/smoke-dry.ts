/**
 * Dry-run smoke: exercises curated Clockify calls against a mocked fetch (no real API).
 * Run: pnpm run smoke
 */
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import {
  createClockifyOpenApiClient,
  requireClockifyData,
} from "../src/clockify/client.js";

process.env.CLOCKIFY_API_KEY ??= "dry-run-key";
process.env.CLOCKIFY_API_BASE_URL ??= "https://clockify-smoke.test/api";

const originalFetch = globalThis.fetch;

function jsonResponse(data: unknown, init?: { headers?: Record<string, string> }) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "last-page": "true",
      ...init?.headers,
    },
  });
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method =
    init?.method ??
    (typeof input === "object" && "method" in input && input.method
      ? input.method
      : "GET");
  const { pathname } = new URL(url);

  if (pathname === "/api/v1/user") {
    return jsonResponse({ id: "user-1", email: "dry@example.com" });
  }

  if (pathname === "/api/v1/workspaces") {
    return jsonResponse([{ id: "ws-1", name: "WS" }]);
  }

  if (
    /^\/api\/v1\/workspaces\/[^/]+\/projects\/[^/]+\/tasks\/?$/.test(pathname)
  ) {
    return jsonResponse([{ id: "task-1", name: "Task" }]);
  }

  if (
    /^\/api\/v1\/workspaces\/[^/]+\/projects\/?$/.test(pathname) &&
    method === "GET"
  ) {
    return jsonResponse([{ id: "proj-1", name: "Project" }]);
  }

  if (
    /^\/api\/v1\/workspaces\/[^/]+\/user\/[^/]+\/time-entries\/?$/.test(
      pathname,
    )
  ) {
    if (method === "PATCH") {
      return jsonResponse({
        id: "te-1",
        timeInterval: { end: "2021-01-01T00:00:00Z" },
      });
    }
    return jsonResponse([{ id: "te-1" }]);
  }

  if (
    /^\/api\/v1\/workspaces\/[^/]+\/time-entries\/?$/.test(pathname) &&
    method === "POST"
  ) {
    return jsonResponse({
      id: "te-new",
      description: "created",
    });
  }

  if (
    /^\/api\/v1\/workspaces\/[^/]+\/time-entries\/[^/]+\/?$/.test(pathname) &&
    method === "PUT"
  ) {
    return jsonResponse({ id: "te-1", description: "updated" });
  }

  return new Response(`unexpected fetch in smoke: ${method} ${pathname}`, {
    status: 599,
  });
};

async function main() {
  const config = loadConfig();
  const client = createClockifyOpenApiClient(config);

  {
    const res = await client.GET("/v1/user", {});
    const { data } = await requireClockifyData("smoke GET /v1/user", res);
    assert.equal(data.id, "user-1");
  }

  {
    const res = await client.GET("/v1/workspaces", {});
    const { data } = await requireClockifyData("smoke GET /v1/workspaces", res);
    assert.ok(Array.isArray(data));
  }

  {
    const res = await client.GET("/v1/workspaces/{workspaceId}/projects", {
      params: { path: { workspaceId: "ws-1" } },
    });
    const { data } = await requireClockifyData("smoke GET projects", res);
    assert.ok(Array.isArray(data));
  }

  {
    const res = await client.GET(
      "/v1/workspaces/{workspaceId}/projects/{projectId}/tasks",
      {
        params: { path: { workspaceId: "ws-1", projectId: "proj-1" } },
      },
    );
    const { data } = await requireClockifyData("smoke GET tasks", res);
    assert.ok(Array.isArray(data));
  }

  {
    const res = await client.GET(
      "/v1/workspaces/{workspaceId}/user/{userId}/time-entries",
      {
        params: {
          path: { workspaceId: "ws-1", userId: "user-1" },
          query: { page: 1, "page-size": 50 },
        },
      },
    );
    const { data } = await requireClockifyData("smoke GET time entries", res);
    assert.ok(Array.isArray(data));
  }

  {
    const res = await client.POST("/v1/workspaces/{workspaceId}/time-entries", {
      params: { path: { workspaceId: "ws-1" } },
      body: { description: "x", start: "2020-01-01T00:00:00Z" },
    });
    const { data } = await requireClockifyData("smoke POST time entry", res);
    assert.ok(data && typeof data === "object");
  }

  {
    const res = await client.PUT("/v1/workspaces/{workspaceId}/time-entries/{id}", {
      params: { path: { workspaceId: "ws-1", id: "te-1" } },
      body: { start: "2020-01-01T00:00:00Z" },
    });
    const { data } = await requireClockifyData("smoke PUT time entry", res);
    assert.ok(data && typeof data === "object");
  }

  {
    const res = await client.PATCH(
      "/v1/workspaces/{workspaceId}/user/{userId}/time-entries",
      {
        params: { path: { workspaceId: "ws-1", userId: "user-1" } },
        body: { end: "2021-01-01T00:00:00Z" },
      },
    );
    const { data } = await requireClockifyData("smoke PATCH stop timer", res);
    assert.ok(data && typeof data === "object");
  }

  console.error("smoke-dry: all mocked curated API shapes OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
