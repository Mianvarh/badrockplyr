try {
  // @ts-ignore
  if (typeof process.loadEnvFile === "function") process.loadEnvFile();
} catch {}

import { prisma } from "../src/lib/prisma";
import { fetchTMDBMetadata } from "../src/services/tmdbService";
import { saveMultipleGeneratedLinks } from "../src/app/actions/generatorActions";
import { resolveVideoUrl } from "../src/services/streamResolver";
import { externalFetch } from "../src/lib/httpClient";
import { isResolvableEmbedUrl } from "../src/lib/playbackUrlPolicy";

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

async function testSingle(category: "tv" | "anime", name: string, tmdbId: string, season = 1, episode = 1) {
  console.log(`\n==================================================`);
  console.log(`[TEST] ${name} (TMDB ID: ${tmdbId}, Type: ${category})`);

  try {
    const meta = await fetchTMDBMetadata(tmdbId, category, season, episode);
    console.log(`  -> TMDB Meta: "${meta.title}" (${meta.firstAirYear})`);
    console.log(`  -> Episode Title: "${meta.episodeTitle}" (S${season}E${episode})`);

    const genRes = await saveMultipleGeneratedLinks(tmdbId, category, season, "single", episode);
    console.log(`  -> Generated: success=${genRes.success}, message=${genRes.message}`);

    const mediaItem = await prisma.mediaItem.findFirst({
      where: { tmdbId, season, episode },
      include: {
        videoVariants: {
          include: { sourceSite: true },
        },
      },
    });

    if (!mediaItem) {
      console.log(`  -> No media item created in DB.`);
      return;
    }

    console.log(`  -> MediaItem in DB: ID=${mediaItem.id}, Variants=${mediaItem.videoVariants.length}`);

    for (const v of mediaItem.videoVariants) {
      console.log(`     [Variant ${v.id}] Lang=${v.language}, Qual=${v.quality}, Source=${v.sourceSite.name}`);
      console.log(`       URL: ${v.videoUrl}`);
      const check = await verifyUrlLive(v.videoUrl);
      console.log(`       Live status: ${check.online ? "ONLINE (" + check.status + ")" : "OFFLINE (" + (check.error || check.status) + ")"}`);

      if (isResolvableEmbedUrl(v.videoUrl)) {
        try {
          const resolved = await resolveVideoUrl(v.videoUrl);
          if (resolved && resolved !== v.videoUrl) {
            console.log(`       -> Resolved stream URL: ${resolved}`);
            const resCheck = await verifyUrlLive(resolved);
            console.log(`       -> Resolved stream live: ${resCheck.online} (${resCheck.status})`);
          } else {
            console.log(`       -> Not resolved to direct stream`);
          }
        } catch (e: any) {
          console.log(`       -> Resolver error: ${e.message}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`  -> Test failed:`, err);
  }
}

async function run() {
  await testSingle("tv", "Mr. Robot", "62560", 1, 1);
  await testSingle("anime", "Naruto", "46260", 1, 1);
  await testSingle("anime", "Dragon Ball Z", "12971", 1, 1);
  await prisma.$disconnect();
}

run().catch(console.error);
