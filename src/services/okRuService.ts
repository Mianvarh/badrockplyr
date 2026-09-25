import * as cheerio from "cheerio";

import { externalFetch } from "@/lib/httpClient";
import { computeMatchScore } from "@/lib/scraperMatching";

const OK_RU_VIDEO_PATTERN = /https?:\/\/(?:m\.)?ok\.ru\/(?:video|videoembed)\/(\d+)/i;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

export type OkRuVideoCandidate = {
  pageUrl: string;
  embedUrl: string;
  title: string;
  durationSeconds: number;
  language: "LATINO" | "CASTELLANO" | "ENGLISH" | "JAPANESE";
  quality: "HD";
  verifiedCatalog?: boolean;
};

export function dedupeOkRuCandidates(candidates: OkRuVideoCandidate[]) {
  return [...new Map(candidates.map((candidate) => [candidate.embedUrl, candidate])).values()];
}

export function prioritizeVerifiedCatalogCandidate<T extends { verifiedCatalog?: boolean }>(candidates: T[]) {
  const verified = candidates.filter((candidate) => candidate.verifiedCatalog);
  const regular = candidates.filter((candidate) => !candidate.verifiedCatalog);
  return verified.length > 0 && regular.length > 0
    ? [regular[0], verified[0], ...regular.slice(1), ...verified.slice(1)]
    : candidates;
}

export function extractOkRuVideoId(url: string): string | null {
  return url.match(OK_RU_VIDEO_PATTERN)?.[1] || null;
}

export function toOkRuEmbedUrl(url: string): string | null {
  const videoId = extractOkRuVideoId(url);
  return videoId ? `https://ok.ru/videoembed/${videoId}` : null;
}

export function inferOkRuLanguage(title: string, originalLanguage?: string | null): OkRuVideoCandidate["language"] {
  const normalized = title.toLowerCase();
  if (/\b(?:latino|lat|es-lat|audio latino)\b/i.test(normalized) || /\(l\)/i.test(title)) return "LATINO";
  if (/\b(?:castellano|espa(?:ñ|n)ol|spa)\b/i.test(normalized) || /\(c\)/i.test(title)) return "CASTELLANO";
  if (/\b(?:japanese|japon(?:é|e)s|vose)\b/i.test(normalized) || originalLanguage === "ja") return "JAPANESE";
  return "ENGLISH";
}

function unwrapDuckDuckGoUrl(href: string): string | null {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(absolute, "https://duckduckgo.com");
    const target = parsed.hostname.endsWith("duckduckgo.com") ? parsed.searchParams.get("uddg") : absolute;
    return target && extractOkRuVideoId(target) ? target : null;
  } catch {
    return null;
  }
}

function hasExpectedYear(title: string, expectedYear?: number | null) {
  if (!expectedYear) return true;
  const years = [...title.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) => Number(match[1]));
  return years.length === 0 || years.includes(expectedYear);
}

function hasExpectedEpisode(title: string, season: number, episode: number) {
  const normalized = title.toLowerCase();
  const patterns = [
    new RegExp(`s0*${season}e0*${episode}\\b`, "i"),
    new RegExp(`\\b0*${season}x0*${episode}\\b`, "i"),
    new RegExp(`(?:cap[ií]tulo|episodio|episode|ep)\\s*0*${episode}\\b`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

async function inspectOkRuVideo(
  url: string,
  titles: string[],
  isMovie: boolean,
  expectedYear: number | null | undefined,
  season: number,
  episode: number,
  originalLanguage?: string | null,
): Promise<OkRuVideoCandidate | null> {
  const videoId = extractOkRuVideoId(url);
  if (!videoId) return null;

  const pageUrl = `https://m.ok.ru/video/${videoId}`;
  const response = await externalFetch(pageUrl, {
    headers: { "user-agent": USER_AGENT, "accept-language": "es-ES,es;q=0.9,en;q=0.8" },
    proxy: "never",
    timeoutMs: 10_000,
  });
  if (!response.ok) return null;

  const html = await response.text();
  const document = cheerio.load(html);
  const title = document("meta[property='og:title']").attr("content")?.trim()
    || document("h1").first().text().trim()
    || document("title").text().replace(/^Видео\s+|\s*\|\s*OK\.RU.*$/gi, "").trim();
  const durationSeconds = Number(document("meta[property='og:video:duration']").attr("content") || 0);
  const allowEmbed = document("meta[property='ya:ovs:allow_embed']").attr("content");

  if (!title || allowEmbed === "false" || !hasExpectedYear(title, expectedYear)) return null;
  if (computeMatchScore(title, title, titles, isMovie) < 0.67) return null;
  if (isMovie && durationSeconds < 2_400) return null;
  if (!isMovie && (durationSeconds < 600 || !hasExpectedEpisode(title, season, episode))) return null;

  return {
    pageUrl,
    embedUrl: `https://ok.ru/videoembed/${videoId}`,
    title,
    durationSeconds,
    language: inferOkRuLanguage(title, originalLanguage),
    quality: "HD",
  };
}

export async function findOkRuVideos(input: {
  titles: string[];
  isMovie: boolean;
  releaseYear?: number | null;
  season?: number;
  episode?: number;
  originalLanguage?: string | null;
  directUrls?: string[];
}): Promise<OkRuVideoCandidate[]> {
  const season = input.season || 1;
  const episode = input.episode || 1;
  const queryTitles = input.titles.slice(0, 3);
  const queries = queryTitles.map((title) => input.isMovie
    ? `site:ok.ru/video ${title} ${input.releaseYear || ""}`.trim()
    : `site:ok.ru/video ${title} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`);

  const resultUrls = new Set<string>(input.directUrls || []);
  const verifiedVideoIds = new Set((input.directUrls || []).map(extractOkRuVideoId).filter(Boolean));
  for (const query of queries) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let searchHtml: string;
      try {
        const response = await externalFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { "user-agent": USER_AGENT },
          proxy: "always",
          timeoutMs: 10_000,
        });
        if (!response.ok) continue;
        searchHtml = await response.text();
      } catch {
        continue;
      }
      const document = cheerio.load(searchHtml);
      let foundForQuery = 0;
      document(".result__a").each((_, element) => {
        const href = document(element).attr("href");
        const target = href ? unwrapDuckDuckGoUrl(href) : null;
        if (target) {
          resultUrls.add(target);
          foundForQuery++;
        }
      });
      if (foundForQuery > 0) break;
    }
  }

  const inspected = await Promise.all(
    [...resultUrls].slice(0, 16).map((url) => inspectOkRuVideo(
      url,
      input.titles,
      input.isMovie,
      input.releaseYear,
      season,
      episode,
      input.originalLanguage,
    ).catch(() => null)),
  );

  return dedupeOkRuCandidates(
    inspected.filter((candidate): candidate is OkRuVideoCandidate => candidate !== null)
  ).map((candidate) => ({
    ...candidate,
    verifiedCatalog: verifiedVideoIds.has(extractOkRuVideoId(candidate.pageUrl)),
  })).slice(0, 4);
}
