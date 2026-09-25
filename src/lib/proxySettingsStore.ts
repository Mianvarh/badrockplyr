import { prisma } from "@/lib/prisma";
import { envProxyConfig, PROXY_CONFIG_KEY, sanitizeProxyConfig, StoredProxyConfig } from "@/lib/proxyConfig";

let cachedConfig: { value: StoredProxyConfig; expiresAt: number } | null = null;

export function clearProxyConfigCache() {
  cachedConfig = null;
}

export async function getStoredProxyConfig() {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return cachedConfig.value;
  }

  try {
    const setting = await prisma.setting.findUnique({ where: { key: PROXY_CONFIG_KEY } });
    if (setting?.value) {
      const parsed = sanitizeProxyConfig(JSON.parse(setting.value));
      cachedConfig = { value: parsed, expiresAt: now + 15_000 };
      return parsed;
    }
  } catch (error) {
    console.warn("[proxySettings] Falling back to env proxy config:", error);
  }

  const fallback = envProxyConfig();
  cachedConfig = { value: fallback, expiresAt: now + 15_000 };
  return fallback;
}

export async function saveStoredProxyConfig(config: StoredProxyConfig) {
  const sanitized = sanitizeProxyConfig(config);
  await prisma.setting.upsert({
    where: { key: PROXY_CONFIG_KEY },
    update: { value: JSON.stringify(sanitized) },
    create: { key: PROXY_CONFIG_KEY, value: JSON.stringify(sanitized) },
  });
  clearProxyConfigCache();
  return sanitized;
}
