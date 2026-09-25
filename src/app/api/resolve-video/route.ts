import { NextRequest, NextResponse } from "next/server";
import { allowVpsVideoProxy } from "@/lib/config";
import { isCleanPlaybackUrl, isDirectStreamUrl } from "@/lib/playbackUrlPolicy";
import { isPrivateMediaUrl, resolvePrivateMediaUrl } from "@/lib/privateMedia";
import { assertAllowedExternalUrl } from "@/lib/urlPolicy";
import {
  dedupeStreamResolution,
  deleteCachedResolvedStream,
  getCachedResolvedStream,
  setCachedResolvedStream,
} from "@/lib/streamResolveCache";
import { scrapePage } from "@/services/authorizedScraper";
import { validateHlsUrl } from "@/services/hlsValidator";
import { resolveVideoUrl } from "@/services/streamResolver";
import { discoverUnlimplayAlternates, resolveUnlimplay } from "@/services/unlimplay/resolver";
import { requiresVpsVideoProxy } from "@/lib/proxyStreamPolicy";

async function isPlayableDirectUrl(url: string) {
  if (!isDirectStreamUrl(url)) return false;
  if (url.includes(".m3u8")) return validateHlsUrl(url);
  return true;
}

function proxiedStreamUrl(request: NextRequest, url: string, relay: boolean = false) {
  const proxied = new URL(`/api/proxy-stream?url=${encodeURIComponent(url)}`, request.nextUrl.origin);
  if (relay) proxied.searchParams.set("relay", "1");
  return proxied.toString();
}

function proxiedPrivateMediaUrl(request: NextRequest, url: string) {
  return new URL(`/api/proxy-stream?privateMediaUrl=${encodeURIComponent(url)}`, request.nextUrl.origin).toString();
}

function playbackResponse(request: NextRequest, resolvedUrl: string, cached: boolean, extra: Record<string, unknown> = {}) {
  const fallbackRelay = request.nextUrl.searchParams.get("allowFallbackRelay") === "1";
  if (!allowVpsVideoProxy && requiresVpsVideoProxy(resolvedUrl) && !fallbackRelay) {
    return NextResponse.json(
      {
        success: false,
        error: "Esta fuente requiere retransmitir el video por el VPS y fue descartada.",
        playbackMode: "rejected",
        requiresProxyBandwidth: true,
        cached,
        ...extra,
      },
      { status: 409 }
    );
  }

  const useManifestProxy = resolvedUrl.toLowerCase().includes(".m3u8") || resolvedUrl.toLowerCase().includes("unlimplay.com/hls/");
  return NextResponse.json({
    success: true,
    resolvedUrl: useManifestProxy ? proxiedStreamUrl(request, resolvedUrl, fallbackRelay) : resolvedUrl,
    playbackMode: useManifestProxy ? "manifest_only" : "direct_clean",
    requiresProxyBandwidth: fallbackRelay && requiresVpsVideoProxy(resolvedUrl),
    cached,
    ...extra,
  });
}

async function resolvePlayableUrl(url: string) {
  const resolvedUrl = await resolveVideoUrl(url);
  if (resolvedUrl === url) return null;
  if (!(await isPlayableDirectUrl(resolvedUrl))) return null;
  return resolvedUrl;
}

function cacheKey(url: string, candidateUrl: string | null) {
  return candidateUrl && candidateUrl !== "MANUAL"
    ? `${url}::${candidateUrl}`
    : url;
}

async function resolveAndCache(
  key: string,
  resolve: () => Promise<string | null>,
  forceRefresh: boolean = false
) {
  if (forceRefresh) {
    deleteCachedResolvedStream(key);
  }

  const cachedUrl = getCachedResolvedStream(key);
  if (cachedUrl) {
    return { resolvedUrl: cachedUrl, cached: true };
  }

  const resolvedUrl = await dedupeStreamResolution(key, async () => {
    const inFlightCachedUrl = getCachedResolvedStream(key);
    if (!forceRefresh && inFlightCachedUrl) {
      return inFlightCachedUrl;
    }
    return resolve();
  });

  if (!resolvedUrl) return null;
  setCachedResolvedStream(key, resolvedUrl);
  return { resolvedUrl, cached: false };
}

async function resolveFreshFromCandidate(candidateUrl: string) {
  await assertAllowedExternalUrl(candidateUrl);

  const scrapeResult = await scrapePage(candidateUrl);
  if (!scrapeResult.success || scrapeResult.videos.length === 0) {
    return null;
  }

  for (const video of scrapeResult.videos) {
    if (!video.url || !isCleanPlaybackUrl(video.url)) continue;

    try {
      await assertAllowedExternalUrl(video.url);

      if (isDirectStreamUrl(video.url)) {
        if (await isPlayableDirectUrl(video.url)) return video.url;
        continue;
      }

      const resolvedUrl = await resolvePlayableUrl(video.url);
      if (resolvedUrl) return resolvedUrl;
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveFreshResponse(
  request: NextRequest,
  url: string,
  candidateUrl: string | null,
  forceRefresh: boolean = false
) {
  if (!candidateUrl || candidateUrl === "MANUAL") return null;

  try {
    const resolved = await resolveAndCache(
      cacheKey(url, candidateUrl),
      () => resolveFreshFromCandidate(candidateUrl),
      forceRefresh
    );
    if (!resolved) return null;

    console.log(`[API Resolve Video] Refreshed playable stream from source page: ${candidateUrl}`);
    return playbackResponse(request, resolved.resolvedUrl, resolved.cached, { refreshed: true });
  } catch (error) {
    console.warn(`[API Resolve Video] Source refresh failed for ${candidateUrl}:`, error);
    return null;
  }
}

async function resolveDirectResponse(
  request: NextRequest,
  url: string,
  candidateUrl: string | null,
  forceRefresh: boolean = false
) {
  if (isPrivateMediaUrl(url)) {
    const privateMedia = await resolvePrivateMediaUrl(url);
    if (!privateMedia?.playback?.url) return null;
    if (privateMedia.playback.cookieHeader && !allowVpsVideoProxy) {
      return NextResponse.json(
        {
          success: false,
          error: "La fuente privada requiere proxy de video del VPS y esta desactivado.",
          playbackMode: "rejected",
          requiresProxyBandwidth: true,
        },
        { status: 409 }
      );
    }
    if (privateMedia.playback.cookieHeader && allowVpsVideoProxy) {
      return NextResponse.json({
        success: true,
        resolvedUrl: proxiedPrivateMediaUrl(request, url),
        playbackMode: "direct_clean",
        requiresProxyBandwidth: true,
        provider: "PRIVATE_MEDIA",
        cached: false,
      });
    }
    return playbackResponse(request, privateMedia.playback.url, false, { provider: "PRIVATE_MEDIA" });
  }

  const shouldForceFreshUnlimplay = forceRefresh || url.includes("unlimplay.com/embed/") || url.includes("unlimplay.com/play.php/embed/");
  const resolved = await resolveAndCache(cacheKey(url, candidateUrl), async () => {
    if (url.includes("unlimplay.com/embed/") || url.includes("unlimplay.com/play.php/embed/")) {
      const alternates = await discoverUnlimplayAlternates(url);
      for (const alternateUrl of alternates) {
        try {
          const resolvedData = await resolveUnlimplay(alternateUrl);
          const sources = resolvedData?.data?.sources || resolvedData?.sources || [];
          const hlsSource = sources.find((src: { type?: string }) => src.type === "hls") || sources[0];
          if (!(resolvedData?.success || resolvedData?.status === "ok") || !hlsSource?.file) continue;
          if (!(await isPlayableDirectUrl(hlsSource.file))) continue;
          return hlsSource.file;
        } catch (error) {
          console.warn(`[API Resolve Video] Unlimplay resolution failed for alternate ${alternateUrl}:`, error);
          continue;
        }
      }
      return null;
    }

    return resolvePlayableUrl(url);
  }, shouldForceFreshUnlimplay);

  if (!resolved) return null;

  if (allowVpsVideoProxy && request.nextUrl.searchParams.get("proxy") === "1") {
    return NextResponse.json({
      success: true,
      resolvedUrl: proxiedStreamUrl(request, resolved.resolvedUrl),
      playbackMode: "direct_clean",
      requiresProxyBandwidth: true,
      cached: resolved.cached,
    });
  }

  return playbackResponse(request, resolved.resolvedUrl, resolved.cached);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");
    const candidateUrl = searchParams.get("candidateUrl");
    const forceRefresh = searchParams.get("refresh") === "1";

    if (!url) {
      return NextResponse.json(
        { success: false, error: "El parametro 'url' es requerido." },
        { status: 400 }
      );
    }

    if (!isPrivateMediaUrl(url)) {
      await assertAllowedExternalUrl(url);
    }

    console.log(`[API Resolve Video] Resolving: ${url}`);

    const directResponse = await resolveDirectResponse(request, url, candidateUrl, forceRefresh);
    if (directResponse) {
      return directResponse;
    }

    const freshResponse = await resolveFreshResponse(request, url, candidateUrl, forceRefresh);
    if (freshResponse) {
      return freshResponse;
    }

    console.warn(`[API Resolve Video] Could not extract direct stream for: ${url}`);
    return NextResponse.json({
      success: false,
      error: url.includes("unlimplay.com")
        ? "No se pudo extraer la transmision de video de Unlimplay."
        : "No se encontro stream directo.",
    });
  } catch (error: any) {
    console.error("Error in resolve-video API:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al resolver el enlace de video." },
      { status: 500 }
    );
  }
}
