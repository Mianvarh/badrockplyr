export const PRIVATE_MEDIA_SOURCE_ID = "private-media-source-id";
export const PRIVATE_MEDIA_CANDIDATE_URL = "PRIVATE_MEDIA";

export type PrivateMediaType = "movie" | "tv";

export interface PrivateMediaResolvedResponse {
  success: boolean;
  error?: string;
  item?: {
    tmdbId: string;
    mediaType: PrivateMediaType;
    season: number | null;
    episode: number | null;
    language: string;
    quality: string;
    provider: "GOOGLE_DRIVE" | "ONEDRIVE";
    providerFileId: string;
  };
  playback?: {
    url: string;
    contentType: string;
    quality: string;
    provider: "GOOGLE_DRIVE" | "ONEDRIVE";
    resolvedAt: string;
    cookieHeader?: string;
  };
}

function privateMediaResolverBaseUrl() {
  return (process.env.PRIVATE_MEDIA_RESOLVER_URL || "http://localhost:3091").replace(/\/+$/, "");
}

export function isPrivateMediaUrl(url: string) {
  return url.startsWith("private-media://");
}

export function buildPrivateMediaUrl(input: {
  tmdbId: string;
  type: PrivateMediaType;
  season?: number | null;
  episode?: number | null;
}) {
  const url = new URL("private-media://resolve");
  url.searchParams.set("tmdbId", input.tmdbId);
  url.searchParams.set("type", input.type);
  if (input.type === "tv") {
    url.searchParams.set("season", String(input.season || 1));
    url.searchParams.set("episode", String(input.episode || 1));
  }
  return url.toString();
}

export function parsePrivateMediaUrl(value: string) {
  if (!isPrivateMediaUrl(value)) return null;
  const url = new URL(value);
  const tmdbId = url.searchParams.get("tmdbId");
  const type = url.searchParams.get("type") as PrivateMediaType | null;
  if (!tmdbId || (type !== "movie" && type !== "tv")) return null;

  return {
    tmdbId,
    type,
    season: type === "tv" ? Number(url.searchParams.get("season") || 1) : null,
    episode: type === "tv" ? Number(url.searchParams.get("episode") || 1) : null,
  };
}

export async function resolvePrivateMedia(input: {
  tmdbId: string;
  type: PrivateMediaType;
  season?: number | null;
  episode?: number | null;
}): Promise<PrivateMediaResolvedResponse | null> {
  const url = new URL(`${privateMediaResolverBaseUrl()}/api/private-media/resolve`);
  url.searchParams.set("tmdbId", input.tmdbId);
  url.searchParams.set("type", input.type);
  if (input.type === "tv") {
    url.searchParams.set("season", String(input.season || 1));
    url.searchParams.set("episode", String(input.episode || 1));
  }

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    const data = (await response.json()) as PrivateMediaResolvedResponse;
    if (response.status === 404) return null;
    if (!response.ok || !data.success || !data.item || !data.playback?.url) return null;
    return data;
  } catch (error) {
    console.warn("[Private Media] Resolver unavailable:", error);
    return null;
  }
}

export async function resolvePrivateMediaUrl(url: string) {
  const parsed = parsePrivateMediaUrl(url);
  if (!parsed) return null;
  return resolvePrivateMedia(parsed);
}

export function toPrivateMediaLanguage(value: string | undefined) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("lat")) return "LATINO";
  if (normalized.includes("cast") || normalized.includes("esp")) return "CASTELLANO";
  if (normalized.includes("jap")) return "JAPANESE";
  if (normalized.includes("eng") || normalized.includes("ing")) return "ENGLISH";
  return (value || "LATINO").toUpperCase();
}

export function toPrivateMediaQuality(value: string | undefined) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("1080")) return "1080p";
  if (normalized.includes("720")) return "720p";
  if (normalized.includes("480")) return "SD";
  if (normalized.includes("360")) return "SD";
  if (normalized.includes("hd")) return "HD";
  return "HD";
}
