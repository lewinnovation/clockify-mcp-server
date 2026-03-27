# @lewinnovation/clockify-mcp-server

MCP (Model Context Protocol) server for the [Clockify](https://clockify.me/) REST API. It exposes a small set of curated tools for common workflows plus a generic `clockify_request` tool for other documented `/v1/...` endpoints.

## Requirements

- Node.js 20+
- pnpm 10+
- A Clockify API key ([profile settings](https://app.clockify.me/user/preferences))

## Install

```bash
# via npx
npx @lewinnovation/clockify-mcp-server

# OR via pnpm globally
pnpm add -g @lewinnovation/clockify-mcp-server

# OR clone and install locally
pnpm install
pnpm run build
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOCKIFY_API_KEY` | Yes | Sent as `X-Api-Key` on every request. |
| `CLOCKIFY_API_BASE_URL` | No | Defaults to `https://api.clockify.me/api`. Override only if Clockify documents a different base for your account or region. |

## Run (stdio)

The server speaks MCP over stdio (stdout must stay clean JSON-RPC; logs go to stderr).

```bash
export CLOCKIFY_API_KEY="your-key"
pnpm start
```

Or after `pnpm run build`:

```bash
node dist/index.js
```

MCP tool handlers are registered from `src/tools/register.ts` (shared helpers in `src/tools/helpers.ts`).

## MCP client configuration

Point your MCP client at this package’s entrypoint, for example:

```json
{
  "mcpServers": {
    "clockify": {
      "command": "node",
      "args": ["/absolute/path/to/clockify-mcp-server/dist/index.js"],
      "env": {
        "CLOCKIFY_API_KEY": "your-key"
      }
    }
  }
}
```

If you install the package from git or publish it to a registry, you can use `pnpm exec clockify-mcp-server` or `npx @lewinnovation/clockify-mcp-server` instead of a path to `dist/index.js`, provided the built `dist/` is available.

## Tools

**Curated**

- `get_current_user` — `GET /v1/user`
- `list_workspaces` — `GET /v1/workspaces` (optional single `role` filter; multiple roles require `clockify_request`)
- `list_projects` — `GET /v1/workspaces/{workspaceId}/projects` with pagination (`page`, `page_size` → `page-size`)
- `list_tasks` — `GET /v1/workspaces/{workspaceId}/projects/{projectId}/tasks`
- `list_time_entries` — `GET /v1/workspaces/{workspaceId}/user/{userId}/time-entries` (if `user_id` is omitted, the current API user is resolved via `GET /v1/user`)
- `create_time_entry` — `POST /v1/workspaces/{workspaceId}/time-entries`
- `update_time_entry` — `PUT /v1/workspaces/{workspaceId}/time-entries/{id}` (Clockify requires `start` on updates)
- `stop_running_time_entry` — `PATCH /v1/workspaces/{workspaceId}/user/{userId}/time-entries` with `{ end }` (optional `user_id`, default current user)

**Generic**

- `clockify_request` — `method`, `path` (must start with `/v1/`), optional `query` map, optional JSON `body` (max 256 KiB serialized). Array query values are sent as repeated keys.

Responses wrap JSON in a text content block; when Clockify returns a `Last-Page` header, curated list-style tools include `lastPage` in the decoded JSON payload.

## OpenAPI types

Types are generated from Clockify’s OpenAPI document:

```bash
pnpm run generate:openapi
```

Source URL: `https://api.clockify.me/api/v3/api-docs`  
Output: `src/generated/clockify.d.ts`

Re-run this periodically to pick up API changes, then fix any compile errors from type drift.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm run dev` | Watch `src/index.ts` with `tsx`. |
| `pnpm run build` | Emit `dist/` with `tsc`. |
| `pnpm run typecheck` | `tsc --noEmit`. |
| `pnpm run smoke` | Mocked HTTP smoke test for curated endpoints (no API key needed; uses a dummy key + mocked `fetch`). |
| `pnpm run generate:openapi` | Regenerate `src/generated/clockify.d.ts`. |

## License

MIT
