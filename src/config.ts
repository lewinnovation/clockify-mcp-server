export type AppConfig = {
  apiKey: string;
  baseUrl: string;
};

export function loadConfig(): AppConfig {
  const apiKey = process.env.CLOCKIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "CLOCKIFY_API_KEY is required. Set it in the environment before starting the MCP server.",
    );
  }
  const raw =
    process.env.CLOCKIFY_API_BASE_URL?.trim() ?? "https://api.clockify.me/api";
  const baseUrl = raw.replace(/\/+$/, "");
  return { apiKey, baseUrl };
}
