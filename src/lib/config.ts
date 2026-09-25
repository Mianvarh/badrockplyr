export type ProxyMode = "off" | "optional" | "required";
export type ProxyRotation = "round_robin";

function cleanTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function readBoolean(value: string | undefined, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readProxyMode(value: string | undefined): ProxyMode {
  if (value === "required" || value === "optional" || value === "off") return value;
  return "optional";
}

export const appBaseUrl = cleanTrailingSlash(
  process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "http://localhost:3000"
);

export const databaseUrl =
  process.env.DATABASE_URL || "file:./dev.db";

export const redisUrl = process.env.REDIS_URL || "";

export const proxyUrls = (process.env.OUTBOUND_PROXY_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const proxyMode = readProxyMode(process.env.OUTBOUND_PROXY_MODE);

export const proxyRotation: ProxyRotation = "round_robin";

export const debugLogs = readBoolean(process.env.DEBUG_LOGS, process.env.NODE_ENV === "development");

export const isProduction = process.env.NODE_ENV === "production";

export const allowVpsVideoProxy = readBoolean(process.env.ALLOW_VPS_VIDEO_PROXY, false);
