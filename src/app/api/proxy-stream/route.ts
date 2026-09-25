import { NextRequest, NextResponse } from "next/server";
import { allowVpsVideoProxy } from "@/lib/config";
import { externalFetch } from "@/lib/httpClient";
import { resolvePrivateMediaUrl } from "@/lib/privateMedia";
import {
  getPlaybackResponseContentType,
  isHeavyVideoContentType,
  isLikelyHeavyVideoUrl,
  isPlaylistUrl,
  shouldBypassProxyForPlayback,
  shouldProxySegmentThroughVps,
  requiresVpsVideoProxy,
  allowsExplicitFallbackRelay,
} from "@/lib/proxyStreamPolicy";
import { assertAllowedExternalUrl } from "@/lib/urlPolicy";

function proxiedUrl(request: NextRequest, targetUrl: string) {
  const proxied = new URL(`/api/proxy-stream?url=${encodeURIComponent(targetUrl)}`, request.nextUrl.origin);
  if (request.nextUrl.searchParams.get("relay") === "1") {
    proxied.searchParams.set("relay", "1");
  }
  return proxied.toString();
}

function getPlaybackHeaders(targetUrl: string, range: string | null, cookieHeader?: string | null) {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,video/*,text/plain,*/*",
    ...(range ? { Range: range } : {}),
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    const needsNextgenReferer = [
      "digitalnomadventures.site",
      "highperformancebrands.site",
      "scalableimpactgroup.site",
      "putgate.com",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));

    if (needsNextgenReferer) {
      headers.Origin = "https://nextgencloudfabric.com";
      headers.Referer = "https://nextgencloudfabric.com/";
    }

    if (host === "vimeos.net" || host.endsWith(".vimeos.net") || host === "vimeos.zip" || host.endsWith(".vimeos.zip")) {
      headers.Origin = "https://vimeos.net";
      headers.Referer = "https://vimeos.net/";
    }

    if (host === "goodstream.one" || host.endsWith(".goodstream.one")) {
      headers.Origin = "https://goodstream.one";
      headers.Referer = "https://goodstream.one/";
    }

    if (host === "unlimplay.com" || host.endsWith(".unlimplay.com")) {
      headers.Origin = "https://unlimplay.com";
      headers.Referer = "https://unlimplay.com/";
    }

    if (
      host === "niramirus.com" ||
      host.endsWith(".niramirus.com") ||
      host === "streamwish.to" ||
      host.endsWith(".streamwish.to") ||
      host === "sfastwish.com" ||
      host.endsWith(".sfastwish.com") ||
      host === "awish.pro" ||
      host.endsWith(".awish.pro") ||
      host === "hlswish.com" ||
      host.endsWith(".hlswish.com")
    ) {
      headers.Origin = `https://${host}`;
      headers.Referer = `https://${host}/`;
    }

    if (host === "tiktokcdn.com" || host.endsWith(".tiktokcdn.com")) {
      headers.Origin = "https://streamwish.to";
      headers.Referer = "https://streamwish.to/";
    }

    if (host.includes("dramiyos-cdn.com") || host.includes("acek-cdn.com") || host.includes("minochinos.com")) {
      headers.Origin = "https://minochinos.com";
      headers.Referer = "https://minochinos.com/";
    }

    if (host.includes("uqload.")) {
      headers.Origin = "https://uqload.co";
      headers.Referer = "https://uqload.co/";
    }

    if (host.includes("mp4upload.com")) {
      headers.Origin = "https://www.mp4upload.com";
      headers.Referer = "https://www.mp4upload.com/";
    }

    if (host.includes("cloudwindow-route.com") || host.includes("jamesbornmain.com")) {
      headers.Origin = "https://voe.sx";
      headers.Referer = "https://voe.sx/";
    }
  } catch {
    // Keep default playback headers.
  }

  return headers;
}

function rewritePlaylist(request: NextRequest, playlistUrl: string, manifest: string) {
  const relaySegments = request.nextUrl.searchParams.get("relay") === "1";
  return manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, value: string) => {
          const absolute = new URL(value, playlistUrl).toString();
          return `URI="${isPlaylistUrl(absolute) || (relaySegments && shouldProxySegmentThroughVps(absolute)) ? proxiedUrl(request, absolute) : absolute}"`;
        });
      }
      const absolute = new URL(trimmed, playlistUrl).toString();
      return isPlaylistUrl(absolute) || (relaySegments && shouldProxySegmentThroughVps(absolute)) ? proxiedUrl(request, absolute) : absolute;
    })
    .join("\n");
}

function findMpegTsOffset(bytes: Uint8Array) {
  const maxScan = Math.min(bytes.length - 376, 4096);
  for (let index = 0; index < maxScan; index++) {
    if (bytes[index] === 0x47 && bytes[index + 188] === 0x47 && bytes[index + 376] === 0x47) {
      return index;
    }
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    let targetUrl = request.nextUrl.searchParams.get("url");
    let cookieHeader: string | null = null;
    const privateMediaUrl = request.nextUrl.searchParams.get("privateMediaUrl");

    if (privateMediaUrl) {
      const privateMedia = await resolvePrivateMediaUrl(privateMediaUrl);
      if (!privateMedia?.playback?.url) {
        return NextResponse.json({ error: "No se pudo resolver la fuente privada." }, { status: 502 });
      }
      targetUrl = privateMedia.playback.url;
      cookieHeader = privateMedia.playback.cookieHeader || null;
    }
    if (!targetUrl) {
      return NextResponse.json({ error: "El parámetro 'url' es requerido." }, { status: 400 });
    }

    await assertAllowedExternalUrl(targetUrl, ["docs.google.com", "drive.google.com", "googleusercontent.com"]);

    const forceSegmentProxy = shouldProxySegmentThroughVps(targetUrl);
    const fallbackRelay = allowsExplicitFallbackRelay(
      targetUrl,
      request.nextUrl.searchParams.get("relay") === "1"
    );
    const videoProxyAllowed = allowVpsVideoProxy || fallbackRelay;

    if (!videoProxyAllowed && (requiresVpsVideoProxy(targetUrl) || isLikelyHeavyVideoUrl(targetUrl))) {
      return NextResponse.json(
        {
          error: "Proxy de video pesado bloqueado. El VPS solo puede proxyear manifiestos o validaciones ligeras.",
          code: "VPS_VIDEO_PROXY_DISABLED",
        },
        { status: 403 }
      );
    }

    const range = request.headers.get("range");
    const upstream = await externalFetch(targetUrl, {
      headers: getPlaybackHeaders(targetUrl, range, cookieHeader),
      proxy: shouldBypassProxyForPlayback(targetUrl) ? "never" : "auto",
      timeoutMs: 20_000,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `No se pudo obtener el stream (${upstream.status}).` },
        { status: upstream.status || 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    const isPlaylist = isPlaylistUrl(targetUrl) || contentType.includes("mpegurl");

    if (isPlaylist) {
      const manifest = await upstream.text();
      const playableManifest = manifest;
      return new NextResponse(rewritePlaylist(request, targetUrl, playableManifest), {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }

    if (!videoProxyAllowed && isHeavyVideoContentType(contentType)) {
      return NextResponse.json(
        {
          error: "Proxy de video pesado bloqueado. El navegador debe reproducir esta fuente desde el host externo.",
          code: "VPS_VIDEO_PROXY_DISABLED",
        },
        { status: 403 }
      );
    }

    if (!upstream.body) {
      return NextResponse.json({ error: "El stream no devolvio cuerpo de respuesta." }, { status: 502 });
    }

    if (forceSegmentProxy) {
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      const offset = findMpegTsOffset(bytes);
      const body = offset > 0 ? bytes.slice(offset) : bytes;

      return new NextResponse(body, {
        status: upstream.status,
        headers: {
          "content-type": "video/mp2t",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "content-length": String(body.byteLength),
        },
      });
    }

    return new NextResponse(upstream.body as unknown as BodyInit, {
      status: upstream.status,
      headers: {
        "content-type": getPlaybackResponseContentType(targetUrl, contentType),
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        ...(upstream.headers.get("content-length") ? { "content-length": upstream.headers.get("content-length")! } : {}),
        ...(upstream.headers.get("content-range") ? { "content-range": upstream.headers.get("content-range")! } : {}),
        ...(upstream.headers.get("accept-ranges") ? { "accept-ranges": upstream.headers.get("accept-ranges")! } : {}),
      },
    });
  } catch (error: any) {
    console.error("Error in proxy-stream API:", error);
    return NextResponse.json(
      { error: error.message || "Error al proxyear el stream." },
      { status: 500 }
    );
  }
}
