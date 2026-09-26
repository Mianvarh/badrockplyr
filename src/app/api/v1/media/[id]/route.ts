import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/config";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/apiKeyAuth";
import { findTMDBByImdbId, fetchTMDBExternalIds } from "@/services/tmdbService";
import { saveGeneratedLink } from "@/app/actions/generatorActions";
import { isPrivateMediaVariant, isPrivateMediaUrl } from "@/lib/playbackUrlPolicy";
import { PRIVATE_MEDIA_SOURCE_ID } from "@/lib/privateMedia";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    // 1. API Key Authentication via X-Badrock-Key or Authorization: Bearer <key>
    const apiKey = extractApiKeyFromHeaders(request.headers);
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "API Key requerida. Proporciona el header X-Badrock-Key o Authorization: Bearer <key>.",
        },
        { status: 401 }
      );
    }

    const origin =
      request.headers.get("origin") || request.headers.get("referer") || undefined;
    const authResult = await validateApiKey(apiKey, origin);

    if (!authResult.valid) {
      const isRateLimit = authResult.error?.includes("Límite");
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: isRateLimit ? 429 : 403 }
      );
    }

    // 2. Parse Query Params
    const { id: rawId } = await props.params;
    const id = rawId.trim();

    const searchParams = request.nextUrl.searchParams;
    const typeParam = (searchParams.get("type") || "movie").toLowerCase();
    const requestedType: "movie" | "tv" | "anime" =
      typeParam === "tv" || typeParam === "anime" ? typeParam : "movie";

    const seasonParam = Math.max(1, Number(searchParams.get("season")) || 1);
    const episodeParam = Math.max(1, Number(searchParams.get("episode")) || 1);

    let resolvedTmdbId = id;
    let resolvedImdbId: string | null = null;
    let resolvedType: "movie" | "tv" | "anime" = requestedType;

    // 3. If ID starts with 'tt', resolve TMDB ID via TMDB API find endpoint
    if (id.startsWith("tt")) {
      resolvedImdbId = id;
      const imdbMatch = await findTMDBByImdbId(id);
      if (!imdbMatch) {
        return NextResponse.json(
          {
            success: false,
            error: `No se encontró ningún título en TMDB para el IMDb ID '${id}'.`,
          },
          { status: 404 }
        );
      }
      resolvedTmdbId = imdbMatch.tmdbId;
      resolvedType = imdbMatch.mediaType === "tv" ? (requestedType === "anime" ? "anime" : "tv") : "movie";
    } else {
      if (isNaN(Number(id))) {
        return NextResponse.json(
          {
            success: false,
            error: "El ID proporcionado debe ser un TMDB ID numérico o un IMDb ID (tt...).",
          },
          { status: 400 }
        );
      }
      // Query external_ids to find IMDb ID if available
      const external = await fetchTMDBExternalIds(resolvedTmdbId, resolvedType);
      resolvedImdbId = external.imdbId;
    }

    const isMovie = resolvedType === "movie";
    const season = isMovie ? null : seasonParam;
    const episode = isMovie ? null : episodeParam;

    // 4. Query MediaItem from SQLite / Postgres database
    let mediaItem = await prisma.mediaItem.findFirst({
      where: {
        tmdbId: resolvedTmdbId,
        mediaType: resolvedType,
        season,
        episode,
      },
      include: {
        videoVariants: {
          where: { status: "ONLINE" },
          include: { sourceSite: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    // 5. If not in DB, trigger auto-generation / scraping on demand
    if (!mediaItem || mediaItem.videoVariants.length === 0) {
      console.log(`[API v1] Contenido TMDB ${resolvedTmdbId} (${resolvedType}) no indexado o sin variantes. Iniciando auto-scraping...`);
      await saveGeneratedLink(
        resolvedTmdbId,
        resolvedType,
        isMovie ? undefined : seasonParam,
        isMovie ? undefined : episodeParam
      );

      // Re-query media item after scraping
      mediaItem = await prisma.mediaItem.findFirst({
        where: {
          tmdbId: resolvedTmdbId,
          mediaType: resolvedType,
          season,
          episode,
        },
        include: {
          videoVariants: {
            where: { status: "ONLINE" },
            include: { sourceSite: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    }

    if (!mediaItem) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudieron obtener metadatos ni fuentes para este contenido.",
        },
        { status: 404 }
      );
    }

    // 6. Build embed URL & iframe
    const baseUrl = appBaseUrl;
    const embedPlayerUrl = isMovie
      ? `${baseUrl}/play/embed/movie/${resolvedTmdbId}`
      : `${baseUrl}/play/embed/tv/${resolvedTmdbId}/${seasonParam}/${episodeParam}`;

    const embedIframe = `<iframe src="${embedPlayerUrl}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`;

    // 7. Format Servers ensuring Fuentes Propias ('Servidor VIP') is ALWAYS the last option
    const allVariants = mediaItem.videoVariants || [];

    const isVipVariant = (v: typeof allVariants[0]) =>
      v.candidateUrl === "PRIVATE_MEDIA" ||
      isPrivateMediaUrl(v.videoUrl) ||
      v.sourceSiteId === PRIVATE_MEDIA_SOURCE_ID ||
      v.sourceSite?.name.includes("VIP") ||
      v.sourceSite?.name.includes("Fuente Propia") ||
      isPrivateMediaVariant(v);

    const regularVariants = allVariants.filter((v) => !isVipVariant(v));
    const vipVariants = allVariants.filter(isVipVariant);

    // Strict rule: VIP sources are always at the end
    const orderedVariants = [...regularVariants, ...vipVariants];

    const servers = orderedVariants.map((variant, index) => {
      const isVip = isVipVariant(variant);
      const serverNum = index + 1;

      return {
        id: serverNum,
        name: isVip ? "Servidor VIP (Fuente Propia)" : `Servidor ${serverNum}`,
        source: isVip ? "Fuente Propia" : (variant.sourceSite?.name || "Servidor"),
        language: variant.language || "LATINO",
        quality: variant.quality || "HD",
        url: variant.videoUrl,
        ...(isVip ? { isVip: true } : {}),
      };
    });

    const posterUrl = mediaItem.posterPath
      ? mediaItem.posterPath.startsWith("http")
        ? mediaItem.posterPath
        : `https://image.tmdb.org/t/p/w500${mediaItem.posterPath}`
      : null;

    const backdropUrl = mediaItem.backdropPath
      ? mediaItem.backdropPath.startsWith("http")
        ? mediaItem.backdropPath
        : `https://image.tmdb.org/t/p/original${mediaItem.backdropPath}`
      : null;

    const year = mediaItem.releaseYear || mediaItem.firstAirYear || null;

    // 8. Return Clean JSON
    return NextResponse.json({
      success: true,
      data: {
        tmdbId: String(resolvedTmdbId),
        imdbId: resolvedImdbId,
        title: mediaItem.title,
        year,
        type: resolvedType,
        overview: mediaItem.overview || "",
        posterUrl,
        backdropUrl,
        embedPlayerUrl,
        embedIframe,
        servers,
      },
    });
  } catch (error: any) {
    console.error("[API v1 Media] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}
