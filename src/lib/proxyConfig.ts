import { proxyMode as envProxyMode, proxyUrls as envProxyUrls } from "@/lib/config";

export type ProxyMode = "off" | "optional" | "required";

export type ProxyGroup = {
  id: string;
  name: string;
  enabled: boolean;
  proxies: string[];
};

export type StoredProxyConfig = {
  mode: ProxyMode;
  groups: ProxyGroup[];
};

export const PROXY_CONFIG_KEY = "outbound_proxy_config";

function normalizeProxyUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length >= 4) {
    const [host, port, username, ...passwordParts] = parts;
    const password = passwordParts.join(":");
    if (!host || !port || !username || !password) return null;
    return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/`;
  }

  return null;
}

export function parseProxyList(input: string) {
  return Array.from(new Set(
    input
      .split(/[\n,]+/)
      .map((line) => normalizeProxyUrl(line))
      .filter((value): value is string => Boolean(value))
  ));
}

export function redactProxyUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "redacted";
      url.password = "redacted";
    }
    return url.toString();
  } catch {
    return "invalid-proxy-url";
  }
}

export function sanitizeProxyConfig(config: StoredProxyConfig): StoredProxyConfig {
  const mode: ProxyMode = config.mode === "off" || config.mode === "required" ? config.mode : "optional";
  const groups = config.groups
    .map((group, index) => ({
      id: group.id || `proxy-group-${index + 1}`,
      name: group.name?.trim() || `Cuenta ${index + 1}`,
      enabled: group.enabled !== false,
      proxies: Array.from(new Set(group.proxies.map((proxy) => normalizeProxyUrl(proxy)).filter(Boolean) as string[])),
    }))
    .filter((group) => group.proxies.length > 0);

  return { mode, groups };
}

export function envProxyConfig(): StoredProxyConfig {
  return sanitizeProxyConfig({
    mode: envProxyMode,
    groups: envProxyUrls.length > 0
      ? [{ id: "env", name: "ENV", enabled: true, proxies: envProxyUrls }]
      : [],
  });
}

export function flattenEnabledProxies(config: StoredProxyConfig) {
  return config.groups
    .filter((group) => group.enabled)
    .flatMap((group) => group.proxies.map((proxy) => ({ groupId: group.id, groupName: group.name, proxy })));
}
