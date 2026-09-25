import * as cheerio from "cheerio";
import { externalFetch } from "@/lib/httpClient";
import { isCleanPlaybackUrl, isResolvableEmbedUrl, isUnsafeIframeHost } from "@/lib/playbackUrlPolicy";
import { normalizeLanguage } from "./languageNormalizer";
import { computeMatchScore } from "@/lib/scraperMatching";

export const PELISFLIX_BASE_URL = process.env.PELISFLIX_BASE_URL || "https://pelisflix.lat";

export function isPelisFlixUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("pelisflix");
  } catch {
    return false;
  }
}

/**
 * Decodes the base64 data-server payload used by PelisFlix,
 * extracting direct server links (e.g. voe.sx) when wrapped inside nupload.
 */
export function decodePelisFlixServer(rawData: string): string | null {
  try {
    const trimmed = rawData.trim();
    if (!trimmed) return null;

    let decoded = trimmed;
    // Check if it's base64 encoded
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      try {
        decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      } catch {
        return null;
      }
    }

    // If wrapped in an iframe proxy query (e.g. nupload.my/iframe/?url=https%3A%2F%2Fvoe.sx%2Fe%2F...)
    if (decoded.includes("url=")) {
      const match = decoded.match(/[?&]url=([^&]+)/);
      if (match) {
        const unwrapped = decodeURIComponent(match[1]);
        if (unwrapped.startsWith("http://") || unwrapped.startsWith("https://")) {
          return unwrapped;
        }
      }
    }

    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return decoded;
    }

    return null;
  } catch {
    return null;
  }
}

export interface PelisFlixStreamOption {
  url: string;
  language: string;
  quality: string;
  serverName?: string;
}

/**
 * Extracts available video streams from a PelisFlix movie or episode HTML page.
 */
export function extractPelisFlixStreamRows(html: string): PelisFlixStreamOption[] {
  const $ = cheerio.load(html);
  const rows: PelisFlixStreamOption[] = [];
  const seen = new Set<string>();

  $("[data-server], [data-url]").each((_, el) => {
    const rawData = $(el).attr("data-server") || $(el).attr("data-url");
    if (!rawData) return;

    const streamUrl = decodePelisFlixServer(rawData);
    if (!streamUrl || seen.has(streamUrl)) return;
    if (isUnsafeIframeHost(streamUrl)) return;
    if (!isCleanPlaybackUrl(streamUrl) && !isResolvableEmbedUrl(streamUrl)) return;

    const label = $(el).text().trim().replace(/\s+/g, " ").toLowerCase();

    let rawLang = "LATINO";
    if (label.includes("castellano") || label.includes("español") || label.includes("espanol")) {
      rawLang = "CASTELLANO";
    } else if (label.includes("subtitul") || label.includes("sub") || label.includes("vose")) {
      rawLang = "ENGLISH";
    }

    const language = normalizeLanguage(rawLang);
    const isDirectResolvable = streamUrl.includes("voe.") || streamUrl.includes("filemoon.");
    const quality = isDirectResolvable ? "1080p" : "HD";

    seen.add(streamUrl);
    rows.push({
      url: streamUrl,
      language,
      quality,
      serverName: isDirectResolvable ? "Voe" : "Nupload",
    });
  });

  // Prioritize direct resolvable hosts (e.g. VOE) over generic embeds
  return rows.sort((a, b) => {
    const aResolvable = Number(a.url.includes("voe.") || a.url.includes("filemoon."));
    const bResolvable = Number(b.url.includes("voe.") || b.url.includes("filemoon."));
    return bResolvable - aResolvable;
  });
}

/**
 * Searches PelisFlix for a given movie or episode, navigating seasons and episodes if necessary.
 */
export async function findPelisFlixUrl(
  allTitles: string[],
  isMovie: boolean,
  releaseYear?: number,
  season: number = 1,
  episode: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const searchQueries = allTitles
    .filter((t, i, arr) => t.length > 2 && arr.indexOf(t) === i)
    .slice(0, 3);

  for (const q of searchQueries) {
    try {
      const searchUrl = `${PELISFLIX_BASE_URL}/?s=${encodeURIComponent(q)}`;
      const res = await externalFetch(searchUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": ua }
      });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      let bestUrl: string | null = null;
      let bestScore = 0;

      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const cleanHref = href.startsWith("http") ? href : `${PELISFLIX_BASE_URL}${href}`;

        if (isMovie && cleanHref.includes("/pelicula/")) {
          const slug = cleanHref.split("/pelicula/")[1]?.replace(/\/$/, "");
          if (slug) {
            const score = computeMatchScore(slug, slug, allTitles, true, releaseYear ? String(releaseYear) : undefined);
            if (score > bestScore) {
              bestScore = score;
              bestUrl = cleanHref;
            }
          }
        } else if (!isMovie && cleanHref.includes("/serie/")) {
          const slug = cleanHref.split("/serie/")[1]?.replace(/\/$/, "");
          if (slug) {
            const score = computeMatchScore(slug, slug, allTitles, false);
            if (score > bestScore) {
              bestScore = score;
              bestUrl = cleanHref;
            }
          }
        }
      });

      if (bestScore >= 0.4 && bestUrl) {
        if (isMovie) {
          console.log(`[PelisFlix] Movie matched (score ${bestScore.toFixed(2)}): ${bestUrl}`);
          return bestUrl;
        }

        // Navigate TV Show -> Season -> Episode
        const epUrl = await findPelisFlixEpisodeUrl(bestUrl, season, episode, ua);
        if (epUrl) {
          console.log(`[PelisFlix] Episode matched (score ${bestScore.toFixed(2)}): ${epUrl}`);
          return epUrl;
        }
      }
    } catch (e: any) {
      console.warn(`[PelisFlix] Error searching for "${q}":`, e.message);
    }
  }

  return null;
}

async function findPelisFlixEpisodeUrl(
  serieUrl: string,
  season: number,
  episode: number,
  ua: string
): Promise<string | null> {
  try {
    const sRes = await externalFetch(serieUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": ua }
    });
    if (!sRes.ok) return null;

    const sHtml = await sRes.text();
    const $ = cheerio.load(sHtml);

    let seasonUrl: string | null = null;
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim().toLowerCase();
      if (
        href &&
        ((href.includes(`/temporada/`) && (href.endsWith(`-${season}/`) || href.endsWith(`-${season}`))) ||
          text === `temporada ${season}` ||
          text === `ver temporada ${season}`)
      ) {
        seasonUrl = href.startsWith("http") ? href : `${PELISFLIX_BASE_URL}${href}`;
      }
    });

    if (!seasonUrl) return null;

    const epListRes = await externalFetch(seasonUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": ua }
    });
    if (!epListRes.ok) return null;

    const epHtml = await epListRes.text();
    const ep$ = cheerio.load(epHtml);

    let targetEpisodeUrl: string | null = null;
    ep$("a").each((_, el) => {
      const href = ep$(el).attr("href");
      const text = ep$(el).text().trim();
      if (
        href &&
        ((href.includes(`/episodio/`) &&
          (href.includes(`-${season}x${episode}/`) || href.includes(`-${season}x${episode}`))) ||
          text.includes(`${season}x${episode}`))
      ) {
        targetEpisodeUrl = href.startsWith("http") ? href : `${PELISFLIX_BASE_URL}${href}`;
      }
    });

    return targetEpisodeUrl;
  } catch {
    return null;
  }
}
