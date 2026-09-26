import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";
import { getStoredProxyConfig } from "@/lib/proxySettingsStore";
import { parseProxyList, redactProxyUrl } from "@/lib/proxyConfig";
import { safeDnsLookup } from "@/lib/urlPolicy";

export type WebsharePoolId = 1 | 2;

export interface ProxyFailoverResult {
  response: Response;
  poolUsed: "pool1" | "pool2" | "direct";
  proxyUsed?: string;
  attempts: Array<{ pool: string; proxy?: string; error?: string; status?: number }>;
}

let pool1RoundRobin = 0;
let pool2RoundRobin = 0;

const directAgent = new Agent({
  allowH2: false,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connect: { lookup: safeDnsLookup },
});

const proxyAgentCache = new Map<string, ProxyAgent>();

function getOrCreateProxyAgent(proxyUri: string): ProxyAgent {
  let agent = proxyAgentCache.get(proxyUri);
  if (!agent) {
    agent = new ProxyAgent({ uri: proxyUri, allowH2: false });
    proxyAgentCache.set(proxyUri, agent);
  }
  return agent;
}

/**
 * Returns proxy URLs for Webshare Pool 1 or Pool 2.
 * Looks in environment variables (WEBSHARE_POOL_1, WEBSHARE_POOL_2)
 * and in database stored proxy groups (matching names or group order).
 */
export async function getWebsharePool(poolIndex: WebsharePoolId): Promise<string[]> {
  // 1. Check environment variables first
  const envPoolKey = poolIndex === 1 ? process.env.WEBSHARE_POOL_1 || process.env.WEBSHARE_POOL_1_URLS : process.env.WEBSHARE_POOL_2 || process.env.WEBSHARE_POOL_2_URLS;
  if (envPoolKey?.trim()) {
    const parsed = parseProxyList(envPoolKey);
    if (parsed.length > 0) return parsed;
  }

  // 2. Check stored database groups
  try {
    const config = await getStoredProxyConfig();
    const enabledGroups = config.groups.filter((g) => g.enabled && g.proxies.length > 0);

    // Look for explicit pool name matching
    const targetMatch = poolIndex === 1 ? /pool\s*1|webshare\s*1|cuenta\s*1/i : /pool\s*2|webshare\s*2|cuenta\s*2/i;
    const matchedGroup = enabledGroups.find((g) => targetMatch.test(g.name));
    if (matchedGroup && matchedGroup.proxies.length > 0) {
      return matchedGroup.proxies;
    }

    // If multiple groups exist, group 0 is Pool 1, group 1 is Pool 2
    if (enabledGroups.length >= 2) {
      return poolIndex === 1 ? enabledGroups[0].proxies : enabledGroups[1].proxies;
    }

    // If only 1 group exists with multiple proxies, split them
    if (enabledGroups.length === 1) {
      const allProxies = enabledGroups[0].proxies;
      if (allProxies.length > 1) {
        const half = Math.ceil(allProxies.length / 2);
        return poolIndex === 1 ? allProxies.slice(0, half) : allProxies.slice(half);
      }
      return allProxies;
    }
  } catch (error) {
    console.warn("[proxyService] Error cargando pools desde base de datos:", error);
  }

  return [];
}

/**
 * Gets next proxy URL in round-robin order from the specified pool.
 */
export async function getNextProxyFromPool(poolIndex: WebsharePoolId): Promise<string | null> {
  const pool = await getWebsharePool(poolIndex);
  if (pool.length === 0) return null;

  if (poolIndex === 1) {
    const proxy = pool[pool1RoundRobin % pool.length];
    pool1RoundRobin++;
    return proxy;
  } else {
    const proxy = pool[pool2RoundRobin % pool.length];
    pool2RoundRobin++;
    return proxy;
  }
}

function isGoogleDriveQuotaError(text: string, status: number): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("quota exceeded") ||
    lower.includes("download quota") ||
    lower.includes("limite de cuota") ||
    lower.includes("demasiadas solicitudes") ||
    lower.includes("too many requests") ||
    lower.includes("access denied") ||
    lower.includes("bandwidth limit")
  );
}

/**
 * Fetches an upstream stream or resource with automatic failover
 * from Webshare Pool 1 to Webshare Pool 2, evading Google Drive 24h IP quota locks.
 */
export async function fetchWithWebshareFailover(
  targetUrl: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    method?: string;
    signal?: AbortSignal;
  } = {}
): Promise<ProxyFailoverResult> {
  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs || 25_000;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "*/*",
    ...options.headers,
  };

  const attempts: Array<{ pool: string; proxy?: string; error?: string; status?: number }> = [];

  // Helper to run fetch through specific dispatcher
  const attemptFetch = async (agent: Agent | ProxyAgent, timeout: number) => {
    const timeoutSignal = AbortSignal.timeout(timeout);
    const combinedSignal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    return undiciFetch(targetUrl, {
      method,
      headers,
      signal: combinedSignal,
      dispatcher: agent,
    } as any) as unknown as Response;
  };

  // 1. Attempt with Webshare Pool 1
  const proxy1 = await getNextProxyFromPool(1);
  if (proxy1) {
    try {
      const agent = getOrCreateProxyAgent(proxy1);
      const res = await attemptFetch(agent, timeoutMs);

      // Check if Google Drive returned an HTML quota-lock page instead of video
      const contentType = res.headers.get("content-type") || "";
      if ((res.status === 200 || res.status === 206) && !contentType.includes("text/html")) {
        return { response: res, poolUsed: "pool1", proxyUsed: redactProxyUrl(proxy1), attempts };
      }

      // If status is error or HTML quota page
      let errorDetail = `HTTP ${res.status}`;
      if (contentType.includes("text/html")) {
        const text = await res.text().catch(() => "");
        if (isGoogleDriveQuotaError(text, res.status)) {
          errorDetail = `Google Drive 24h IP Quota Lock detectado (HTTP ${res.status})`;
        }
      }

      attempts.push({ pool: "Webshare Pool 1", proxy: redactProxyUrl(proxy1), error: errorDetail, status: res.status });
      console.warn(`[proxyService] Pool 1 fallo con ${errorDetail} en ${redactProxyUrl(proxy1)}. Activando failover a Webshare Pool 2...`);
    } catch (err: any) {
      attempts.push({ pool: "Webshare Pool 1", proxy: redactProxyUrl(proxy1), error: err.message || "Timeout/Network error" });
      console.warn(`[proxyService] Pool 1 error de conexión en ${redactProxyUrl(proxy1)}:`, err.message || err);
    }
  }

  // 2. Failover to Webshare Pool 2
  const proxy2 = await getNextProxyFromPool(2);
  if (proxy2) {
    try {
      const agent = getOrCreateProxyAgent(proxy2);
      const res = await attemptFetch(agent, timeoutMs);

      const contentType = res.headers.get("content-type") || "";
      if ((res.status === 200 || res.status === 206) && !contentType.includes("text/html")) {
        return { response: res, poolUsed: "pool2", proxyUsed: redactProxyUrl(proxy2), attempts };
      }

      let errorDetail = `HTTP ${res.status}`;
      if (contentType.includes("text/html")) {
        const text = await res.text().catch(() => "");
        if (isGoogleDriveQuotaError(text, res.status)) {
          errorDetail = `Google Drive 24h IP Quota Lock detectado en Pool 2 (HTTP ${res.status})`;
        }
      }

      attempts.push({ pool: "Webshare Pool 2", proxy: redactProxyUrl(proxy2), error: errorDetail, status: res.status });
      console.warn(`[proxyService] Pool 2 fallo con ${errorDetail} en ${redactProxyUrl(proxy2)}.`);
    } catch (err: any) {
      attempts.push({ pool: "Webshare Pool 2", proxy: redactProxyUrl(proxy2), error: err.message || "Timeout/Network error" });
      console.warn(`[proxyService] Pool 2 error de conexión en ${redactProxyUrl(proxy2)}:`, err.message || err);
    }
  }

  // 3. Fallback to direct fetch
  try {
    const res = await attemptFetch(directAgent, timeoutMs);
    attempts.push({ pool: "direct", status: res.status });
    return { response: res, poolUsed: "direct", attempts };
  } catch (directErr: any) {
    attempts.push({ pool: "direct", error: directErr.message || "Fallo conexión directa" });
    throw new Error(
      `Fallo la conexión con upstream en todos los pools (Pool 1, Pool 2 y Directo). Intentos: ${JSON.stringify(attempts)}`
    );
  }
}

/**
 * Resolves a Google Drive file ID into a playable video URL with cookies,
 * attempting get_video_info via Webshare proxy pools.
 */
export async function resolveGoogleDriveStreamUrl(
  fileId: string
): Promise<{ url: string; cookieHeader?: string }> {
  const cleanId = fileId.trim();

  // Try Google Drive video info endpoint
  const infoUrl = `https://docs.google.com/get_video_info?docid=${encodeURIComponent(cleanId)}`;
  try {
    const result = await fetchWithWebshareFailover(infoUrl, { timeoutMs: 15_000 });
    if (result.response.ok) {
      const text = await result.response.text();
      const params = new URLSearchParams(text);
      const streamMap = params.get("fmt_stream_map") || params.get("url_encoded_fmt_stream_map");

      if (streamMap) {
        const cookies = result.response.headers.get("set-cookie") || undefined;
        // Parse stream entries (itag|url)
        const entries = streamMap.split(",").map((item) => {
          const [itag, rawUrl] = item.split("|");
          return { itag, url: decodeURIComponent(rawUrl || "") };
        }).filter((e) => Boolean(e.url));

        // Prioritize 1080p (37), 720p (22), 480p (59), 360p (18)
        const itagPriority = ["37", "22", "59", "18"];
        entries.sort((a, b) => {
          const idxA = itagPriority.indexOf(a.itag);
          const idxB = itagPriority.indexOf(b.itag);
          return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        if (entries.length > 0 && entries[0].url) {
          return { url: entries[0].url, cookieHeader: cookies };
        }
      }
    }
  } catch (error) {
    console.warn("[proxyService] Falló resolución get_video_info de Google Drive:", error);
  }

  // Fallback to direct download URL
  return {
    url: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(cleanId)}&export=download&confirm=t`,
  };
}
