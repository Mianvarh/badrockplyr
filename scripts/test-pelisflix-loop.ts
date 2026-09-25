import { fetch as undiciFetch } from "undici";
import * as cheerio from "cheerio";
import { computeMatchScore } from "../src/lib/scraperMatching";

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const base = "https://pelisflix.lat";

interface TestItem {
  name: string;
  tmdbId: string;
  isMovie: boolean;
  year?: number;
  season?: number;
  episode?: number;
}

const testItems: TestItem[] = [
  { name: "Interstellar", tmdbId: "157336", isMovie: true, year: 2014 },
  { name: "The Dark Knight", tmdbId: "155", isMovie: true, year: 2008 },
  { name: "Breaking Bad", tmdbId: "1396", isMovie: false, season: 1, episode: 1 },
  { name: "Inception", tmdbId: "27205", isMovie: true, year: 2010 },
  { name: "Fight Club", tmdbId: "550", isMovie: true, year: 1999 },
  { name: "Stranger Things", tmdbId: "66732", isMovie: false, season: 1, episode: 1 },
  { name: "Gladiator", tmdbId: "98", isMovie: true, year: 2000 },
  { name: "Shrek", tmdbId: "808", isMovie: true, year: 2001 },
  { name: "Oppenheimer", tmdbId: "872585", isMovie: true, year: 2023 },
  { name: "Spider-Man", tmdbId: "557", isMovie: true, year: 2002 },
];

function decodeOptionData(raw: string): string | null {
  try {
    const decoded = Buffer.from(raw.trim(), "base64").toString("utf-8");
    if (decoded.includes("url=")) {
      const match = decoded.match(/url=([^&]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
    return decoded;
  } catch {
    return null;
  }
}

async function findPelisflixPage(item: TestItem): Promise<string | null> {
  const searchUrl = `${base}/?s=${encodeURIComponent(item.name)}`;
  try {
    const res = await undiciFetch(searchUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": ua }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    let bestUrl: string | null = null;
    let bestScore = 0;

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const cleanHref = href.startsWith("http") ? href : `${base}${href}`;

      if (item.isMovie && cleanHref.includes("/pelicula/")) {
        const slug = cleanHref.split("/pelicula/")[1]?.replace(/\/$/, "");
        if (slug) {
          const score = computeMatchScore(slug, slug, [item.name], true, item.year ? String(item.year) : undefined);
          if (score > bestScore) {
            bestScore = score;
            bestUrl = cleanHref;
          }
        }
      } else if (!item.isMovie && cleanHref.includes("/serie/")) {
        const slug = cleanHref.split("/serie/")[1]?.replace(/\/$/, "");
        if (slug) {
          const score = computeMatchScore(slug, slug, [item.name], false);
          if (score > bestScore) {
            bestScore = score;
            bestUrl = cleanHref;
          }
        }
      }
    });

    if (bestScore >= 0.4 && bestUrl) {
      if (!item.isMovie) {
        // Find season and episode URL
        return await findPelisflixEpisode(bestUrl, item.season || 1, item.episode || 1);
      }
      return bestUrl;
    }
  } catch (e: any) {
    console.log(`Search error for ${item.name}:`, e.message);
  }
  return null;
}

async function findPelisflixEpisode(serieUrl: string, season: number, episode: number): Promise<string | null> {
  try {
    const res = await undiciFetch(serieUrl, { headers: { "User-Agent": ua } });
    const html = await res.text();
    const $ = cheerio.load(html);

    let seasonUrl: string | null = null;
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && (href.includes(`/temporada/`) || href.includes(`-${season}/`) || href.includes(`-${season}`))) {
        seasonUrl = href;
      }
    });

    if (!seasonUrl) return null;
    const sRes = await undiciFetch(seasonUrl, { headers: { "User-Agent": ua } });
    const sHtml = await sRes.text();
    const s$ = cheerio.load(sHtml);

    let epUrl: string | null = null;
    s$("a").each((_, el) => {
      const href = s$(el).attr("href");
      if (href && (href.includes(`-${season}x${episode}/`) || href.includes(`-${season}x${episode}`))) {
        epUrl = href;
      }
    });
    return epUrl;
  } catch {
    return null;
  }
}

async function extractPelisflixPlayers(url: string) {
  try {
    const res = await undiciFetch(url, { headers: { "User-Agent": ua } });
    const html = await res.text();
    const $ = cheerio.load(html);

    const players: { label: string; url: string; language: string }[] = [];
    $("[data-server], [data-url]").each((_, el) => {
      const raw = $(el).attr("data-server") || $(el).attr("data-url");
      const label = $(el).text().trim().replace(/\s+/g, " ");
      if (raw) {
        const decoded = decodeOptionData(raw);
        if (decoded) {
          let lang = "LATINO";
          if (label.toLowerCase().includes("castellano") || label.toLowerCase().includes("español")) lang = "CASTELLANO";
          if (label.toLowerCase().includes("subtitul") || label.toLowerCase().includes("sub")) lang = "ENGLISH";
          players.push({ label, url: decoded, language: lang });
        }
      }
    });
    return players;
  } catch {
    return [];
  }
}

async function runLoop() {
  console.log("=== Testing PelisFlix on 10 Top Media Items ===");
  let successCount = 0;

  for (const item of testItems) {
    const pageUrl = await findPelisflixPage(item);
    if (!pageUrl) {
      console.log(`❌ [NOT FOUND] ${item.name} (TMDB ${item.tmdbId})`);
      continue;
    }

    const players = await extractPelisflixPlayers(pageUrl);
    if (players.length > 0) {
      successCount++;
      console.log(`✅ [FOUND] ${item.name} -> ${players.length} players found:`);
      for (const p of players) {
        console.log(`   - [${p.language}] ${p.label} -> ${p.url}`);
      }
    } else {
      console.log(`⚠️ [PAGE FOUND BUT NO PLAYERS] ${item.name} -> ${pageUrl}`);
    }
  }

  console.log(`\nResults: ${successCount}/${testItems.length} items successfully resolved with players!`);
}

runLoop();
