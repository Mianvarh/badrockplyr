"use server";

import { prisma } from "@/lib/prisma";
import { fetchTMDBMetadata, fetchAlternativeTitles } from "@/services/tmdbService";
import { scrapePage } from "@/services/authorizedScraper";
import { checkVideoAvailability } from "@/services/videoAvailabilityService";
import { runPlaybackSelection } from "@/services/playbackSelectionService";
import { detectLanguageFromAudio } from "@/services/audioDetector";
import { normalizeRelayLanguage } from "@/services/languageNormalizer";
import { resolveVideoUrl } from "@/services/streamResolver";
import { findOkRuVideos, prioritizeVerifiedCatalogCandidate } from "@/services/okRuService";
import { extractPelisJuanitaCandidates, PELIS_JUANITA_BASE_URL } from "@/services/pelisJuanitaService";
import { findMonosChinosUrl } from "@/services/monosChinosService";
import { validateHlsUrl } from "@/services/hlsValidator";
import { discoverUnlimplayAlternates, resolveUnlimplay } from "@/services/unlimplay/resolver";
import { appBaseUrl } from "@/lib/config";
import { externalFetch } from "@/lib/httpClient";
import { enqueueScrapeGeneratedLink, isScrapeQueueEnabled } from "@/lib/scrapeQueue";
import {
  buildPrivateMediaUrl,
  PRIVATE_MEDIA_CANDIDATE_URL,
  PRIVATE_MEDIA_SOURCE_ID,
  resolvePrivateMedia,
  toPrivateMediaLanguage,
  toPrivateMediaQuality,
} from "@/lib/privateMedia";
import {
  isCleanPlaybackUrl,
  isDirectStreamUrl,
  isResolvableEmbedUrl,
  isSupportedEmbedUrl,
  isUnsafeIframeHost,
  orderPlaybackOptions,
} from "@/lib/playbackUrlPolicy";
import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (e) {
    // Ignore error when executing outside Next.js context (like CLI scripts)
  }
}


export interface GenerateLinkResult {
  success: boolean;
  message?: string;
  playerUrl?: string;
  collectorUrl?: string;
  error?: string;
}
export async function saveGeneratedLink(
  tmdbIdInput: string,
  mediaType: "movie" | "tv" | "anime",
  seasonInput?: number,
  episodeInput?: number
): Promise<GenerateLinkResult> {
  try {
    const tmdbId = tmdbIdInput.trim();
    if (!tmdbId || isNaN(Number(tmdbId))) {
      return { success: false, error: "El TMDB ID debe ser un valor numérico válido." };
    }

    // 1. Fetch TMDB Metadata
    const meta = await fetchTMDBMetadata(tmdbId, mediaType, seasonInput || undefined, episodeInput || undefined);

    // Auto-detect and resolve mismatch between user-selected mediaType and actual TMDB media type
    let resolvedMediaType = mediaType;
    if (meta.detectedType && meta.detectedType !== (mediaType === "movie" ? "movie" : "tv")) {
      console.log(`[Auto-Correction] Correcting mediaType from "${mediaType}" to "${meta.detectedType}" for TMDB ID ${tmdbId}`);
      resolvedMediaType = meta.detectedType === "movie" ? "movie" : (mediaType === "anime" ? "anime" : "tv");
    }

    const isMovie = resolvedMediaType === "movie";
    const season = isMovie ? null : Number(seasonInput) || 1;
    const episode = isMovie ? null : Number(episodeInput) || 1;

    // 2. Generate URLs
    const baseUrl = appBaseUrl;
    let playerUrl = "";
    let collectorUrl = "";

    if (isMovie) {
      playerUrl = `${baseUrl}/play/embed/movie/${tmdbId}`;
      collectorUrl = `${baseUrl}/f/embed/movie/${tmdbId}`;
    } else {
      playerUrl = `${baseUrl}/play/embed/tv/${tmdbId}/${season}/${episode}`;
      collectorUrl = `${baseUrl}/f/embed/tv/${tmdbId}/${season}/${episode}`;
    }

    // 3. Upsert MediaItem in SQLite database
    let mediaItem = await prisma.mediaItem.findFirst({
      where: {
        tmdbId,
        mediaType: resolvedMediaType,
        season,
        episode
      }
    });

    if (!mediaItem) {
      mediaItem = await prisma.mediaItem.create({
        data: {
          tmdbId,
          mediaType: resolvedMediaType,
          title: meta.title,
          originalTitle: meta.originalTitle,
          overview: meta.overview,
          posterPath: meta.posterPath,
          backdropPath: meta.backdropPath,
          releaseYear: meta.releaseYear,
          firstAirYear: meta.firstAirYear,
          genres: meta.genres,
          originalLanguage: meta.originalLanguage,
          season,
          episode,
          episodeTitle: meta.episodeTitle,
          episodeOverview: meta.episodeOverview,
          episodeStillPath: meta.episodeStillPath,
          airDate: meta.airDate
        }
      });
    } else {
      mediaItem = await prisma.mediaItem.update({
        where: { id: mediaItem.id },
        data: {
          title: meta.title,
          originalTitle: meta.originalTitle,
          overview: meta.overview,
          posterPath: meta.posterPath,
          backdropPath: meta.backdropPath,
          releaseYear: meta.releaseYear,
          firstAirYear: meta.firstAirYear,
          genres: meta.genres,
          originalLanguage: meta.originalLanguage,
          episodeTitle: meta.episodeTitle,
          episodeOverview: meta.episodeOverview,
          episodeStillPath: meta.episodeStillPath,
          airDate: meta.airDate
        }
      });
    }

    // 4. Create or reuse the GeneratedLink
    const existingLink = await prisma.generatedLink.findFirst({
      where: {
        mediaItemId: mediaItem.id,
        type: resolvedMediaType,
        tmdbId,
        season,
        episode
      }
    });

    const generatedLink = existingLink || (await prisma.generatedLink.create({
      data: {
        mediaItemId: mediaItem.id,
        type: resolvedMediaType,
        tmdbId,
        season,
        episode,
        playerUrl,
        collectorUrl
      }
    }));

    const autoSearch = await autoSearchGeneratedLinks([generatedLink.id]);

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath("/dashboard/movies");

    return {
      success: true,
      message: autoSearch.failedCount > 0
        ? "Enlace guardado en la biblioteca, pero la búsqueda automática de fuentes no encontró resultados reproducibles."
        : "Enlace guardado en la biblioteca y búsqueda automática de fuentes iniciada.",
      playerUrl,
      collectorUrl
    };
  } catch (err: any) {
    console.error("Error in saveGeneratedLink action:", err);
    return {
      success: false,
      error: err.message || "Ocurrió un error inesperado al procesar la solicitud."
    };
  }
}

export async function deleteGeneratedLink(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const link = await prisma.generatedLink.findUnique({ where: { id } });
    if (!link) {
      return { success: false, error: "El enlace no existe." };
    }

    // Delete link
    await prisma.generatedLink.delete({ where: { id } });

    // Optionally check if MediaItem has other references
    const otherLinks = await prisma.generatedLink.count({ where: { mediaItemId: link.mediaItemId } });
    if (otherLinks === 0) {
      await prisma.mediaItem.delete({ where: { id: link.mediaItemId } }).catch(() => {});
    }

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath("/dashboard/movies");

    return { success: true };
  } catch (err: any) {
    console.error("Error in deleteGeneratedLink action:", err);
    return { success: false, error: err.message || "Error al eliminar el enlace." };
  }
}

// Helper: Convert a title to a URL slug
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function kanaToRomaji(text: string): string {
  const kanaMap: Record<string, string> = {
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "キャ": "kya", "キュ": "kyu", "キョ": "kyo",
    "シャ": "sha", "シュ": "shu", "ショ": "sho",
    "チャ": "cha", "チュ": "chu", "チョ": "cho",
    "ニャ": "nya", "ニュ": "nyu", "ニョ": "nyo",
    "ヒャ": "hya", "ヒュ": "hyu", "ヒョ": "hyo",
    "ミャ": "mya", "ミュ": "myu", "ミョ": "myo",
    "リャ": "rya", "リュ": "ryu", "リョ": "ryo",
    "ギャ": "gya", "ギュ": "gyu", "ギョ": "gyo",
    "ジャ": "ja", "ジュ": "ju", "ジョ": "jo",
    "ビャ": "bya", "ビュ": "byu", "ビョ": "byo",
    "ピャ": "pya", "ピュ": "pyu", "ピョ": "pyo",
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "を": "wo", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o",
    "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
    "サ": "sa", "シ": "shi", "ス": "su", "セ": "se", "ソ": "so",
    "タ": "ta", "チ": "chi", "ツ": "tsu", "テ": "te", "ト": "to",
    "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
    "ハ": "ha", "ヒ": "hi", "フ": "fu", "ヘ": "he", "ホ": "ho",
    "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
    "ヤ": "ya", "ユ": "yu", "ヨ": "yo",
    "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro",
    "ワ": "wa", "ヲ": "wo", "ン": "n",
    "ガ": "ga", "ギ": "gi", "グ": "gu", "ゲ": "ge", "ゴ": "go",
    "ザ": "za", "ジ": "ji", "ズ": "zu", "ゼ": "ze", "ゾ": "zo",
    "ダ": "da", "ヂ": "ji", "ヅ": "zu", "デ": "de", "ド": "do",
    "バ": "ba", "ビ": "bi", "ブ": "bu", "ベ": "be", "ボ": "bo",
    "パ": "pa", "ピ": "pi", "プ": "pu", "ペ": "pe", "ポ": "po",
    "ー": "", "・": " ", " ": " "
  };

  let hasKana = false;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (kanaMap[two]) {
      out += kanaMap[two];
      hasKana = true;
      i += 2;
    } else if (kanaMap[text[i]]) {
      out += kanaMap[text[i]];
      hasKana = true;
      i++;
    } else {
      out += text[i];
      i++;
    }
  }
  return hasKana ? out.trim() : "";
}

function extractCandidateSlug(candidateUrl: string) {
  try {
    const url = new URL(candidateUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const knownPrefixes = ["pelicula", "serie", "ver-pelicula", "ver-serie", "ver-episode"];
    for (const prefix of knownPrefixes) {
      const index = parts.indexOf(prefix);
      if (index !== -1 && parts[index + 1]) return parts[index + 1].replace(/-\d+x\d+$/i, "");
    }
    return (parts.find((part) => !/^\d+$/.test(part) && !part.startsWith("episodio-")) || "").replace(/-\d+x\d+$/i, "");
  } catch {
    return "";
  }
}

function candidateUrlMatchesCurrentTitle(candidateUrl: string, tmdbId: string, allTitles: string[], isMovie: boolean) {
  if (!candidateUrl || candidateUrl === "MANUAL" || candidateUrl.includes(tmdbId)) return true;
  const slug = extractCandidateSlug(candidateUrl);
  if (!slug) return true;
  return computeMatchScore(slug, slug, allTitles, isMovie) >= 0.4;
}

function hasAuthoritativeTitles(allTitles: string[]) {
  return allTitles.some((title) => {
    const normalized = title.toLowerCase();
    return (
      normalized.trim().length > 0 &&
      !normalized.includes("mock") &&
      !normalized.includes("error tmdb") &&
      !/^id\s+\d+/.test(normalized)
    );
  });
}

async function removeStalePlaybackVariants(mediaItemId: string, tmdbId: string, allTitles: string[], isMovie: boolean) {
  const variants = await prisma.videoVariant.findMany({
    where: { mediaItemId },
    select: { id: true, candidateUrl: true },
  });
  const staleIds = variants
    .filter((variant) => !candidateUrlMatchesCurrentTitle(variant.candidateUrl, tmdbId, allTitles, isMovie))
    .map((variant) => variant.id);

  if (staleIds.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.selectedPlayback.deleteMany({
      where: {
        mediaItemId,
        videoVariantId: { in: staleIds },
      },
    });
    await tx.videoVariant.deleteMany({ where: { id: { in: staleIds } } });
  });

  return staleIds.length;
}

// Helper: Check if a URL has content (iframe-aware)
async function checkUrl(url: string): Promise<boolean> {
  const cleanUrl = url.trim();
  const proxyPreference = cleanUrl.includes("cloudwindow-route.com") ? "never" : "auto";
  if (cleanUrl.startsWith("<")) return true; // manual script is always online
  if (cleanUrl.toLowerCase().includes(".m3u8") || cleanUrl.toLowerCase().includes("unlimplay.com/hls/")) {
    try {
      return await validateHlsUrl(cleanUrl);
    } catch {
      return false;
    }
  }

  // 1. Handle JKAnime player wrapper URLs (um, umv, jk, jkokru.php)
  if (cleanUrl.includes("jkanime.net/jkplayer/") || cleanUrl.includes("jkanime.net/jkokru.php")) {
    try {
      const res = await externalFetch(cleanUrl, {
        method: "GET",
        signal: AbortSignal.timeout(6000),
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Referer": "https://jkanime.net/"
        }
      });
      if (!res.ok) return false;
      const html = await res.text();
      
      // Look for stream URLs (m3u8, mp4, etc.)
      const streamMatch = html.match(/(https?:\/\/[^\s'"]+?\.(?:m3u8|mp4|webm|mkv)[^\s'"]*)/i);
      if (!streamMatch) {
        // If there's no stream URL, check if there is an okru embed
        const okruMatch = html.match(/ok\.ru\/videoembed\/(\d+)/i);
        if (okruMatch) {
          const nestedUrl = `https://ok.ru/videoembed/${okruMatch[1]}`;
          return checkUrl(nestedUrl);
        }
        return false; // No player or stream found
      }
      
      const nestedStreamUrl = streamMatch[1].replace(/\\/g, "");
      // Validate the actual stream URL is online
      try {
        const streamRes = await externalFetch(nestedStreamUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        return streamRes.status < 400;
      } catch {
        // Fallback to GET check in case HEAD is blocked but stream works
        try {
          const streamRes = await externalFetch(nestedStreamUrl, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });
          return streamRes.status < 400;
        } catch {
          return false;
        }
      }
    } catch (e) {
      console.warn(`[checkUrl] Failed checking JKAnime player: ${cleanUrl}`, e);
      return false;
    }
  }

  // 2. Handle standard Iframe embed hosts and OKru
  const iframeHosts = [
    "streamwish", "niramirus", "awish", "hlswish", "hanerix", "minochinos", "sfastwish",
    "wishembed", "embedwish", "strwish",
    "embedsito", "fembed", "feurl", "voe.sx", "voe.network", "voe-network.net", "repacklab.com",
    "mp4upload.com", "vsembed.ru", "vidlink.pro", "videasy.net", "player.videasy.net", "vidapi.xyz",
    "goodstream.one", "vimeos.net", "vimeus.com", "unlimplay.com",
    "supervideo.tv", "dropload.io", "uqload",
    "mega.nz", "yourupload", "hqq.tv", "streamtape", "ok.ru",
    "byse", "do7go", "fkplayer", "primeload", "dramiyos-cdn", "acek-cdn", "jamesbornmain", "callistanise"
  ];
  
  const isEmbedHost = !cleanUrl.includes(".m3u8") && !cleanUrl.includes(".mp4") && (
    iframeHosts.some((h) => cleanUrl.includes(h)) ||
    cleanUrl.includes("/e/") ||
    cleanUrl.includes("/v/") ||
    cleanUrl.includes("/embed/") ||
    cleanUrl.includes("embed-")
  );
  
  if (isEmbedHost) {
    try {
      const res = await externalFetch(cleanUrl, {
        method: "GET",
        signal: AbortSignal.timeout(6000),
        proxy: "never",
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36" 
        }
      });
      if (!res.ok) return false;
      const text = await res.text();
      const textLower = text.toLowerCase();
      
      const deletionIndicators = [
        "file not found",
        "file_not_found",
        "file was deleted",
        "no longer available",
        "no longer exists",
        "has been removed",
        "video not found",
        "invalid link",
        "decryption error",
        "video no disponible",
        "video no encontrado",
        "video has been blocked",
        "copyright claim",
        "copyright infringement",
        "copyright violation",
        "due to copyright",
        "copyright takedown",
        "reclamacion de copyright",
        "derechos de autor",
        "expired or has been deleted",
        "el archivo fue borrado",
        "archivo no encontrado",
        "video eliminado"
      ];
      
      const isDeleted = deletionIndicators.some(indicator => textLower.includes(indicator));
      if (isDeleted) {
        console.log(`[checkUrl] Detected deleted/blocked video on host for: ${cleanUrl}`);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[checkUrl] Failed to fetch embed URL: ${cleanUrl}`, e);
      return false;
    }
  }

  try {
    const res = await externalFetch(cleanUrl, {
      method: "HEAD",
      proxy: proxyPreference,
      timeoutMs: 5000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (res.status < 400) return true;
  } catch {
    // Some hosts block HEAD even when byte-range playback is available.
  }

  try {
    const res = await externalFetch(cleanUrl, {
      method: "GET",
      proxy: proxyPreference,
      timeoutMs: 7000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Range": "bytes=0-2047"
      }
    });
    return res.status < 400;
  } catch {
    return false;
  }
}

type CleanPlayableCandidate = {
  storedUrl: string;
  validationUrl: string;
  kind: "direct" | "iframe_fallback";
};

async function resolveCleanPlayableCandidate(url: string): Promise<CleanPlayableCandidate | null> {
  const cleanUrl = url.trim();
  if (cleanUrl.startsWith("<") || isUnsafeIframeHost(cleanUrl)) return null;
  if (isDirectStreamUrl(cleanUrl)) {
    return { storedUrl: cleanUrl, validationUrl: cleanUrl, kind: "direct" };
  }
  if (!isResolvableEmbedUrl(cleanUrl) && !isSupportedEmbedUrl(cleanUrl)) return null;

  if (cleanUrl.includes("unlimplay.com/embed/") || cleanUrl.includes("unlimplay.com/play.php/embed/")) {
    try {
      const alternates = await discoverUnlimplayAlternates(cleanUrl);
      for (const alternateUrl of alternates) {
        const resolvedData = await resolveUnlimplay(alternateUrl);
        const sources = resolvedData?.data?.sources || resolvedData?.sources || [];
        const hlsSource = sources.find((src: { type?: string }) => src.type === "hls") || sources[0];
        if ((resolvedData?.success || resolvedData?.status === "ok") && hlsSource?.file && isDirectStreamUrl(hlsSource.file) && isCleanPlaybackUrl(hlsSource.file)) {
          if (!(await validateHlsUrl(hlsSource.file))) {
            continue;
          }
          return { storedUrl: alternateUrl, validationUrl: hlsSource.file, kind: "direct" };
        }
      }
    } catch (error) {
      console.warn(`[Scraper] Could not resolve Unlimplay stream for ${cleanUrl}:`, error);
    }
  }

  try {
    const resolvedUrl = await resolveVideoUrl(cleanUrl);
    if (resolvedUrl !== cleanUrl && isDirectStreamUrl(resolvedUrl) && isCleanPlaybackUrl(resolvedUrl)) {
      return { storedUrl: cleanUrl, validationUrl: resolvedUrl, kind: "direct" };
    }
  } catch (error) {
    console.warn(`[Scraper] Could not resolve clean stream for ${cleanUrl}:`, error);
  }

  if (await checkUrl(cleanUrl)) {
    return { storedUrl: cleanUrl, validationUrl: cleanUrl, kind: "iframe_fallback" };
  }

  return null;
}

function cleanString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-_]/g, " ")
    .trim();
}

function getWords(str: string): string[] {
  const ignoredWords = new Set(["a", "i", "la", "de", "el", "en", "am", "the", "and", "los", "les", "del", "con", "para", "por", "que", "una", "uno", "pelicula", "movie"]);
  return cleanString(str)
    .split(/\s+/)
    .map(w => {
      if (/^\d+$/.test(w)) {
        return String(Number(w));
      }
      return w;
    })
    .filter(w => (w.length > 1 || /^\d+$/.test(w)) && !ignoredWords.has(w));
}

function extractNumbers(words: string[]): Set<string> {
  const nums = new Set<string>();
  const romanMap: Record<string, string> = {
    "i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"
  };
  for (const w of words) {
    if (/^\d+$/.test(w)) {
      const val = Number(w);
      if (val >= 1 && val <= 10) {
        nums.add(String(val));
      }
    } else if (romanMap[w]) {
      nums.add(romanMap[w]);
    }
  }
  return nums;
}

function hasMovieSignal(value: string) {
  const lower = value.toLowerCase();
  return [
    "movie",
    "pelicula",
    "film",
    "ova",
    "special",
    "especial",
    "gekijouban",
    "the-movie",
  ].some((keyword) => lower.includes(keyword));
}

function computeMatchScore(
  candidateSlug: string,
  candidateTitle: string,
  targets: string[],
  isMovie: boolean,
  candidateType?: string,
  season: number = 1
): number {
  if (targets.length === 0) return 0;

  // Extract all numbers from all target titles to find conflicts
  const allTargetNumbers = new Set<string>();
  for (const t of targets) {
    extractNumbers(getWords(t)).forEach(n => allTargetNumbers.add(n));
  }

  const candidateWordsList = [...getWords(candidateSlug), ...getWords(candidateTitle)];
  const candidateWords = new Set(candidateWordsList);
  const candidateNumbers = extractNumbers(candidateWordsList);
  const primaryWords = getWords(targets[0]);
  const targetCoverages = targets.map((target) => {
    const targetWords = getWords(target);
    if (targetWords.length === 0) return 0;
    const matches = targetWords.filter((tw) => {
      return candidateWords.has(tw) || Array.from(candidateWords).some((cw) => cw.includes(tw) || tw.includes(cw));
    }).length;
    return matches / targetWords.length;
  });
  const bestTargetCoverage = Math.max(...targetCoverages);

  const candidateCoverages = targets.map((target) => {
    const targetWords = getWords(target);
    if (candidateWords.size === 0) return 0;
    const matches = Array.from(candidateWords).filter((cw) => {
      return targetWords.includes(cw) || targetWords.some((tw) => tw.includes(cw) || cw.includes(tw));
    }).length;
    return matches / candidateWords.size;
  });
  const bestCandidateCoverage = Math.max(...candidateCoverages);

  if (bestTargetCoverage < 0.67 && (bestCandidateCoverage < 0.75 || candidateWords.size < 2)) {
    return 0;
  }

  if (isMovie && primaryWords.length >= 3 && !hasMovieSignal(`${candidateSlug} ${candidateTitle}`)) {
    if (bestTargetCoverage < 0.75) {
      return 0;
    }
  }

  // If targets and candidate both specify numbers, but they don't share any, it's a conflict
  if (allTargetNumbers.size > 0 && candidateNumbers.size > 0) {
    const hasSharedNumber = Array.from(candidateNumbers).some(n => allTargetNumbers.has(n));
    if (!hasSharedNumber) {
      return 0; // Number conflict (e.g. Movie 1 vs Movie 3)
    }
  }

  let maxScore = 0;
  
  // Generic franchise words to exclude from "unique words" checks
  const franchiseWords = new Set([
    "dragon", "ball", "z", "super", "gt", "kai", "naruto", 
    "shippuden", "one", "piece", "bleach", "boruto"
  ]);

  const uniqueCandidateWords = Array.from(candidateWords).filter(cw => !franchiseWords.has(cw));
  
  for (const target of targets) {
    const targetWords = getWords(target);
    if (targetWords.length === 0) continue;
    
    // Check franchise brand words alignment (e.g. Z vs Super)
    const targetFranchiseWords = targetWords.filter(tw => franchiseWords.has(tw));
    const hasAllFranchiseWords = targetFranchiseWords.every(tfw => candidateWords.has(tfw));
    if (!hasAllFranchiseWords) {
      continue; // Skip if candidate does not contain all target's franchise words
    }

    // Skip candidate if it contains franchise words not requested in target (e.g. Boruto/Shippuden for Naruto, Super for DBZ)
    const unrequestedFranchiseWords = Array.from(candidateWords).filter(
      cw => franchiseWords.has(cw) && !targetFranchiseWords.includes(cw)
    );
    if (unrequestedFranchiseWords.length > 0) {
      continue;
    }

    // Extract unique words (words that are not franchise names)
    const uniqueTargetWords = targetWords.filter(tw => !franchiseWords.has(tw));
    
    // If there are unique target words, at least one must fuzzy or exact match the unique candidate words
    if (uniqueTargetWords.length > 0) {
      const hasUniqueMatch = uniqueTargetWords.some(utw => {
        return uniqueCandidateWords.includes(utw) || uniqueCandidateWords.some(ucw => ucw.includes(utw) || utw.includes(ucw));
      });
      if (!hasUniqueMatch) {
        continue; // Skip this target to prevent false-positives
      }
    }
    
    // Count matches
    let matches = 0;
    for (const tw of targetWords) {
      const hasExact = candidateWords.has(tw);
      const hasFuzzy = Array.from(candidateWords).some(cw => cw.includes(tw) || tw.includes(cw));
      if (hasExact || hasFuzzy) {
        matches++;
      }
    }
    let score = matches / targetWords.length;

    // Length penalty: if candidate has extra words not in target, penalize to prefer exact title matches
    const extraCandidateWords = candidateWords.size - matches;
    if (extraCandidateWords > 0) {
      score *= Math.max(0.4, 1 - (extraCandidateWords * 0.15));
    }

    // Distinguishing words check: If the matched target is shorter/less specific than the primary title,
    // and the candidate does not match any of the missing primary words, penalize the score.
    // BUT only apply this if the target shares at least one word with the primary title (avoiding translating title conflicts)
    const hasSharedWordWithPrimary = targetWords.some(tw => primaryWords.includes(tw));
    if (hasSharedWordWithPrimary) {
      const missingPrimaryWords = primaryWords.filter(pw => !targetWords.includes(pw));
      if (missingPrimaryWords.length > 0) {
        const hasAnyMissingPrimaryMatch = missingPrimaryWords.some(mpw => {
          return candidateWords.has(mpw) || Array.from(candidateWords).some(cw => cw.includes(mpw) || mpw.includes(cw));
        });
        if (!hasAnyMissingPrimaryMatch) {
          score *= 0.1; // heavily penalize since it only matches the generic/franchise name
        }
      }
    }

    if (score > maxScore) {
      maxScore = score;
    }
  }

  if (maxScore === 0) return 0;

  // Apply movie/tv filters and bonuses based on explicit keywords
  const candidateSlugLower = candidateSlug.toLowerCase();
  const candidateTitleLower = candidateTitle.toLowerCase();
  
  const hasMovieKeywords = hasMovieSignal(`${candidateSlugLower} ${candidateTitleLower}`);

  const candidateTextLower = `${candidateSlugLower} ${candidateTitleLower}`;
  const targetTextLower = targets.join(" ").toLowerCase();
  const hasEpisodeTitleWord =
    isMovie &&
    (targetTextLower.includes("episode") || targetTextLower.includes("episodio")) &&
    (candidateTextLower.includes("episode") || candidateTextLower.includes("episodio"));
  const hasTVKeywords = candidateSlugLower.includes("serie") ||
                        candidateSlugLower.includes("tv") ||
                        candidateTitleLower.includes("serie") ||
                        candidateTitleLower.includes("tv") ||
                        candidateSlugLower.includes("season") ||
                        candidateTitleLower.includes("season") ||
                        candidateSlugLower.includes("temporada") ||
                        candidateTitleLower.includes("temporada") ||
                        candidateSlugLower.includes("capitulo") ||
                        candidateTitleLower.includes("capitulo") ||
                        (!hasEpisodeTitleWord && (
                          candidateSlugLower.includes("episodio") ||
                          candidateTitleLower.includes("episodio") ||
                          candidateSlugLower.includes("episode") ||
                          candidateTitleLower.includes("episode")
                        ));

  const isCandidateTV = candidateType === "tv";
  const isCandidateMovieType = candidateType === "movie" || candidateType === "ova";

  if (isMovie) {
    if (candidateType) {
      if (isCandidateMovieType) {
        maxScore *= 1.2;
      } else if (isCandidateTV) {
        maxScore *= 0.1; // heavily penalize TV series candidates
      }
    } else {
      if (hasMovieKeywords) {
        maxScore *= 1.2;
      } else if (hasTVKeywords) {
        maxScore *= 0.1; // heavily penalize likely TV show candidates
      }
    }
  } else {
    if (candidateType) {
      if (isCandidateTV) {
        maxScore *= 1.2;
      } else if (isCandidateMovieType) {
        maxScore *= 0.1; // heavily penalize movies
      }
    } else {
      if (hasMovieKeywords) {
        maxScore *= 0.1; // heavily penalize movie urls
      } else if (hasTVKeywords) {
        maxScore *= 1.2;
      }
    }
  }

  // Prioritize latino matches since the user's priority is Latino
  const isLatino = candidateSlugLower.includes("latino") || candidateTitleLower.includes("latino");
  if (isLatino) {
    maxScore *= 1.05; // Give a 5% bonus for Latino dubbed candidates
  }

  // Season disambiguation logic
  const candidateLower = `${candidateSlugLower} ${candidateTitleLower}`;
  if (!isMovie) {
    if (season > 1) {
      const seasonPatterns = [
        `season ${season}`,
        `season-${season}`,
        `season${season}`,
        `temporada ${season}`,
        `temporada-${season}`,
        `${season}nd season`,
        `${season}rd season`,
        `${season}th season`,
        `${season}nd-season`,
        `${season}rd-season`,
        `${season}th-season`,
      ];
      if (seasonPatterns.some((p) => candidateLower.includes(p))) {
        maxScore *= 1.3;
      }
    } else if (season === 1) {
      // If asking for Season 1, penalize candidates that mention Season 2, 3, etc.
      const higherSeasonPatterns = [
        "2nd-season", "2nd season", "season-2", "season 2", "temporada-2", "temporada 2",
        "3rd-season", "3rd season", "season-3", "season 3", "temporada-3", "temporada 3",
        "4th-season", "4th season", "season-4", "season 4", "temporada-4", "temporada 4"
      ];
      if (higherSeasonPatterns.some((p) => candidateLower.includes(p))) {
        maxScore *= 0.1;
      }
    }
  }

  return maxScore;
}

// Helper: Find AnimeFLV episode URL using their public search API
async function findAnimeFLVUrl(
  title: string,
  originalTitle: string,
  allTitles: string[],
  isMovie: boolean,
  episode: number,
  season: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const apiBase = "https://www3.animeflv.net/api/animes/search?value=";

  const searchQueries: string[] = [];
  for (const t of allTitles) {
    searchQueries.push(t);
    if (season > 1) {
      searchQueries.push(`${t} season ${season}`);
      searchQueries.push(`${t} ${season}`);
    }
    const parts = t.split(/[:-]/);
    if (parts.length > 1 && parts[0].trim().length > 3) {
      searchQueries.push(parts[0].trim());
      if (season > 1) {
        searchQueries.push(`${parts[0].trim()} season ${season}`);
      }
    }
  }
  
  const cleanQueries = searchQueries
    .map(q => q.replace(/[:-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((q, i, a) => q.length > 3 && a.indexOf(q) === i)
    .slice(0, 4);

  const candidatesMap = new Map<string, { slug: string; title: string; type?: string }>();

  for (const q of cleanQueries) {
    if (candidatesMap.size > 0) break;
    try {
      const res = await externalFetch(`${apiBase}${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": ua }
      });
      if (!res.ok) continue;
      const data = await res.json() as Array<{ slug: string; title: string; type?: string }>;
      if (!data || !Array.isArray(data)) continue;

      for (const item of data) {
        if (item.slug) {
          candidatesMap.set(item.slug, item);
        }
      }
    } catch (e) {
      console.warn(`[AnimeFLV] Search error for query "${q}":`, e);
    }
  }

  if (candidatesMap.size === 0) return null;

  const scored = Array.from(candidatesMap.values()).map(item => {
    const score = computeMatchScore(item.slug, item.title, allTitles, isMovie, item.type, season);
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  console.log(`[AnimeFLV] Scored candidates:`, scored.map(s => `${s.item.slug} (${s.item.type}) -> score: ${s.score.toFixed(2)}`));

  for (const { item, score } of scored) {
    if (score < 0.4) break;

    const episodeNum = isMovie ? 1 : episode;
    const epUrl = `https://www4.animeflv.net/ver/${item.slug}-${episodeNum}`;
    try {
      const check = await externalFetch(epUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": ua }
      });
      if (check.ok) {
        console.log(`[AnimeFLV] Matched best candidate: ${epUrl} (score: ${score.toFixed(2)})`);
        return epUrl;
      }
    } catch { /* try next */ }
  }

  return null;
}

// Helper: Find JKAnime episode URL using their search page
async function findJKAnimeUrl(
  title: string,
  originalTitle: string,
  allTitles: string[],
  isMovie: boolean,
  episode: number,
  season: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  const slugVariants: string[] = [];
  for (const t of allTitles) {
    slugVariants.push(titleToSlug(t));
  }
  const cleanSlugs = slugVariants.filter((s, i, a) => s.length > 0 && a.indexOf(s) === i);

  const suffixes = isMovie ? ["", "1/"] : [`${episode}/`];
  for (const slug of cleanSlugs) {
    const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined, season);
    if (score < 0.4) {
      console.log(`[JKAnime] Skipping direct slug candidate with low score (${score.toFixed(2)}): ${slug}`);
      continue;
    }

    for (const suffix of suffixes) {
      const url = `https://jkanime.net/${slug}/${suffix}`;
      try {
        const res = await externalFetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": ua }
        });
        if (res.ok) {
          console.log(`[JKAnime] Direct slug match: ${url}`);
          return url;
        }
      } catch { /* try next */ }
    }
  }

  const searchQueries: string[] = [];
  for (const t of allTitles) {
    searchQueries.push(t);
    if (season > 1) {
      searchQueries.push(`${t} season ${season}`);
      searchQueries.push(`${t} ${season}`);
      const suffix = season === 2 ? "2nd" : season === 3 ? "3rd" : `${season}th`;
      searchQueries.push(`${t} ${suffix} season`);
    }
    const parts = t.split(/[:-]/);
    if (parts.length > 1 && parts[0].trim().length > 3) {
      searchQueries.push(parts[0].trim());
      if (season > 1) {
        searchQueries.push(`${parts[0].trim()} season ${season}`);
      }
    }
  }
  const cleanQueries = searchQueries.filter((q, i, a) => q.length > 3 && a.indexOf(q) === i);

  const foundCandidates = new Map<string, { slug: string; base: string }>();
  const ignoredSlugs = new Set([
    "directorio", "horario", "comunidad", "aplicacion", "historial", 
    "estrenos", "top", "buscar", "usuario", "guardado", "notificaciones", 
    "dash", "login", "register", "logout"
  ]);

  for (const term of cleanQueries) {
    try {
      const searchUrl = `https://jkanime.net/buscar/${encodeURIComponent(term)}/`;
      const res = await externalFetch(searchUrl, {
        signal: AbortSignal.timeout(7000),
        headers: { "User-Agent": ua }
      });
      if (!res.ok) continue;
      const html = await res.text();

      const re = /href="(https?:\/\/jkanime\.net\/([a-z0-9-]+)\/)"/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const [, , slug] = m;
        if (!ignoredSlugs.has(slug)) {
          foundCandidates.set(slug, { slug, base: `https://jkanime.net/${slug}/` });
        }
      }
    } catch (e) {
      console.warn(`[JKAnime] Search error for "${term}":`, e);
    }
  }

  if (foundCandidates.size === 0) return null;

  const scored = Array.from(foundCandidates.values()).map(item => {
    const score = computeMatchScore(item.slug, item.slug, allTitles, isMovie, undefined, season);
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  console.log(`[JKAnime] Scored candidates:`, scored.map(s => `${s.item.slug} -> score: ${s.score.toFixed(2)}`));

  const searchSuffixes = isMovie ? ["1/", ""] : [`${episode}/`];
  for (const { item, score } of scored) {
    if (score < 0.4) break;

    for (const suffix of searchSuffixes) {
      const episodeUrl = `${item.base}${suffix}`;
      try {
        const chk = await externalFetch(episodeUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": ua }
        });
        if (chk.ok) {
          console.log(`[JKAnime] Matched best candidate: ${episodeUrl} (score: ${score.toFixed(2)})`);
          return episodeUrl;
        }
      } catch { /* try next */ }
    }
  }

  return null;
}

// Helper: Find TioAnime episode URL using their directory search
async function findTioAnimeUrl(
  title: string,
  originalTitle: string,
  allTitles: string[],
  isMovie: boolean,
  episode: number,
  season: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const searchQueries: string[] = [];
  for (const t of allTitles) {
    searchQueries.push(t);
    if (season > 1) {
      searchQueries.push(`${t} season ${season}`);
      searchQueries.push(`${t} ${season}`);
    }
  }
  const cleanQueries = searchQueries.filter((q, i, a) => q.length > 2 && a.indexOf(q) === i).slice(0, 4);

  const foundCandidates = new Map<string, { slug: string; base: string }>();

  for (const term of cleanQueries) {
    if (foundCandidates.size > 0) break;
    try {
      const searchUrl = `https://tioanime.com/directorio?q=${encodeURIComponent(term)}`;
      const res = await externalFetch(searchUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": ua },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const re = /href="(\/anime\/([a-z0-9-]+))"/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const slug = m[2];
        if (!foundCandidates.has(slug)) {
          foundCandidates.set(slug, { slug, base: `https://tioanime.com/ver/${slug}-` });
        }
      }
    } catch {
      // Continue next query
    }
  }

  if (foundCandidates.size === 0) return null;

  const scored = Array.from(foundCandidates.values())
    .map((item) => {
      const score = computeMatchScore(item.slug, item.slug, allTitles, isMovie, undefined, season);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  const epNum = isMovie ? 1 : episode;
  for (const { item, score } of scored) {
    if (score < 0.4) break;
    const episodeUrl = `${item.base}${epNum}`;
    try {
      const chk = await externalFetch(episodeUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": ua },
      });
      if (chk.ok) {
        console.log(`[TioAnime] Matched candidate: ${episodeUrl} (score: ${score.toFixed(2)})`);
        return episodeUrl;
      }
    } catch {
      // Try next
    }
  }

  return null;
}

async function findCuevana3Url(
  allTitles: string[],
  isMovie: boolean,
  releaseYear?: number,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const bases = ["https://cuevana3i.you", "https://cuevana3.ch"];
  const slugVariants: string[] = [];

  for (const t of allTitles) {
    const baseSlug = titleToSlug(t);
    if (baseSlug) {
      slugVariants.push(baseSlug);
      if (releaseYear) {
        slugVariants.push(`${baseSlug}-${releaseYear}`);
      }
    }
  }

  const cleanSlugs = slugVariants.filter((s, i, a) => s.length > 0 && a.indexOf(s) === i);

  for (const base of bases) {
    // 1. Try direct slug URLs first
    for (const slug of cleanSlugs) {
      const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined);
      if (score < 0.4) {
        continue;
      }

      let url = "";
      if (isMovie) {
        url = `${base}/pelicula/${slug}`;
      } else {
        url = `${base}/serie/${slug}/episodio-${season}x${episode}`;
      }

      try {
        const res = await externalFetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": ua }
        });
        if (res.status === 200) {
          console.log(`[Cuevana3] Direct slug match: ${url}`);
          return url;
        }
      } catch { /* try next */ }
    }

    // 2. Fallback: search using the site's search endpoint
    const searchQueries = allTitles.slice(0, 3);
    for (const q of searchQueries) {
      try {
        const searchUrl = `${base}/?s=${encodeURIComponent(q)}`;
        const res = await externalFetch(searchUrl, {
          signal: AbortSignal.timeout(7000),
          headers: { "User-Agent": ua }
        });
        if (!res.ok) continue;
        const html = await res.text();

        const linkRegex = isMovie
          ? /href="(https?:\/\/(?:cuevana3\.cl|cuevana3i\.you|cuevana3\.ch)\/pelicula\/([^"\/]+?))"/g
          : /href="(https?:\/\/(?:cuevana3\.cl|cuevana3i\.you|cuevana3\.ch)\/serie\/([^"\/]+?))"/g;
        let m;
        while ((m = linkRegex.exec(html)) !== null) {
          const found = m[1];
          const slug = m[2];
          const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined);
          if (score < 0.4) continue;

          if (isMovie && !found.includes("episodio")) {
            console.log(`[Cuevana3] Search match approved (score ${score.toFixed(2)}): ${found}`);
            return found;
          } else if (!isMovie && found.includes(`episodio-${season}x${episode}`)) {
            console.log(`[Cuevana3] Search match approved (score ${score.toFixed(2)}): ${found}`);
            return found;
          }
        }
      } catch { /* try next */ }
    }
  }

  return null;
}

// Helper: Find CineCalidad URL using search
async function findCineCalidadUrl(
  allTitles: string[],
  isMovie: boolean,
  releaseYear?: number,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const base = "https://www.cinecalidad.am";

  // 1. Try direct slug URLs (CineCalidad uses /ver-pelicula/ and /ver-serie/)
  const slugVariants: string[] = [];
  for (const t of allTitles) {
    const baseSlug = titleToSlug(t);
    if (baseSlug) {
      slugVariants.push(baseSlug);
      if (releaseYear) {
        slugVariants.push(`${baseSlug}-${releaseYear}`);
      }
    }
  }
  const cleanSlugs = slugVariants.filter((s, i, a) => s.length > 0 && a.indexOf(s) === i);

  for (const slug of cleanSlugs) {
    const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined);
    if (score < 0.4) {
      console.log(`[CineCalidad] Skipping direct slug candidate with low score (${score.toFixed(2)}): ${slug}`);
      continue;
    }

    let url = "";
    if (isMovie) {
      url = `${base}/ver-pelicula/${slug}/`;
    } else {
      url = `${base}/ver-serie/${slug}/episodio-${season}x${episode}/`;
    }
    try {
      const res = await externalFetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": ua }
      });
      if (res.status === 200) {
        console.log(`[CineCalidad] Direct slug match: ${url}`);
        return url;
      }
    } catch { /* try next */ }
  }

  // 2. Fallback: active search via /?s=query
  const searchQueries = allTitles.slice(0, 3);
  for (const q of searchQueries) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(q)}`;
      const res = await externalFetch(searchUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": ua,
          "Accept": "text/html",
          "Accept-Language": "es-MX,es;q=0.9"
        }
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Find /ver-pelicula/ or /ver-serie/ links in results and capture slug
      const linkRegex = isMovie
        ? /href="(https?:\/\/www\.cinecalidad\.am\/ver-pelicula\/([^"\/]+?)\/?)"/g
        : /href="(https?:\/\/www\.cinecalidad\.am\/ver-serie\/([^"\/]+?)\/?)"/g;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const found = m[1];
        const slug = m[2];
        const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined);
        if (score < 0.4) {
          console.log(`[CineCalidad] Skipping search match with low score (${score.toFixed(2)}): ${found}`);
          continue;
        }

        // For series: confirm it's an episode page
        if (!isMovie) {
          // Fetch the series page to find the specific episode URL
          try {
            const seriesBase = found.replace(/\/episodio-.*/, "");
            const epUrl = `${seriesBase}/episodio-${season}x${episode}/`;
            const epRes = await externalFetch(epUrl, {
              method: "HEAD",
              signal: AbortSignal.timeout(5000),
              headers: { "User-Agent": ua }
            });
            if (epRes.status === 200) {
              console.log(`[CineCalidad] Search -> episode match approved (score ${score.toFixed(2)}): ${epUrl}`);
              return epUrl;
            }
          } catch { /* skip */ }
        } else {
          // For movies: skip duplicates and return first clean result
          const cleanSlug = found.replace(/^.*\/ver-pelicula\//, "").replace(/\/$/, "");
          if (cleanSlug && !cleanSlug.includes("/")) {
            console.log(`[CineCalidad] Search match approved (score ${score.toFixed(2)}): ${found}`);
            // Verify the URL actually resolves
            try {
              const verifyRes = await externalFetch(found, {
                method: "HEAD",
                signal: AbortSignal.timeout(5000),
                headers: { "User-Agent": ua }
              });
              if (verifyRes.status === 200) return found;
            } catch { /* skip */ }
          }
        }
      }
    } catch (e) {
      console.warn(`[CineCalidad] Search error for "${q}":`, e);
    }
  }

  return null;
}

async function findGnulaUrl(
  allTitles: string[],
  isMovie: boolean,
  releaseYear?: number,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const base = "https://wnv5.gnula.cc";
  const slugVariants: string[] = [];

  const relevantTitles = allTitles
    .filter((title) => /[a-z0-9]/i.test(title))
    .slice(0, 5);

  for (const title of relevantTitles) {
    const slug = titleToSlug(title);
    if (!slug) continue;
    slugVariants.push(slug);
    if (releaseYear) slugVariants.push(`${slug}-${releaseYear}`);
  }

  const cleanSlugs = slugVariants.filter((slug, index, array) => slug.length > 0 && array.indexOf(slug) === index);

  for (const slug of cleanSlugs) {
    const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined);
    if (score < 0.4) {
      console.log(`[Gnula] Skipping direct slug candidate with low score (${score.toFixed(2)}): ${slug}`);
      continue;
    }

    const urls = isMovie
      ? [
          `${base}/pelicula/${slug}/`,
          `${base}/ver-pelicula/${slug}/`,
          `${base}/movie/${slug}/`,
        ]
      : [
          `${base}/ver-episode/${slug}-${season}x${episode}/`,
          `${base}/episodio/${slug}-${season}x${episode}/`,
          `${base}/serie/${slug}/episodio-${season}x${episode}/`,
          `${base}/series/${slug}/episodio-${season}x${episode}/`,
          `${base}/capitulo/${slug}-${season}x${episode}/`,
        ];

    for (const url of urls) {
      try {
        const res = await externalFetch(url, {
          method: "GET",
          proxy: "auto",
          timeoutMs: 9000,
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            "Referer": base,
          }
        });
        const html = await res.text();
        if (res.status === 403 && /cloudflare|just a moment|verificaci[oó]n de seguridad/i.test(html)) {
          console.warn(`[Gnula] Cloudflare/anti-bot blocked access to ${url}`);
          continue;
        }
        if (res.ok && !/404|not found|no encontrado/i.test(html.slice(0, 1500))) {
          console.log(`[Gnula] Direct slug match: ${url}`);
          return url;
        }
      } catch (error) {
        console.warn(`[Gnula] Direct candidate failed ${url}:`, error);
      }
    }
  }

  const searchQueries = allTitles.slice(0, 3);
  for (const query of searchQueries) {
    try {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const res = await externalFetch(searchUrl, {
        proxy: "auto",
        timeoutMs: 9000,
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          "Referer": base,
        }
      });
      const html = await res.text();
      if (!res.ok) continue;

      const linkRegex = /href="(https?:\/\/wnv5\.gnula\.cc\/(?:serie|series|pelicula|episodio|capitulo|ver-pelicula|ver-episode)\/([^"\/]+)[^"]*)"/g;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const found = match[1];
        const slug = match[2];
        const score = computeMatchScore(slug, slug, allTitles, isMovie, undefined);
        if (score < 0.4) {
          console.log(`[Gnula] Skipping search match with low score (${score.toFixed(2)}): ${found}`);
          continue;
        }

        if (isMovie) return found;
        if (found.includes(`${season}x${episode}`) || found.includes(`episodio-${season}x${episode}`)) return found;
      }
    } catch (error) {
      console.warn(`[Gnula] Search error for "${query}":`, error);
    }
  }

  return null;
}

function randomAscii(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < length; i++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

function createDoramasFlixPlatformToken() {
  const expiresAt = Math.round(Date.now() / 1000 + 43200).toString();
  return `${randomAscii(10)}_${randomAscii(12)}_${randomAscii(5)}${Buffer.from(expiresAt, "utf8").toString("base64")}`;
}

type DoramasFlixSearchItem = {
  slug?: string;
  name?: string;
  name_es?: string;
};

async function doramasFlixGql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await externalFetch("https://sv1.fluxcedene.net/api/gql", {
      method: "POST",
      proxy: "auto",
      timeoutMs: 12000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://doramasflix.in",
        "Referer": "https://doramasflix.in/",
        "Authorization": "Bear ",
        "x-access-jwt-token": "",
        "x-access-platform": createDoramasFlixPlatformToken(),
        "platform": "doramasflix",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      console.warn(`[Doramasflix] GraphQL request failed with status ${res.status}`);
      return null;
    }

    return await res.json() as T;
  } catch (error) {
    console.warn("[Doramasflix] GraphQL request error:", error);
    return null;
  }
}

function scoreDoramasFlixItem(item: DoramasFlixSearchItem, allTitles: string[], isMovie: boolean) {
  const candidates = [item.slug, item.name, item.name_es].filter(Boolean) as string[];
  return Math.max(0, ...candidates.map((candidate) => computeMatchScore(candidate, candidate, allTitles, isMovie, undefined)));
}

function hasDoramasFlixTitlePhrase(item: DoramasFlixSearchItem, allTitles: string[]) {
  const candidates = [item.slug, item.name, item.name_es]
    .filter(Boolean)
    .map((value) => getWords(value as string).join(" "))
    .filter(Boolean);
  const targets = allTitles.map((value) => getWords(value).join(" ")).filter(Boolean);

  return candidates.some((candidate) =>
    targets.some((target) => candidate === target || candidate.includes(target) || target.includes(candidate))
  );
}

async function findDoramasFlixUrl(
  allTitles: string[],
  isMovie: boolean,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const searchQuery = `
    query searchAll($input: String!) {
      searchDorama(input: $input, limit: 5) {
        slug
        name
        name_es
      }
      searchMovie(input: $input, limit: 5) {
        slug
        name
        name_es
      }
    }
  `;

  const detailQuery = `
    query detailDoramaExtra($slug: String!, $season_number: Float!) {
      listEpisodes(
        sort: NUMBER_ASC
        filter: {
          type_serie: "dorama"
          serie_slug: $slug
          season_number: $season_number
        }
      ) {
        slug
        name
        name_es
        season_number
        episode_number
      }
    }
  `;

  const queries = allTitles
    .filter((title, index, array) => title.length > 2 && array.indexOf(title) === index)
    .slice(0, 4);

  for (const input of queries) {
    const data = await doramasFlixGql<{
      data?: {
        searchDorama?: DoramasFlixSearchItem[];
        searchMovie?: DoramasFlixSearchItem[];
      };
    }>(searchQuery, { input });

    const results = isMovie ? data?.data?.searchMovie || [] : data?.data?.searchDorama || [];
    const ranked = results
      .map((item) => ({ item, score: scoreDoramasFlixItem(item, allTitles, isMovie) }))
      .filter(({ item, score }) => Boolean(item.slug) && score >= 0.4 && hasDoramasFlixTitlePhrase(item, allTitles))
      .sort((a, b) => b.score - a.score);

    for (const { item, score } of ranked) {
      if (!item.slug) continue;
      if (isMovie) {
        const url = `https://doramasflix.in/peliculas-online/${item.slug}`;
        console.log(`[Doramasflix] Movie match approved (score ${score.toFixed(2)}): ${url}`);
        return url;
      }

      const detail = await doramasFlixGql<{
        data?: {
          listEpisodes?: Array<{
            slug?: string;
            season_number?: number;
            episode_number?: number;
          }>;
        };
      }>(detailQuery, { slug: item.slug, season_number: season });

      const episodeMatch = detail?.data?.listEpisodes?.find((ep) => ep.episode_number === episode && ep.slug);
      if (episodeMatch?.slug) {
        const url = `https://doramasflix.in/episodios/${episodeMatch.slug}`;
        console.log(`[Doramasflix] Episode match approved (score ${score.toFixed(2)}): ${url}`);
        return url;
      }
    }
  }

  return null;
}

async function findCineHdPlusUrl(
  tmdbId: string,
  allTitles: string[],
  isMovie: boolean,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const base = "https://cinehdplus.biz";
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const queries = allTitles
    .filter((title, index, array) => title.length > 2 && array.indexOf(title) === index)
    .slice(0, 4);

  for (const query of queries) {
    try {
      const searchUrl = `${base}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
      const res = await externalFetch(searchUrl, {
        proxy: "auto",
        timeoutMs: 12000,
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Referer": base,
        },
      });
      if (!res.ok) continue;

      const html = await res.text();
      const matches = Array.from(html.matchAll(/href="(https?:\/\/cinehdplus\.(?:zone|biz)\/peliculas\/(\d+)-([^"]+?)(?:-ver-online-hd)?\.html)"/g));
      const unique = new Map<string, { url: string; slug: string }>();
      for (const match of matches) {
        unique.set(match[1], { url: match[1], slug: match[3] });
      }

      const ranked = Array.from(unique.values())
        .map((item) => ({ item, score: computeMatchScore(item.slug, item.slug, allTitles, isMovie, undefined) }))
        .filter(({ score }) => score >= 0.45)
        .sort((a, b) => b.score - a.score);

      for (const { item, score } of ranked.slice(0, 5)) {
        try {
          const detailRes = await externalFetch(item.url, {
            proxy: "auto",
            timeoutMs: 12000,
            headers: { "User-Agent": ua, "Referer": searchUrl },
          });
          if (!detailRes.ok) continue;
          const detailHtml = await detailRes.text();
          const tmdbRaw = detailHtml.match(/var\s+tmdbRaw\s*=\s*['"]([^'"]+)['"]/)?.[1];
          const detailTmdb = tmdbRaw ? tmdbRaw.split("-")[0].trim() : "";
          if (detailTmdb !== tmdbId) {
            console.log(`[CineHDPlus] Skipping TMDB mismatch ${detailTmdb || "unknown"} for ${item.url}`);
            continue;
          }

          const supportsDynamicSeriesPlayer = /vimeus\.com\/e\/serie/i.test(detailHtml);
          if (!isMovie && !supportsDynamicSeriesPlayer && !detailHtml.includes(`id="serie-${season}_${episode}"`)) {
            console.log(`[CineHDPlus] Skipping missing episode ${season}x${episode}: ${item.url}`);
            continue;
          }

          const finalUrl = isMovie ? item.url : `${item.url}#s=${season}&e=${episode}`;
          console.log(`[CineHDPlus] Match approved (score ${score.toFixed(2)}): ${finalUrl}`);
          return finalUrl;
        } catch (error) {
          console.warn(`[CineHDPlus] Detail candidate failed ${item.url}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[CineHDPlus] Search error for "${query}":`, error);
    }
  }

  return null;
}

async function findFullOnlineUrl(
  tmdbId: string,
  allTitles: string[],
  isMovie: boolean,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const base = PELIS_JUANITA_BASE_URL.replace(/\/$/, "");
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const accessToken = process.env.PELISJUANITA_API_TOKEN?.trim();
  const requestHeaders = (referer: string) => ({
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": referer,
    ...(accessToken ? { "X-Badrockplyr-Token": accessToken, "X-Bandrackply-Token": accessToken } : {}),
  });
  const queries = allTitles
    .filter((title, index, array) => title.length > 2 && array.indexOf(title) === index)
    .slice(0, 4);

  for (const query of queries) {
    try {
      const searchUrl = `${base}/movies/movies.php?s=${encodeURIComponent(query)}`;
      const res = await externalFetch(searchUrl, {
        proxy: "auto",
        timeoutMs: 12000,
        headers: requestHeaders(`${base}/movies/`),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const ranked = extractPelisJuanitaCandidates(html, isMovie ? "movie" : "tv")
        .map((item) => ({ item, score: computeMatchScore(item.slug, item.label || item.slug, allTitles, isMovie, undefined) }))
        .filter(({ score }) => score >= 0.45)
        .sort((a, b) => b.score - a.score);

      for (const { item, score } of ranked.slice(0, 5)) {
        try {
          const detailUrl = isMovie
            ? `${base}/movies/pelicula/${encodeURIComponent(item.slug)}`
            : `${base}/series/serieInfo.php?nombreSerie=${encodeURIComponent(item.slug)}&nroTemporada=${season}&nroEpisodio=${episode}`;
          const detailRes = await externalFetch(detailUrl, {
            proxy: "auto",
            timeoutMs: 12000,
            headers: requestHeaders(isMovie ? `${base}/movies/` : `${base}/series/ver-serie/${item.slug}`),
          });
          if (!detailRes.ok) continue;

          const detailHtml = await detailRes.text();
          const detailTmdb = detailHtml.match(/<meta\s+name=["']tmdb-id["']\s+content=["']([^"']+)/i)?.[1]?.trim();
          const detailSeason = detailHtml.match(/<meta\s+name=["']snum["']\s+content=["']([^"']+)/i)?.[1]?.trim();
          const detailEpisode = detailHtml.match(/<meta\s+name=["']enum["']\s+content=["']([^"']+)/i)?.[1]?.trim();

          if (!isMovie && detailTmdb !== tmdbId) {
            console.log(`[Pelis Juanita] Skipping TMDB mismatch ${detailTmdb || "unknown"} for ${detailUrl}`);
            continue;
          }
          if (!isMovie && detailSeason && Number(detailSeason) !== season) continue;
          if (!isMovie && detailEpisode && Number(detailEpisode) !== episode) continue;
          if (!/data-tipo=['"]stream['"]/i.test(detailHtml)) continue;

          console.log(`[Pelis Juanita] Match approved (score ${score.toFixed(2)}): ${detailUrl}`);
          return detailUrl;
        } catch (error) {
          console.warn(`[Pelis Juanita] Detail candidate failed ${item.slug}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[Pelis Juanita] Search error for "${query}":`, error);
    }
  }

  return null;
}



async function fetchUnlimplayVideos(
  tmdbId: string,
  isMovie: boolean,
  season: number = 1,
  episode: number = 1,
  originalLanguage?: string | null
): Promise<Array<{ url: string; language: string; quality: string }> | null> {
  type UnlimplayApiItem = { embed_url?: string; language?: string };
  type UnlimplayApiResponse = { success?: boolean; data?: UnlimplayApiItem[] };
  const url = isMovie 
    ? `https://unlimplay.com/play.php/embed/movie/${tmdbId}?api=1`
    : `https://unlimplay.com/play.php/embed/tv/${tmdbId}/${season}/${episode}?api=1`;

  try {
    const res = await externalFetch(url, {
      proxy: "never",
      timeoutMs: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) return null;
    const data = await res.json() as UnlimplayApiResponse;
    if (data.success && Array.isArray(data.data)) {
      return data.data.flatMap((item) => {
        if (!item.embed_url) return [];
        const language = normalizeRelayLanguage(item.language, originalLanguage);
        return {
          url: item.embed_url,
          language,
          quality: "HD"
        };
      });
    }
  } catch (e) {
    console.error("[Unlimplay] API fetch error:", e);
  }
  return null;
}

function buildGnulaCandidateUrl(
  allTitles: string[],
  isMovie: boolean,
  releaseYear?: number,
  season: number = 1,
  episode: number = 1
) {
  const title = allTitles.find((value) => /[a-z0-9]/i.test(value)) || allTitles[0] || "";
  const slug = titleToSlug(title);
  if (!slug) return "https://wnv5.gnula.cc";
  if (isMovie) {
    return releaseYear
      ? `https://wnv5.gnula.cc/ver-pelicula/${slug}-${releaseYear}/`
      : `https://wnv5.gnula.cc/ver-pelicula/${slug}/`;
  }
  return `https://wnv5.gnula.cc/ver-episode/${slug}-${season}x${episode}/`;
}

async function fetchGnulaRelayVideos(
  tmdbId: string,
  allTitles: string[],
  isMovie: boolean,
  releaseYear?: number,
  season: number = 1,
  episode: number = 1,
  originalLanguage?: string | null
): Promise<{ candidateUrl: string; videos: Array<{ url: string; language: string; quality: string }> } | null> {
  type UnlimplayApiItem = {
    tmdb_id?: string;
    type?: string;
    language?: string;
    embed_url?: string;
    server_count?: number;
  };
  type UnlimplayApiResponse = {
    success?: boolean;
    data?: UnlimplayApiItem[];
    total_servers?: number;
  };

  const apiUrl = isMovie
    ? `https://unlimplay.com/play.php/embed/movie/${tmdbId}?api=1`
    : `https://unlimplay.com/play.php/embed/tv/${tmdbId}/${season}/${episode}?api=1`;

  try {
    const res = await externalFetch(apiUrl, {
      proxy: "never",
      timeoutMs: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json,text/plain,*/*",
      },
    });
    if (!res.ok) return null;

    const data = await res.json() as UnlimplayApiResponse;
    if (!data.success || !Array.isArray(data.data)) return null;

    const videos = data.data.flatMap((item) => {
      if (!item.embed_url || item.tmdb_id !== tmdbId) return [];
      const itemType = (item.type || "").toLowerCase();
      if (isMovie && itemType && itemType !== "movie") return [];
      if (!isMovie && itemType && itemType !== "tv") return [];

      const language = normalizeRelayLanguage(item.language, originalLanguage);

      return [{
        url: item.embed_url,
        language,
        quality: "HD",
      }];
    });

    if (videos.length === 0) return null;

    return {
      candidateUrl: buildGnulaCandidateUrl(allTitles, isMovie, releaseYear, season, episode),
      videos,
    };
  } catch (error) {
    console.warn("[Gnula] Relay via Unlimplay failed:", error);
    return null;
  }
}


export async function runScrapeForGeneratedLink(linkId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const link = await prisma.generatedLink.findUnique({
      where: { id: linkId },
      include: { mediaItem: true }
    });

    if (!link) {
      return { success: false, error: "El enlace no existe." };
    }

    const title = link.mediaItem.title || "";
    const originalTitle = link.mediaItem.originalTitle || title;

    // Fetch alternative titles (English, Romaji, etc.) from TMDB API to search in all languages
    const altTitles = await fetchAlternativeTitles(link.tmdbId, link.type as any);
    const seasonTitles: string[] = [];
    if (link.season && link.season > 1) {
      seasonTitles.push(`${title} Season ${link.season}`);
      seasonTitles.push(`${title} Temporada ${link.season}`);
      seasonTitles.push(`${originalTitle} Season ${link.season}`);
    }

    const subTitles: string[] = [];
    const kanaTransliterations: string[] = [];
    for (const t of [title, originalTitle, ...altTitles]) {
      const parts = t.split(/[:\-\–\—\/]/);
      if (parts.length > 1) {
        for (const p of parts) {
          const trimmed = p.trim();
          if (trimmed.length >= 3) subTitles.push(trimmed);
        }
      }
      const romaji = kanaToRomaji(t);
      if (romaji && romaji.toLowerCase() !== t.toLowerCase()) {
        kanaTransliterations.push(romaji);
      }
    }

    const allTitles = [title, originalTitle, ...subTitles, ...kanaTransliterations, ...seasonTitles, ...altTitles].filter((t, i, a) => t && a.indexOf(t) === i);
    const isMovie = link.type === "movie";
    const episode = link.episode || 1;
    const okruCatalogSetting = await prisma.setting.findUnique({
      where: { key: `okru.catalog.${link.tmdbId}` },
      select: { value: true },
    });
    let okruCatalogUrls: string[] = [];
    try {
      const parsed = okruCatalogSetting ? JSON.parse(okruCatalogSetting.value) : [];
      okruCatalogUrls = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      console.warn(`[OK.ru] Invalid catalog entry for TMDB ${link.tmdbId}.`);
    }

    console.log(`[Scraper] Searching for TMDB ${link.tmdbId} (${isMovie ? 'movie' : 'episode ' + episode}) using titles:`, allTitles);

    // 1. Ensure all source sites are registered
    const jkanime = await prisma.sourceSite.upsert({
      where: { id: "jkanime-source-id" },
      update: { name: "JKAnime", allowedDomain: "jkanime.net", baseUrl: "https://jkanime.net", searchMode: "TITLE", active: true, priority: 11, usePlaywright: false },
      create: { id: "jkanime-source-id", name: "JKAnime", allowedDomain: "jkanime.net", baseUrl: "https://jkanime.net", searchMode: "TITLE", active: true, priority: 11, usePlaywright: false }
    });

    const tioanime = await prisma.sourceSite.upsert({
      where: { id: "tioanime-source-id" },
      update: { name: "TioAnime", allowedDomain: "tioanime.com", baseUrl: "https://tioanime.com", searchMode: "TITLE", active: true, priority: 11, usePlaywright: false },
      create: { id: "tioanime-source-id", name: "TioAnime", allowedDomain: "tioanime.com", baseUrl: "https://tioanime.com", searchMode: "TITLE", active: true, priority: 11, usePlaywright: false }
    });

    const animeflv = await prisma.sourceSite.upsert({
      where: { id: "animeflv-source-id" },
      update: { name: "AnimeFLV", allowedDomain: "www4.animeflv.net", baseUrl: "https://www4.animeflv.net", searchMode: "TITLE", active: true, priority: 10, usePlaywright: false },
      create: { id: "animeflv-source-id", name: "AnimeFLV", allowedDomain: "www4.animeflv.net", baseUrl: "https://www4.animeflv.net", searchMode: "TITLE", active: true, priority: 10, usePlaywright: false }
    });

    const cuevana3 = await prisma.sourceSite.upsert({
      where: { id: "cuevana3-source-id" },
      update: { name: "Cuevana3", allowedDomain: "cuevana3i.you", baseUrl: "https://cuevana3i.you", searchMode: "TITLE", active: true, priority: 12, usePlaywright: false },
      create: { id: "cuevana3-source-id", name: "Cuevana3", allowedDomain: "cuevana3i.you", baseUrl: "https://cuevana3i.you", searchMode: "TITLE", active: true, priority: 12, usePlaywright: false }
    });

    const unlimplay = await prisma.sourceSite.upsert({
      where: { id: "unlimplay-source-id" },
      update: { name: "Unlimplay", allowedDomain: "unlimplay.com", baseUrl: "https://unlimplay.com", searchMode: "TMDB_ID", active: true, priority: 15, usePlaywright: false },
      create: { id: "unlimplay-source-id", name: "Unlimplay", allowedDomain: "unlimplay.com", baseUrl: "https://unlimplay.com", searchMode: "TMDB_ID", active: true, priority: 15, usePlaywright: false }
    });

    const cinecalidad = await prisma.sourceSite.upsert({
      where: { id: "cinecalidad-source-id" },
      update: { name: "CineCalidad", allowedDomain: "cinecalidad.am", baseUrl: "https://www.cinecalidad.am", searchMode: "TITLE", active: true, priority: 13, usePlaywright: false },
      create: { id: "cinecalidad-source-id", name: "CineCalidad", allowedDomain: "cinecalidad.am", baseUrl: "https://www.cinecalidad.am", searchMode: "TITLE", active: true, priority: 13, usePlaywright: false }
    });

    const gnula = await prisma.sourceSite.upsert({
      where: { id: "gnula-source-id" },
      update: { name: "Gnula", allowedDomain: "wnv5.gnula.cc", baseUrl: "https://wnv5.gnula.cc", searchMode: "TITLE", active: true, priority: 16, usePlaywright: false },
      create: { id: "gnula-source-id", name: "Gnula", allowedDomain: "wnv5.gnula.cc", baseUrl: "https://wnv5.gnula.cc", searchMode: "TITLE", active: true, priority: 16, usePlaywright: false }
    });

    const doramasflix = await prisma.sourceSite.upsert({
      where: { id: "doramasflix-source-id" },
      update: { name: "Doramasflix", allowedDomain: "doramasflix.in", baseUrl: "https://doramasflix.in", searchMode: "TITLE", active: true, priority: 9, usePlaywright: false },
      create: { id: "doramasflix-source-id", name: "Doramasflix", allowedDomain: "doramasflix.in", baseUrl: "https://doramasflix.in", searchMode: "TITLE", active: true, priority: 9, usePlaywright: false }
    });

    const cinehdplus = await prisma.sourceSite.upsert({
      where: { id: "cinehdplus-source-id" },
      update: { name: "CineHDPlus", allowedDomain: "cinehdplus.biz", baseUrl: "https://cinehdplus.biz", searchMode: "TITLE", active: true, priority: 16, usePlaywright: false },
      create: { id: "cinehdplus-source-id", name: "CineHDPlus", allowedDomain: "cinehdplus.biz", baseUrl: "https://cinehdplus.biz", searchMode: "TITLE", active: true, priority: 16, usePlaywright: false }
    });

    const fullonline = await prisma.sourceSite.upsert({
      where: { id: "fullonline-source-id" },
      update: { name: "Pelis Juanita", allowedDomain: "pelisjuanita.com", baseUrl: `${PELIS_JUANITA_BASE_URL}/movies`, searchMode: "TITLE", active: true, priority: 17, usePlaywright: false },
      create: { id: "fullonline-source-id", name: "Pelis Juanita", allowedDomain: "pelisjuanita.com", baseUrl: `${PELIS_JUANITA_BASE_URL}/movies`, searchMode: "TITLE", active: true, priority: 17, usePlaywright: false }
    });

    const okru = await prisma.sourceSite.upsert({
      where: { id: "okru-source-id" },
      update: { name: "OK.ru", allowedDomain: "ok.ru", baseUrl: "https://ok.ru/video", searchMode: "TITLE", active: true, priority: 14, usePlaywright: false },
      create: { id: "okru-source-id", name: "OK.ru", allowedDomain: "ok.ru", baseUrl: "https://ok.ru/video", searchMode: "TITLE", active: true, priority: 14, usePlaywright: false }
    });

    const monoschinos = await prisma.sourceSite.upsert({
      where: { id: "monoschinos-source-id" },
      update: { name: "MonosChinos", allowedDomain: "monoschinos2.com", baseUrl: "https://monoschinos2.com", searchMode: "TITLE", active: true, priority: 12, usePlaywright: false },
      create: { id: "monoschinos-source-id", name: "MonosChinos", allowedDomain: "monoschinos2.com", baseUrl: "https://monoschinos2.com", searchMode: "TITLE", active: true, priority: 12, usePlaywright: false }
    });

    const privateMedia = await prisma.sourceSite.upsert({
      where: { id: PRIVATE_MEDIA_SOURCE_ID },
      update: { name: "Private Media", allowedDomain: "private-media.local", baseUrl: "private-media://resolve", searchMode: "TMDB_ID", active: true, priority: 98, usePlaywright: false },
      create: { id: PRIVATE_MEDIA_SOURCE_ID, name: "Private Media", allowedDomain: "private-media.local", baseUrl: "private-media://resolve", searchMode: "TMDB_ID", active: true, priority: 98, usePlaywright: false }
    });

    // 2. Clear previous discovery logs. Playback variants are replaced only
    // after new playable sources have been validated, so a failed scrape does
    // not break existing player links.
    await prisma.sourceCandidate.deleteMany({ where: { mediaItemId: link.mediaItemId } });

    let videosFoundCount = 0;
    let subtitleTracksCount = 0;

    // 3. Search sources simultaneously based on media type routing
    // Sources: Unlimplay (API), JKAnime (anime), TioAnime (anime), AnimeFLV (anime),
    //          MonosChinos (anime), Cuevana3, CineCalidad, Gnula, etc.
    const isAnime = link.type === "anime" || (Boolean(link.mediaItem.genres) && /animaci[oó]n|anime/i.test(link.mediaItem.genres || ""));
    const shouldSearchAnime = isAnime;
    const shouldSearchGeneral = !isAnime || isMovie;
    const shouldSearchSeries = !isAnime && !isMovie;

    const [jkUrl, tioUrl, aflvUrl, mcUrl, cuevanaUrl, cinecalidadUrl, gnulaUrl, gnulaRelay, doramasflixUrl, cinehdplusUrl, fullonlineUrl, unlimplayVideos, okruVideos] = await Promise.all([
      shouldSearchAnime ? findJKAnimeUrl(title, originalTitle, allTitles, isMovie, episode, link.season || 1).catch(() => null) : Promise.resolve(null),
      shouldSearchAnime ? findTioAnimeUrl(title, originalTitle, allTitles, isMovie, episode, link.season || 1).catch(() => null) : Promise.resolve(null),
      shouldSearchAnime ? findAnimeFLVUrl(title, originalTitle, allTitles, isMovie, episode, link.season || 1).catch(() => null) : Promise.resolve(null),
      shouldSearchAnime ? findMonosChinosUrl(title, originalTitle, allTitles, isMovie, episode, link.season || 1).catch(() => null) : Promise.resolve(null),
      shouldSearchGeneral ? findCuevana3Url(allTitles, isMovie, link.mediaItem.releaseYear || undefined, link.season || 1, episode).catch(() => null) : Promise.resolve(null),
      shouldSearchGeneral ? findCineCalidadUrl(allTitles, isMovie, link.mediaItem.releaseYear || undefined, link.season || 1, episode).catch(() => null) : Promise.resolve(null),
      findGnulaUrl(allTitles, isMovie, link.mediaItem.releaseYear || undefined, link.season || 1, episode).catch(() => null),
      fetchGnulaRelayVideos(link.tmdbId, allTitles, isMovie, link.mediaItem.releaseYear || undefined, link.season || 1, episode, link.mediaItem.originalLanguage).catch(() => null),
      shouldSearchSeries ? findDoramasFlixUrl(allTitles, isMovie, link.season || 1, episode).catch(() => null) : Promise.resolve(null),
      shouldSearchGeneral ? findCineHdPlusUrl(link.tmdbId, allTitles, isMovie, link.season || 1, episode).catch(() => null) : Promise.resolve(null),
      shouldSearchGeneral ? findFullOnlineUrl(link.tmdbId, allTitles, isMovie, link.season || 1, episode).catch(() => null) : Promise.resolve(null),
      fetchUnlimplayVideos(link.tmdbId, isMovie, link.season || 1, episode, link.mediaItem.originalLanguage).catch(() => null),
      findOkRuVideos({
        titles: allTitles,
        isMovie,
        releaseYear: link.mediaItem.releaseYear || link.mediaItem.firstAirYear,
        season: link.season || 1,
        episode,
        originalLanguage: link.mediaItem.originalLanguage,
        directUrls: okruCatalogUrls,
      }).catch(() => [])
    ]);

    console.log(`[Scraper] Source discovery -> JKAnime: ${jkUrl || 'not found'} | TioAnime: ${tioUrl || 'not found'} | AnimeFLV: ${aflvUrl || 'not found'} | MonosChinos: ${mcUrl || 'not found'} | Cuevana3: ${cuevanaUrl || 'not found'} | CineCalidad: ${cinecalidadUrl || 'not found'} | Gnula: ${gnulaUrl || 'not found'} | Gnula Relay: ${gnulaRelay ? gnulaRelay.videos.length + ' videos' : 'not found'} | Doramasflix: ${doramasflixUrl || 'not found'} | CineHDPlus: ${cinehdplusUrl || 'not found'} | Full Online: ${fullonlineUrl || 'not found'} | Unlimplay: ${unlimplayVideos ? unlimplayVideos.length + ' videos' : 'not found'} | OK.ru: ${okruVideos.length ? okruVideos.length + ' videos' : 'not found'}`);

    // 3.5. Save Unlimplay videos directly (API source, no scraping needed)
    // We will collect all candidates first
    interface RawVariant {
      sourceSiteId: string;
      candidateUrl: string;
      videoUrl: string;
      language: string;
      quality: string;
      verifiedCatalog?: boolean;
      subtitles: Array<{
        url: string;
        language: string;
        format: "vtt" | "srt";
        label?: string;
      }>;
    }

    interface StagedVariant extends RawVariant {
      storedUrl: string;
      validationUrl: string;
      detectedLanguage: string;
      sortOrder: number;
    }

    const allCandidates: RawVariant[] = [];
    const stagedVariants: StagedVariant[] = [];

    if (okruVideos.length > 0) {
      for (const video of okruVideos) {
        await prisma.sourceCandidate.create({
          data: {
            mediaItemId: link.mediaItemId,
            sourceSiteId: okru.id,
            candidateUrl: video.pageUrl,
            matchTitle: video.title,
            matchYear: link.mediaItem.releaseYear || link.mediaItem.firstAirYear || undefined,
            matchTmdbId: link.tmdbId,
            matchScore: 1,
            status: "FOUND",
          },
        });
        allCandidates.push({
          sourceSiteId: okru.id,
          candidateUrl: video.pageUrl,
          videoUrl: video.embedUrl,
          language: video.language,
          quality: video.quality,
          verifiedCatalog: video.verifiedCatalog,
          subtitles: [],
        });
      }
    }

    const privateResolved = await resolvePrivateMedia({
      tmdbId: link.tmdbId,
      type: isMovie ? "movie" : "tv",
      season: link.season || 1,
      episode,
    });

    if (privateResolved?.item && privateResolved.playback?.url) {
      const privateUrl = buildPrivateMediaUrl({
        tmdbId: link.tmdbId,
        type: isMovie ? "movie" : "tv",
        season: link.season || 1,
        episode,
      });

      await prisma.sourceCandidate.create({
        data: {
          mediaItemId: link.mediaItemId,
          sourceSiteId: privateMedia.id,
          candidateUrl: PRIVATE_MEDIA_CANDIDATE_URL,
          matchTitle: title,
          matchYear: link.mediaItem.releaseYear || link.mediaItem.firstAirYear || undefined,
          matchTmdbId: link.tmdbId,
          matchScore: 1.0,
          status: "FOUND"
        }
      });

      stagedVariants.push({
        sourceSiteId: privateMedia.id,
        candidateUrl: PRIVATE_MEDIA_CANDIDATE_URL,
        videoUrl: privateUrl,
        language: toPrivateMediaLanguage(privateResolved.item.language),
        quality: toPrivateMediaQuality(privateResolved.playback.quality || privateResolved.item.quality),
        subtitles: [],
        storedUrl: privateUrl,
        validationUrl: privateResolved.playback.url,
        detectedLanguage: toPrivateMediaLanguage(privateResolved.item.language),
        sortOrder: 0,
      });
      videosFoundCount++;
      console.log(`[Private Media] Fuente propia validada para TMDB ${link.tmdbId}. Se usará como opción prioritaria.`);
    }

    if (gnulaRelay && gnulaRelay.videos.length > 0) {
      await prisma.sourceCandidate.create({
        data: {
          mediaItemId: link.mediaItemId,
          sourceSiteId: gnula.id,
          candidateUrl: gnulaRelay.candidateUrl,
          matchTitle: title,
          matchYear: link.mediaItem.releaseYear || 2025,
          matchTmdbId: link.tmdbId,
          matchScore: 1.0,
          status: "FOUND"
        }
      });

      for (const video of gnulaRelay.videos) {
        allCandidates.push({
          sourceSiteId: gnula.id,
          candidateUrl: gnulaRelay.candidateUrl,
          videoUrl: video.url,
          language: video.language,
          quality: video.quality,
          subtitles: []
        });
      }
    }

    // 3.5. Collect Unlimplay videos (API source)
    if (unlimplayVideos && unlimplayVideos.length > 0) {
      // Create candidate record for database log
      await prisma.sourceCandidate.create({
        data: {
          mediaItemId: link.mediaItemId,
          sourceSiteId: unlimplay.id,
          candidateUrl: isMovie 
            ? `https://unlimplay.com/play/embed/movie/${link.tmdbId}`
            : `https://unlimplay.com/play/embed/tv/${link.tmdbId}/${link.season || 1}/${episode}`,
          matchTitle: title,
          matchYear: link.mediaItem.releaseYear || 2025,
          matchTmdbId: link.tmdbId,
          matchScore: 1.0,
          status: "FOUND"
        }
      });

      const candidateUrl = isMovie 
        ? `https://unlimplay.com/play/embed/movie/${link.tmdbId}`
        : `https://unlimplay.com/play/embed/tv/${link.tmdbId}/${link.season || 1}/${episode}`;

      for (const video of unlimplayVideos) {
        allCandidates.push({
          sourceSiteId: unlimplay.id,
          candidateUrl,
          videoUrl: video.url,
          language: video.language,
          quality: video.quality,
          subtitles: []
        });
      }
    }

    // 3.6. Scrape title-based sources (JKAnime, TioAnime, AnimeFLV, Cuevana3, CineCalidad)
    const sourceJobs: Array<{ site: typeof jkanime; scrapeUrl: string }> = [];
    if (jkUrl) sourceJobs.push({ site: jkanime, scrapeUrl: jkUrl });
    if (tioUrl) sourceJobs.push({ site: tioanime, scrapeUrl: tioUrl });
    if (aflvUrl) sourceJobs.push({ site: animeflv, scrapeUrl: aflvUrl });
    if (mcUrl) sourceJobs.push({ site: monoschinos, scrapeUrl: mcUrl });
    if (cuevanaUrl) sourceJobs.push({ site: cuevana3, scrapeUrl: cuevanaUrl });
    if (cinecalidadUrl) sourceJobs.push({ site: cinecalidad, scrapeUrl: cinecalidadUrl });
    if (gnulaUrl) sourceJobs.push({ site: gnula, scrapeUrl: gnulaUrl });
    if (doramasflixUrl) sourceJobs.push({ site: doramasflix, scrapeUrl: doramasflixUrl });
    if (cinehdplusUrl) sourceJobs.push({ site: cinehdplus, scrapeUrl: cinehdplusUrl });
    if (fullonlineUrl) sourceJobs.push({ site: fullonline, scrapeUrl: fullonlineUrl });

    for (const { site, scrapeUrl } of sourceJobs) {
      try {
        console.log(`[Scraper] Scraping ${site.name}: ${scrapeUrl}`);

        const scrapeResult = await scrapePage(scrapeUrl);

        if (!scrapeResult.success || scrapeResult.videos.length === 0) {
          console.log(`[Scraper] No videos found at ${scrapeUrl} for ${site.name}`);
          continue;
        }

        // Create candidate record in database log
        await prisma.sourceCandidate.create({
          data: {
            mediaItemId: link.mediaItemId,
            sourceSiteId: site.id,
            candidateUrl: scrapeUrl,
            matchTitle: title,
            matchYear: link.mediaItem.releaseYear || 2025,
            matchTmdbId: scrapeResult.tmdbId || link.tmdbId,
            matchScore: 1.0,
            status: "FOUND"
          }
        });

        // Collect video variants
        for (const video of scrapeResult.videos) {
          if (isUnsafeIframeHost(video.url)) {
            console.log(`[Scraper] Skipping unsafe iframe host variant: ${video.url}`);
            continue;
          }

          allCandidates.push({
            sourceSiteId: site.id,
            candidateUrl: scrapeUrl,
            videoUrl: video.url,
            language: video.language,
            quality: video.quality,
            subtitles: scrapeResult.subtitles
          });
        }

        // Log scrape result
        await prisma.scrapeResult.create({
          data: {
            mediaItemId: link.mediaItemId,
            sourceSiteId: site.id,
            candidateUrl: scrapeUrl,
            found: true,
            message: `Scrapeo completo. Encontradas ${scrapeResult.videos.length} fuentes de video.`
          }
        });

      } catch (e: any) {
        console.error(`[Scraper] Error scraping ${site.name}:`, e);
      }
    }

    // 3.7. Sort and select top 4 online variants (running audio language analysis)
    const sourcePriorityMap: Record<string, number> = {
      [PRIVATE_MEDIA_SOURCE_ID]: 98,
      "unlimplay-source-id": 15,
      "fullonline-source-id": 17,
      "cinehdplus-source-id": 16,
      "cinecalidad-source-id": 13,
      "gnula-source-id": 16,
      "cuevana3-source-id": 12,
      "monoschinos-source-id": 12,
      "jkanime-source-id": 11,
      "animeflv-source-id": 10,
      "doramasflix-source-id": 9,
      "okru-source-id": 14
    };

    const rankedCandidates = orderPlaybackOptions(
      allCandidates.map((candidate) => ({
        ...candidate,
        sourceSite: { priority: sourcePriorityMap[candidate.sourceSiteId] || 0 },
      })),
      null
    );
    const prioritizedCandidates = prioritizeVerifiedCatalogCandidate(rankedCandidates);
    allCandidates.splice(0, allCandidates.length, ...prioritizedCandidates);

    console.log(`[Scraper] Total candidatos encontrados: ${allCandidates.length}. Iniciando validación y análisis de audio (Máximo 4 online)...`);
    const savedUrls = new Set<string>();
    const savedValidationUrls = new Set<string>();
    const failedStoredUrls = new Set<string>();
    const failedCandidateUrls = new Set<string>();

    for (const cand of allCandidates) {
      if (videosFoundCount >= 4) {
        console.log(`[Scraper] Se alcanzó el límite máximo de 4 opciones. Omitiendo candidatos restantes.`);
        break;
      }

      const cleanCandidate = await resolveCleanPlayableCandidate(cand.videoUrl);
      if (!cleanCandidate) {
        console.log(`[Scraper] Omitiendo variante no reproducible limpia: ${cand.videoUrl}`);
        failedStoredUrls.add(cand.videoUrl);
        failedCandidateUrls.add(cand.candidateUrl);
        continue;
      }
      if (savedUrls.has(cleanCandidate.storedUrl)) {
        console.log(`[Scraper] Omitiendo variante duplicada: ${cleanCandidate.storedUrl}`);
        continue;
      }
      const validationSignature = cleanCandidate.validationUrl.split("?")[0];
      if (savedValidationUrls.has(validationSignature)) {
        console.log(`[Scraper] Omitiendo variante que resuelve al mismo stream: ${cleanCandidate.validationUrl}`);
        continue;
      }

      let isAlive = false;
      try {
        isAlive = await checkUrl(cleanCandidate.validationUrl);
      } catch (error) {
        console.warn(`[Scraper] Availability check failed for ${cleanCandidate.validationUrl}:`, error);
      }
      if (!isAlive) {
        console.log(`[Scraper] Omitiendo variante OFFLINE: ${cleanCandidate.validationUrl}`);
        failedStoredUrls.add(cleanCandidate.storedUrl);
        failedCandidateUrls.add(cand.candidateUrl);
        continue;
      }

      // Run audio analysis only for direct streams. Iframe fallbacks are isolated
      // in the browser sandbox, so the server cannot inspect their audio safely.
      const detectedLang = cleanCandidate.kind === "direct"
        ? await detectLanguageFromAudio(cleanCandidate.validationUrl, cand.language)
        : cand.language;

      stagedVariants.push({
        ...cand,
        storedUrl: cleanCandidate.storedUrl,
        validationUrl: cleanCandidate.validationUrl,
        detectedLanguage: detectedLang,
        sortOrder: videosFoundCount,
      });

      videosFoundCount++;
      savedUrls.add(cleanCandidate.storedUrl);
      savedValidationUrls.add(validationSignature);
    }

    // 3.8. Guaranteed rescue fallback: Ensure minimum of 2 playable embeds per media item
    if (stagedVariants.length < 2) {
      console.log(`[Safety Net] MediaItem ${link.mediaItemId} (TMDB ${link.tmdbId}) tiene solo ${stagedVariants.length} opciones (< 2). Evaluando opciones de rescate garantizadas...`);
      const guaranteedSite = await prisma.sourceSite.upsert({
        where: { id: "guaranteed-embed-source-id" },
        update: { name: "Multi-Embed", allowedDomain: "vidlink.pro", baseUrl: "https://vidlink.pro", searchMode: "TMDB_ID", active: true, priority: 7, usePlaywright: false },
        create: { id: "guaranteed-embed-source-id", name: "Multi-Embed", allowedDomain: "vidlink.pro", baseUrl: "https://vidlink.pro", searchMode: "TMDB_ID", active: true, priority: 7, usePlaywright: false }
      });

      const fallbackUrls: string[] = isMovie
        ? [
            `https://vidlink.pro/movie/${link.tmdbId}?sub_label=Spanish&primaryColor=ffffff&secondaryColor=ffffff&iconColor=ffffff&icons=default&player=jw&title=false&poster=true&autoplay=true`,
            `https://vidapi.xyz/embed/movie/${link.tmdbId}`,
            `https://player.videasy.net/movie/${link.tmdbId}`,
            `https://vsembed.ru/embed/movie?tmdb=${link.tmdbId}&ds_lang=es`,
          ]
        : [
            `https://vidlink.pro/tv/${link.tmdbId}/${link.season || 1}/${episode}?sub_label=Spanish&primaryColor=ffffff&secondaryColor=ffffff&iconColor=ffffff&icons=default&player=jw&title=false&poster=true&autoplay=true`,
            `https://vidapi.xyz/embed/tv/${link.tmdbId}/${link.season || 1}/${episode}`,
            `https://player.videasy.net/tv/${link.tmdbId}/${link.season || 1}/${episode}`,
            `https://vsembed.ru/embed/tv?tmdb=${link.tmdbId}&season=${link.season || 1}&episode=${episode}&ds_lang=es`,
          ];

      for (const fbUrl of fallbackUrls) {
        if (stagedVariants.length >= 2) break;
        if (savedUrls.has(fbUrl)) continue;

        try {
          const isAlive = await checkUrl(fbUrl);
          if (isAlive) {
            stagedVariants.push({
              sourceSiteId: guaranteedSite.id,
              candidateUrl: fbUrl,
              videoUrl: fbUrl,
              language: "LATINO",
              quality: "HD",
              subtitles: [],
              storedUrl: fbUrl,
              validationUrl: fbUrl,
              detectedLanguage: "LATINO",
              sortOrder: stagedVariants.length,
            });
            savedUrls.add(fbUrl);
            videosFoundCount++;
            console.log(`[Safety Net] Embed garantizado añadido para TMDB ${link.tmdbId}: ${fbUrl} (Total opciones: ${stagedVariants.length})`);
          }
        } catch (e: any) {
          console.warn(`[Safety Net] Error verificando fallback ${fbUrl}:`, e.message);
        }
      }
    }

    let winningPlayback: Awaited<ReturnType<typeof runPlaybackSelection>> = null;

    if (stagedVariants.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.selectedPlayback.deleteMany({ where: { mediaItemId: link.mediaItemId } });
        await tx.videoVariant.deleteMany({ where: { mediaItemId: link.mediaItemId } });

        for (const staged of stagedVariants) {
          const variant = await tx.videoVariant.create({
            data: {
              mediaItemId: link.mediaItemId,
              sourceSiteId: staged.sourceSiteId,
              candidateUrl: staged.candidateUrl,
              videoUrl: staged.storedUrl,
              language: staged.detectedLanguage,
              quality: staged.quality,
              status: "ONLINE",
              isSelected: false,
              sortOrder: staged.sortOrder
            }
          });

          for (const sub of staged.subtitles) {
            await tx.subtitleTrack.create({
              data: {
                videoVariantId: variant.id,
                url: sub.url,
                language: sub.language,
                format: sub.format,
                label: sub.label || sub.language,
                status: "ONLINE"
              }
            });
            subtitleTracksCount++;
          }
        }
      });

      // 4. Run selector engine to pick the best available variant
      winningPlayback = await runPlaybackSelection(link.mediaItemId);
    } else {
      const failedStoredUrlList = [...failedStoredUrls];
      const failedCandidateUrlList = [...failedCandidateUrls];
      if (failedStoredUrlList.length > 0 || failedCandidateUrlList.length > 0) {
        const failedVariants = await prisma.videoVariant.findMany({
          where: {
            mediaItemId: link.mediaItemId,
            OR: [
              ...(failedStoredUrlList.length > 0 ? [{ videoUrl: { in: failedStoredUrlList } }] : []),
              ...(failedCandidateUrlList.length > 0 ? [{ candidateUrl: { in: failedCandidateUrlList } }] : []),
            ],
          },
          select: { id: true },
        });

        if (failedVariants.length > 0) {
          const failedVariantIds = failedVariants.map((variant) => variant.id);
          await prisma.$transaction(async (tx) => {
            await tx.selectedPlayback.deleteMany({
              where: {
                mediaItemId: link.mediaItemId,
                videoVariantId: { in: failedVariantIds },
              },
            });
            await tx.videoVariant.deleteMany({ where: { id: { in: failedVariantIds } } });
          });
          console.log(`[Scraper] Removed ${failedVariants.length} variants that failed deep playback validation.`);
        }
      }

      if (hasAuthoritativeTitles(allTitles)) {
        const staleCount = await removeStalePlaybackVariants(link.mediaItemId, link.tmdbId, allTitles, isMovie);
        if (staleCount > 0) {
          console.log(`[Scraper] Removed ${staleCount} stale variants that no longer match TMDB ${link.tmdbId}.`);
        }
      } else {
        console.warn(`[Scraper] Skipping stale variant cleanup for TMDB ${link.tmdbId} because metadata titles are not authoritative.`);
      }
      winningPlayback = await prisma.selectedPlayback.findUnique({
        where: { mediaItemId: link.mediaItemId },
      }) as Awaited<ReturnType<typeof runPlaybackSelection>>;
    }

    // 5. Create job history log
    const sourcesSearched = sourceJobs.length + (unlimplayVideos?.length ? 1 : 0) + (okruVideos.length ? 1 : 0) + (privateResolved ? 1 : 0);
    await prisma.refreshJobLog.create({
      data: {
        finishedAt: new Date(),
        status: stagedVariants.length > 0 && winningPlayback ? "COMPLETED" : "FAILED",
        message: `Búsqueda completada para TMDB ${link.tmdbId}. Buscado en ${sourcesSearched} fuentes. ${videosFoundCount} videos nuevos, ${subtitleTracksCount} subtítulos.`
      }
    });

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/dashboard/jobs");

    if (stagedVariants.length > 0 && winningPlayback) {
      return {
        success: true,
        message: `Scrapeo finalizado. Se encontraron ${videosFoundCount} fuentes de video en ${sourcesSearched} fuentes activas. Principal: ${winningPlayback.language} ${winningPlayback.quality}.`
      };
    } else {
      return {
        success: false,
        error: winningPlayback
          ? "No se encontraron fuentes nuevas reproducibles. Se conservaron las fuentes anteriores para no romper el player."
          : "Se completó la búsqueda pero no se encontraron fuentes de video disponibles. Intenta con otro TMDB ID."
      };
    }
  } catch (err: any) {
    console.error("Error in triggerSearchSimulation action:", err);
    return { success: false, error: err.message || "Error al ejecutar el scraper." };
  }
}

export async function triggerSearchSimulation(linkId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  if (isScrapeQueueEnabled()) {
    const job = await enqueueScrapeGeneratedLink(linkId);
    if (job) {
      safeRevalidatePath("/dashboard/jobs");
      return {
        success: true,
        message: `Búsqueda enviada a la cola de scraping. Job: ${job.id}`,
      };
    }
  }

  return runScrapeForGeneratedLink(linkId);
}

async function autoSearchGeneratedLinks(linkIds: string[]) {
  const uniqueLinkIds = Array.from(new Set(linkIds));
  let searchedCount = 0;
  let failedCount = 0;

  for (const linkId of uniqueLinkIds) {
    const result = await triggerSearchSimulation(linkId);
    if (result.success) {
      searchedCount++;
    } else {
      failedCount++;
      console.warn(`[Auto Search] Source search failed for generated link ${linkId}: ${result.error}`);
    }
  }

  return { searchedCount, failedCount };
}

export async function addManualVideoVariant(
  mediaItemId: string,
  videoUrl: string,
  language: string,
  quality: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const mediaItem = await prisma.mediaItem.findUnique({ where: { id: mediaItemId } });
    if (!mediaItem) {
      return { success: false, error: "El elemento de biblioteca no existe." };
    }

    // Ensure custom source site exists
    const customSite = await prisma.sourceSite.upsert({
      where: { id: "custom-source-id" },
      update: { name: "Manual", allowedDomain: "manual.link", baseUrl: "https://manual.link", searchMode: "MANUAL_URL", active: true, priority: 99, usePlaywright: false },
      create: { id: "custom-source-id", name: "Manual", allowedDomain: "manual.link", baseUrl: "https://manual.link", searchMode: "MANUAL_URL", active: true, priority: 99, usePlaywright: false }
    });

    // Create the video variant and mark it as isSelected: true
    await prisma.videoVariant.updateMany({
      where: { mediaItemId },
      data: { isSelected: false }
    });

    await prisma.videoVariant.create({
      data: {
        mediaItemId,
        sourceSiteId: customSite.id,
        candidateUrl: "MANUAL",
        videoUrl: videoUrl.trim(),
        language,
        quality,
        status: "ONLINE",
        isSelected: true
      }
    });

    // Run playback selection to update selectedPlayback pointer
    await runPlaybackSelection(mediaItemId);

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath(`/dashboard/results?mediaItemId=${mediaItemId}`);

    return { success: true };
  } catch (err: any) {
    console.error("Error in addManualVideoVariant action:", err);
    return { success: false, error: err.message || "Error al agregar el video manual." };
  }
}

export async function addMultipleManualVideoVariants(
  mediaItemId: string,
  videoUrls: string[],
  language: string,
  quality: string,
  replaceVariantId?: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const mediaItem = await prisma.mediaItem.findUnique({ where: { id: mediaItemId } });
    if (!mediaItem) {
      return { success: false, error: "El elemento de biblioteca no existe." };
    }

    // Ensure custom source site exists
    const customSite = await prisma.sourceSite.upsert({
      where: { id: "custom-source-id" },
      update: { name: "Manual", allowedDomain: "manual.link", baseUrl: "https://manual.link", searchMode: "MANUAL_URL", active: true, priority: 99, usePlaywright: false },
      create: { id: "custom-source-id", name: "Manual", allowedDomain: "manual.link", baseUrl: "https://manual.link", searchMode: "MANUAL_URL", active: true, priority: 99, usePlaywright: false }
    });

    const cleanUrls = videoUrls
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (cleanUrls.length === 0) {
      return { success: false, error: "Por favor ingresa al menos un enlace de video válido." };
    }

    let count = 0;

    if (replaceVariantId && replaceVariantId !== "new") {
      // We are replacing an existing variant!
      await prisma.videoVariant.update({
        where: { id: replaceVariantId },
        data: {
          sourceSiteId: customSite.id,
          candidateUrl: "MANUAL",
          videoUrl: cleanUrls[0],
          language,
          quality,
          status: "ONLINE",
          isSelected: true
        }
      });
      
      // Also unselect all other variants
      await prisma.videoVariant.updateMany({
        where: {
          mediaItemId,
          NOT: { id: replaceVariantId }
        },
        data: { isSelected: false }
      });
      
      count++;

      // If there are more URLs entered, add them as new variants
      for (let i = 1; i < cleanUrls.length; i++) {
        await prisma.videoVariant.create({
          data: {
            mediaItemId,
            sourceSiteId: customSite.id,
            candidateUrl: "MANUAL",
            videoUrl: cleanUrls[i],
            language,
            quality,
            status: "ONLINE",
            isSelected: false
          }
        });
        count++;
      }
    } else {
      // Normal behavior: Create them all as new manual variants
      await prisma.videoVariant.updateMany({
        where: { mediaItemId },
        data: { isSelected: false }
      });

      for (let i = 0; i < cleanUrls.length; i++) {
        await prisma.videoVariant.create({
          data: {
            mediaItemId,
            sourceSiteId: customSite.id,
            candidateUrl: "MANUAL",
            videoUrl: cleanUrls[i],
            language,
            quality,
            status: "ONLINE",
            isSelected: i === 0
          }
        });
        count++;
      }
    }

    // Run playback selection to update selectedPlayback pointer
    await runPlaybackSelection(mediaItemId);

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath(`/dashboard/results?mediaItemId=${mediaItemId}`);

    return { success: true, count };
  } catch (err: any) {
    console.error("Error in addMultipleManualVideoVariants action:", err);
    return {
      success: false,
      error: err.message || "Ocurrió un error inesperado al guardar los enlaces manuales."
    };
  }
}


export async function deleteVideoVariant(
  variantId: string,
  mediaItemId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.videoVariant.delete({ where: { id: variantId } });
    
    // Rerun playback selection to select another variant if any
    await runPlaybackSelection(mediaItemId);
    
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath(`/dashboard/results?mediaItemId=${mediaItemId}`);
    
    return { success: true };
  } catch (err: any) {
    console.error("Error in deleteVideoVariant action:", err);
    return { success: false, error: err.message || "Error al eliminar la variante de video." };
  }
}

export async function saveMultipleGeneratedLinks(
  tmdbIdInput: string,
  mediaType: "movie" | "tv" | "anime",
  seasonInput: number,
  mode: "single" | "range" | "count" | "season",
  startEpisode?: number,
  endEpisode?: number,
  count?: number
): Promise<{ success: boolean; message?: string; error?: string; count?: number }> {
  try {
    const tmdbId = tmdbIdInput.trim();
    if (!tmdbId || isNaN(Number(tmdbId))) {
      return { success: false, error: "El TMDB ID debe ser un valor numérico válido." };
    }

    const apiKey = process.env.TMDB_API_KEY;

    // Pre-fetch TMDB metadata to auto-detect corrected type
    const initialMeta = await fetchTMDBMetadata(tmdbId, mediaType, seasonInput || undefined, startEpisode || 1);
    let resolvedMediaType = mediaType;
    if (initialMeta.detectedType && initialMeta.detectedType !== (mediaType === "movie" ? "movie" : "tv")) {
      console.log(`[Auto-Correction] Correcting mediaType from "${mediaType}" to "${initialMeta.detectedType}" for TMDB ID ${tmdbId}`);
      resolvedMediaType = initialMeta.detectedType === "movie" ? "movie" : (mediaType === "anime" ? "anime" : "tv");
    }

    const isMovie = resolvedMediaType === "movie";
    const season = isMovie ? null : Number(seasonInput) || 1;

    let episodesToGenerate: number[] = [];

    if (isMovie) {
      episodesToGenerate = [1];
    } else {
      if (mode === "single") {
        episodesToGenerate = [Number(startEpisode) || 1];
      } else if (mode === "range") {
        const start = Number(startEpisode) || 1;
        const end = Number(endEpisode) || start;
        for (let i = start; i <= end; i++) {
          episodesToGenerate.push(i);
        }
      } else if (mode === "count") {
        const start = Number(startEpisode) || 1;
        const c = Number(count) || 1;
        for (let i = start; i < start + c; i++) {
          episodesToGenerate.push(i);
        }
      } else if (mode === "season") {
        if (!apiKey) {
          // If no API key, default to 12 episodes for local testing
          for (let i = 1; i <= 12; i++) {
            episodesToGenerate.push(i);
          }
        } else {
          const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${apiKey}&language=es-MX`;
          const seasonRes = await externalFetch(seasonUrl, { proxy: "never" });
          if (seasonRes.ok) {
            const seasonData = await seasonRes.json() as { episodes?: Array<{ episode_number: number }> };
            const eps = seasonData.episodes || [];
            episodesToGenerate = eps.map((episodeInfo) => episodeInfo.episode_number);
          } else {
            return { success: false, error: `No se pudo obtener información de la temporada ${season} de TMDB.` };
          }
        }
      }
    }

    if (episodesToGenerate.length === 0) {
      return { success: false, error: "No se definieron episodios válidos para generar." };
    }

    let successCount = 0;
    const savedLinkIds: string[] = [];
    for (const ep of episodesToGenerate) {
      try {
        const meta = await fetchTMDBMetadata(tmdbId, resolvedMediaType, season || undefined, ep);
        const baseUrl = appBaseUrl;
        const playerUrl = isMovie 
          ? `${baseUrl}/play/embed/movie/${tmdbId}`
          : `${baseUrl}/play/embed/tv/${tmdbId}/${season}/${ep}`;
        const collectorUrl = isMovie
          ? `${baseUrl}/f/embed/movie/${tmdbId}`
          : `${baseUrl}/f/embed/tv/${tmdbId}/${season}/${ep}`;

        let mediaItem = await prisma.mediaItem.findFirst({
          where: { tmdbId, mediaType: resolvedMediaType, season, episode: ep }
        });

        if (!mediaItem) {
          mediaItem = await prisma.mediaItem.create({
            data: {
              tmdbId,
              mediaType: resolvedMediaType,
              title: meta.title,
              originalTitle: meta.originalTitle,
              overview: meta.overview,
              posterPath: meta.posterPath,
              backdropPath: meta.backdropPath,
              releaseYear: meta.releaseYear,
              firstAirYear: meta.firstAirYear,
              genres: meta.genres,
              originalLanguage: meta.originalLanguage,
              season,
              episode: ep,
              episodeTitle: meta.episodeTitle,
              episodeOverview: meta.episodeOverview,
              episodeStillPath: meta.episodeStillPath,
              airDate: meta.airDate
            }
          });
        } else {
          mediaItem = await prisma.mediaItem.update({
            where: { id: mediaItem.id },
            data: {
              title: meta.title,
              originalTitle: meta.originalTitle,
              overview: meta.overview,
              posterPath: meta.posterPath,
              backdropPath: meta.backdropPath,
              releaseYear: meta.releaseYear,
              firstAirYear: meta.firstAirYear,
              genres: meta.genres,
              originalLanguage: meta.originalLanguage,
              episodeTitle: meta.episodeTitle,
              episodeOverview: meta.episodeOverview,
              episodeStillPath: meta.episodeStillPath,
              airDate: meta.airDate
            }
          });
        }

        const existingLink = await prisma.generatedLink.findFirst({
          where: { mediaItemId: mediaItem.id, type: resolvedMediaType, tmdbId, season, episode: ep }
        });

        const generatedLink = existingLink || (await prisma.generatedLink.create({
            data: {
              mediaItemId: mediaItem.id,
              type: resolvedMediaType,
              tmdbId,
              season,
              episode: ep,
              playerUrl,
              collectorUrl
            }
          }));

        savedLinkIds.push(generatedLink.id);
        successCount++;
      } catch (e) {
        console.error(`Error saving link for episode ${ep}:`, e);
      }
    }

    const autoSearch = await autoSearchGeneratedLinks(savedLinkIds);

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath("/dashboard/movies");

    return {
      success: true,
      message: `Se han generado e importado ${successCount} enlaces exitosamente. Búsqueda automática: ${autoSearch.searchedCount} iniciada/completada${autoSearch.failedCount > 0 ? `, ${autoSearch.failedCount} con errores` : ""}.`,
      count: successCount
    };
  } catch (err: any) {
    console.error("Error in saveMultipleGeneratedLinks:", err);
    return { success: false, error: err.message || "Error al procesar la solicitud de generación múltiple." };
  }
}

export async function deleteShowLinks(
  tmdbId: string,
  type: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const links = await prisma.generatedLink.findMany({
      where: { tmdbId, type }
    });

    for (const link of links) {
      await prisma.generatedLink.delete({ where: { id: link.id } });
      const otherLinks = await prisma.generatedLink.count({ where: { mediaItemId: link.mediaItemId } });
      if (otherLinks === 0) {
        await prisma.mediaItem.delete({ where: { id: link.mediaItemId } }).catch(() => {});
      }
    }

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath("/dashboard/movies");

    return { success: true };
  } catch (err: any) {
    console.error("Error in deleteShowLinks:", err);
    return { success: false, error: err.message || "Error al eliminar la serie completa." };
  }
}

export async function moveVideoVariantOrder(
  variantId: string,
  direction: "up" | "down"
): Promise<{ success: boolean; error?: string }> {
  try {
    const targetVariant = await prisma.videoVariant.findUnique({
      where: { id: variantId }
    });

    if (!targetVariant) {
      return { success: false, error: "La variante de video no existe." };
    }

    const mediaItemId = targetVariant.mediaItemId;

    // Fetch all online variants for this mediaItem sorted by current sorting
    const allVariants = await prisma.videoVariant.findMany({
      where: { mediaItemId, status: "ONLINE" },
      orderBy: [
        { sortOrder: "asc" },
        { isSelected: "desc" },
        { createdAt: "asc" }
      ]
    });

    const index = allVariants.findIndex((v) => v.id === variantId);
    if (index === -1) {
      return { success: false, error: "La variante no se encuentra en el listado activo del contenido." };
    }

    if (direction === "up") {
      if (index === 0) {
        return { success: false, error: "La variante ya es la primera opción." };
      }
      // Swap with previous
      const temp = allVariants[index];
      allVariants[index] = allVariants[index - 1];
      allVariants[index - 1] = temp;
    } else {
      if (index === allVariants.length - 1) {
        return { success: false, error: "La variante ya es la última opción." };
      }
      // Swap with next
      const temp = allVariants[index];
      allVariants[index] = allVariants[index + 1];
      allVariants[index + 1] = temp;
    }

    // Save the new sortOrder sequentially
    for (let i = 0; i < allVariants.length; i++) {
      await prisma.videoVariant.update({
        where: { id: allVariants[i].id },
        data: { sortOrder: i }
      });
    }

    // Set the first item as the selected playback winner
    const newWinner = allVariants[0];

    await prisma.videoVariant.updateMany({
      where: { mediaItemId },
      data: { isSelected: false }
    });

    await prisma.videoVariant.update({
      where: { id: newWinner.id },
      data: { isSelected: true }
    });

    await prisma.selectedPlayback.upsert({
      where: { mediaItemId },
      update: {
        videoVariantId: newWinner.id,
        language: newWinner.language,
        quality: newWinner.quality,
        status: newWinner.status,
        selectedAt: new Date()
      },
      create: {
        mediaItemId,
        videoVariantId: newWinner.id,
        language: newWinner.language,
        quality: newWinner.quality,
        status: newWinner.status,
        selectedAt: new Date()
      }
    });

    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/dashboard/generated-links");
    safeRevalidatePath(`/dashboard/results?mediaItemId=${mediaItemId}`);

    return { success: true };
  } catch (err: any) {
    console.error("Error in moveVideoVariantOrder:", err);
    return { success: false, error: err.message || "Error al cambiar el orden de la opción." };
  }
}


