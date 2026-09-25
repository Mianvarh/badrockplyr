type CacheEntry = {
  resolvedUrl: string;
  expiresAt: number;
  createdAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function ttlForUrl(resolvedUrl: string) {
  const lower = resolvedUrl.toLowerCase();
  if (lower.includes("unlimplay.com/hls/")) return 90 * 1000;
  if (lower.includes("cloudwindow-route.com")) return 2 * 60 * 60 * 1000;
  if (lower.includes(".m3u8") || lower.includes("vimeos.")) return 60 * 60 * 1000;
  return 30 * 60 * 1000;
}

function isExpired(entry: CacheEntry) {
  return entry.expiresAt <= Date.now();
}

export function getCachedResolvedStream(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    cache.delete(key);
    return null;
  }
  return entry.resolvedUrl;
}

export function setCachedResolvedStream(key: string, resolvedUrl: string) {
  const now = Date.now();
  cache.set(key, {
    resolvedUrl,
    createdAt: now,
    expiresAt: now + ttlForUrl(resolvedUrl),
  });
}

export function deleteCachedResolvedStream(key: string) {
  cache.delete(key);
}

export async function dedupeStreamResolution(
  key: string,
  resolve: () => Promise<string | null>
) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = resolve().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
