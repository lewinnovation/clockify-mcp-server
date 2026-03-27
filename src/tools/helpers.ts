import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { requireClockifyData, type ClockifyClient } from "../clockify/client.js";

export const optionalId = z.string().min(1).optional();

export function jsonResult(payload: unknown): CallToolResult {
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

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export async function resolveUserId(
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
