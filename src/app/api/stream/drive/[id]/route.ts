import { NextRequest, NextResponse } from "next/server";
import {
  fetchWithWebshareFailover,
  resolveGoogleDriveStreamUrl,
} from "@/services/proxyService";

export const dynamic = "force-dynamic";

function decodeTargetInput(rawId: string, searchUrl?: string | null): { url?: string; fileId?: string } {
  if (searchUrl?.trim()) {
    return { url: searchUrl.trim() };
  }

  const trimmed = rawId.trim();

  // 1. Try URL decode
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {}

  // 2. Check if already http(s)
  if (/^https?:\/\//i.test(decoded)) {
    return { url: decoded };
  }

  // 3. Try base64 decode if applicable
  if (/^[A-Za-z0-9+/=_-]{16,}$/.test(trimmed)) {
    try {
      const buff = Buffer.from(trimmed.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
      if (/^https?:\/\//i.test(buff)) {
        return { url: buff };
      }
    } catch {}
  }

  // 4. Otherwise treat as Drive file ID
  // Clean off any potential /view or query params
  const fileIdMatch = decoded.match(/\/file\/d\/([^/]+)/) || decoded.match(/id=([^&]+)/);
  if (fileIdMatch?.[1]) {
    return { fileId: fileIdMatch[1] };
  }

  return { fileId: decoded };
}

async function handleStreamRequest(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
  isHead: boolean
) {
  try {
    const { id } = await props.params;
    const searchUrl = request.nextUrl.searchParams.get("url");

    const decodedTarget = decodeTargetInput(id, searchUrl);

    let streamUrl: string;
    let cookieHeader: string | undefined;

    if (decodedTarget.url) {
      streamUrl = decodedTarget.url;
    } else if (decodedTarget.fileId) {
      const resolved = await resolveGoogleDriveStreamUrl(decodedTarget.fileId);
      streamUrl = resolved.url;
      cookieHeader = resolved.cookieHeader;
    } else {
      return NextResponse.json(
        { error: "No se proporcionó un fileId de Google Drive o URL directa válida." },
        { status: 400 }
      );
    }

    const rangeHeader = request.headers.get("range");
    const upstreamHeaders: Record<string, string> = {
      ...(rangeHeader ? { Range: rangeHeader } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    // Use proxy failover with Webshare pool 1 and pool 2 to evade 24h IP quota locks
    const result = await fetchWithWebshareFailover(streamUrl, {
      method: isHead ? "HEAD" : "GET",
      headers: upstreamHeaders,
      timeoutMs: 25_000,
    });

    const upstream = result.response;

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        {
          error: `Error al obtener stream desde Google Drive (HTTP ${upstream.status}).`,
          attempts: result.attempts,
        },
        { status: upstream.status || 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges") || "bytes";

    const responseHeaders: Record<string, string> = {
      "content-type": contentType,
      "accept-ranges": acceptRanges,
      "cache-control": "no-cache, no-store, must-revalidate",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "Content-Range, Content-Length, Accept-Ranges",
      "x-stream-pool-used": result.poolUsed,
    };

    if (contentLength) responseHeaders["content-length"] = contentLength;
    if (contentRange) responseHeaders["content-range"] = contentRange;

    // HTTP 206 Partial Content Range streaming
    const status = upstream.status === 206 || contentRange ? 206 : upstream.status;

    if (isHead) {
      return new NextResponse(null, {
        status,
        headers: responseHeaders,
      });
    }

    if (!upstream.body) {
      return NextResponse.json(
        { error: "El stream upstream no devolvió cuerpo de respuesta." },
        { status: 502 }
      );
    }

    return new NextResponse(upstream.body as unknown as BodyInit, {
      status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[Drive Stream Proxy] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Error procesando el proxy de streaming para Google Drive.",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return handleStreamRequest(request, props, false);
}

export async function HEAD(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return handleStreamRequest(request, props, true);
}
