import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";
import { assertPublicHttpUrl, safeDnsLookup } from "@/lib/urlPolicy";
import { flattenEnabledProxies, redactProxyUrl } from "@/lib/proxyConfig";
import { getStoredProxyConfig } from "@/lib/proxySettingsStore";

type ProxyPreference = "auto" | "never" | "always";

export type ExternalFetchInit = RequestInit & {
  proxy?: ProxyPreference;
  timeoutMs?: number;
};

let nextProxyIndex = 0;
const directAgent = new Agent({
  allowH2: false,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connect: {
    lookup: safeDnsLookup,
  },
});
const proxyAgents = new Map<string, ProxyAgent>();
const proxyGroupCooldowns = new Map<string, number>();

function getProxyAgent(uri: string) {
  const existing = proxyAgents.get(uri);
  if (existing) return existing;
  const agent = new ProxyAgent({ uri, allowH2: false });
  proxyAgents.set(uri, agent);
  return agent;
}

function isLimitLikeProxyFailure(error: unknown) {
  const text = String((error as any)?.message || (error as any)?.cause?.message || error).toLowerCase();
  return text.includes("429") || text.includes("too many") || text.includes("quota") || text.includes("limit");
}

function coolDownProxyGroup(groupId: string, error: unknown) {
  const cooldownMs = isLimitLikeProxyFailure(error) ? 15 * 60_000 : 10 * 60_000;
  proxyGroupCooldowns.set(groupId, Date.now() + cooldownMs);
}

async function pickProxyAgent() {
  const config = await getStoredProxyConfig();
  const proxies = flattenEnabledProxies(config).filter((item) => {
    const cooldownUntil = proxyGroupCooldowns.get(item.groupId) || 0;
    return cooldownUntil <= Date.now();
  });
  if (proxies.length === 0) return null;
  const picked = proxies[nextProxyIndex % proxies.length];
  nextProxyIndex++;
  return {
    ...picked,
    agent: getProxyAgent(picked.proxy),
    mode: config.mode,
    totalProxyCount: flattenEnabledProxies(config).length,
  };
}

async function shouldUseProxy(preference: ProxyPreference) {
  const config = await getStoredProxyConfig();
  const proxyCount = flattenEnabledProxies(config).length;
  if (preference === "never" || config.mode === "off") return false;
  if (preference === "always" || config.mode === "required") return true;
  return proxyCount > 0;
}

function getSignal(init: ExternalFetchInit) {
  if (!init.timeoutMs) return init.signal;
  const timeoutSignal = AbortSignal.timeout(init.timeoutMs);
  if (!init.signal) return timeoutSignal;
  return AbortSignal.any([init.signal, timeoutSignal]);
}

export async function externalFetch(input: string | URL, init: ExternalFetchInit = {}) {
  const url = typeof input === "string" ? input : input.toString();
  await assertPublicHttpUrl(url);

  const proxyPreference = init.proxy || "auto";
  const config = await getStoredProxyConfig();
  const configuredProxyCount = flattenEnabledProxies(config).length;
  if (proxyPreference !== "never" && config.mode === "required" && configuredProxyCount === 0) {
    throw new Error("Outbound proxy is required but no dashboard/env proxies are configured.");
  }

  const useProxy = await shouldUseProxy(proxyPreference);
  const pickedProxy = useProxy ? await pickProxyAgent() : null;
  const dispatcher = pickedProxy?.agent || directAgent;

  if ((proxyPreference === "always" || config.mode === "required") && !pickedProxy) {
    throw new Error("Outbound proxy is required but every configured proxy group is unavailable.");
  }

  const { proxy, timeoutMs, signal, ...fetchInit } = init;

  try {
    return await undiciFetch(url, {
      ...fetchInit,
      signal: getSignal(init),
      dispatcher: dispatcher || directAgent,
    } as any);
  } catch (error) {
    if (pickedProxy) {
      coolDownProxyGroup(pickedProxy.groupId, error);
      console.warn(`[externalFetch] Request failed through proxy group "${pickedProxy.groupName}" ${redactProxyUrl(pickedProxy.proxy)}: ${url}`);
      const nextProxy = await pickProxyAgent();
      if (nextProxy) {
        try {
          return await undiciFetch(url, {
            ...fetchInit,
            signal: getSignal(init),
            dispatcher: nextProxy.agent,
          } as any);
        } catch (retryError) {
          coolDownProxyGroup(nextProxy.groupId, retryError);
          console.warn(`[externalFetch] Retry failed through proxy group "${nextProxy.groupName}" ${redactProxyUrl(nextProxy.proxy)}: ${url}`);
        }
      }
      if (config.mode === "optional" && proxyPreference === "auto") {
        return undiciFetch(url, {
          ...fetchInit,
          signal: getSignal(init),
          dispatcher: directAgent,
        } as any);
      }
    }
    throw error;
  }
}
