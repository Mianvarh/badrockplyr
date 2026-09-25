try {
  // @ts-ignore
  if (typeof process.loadEnvFile === "function") process.loadEnvFile();
} catch {}

import { prisma } from "../src/lib/prisma";
import { fetchTMDBMetadata } from "../src/services/tmdbService";
import { saveMultipleGeneratedLinks } from "../src/app/actions/generatorActions";
import { resolveVideoUrl } from "../src/services/streamResolver";
import { externalFetch } from "../src/lib/httpClient";
import { isCleanPlaybackUrl, isDirectStreamUrl, isResolvableEmbedUrl } from "../src/lib/playbackUrlPolicy";

interface TestReportItem {
  category: "movie" | "tv" | "anime";
  name: string;
  tmdbId: string;
  mode?: string;
  season?: number;
  episodesRequested?: string;
  generationSuccess: boolean;
  message?: string;
  itemsCreatedCount: number;
  metadataSample?: {
    title: string;
    originalTitle: string;
    episodeTitle?: string | null;
    season?: number | null;
    episode?: number | null;
    year?: number | null;
  };
  variantsFoundCount: number;
  variantsDetails: Array<{
    id: string;
    language: string;
    quality: string;
    source: string;
    videoUrl: string;
    candidateUrl?: string | null;
    type: "direct_hls" | "direct_mp4" | "resolvable" | "iframe" | "unknown";
    online: boolean;
    httpStatus?: number;
    resolvedUrl?: string;
    resolvedOnline?: boolean;
    resolvedHttpStatus?: number;
    error?: string;
  }>;
}

async function verifyUrlLive(url: string): Promise<{ online: boolean; status?: number; error?: string }> {
  try {
    const res = await externalFetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Range: "bytes=0-1024",
      },
      signal: AbortSignal.timeout(8000),
    });
    return { online: res.status < 400 || res.status === 403 || res.status === 405, status: res.status };
  } catch (err: any) {
    return { online: false, error: err.message || "Timeout / Network error" };
  }
}

async function runTests() {
  console.log("=== INICIANDO PRUEBAS COMPLETAS DE GENERACIÓN Y REPRODUCCIÓN TMDB ===");

  const results: TestReportItem[] = [];

  // TEST CASES
  const testCases: Array<{
    category: "movie" | "tv" | "anime";
    name: string;
    tmdbId: string;
    season: number;
    mode: "single" | "range" | "count" | "season";
    startEpisode?: number;
    endEpisode?: number;
    count?: number;
  }> = [
    // 1. Movies
    { category: "movie", name: "Interstellar", tmdbId: "157336", season: 1, mode: "single" },
    { category: "movie", name: "The Matrix", tmdbId: "603", season: 1, mode: "single" },

    // 2. TV Series (Breaking Bad 1396)
    { category: "tv", name: "Breaking Bad (single)", tmdbId: "1396", season: 1, mode: "single", startEpisode: 1 },
    { category: "tv", name: "Breaking Bad (range)", tmdbId: "1396", season: 1, mode: "range", startEpisode: 1, endEpisode: 3 },
    { category: "tv", name: "Breaking Bad (season)", tmdbId: "1396", season: 1, mode: "season" },

    // 2b. TV Series (Mr. Robot 62560)
    { category: "tv", name: "Mr. Robot (single)", tmdbId: "62560", season: 1, mode: "single", startEpisode: 1 },

    // 3. Anime
    { category: "anime", name: "Naruto", tmdbId: "46260", season: 1, mode: "single", startEpisode: 1 },
    { category: "anime", name: "One Piece", tmdbId: "37854", season: 1, mode: "single", startEpisode: 1 },
    { category: "anime", name: "Dragon Ball Z", tmdbId: "12971", season: 1, mode: "single", startEpisode: 1 },
    { category: "anime", name: "Jujutsu Kaisen", tmdbId: "95479", season: 1, mode: "single", startEpisode: 1 },
  ];

  for (const tc of testCases) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[TEST] ${tc.name} (TMDB ID: ${tc.tmdbId}, Type: ${tc.category}, Mode: ${tc.mode})`);

    try {
      // 1. Fetch metadata first to see what TMDB returns
      const meta = await fetchTMDBMetadata(
        tc.tmdbId,
        tc.category,
        tc.category === "movie" ? undefined : tc.season,
        tc.category === "movie" ? undefined : (tc.startEpisode || 1)
      );

      console.log(`  -> TMDB Meta: "${meta.title}" (${meta.releaseYear || meta.firstAirYear})`);
      if (meta.episodeTitle) {
        console.log(`  -> Episode Title: "${meta.episodeTitle}" (S${tc.season}E${tc.startEpisode || 1})`);
      }

      // 2. Generate and save links
      const genResult = await saveMultipleGeneratedLinks(
        tc.tmdbId,
        tc.category,
        tc.season,
        tc.mode,
        tc.startEpisode,
        tc.endEpisode,
        tc.count
      );

      console.log(`  -> Generation Result: Success=${genResult.success}, Count=${genResult.count || 0}`);
      if (genResult.message) console.log(`     Message: ${genResult.message}`);
      if (genResult.error) console.log(`     Error: ${genResult.error}`);

      // 3. Query generated items from DB
      const mediaItems = await prisma.mediaItem.findMany({
        where: {
          tmdbId: tc.tmdbId,
          ...(tc.category === "movie" ? {} : { season: tc.season }),
        },
        include: {
          videoVariants: {
            include: {
              sourceSite: true,
            },
          },
        },
      });

      console.log(`  -> MediaItems in DB for this query: ${mediaItems.length}`);

      // Collect sample metadata and test variants
      const variantsDetails: TestReportItem["variantsDetails"] = [];

      for (const item of mediaItems) {
        for (const variant of item.videoVariants) {
          const url = variant.videoUrl;
          let variantType: TestReportItem["variantsDetails"][0]["type"] = "unknown";
          if (url.toLowerCase().includes(".m3u8") || url.toLowerCase().includes("/hls/")) {
            variantType = "direct_hls";
          } else if (url.toLowerCase().includes(".mp4")) {
            variantType = "direct_mp4";
          } else if (isResolvableEmbedUrl(url)) {
            variantType = "resolvable";
          } else {
            variantType = "iframe";
          }

          console.log(`     [Variant] Lang: ${variant.language}, Qual: ${variant.quality}, Source: ${variant.sourceSite.name}, Type: ${variantType}`);
          console.log(`       URL: ${url}`);

          // Check live status
          const liveCheck = await verifyUrlLive(url);
          console.log(`       Live status: ${liveCheck.online ? "ONLINE (" + liveCheck.status + ")" : "OFFLINE (" + (liveCheck.error || liveCheck.status) + ")"}`);

          let resolvedUrl: string | undefined;
          let resolvedOnline: boolean | undefined;
          let resolvedHttpStatus: number | undefined;

          // If resolvable, try resolving
          if (isResolvableEmbedUrl(url)) {
            try {
              console.log(`       Attempting resolution with resolveVideoUrl...`);
              const resolved = await resolveVideoUrl(url);
              if (resolved && resolved !== url) {
                resolvedUrl = resolved;
                console.log(`       -> Resolved to: ${resolvedUrl}`);
                const resLiveCheck = await verifyUrlLive(resolvedUrl);
                resolvedOnline = resLiveCheck.online;
                resolvedHttpStatus = resLiveCheck.status;
                console.log(`       -> Resolved Online: ${resolvedOnline} (HTTP ${resolvedHttpStatus})`);
              } else {
                console.log(`       -> Could not resolve to direct stream`);
              }
            } catch (err: any) {
              console.log(`       -> Resolver error: ${err.message}`);
            }
          }

          variantsDetails.push({
            id: variant.id,
            language: variant.language,
            quality: variant.quality,
            source: variant.sourceSite.name,
            videoUrl: url,
            candidateUrl: variant.candidateUrl,
            type: variantType,
            online: liveCheck.online,
            httpStatus: liveCheck.status,
            resolvedUrl,
            resolvedOnline,
            resolvedHttpStatus,
            error: liveCheck.error,
          });
        }
      }

      results.push({
        category: tc.category,
        name: tc.name,
        tmdbId: tc.tmdbId,
        mode: tc.mode,
        season: tc.season,
        episodesRequested: tc.mode === "season" ? "Toda la temporada" : tc.mode === "range" ? `${tc.startEpisode}..${tc.endEpisode}` : `${tc.startEpisode || 1}`,
        generationSuccess: genResult.success,
        message: genResult.message || genResult.error,
        itemsCreatedCount: mediaItems.length,
        metadataSample: {
          title: meta.title,
          originalTitle: meta.originalTitle,
          episodeTitle: meta.episodeTitle,
          season: tc.season,
          episode: tc.startEpisode || 1,
          year: meta.releaseYear || meta.firstAirYear,
        },
        variantsFoundCount: variantsDetails.length,
        variantsDetails,
      });

    } catch (err: any) {
      console.error(`  -> Error in test case ${tc.name}:`, err);
      results.push({
        category: tc.category,
        name: tc.name,
        tmdbId: tc.tmdbId,
        mode: tc.mode,
        generationSuccess: false,
        message: err.message,
        itemsCreatedCount: 0,
        variantsFoundCount: 0,
        variantsDetails: [],
      });
    }
  }

  console.log("\n==================================================");
  console.log("=== RESUMEN FINAL DE PRUEBAS TMDB ===");
  console.log(JSON.stringify(results, null, 2));

  await prisma.$disconnect();
}

runTests().catch(console.error);
