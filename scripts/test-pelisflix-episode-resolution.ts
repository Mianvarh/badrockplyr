import { fetch as undiciFetch } from "undici";
import * as cheerio from "cheerio";

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function testSeriesEpisode(seriesSlug: string, season: number, episode: number) {
  const serieUrl = `https://pelisflix.lat/serie/${seriesSlug}/`;
  console.log(`\nFetching series: ${serieUrl}`);
  const res = await undiciFetch(serieUrl, { headers: { "User-Agent": ua } });
  const html = await res.text();
  const $ = cheerio.load(html);

  let seasonUrl: string | null = null;
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim().toLowerCase();
    if (href && (href.includes(`/temporada/`) && (href.endsWith(`-${season}/`) || href.endsWith(`-${season}`))) || text === `temporada ${season}` || text === `ver temporada ${season}`) {
      seasonUrl = href || null;
    }
  });

  console.log(`Found season ${season} URL: ${seasonUrl}`);
  if (!seasonUrl) return;

  const sRes = await undiciFetch(seasonUrl, { headers: { "User-Agent": ua } });
  const sHtml = await sRes.text();
  const s$ = cheerio.load(sHtml);

  let episodeUrl: string | null = null;
  s$("a").each((_, el) => {
    const href = s$(el).attr("href");
    const text = s$(el).text().trim();
    if (href && (href.includes(`/episodio/`) && (href.includes(`-${season}x${episode}/`) || href.includes(`-${season}x${episode}`)) || text.includes(`${season}x${episode}`))) {
      episodeUrl = href;
    }
  });

  console.log(`Found episode ${season}x${episode} URL: ${episodeUrl}`);
  if (!episodeUrl) return;

  const epRes = await undiciFetch(episodeUrl, { headers: { "User-Agent": ua } });
  const epHtml = await epRes.text();
  const ep$ = cheerio.load(epHtml);

  const players: any[] = [];
  ep$("[data-server]").each((_, el) => {
    const raw = ep$(el).attr("data-server");
    const label = ep$(el).text().trim().replace(/\s+/g, " ");
    if (raw) {
      try {
        const decoded = Buffer.from(raw, "base64").toString("utf-8");
        players.push({ label, decoded });
      } catch {}
    }
  });

  console.log(`Found ${players.length} players for S${season}E${episode}:`, players);
}

async function run() {
  await testSeriesEpisode("breaking-bad-zpya", 1, 1);
  await testSeriesEpisode("breaking-bad-zpya", 1, 4);
}

run();
