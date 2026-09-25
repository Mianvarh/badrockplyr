import * as cheerio from "cheerio";
import { isCleanPlaybackUrl, isResolvableEmbedUrl, isUnsafeIframeHost } from "@/lib/playbackUrlPolicy";
import { normalizeLanguage } from "./languageNormalizer";

export const PELIS_JUANITA_BASE_URL = process.env.PELISJUANITA_BASE_URL || "https://pelisjuanita.com";

export function isPelisJuanitaUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "pelisjuanita.com" || host.endsWith(".pelisjuanita.com") || host === "full-online.xyz" || host.endsWith(".full-online.xyz");
  } catch {
    return false;
  }
}

export function extractPelisJuanitaCandidates(html: string, mediaType: "movie" | "tv") {
  const $ = cheerio.load(html);
  const expectedPath = mediaType === "movie" ? "/movies/pelicula/" : "/series/ver-serie/";
  const candidates = new Map<string, { slug: string; label: string }>();

  $(`a[href*="${expectedPath}"]`).each((_, element) => {
    const href = $(element).attr("href") || "";
    const path = new URL(href, PELIS_JUANITA_BASE_URL).pathname;
    const slug = path.split(expectedPath)[1]?.split("/")[0]?.trim();
    const label = $(element).text().replace(/\s+/g, " ").trim();
    if (slug) candidates.set(slug, { slug, label });
  });

  return Array.from(candidates.values());
}

export function extractPelisJuanitaStreamRows(html: string) {
  const $ = cheerio.load(html);
  const rows: Array<{ url: string; language: string; quality: string }> = [];
  const seen = new Set<string>();

  $(".row-download[data-tipo='stream'][data-url]").each((_, element) => {
    const rawUrl = $(element).attr("data-url")?.replace(/\\/g, "").trim();
    if (!rawUrl || seen.has(rawUrl) || rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) return;
    if (isUnsafeIframeHost(rawUrl) || (!isCleanPlaybackUrl(rawUrl) && !isResolvableEmbedUrl(rawUrl))) return;

    const rawLanguage = ($(element).attr("data-idioma") || "latino").toLowerCase();
    const language = normalizeLanguage(
      rawLanguage.includes("sub")
        ? "JAPANESE"
        : rawLanguage.includes("castellano") || rawLanguage.includes("espanol") || rawLanguage.includes("español")
          ? "CASTELLANO"
          : "LATINO"
    );

    seen.add(rawUrl);
    rows.push({ url: rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl, language, quality: "HD" });
  });

  return rows.sort((a, b) => Number(b.url.includes("voe.")) - Number(a.url.includes("voe.")));
}
