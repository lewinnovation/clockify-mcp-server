import createClient from "openapi-fetch";
import type { paths } from "../generated/clockify.js";
import type { AppConfig } from "../config.js";

export type ClockifyClient = ReturnType<typeof createClockifyOpenApiClient>;

const LAST_PAGE_HEADER = "last-page";

export function readLastPageHeader(response: Response): boolean | undefined {
  const v = response.headers.get(LAST_PAGE_HEADER);
  if (v === null) return undefined;
  return v.toLowerCase() === "true";
}

export function createClockifyOpenApiClient(config: AppConfig) {
  return createClient<paths>({
    baseUrl: config.baseUrl,
    headers: { "X-Api-Key": config.apiKey },
  });
}

export class ClockifyHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = "ClockifyHttpError";
  }
}

async function bodySnippet(response: Response): Promise<string | undefined> {
  try {
    const t = await response.clone().text();
    if (!t) return undefined;
    try {
      const parsed = JSON.parse(t) as { message?: string };
      if (typeof parsed?.message === "string") {
        return parsed.message;
      }
    } catch {
      /* not JSON */
    }
    return t.length > 512 ? `${t.slice(0, 512)}…` : t;
  } catch {
    return undefined;
  }
}

/** Ensures openapi-fetch returned success payload (throws with API details otherwise). */
export async function requireClockifyData<T>(
  label: string,
  res: { data?: T; error?: unknown; response: Response },
): Promise<{ data: T; response: Response }> {
  if (res.error !== undefined || res.data === undefined) {
    const status = res.response.status;
    const hint = await bodySnippet(res.response);
    throw new ClockifyHttpError(
      status,
      `${label} failed: ${status} ${res.response.statusText}${hint ? ` — ${hint}` : ""}`,
      hint,
    );
  }
  return { data: res.data, response: res.response };
}

export type JsonRecord = Record<string, unknown>;

export type PassthroughResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  lastPage?: boolean;
};

const MAX_BODY_BYTES = 256 * 1024;

/** Raw request for the generic MCP tool (any /v1/… endpoint). */
export async function clockifyPassthroughRequest(
  config: AppConfig,
  init: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
  },
): Promise<PassthroughResult> {
  if (!init.path.startsWith("/v1/")) {
    throw new Error('path must start with "/v1/"');
  }
  if (init.path.includes("..")) {
    throw new Error("path must not contain '..'");
  }

  const url = new URL(config.baseUrl + init.path);
  if (init.query instanceof URLSearchParams) {
    init.query.forEach((v, k) => url.searchParams.append(k, v));
  } else if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.append(k, String(v));
    }
  }

  let body: string | undefined;
  if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    if (body.length > MAX_BODY_BYTES) {
      throw new Error(
        `JSON body exceeds maximum size (${MAX_BODY_BYTES} bytes).`,
      );
    }
  }

  const response = await fetch(url, {
    method: init.method,
    headers: {
      "X-Api-Key": config.apiKey,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body ?? null,
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const text = await response.text();
  let parsed: unknown = text;
  if (text.length > 0) {
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }
  } else {
    parsed = null;
  }

  if (!response.ok) {
    const hint =
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : typeof parsed === "string"
          ? parsed
          : undefined;
    throw new ClockifyHttpError(
      response.status,
      `clockify_request failed: ${response.status} ${response.statusText}${hint ? ` — ${hint}` : ""}`,
      hint,
    );
  }

  return {
    status: response.status,
    headers,
    body: parsed,
    lastPage: readLastPageHeader(response),
  };
}
