import { externalFetch } from "@/lib/httpClient";
import { computeMatchScore } from "@/lib/scraperMatching";

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

export async function findMonosChinosUrl(
  title: string,
  originalTitle: string,
  allTitles: string[],
  isMovie: boolean,
  episode: number,
  season: number = 1
): Promise<string | null> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const base = "https://monoschinos2.com";

  // 1. Direct slug probe
  const slugVariants: string[] = [];
  for (const t of allTitles) {
    const slug = titleToSlug(t);
    if (!slug) continue;
    slugVariants.push(slug);
    if (season > 1) {
      slugVariants.push(`${slug}-${season}`);
      slugVariants.push(`${slug}-season-${season}`);
      slugVariants.push(`${slug}-${season}nd-season`);
      slugVariants.push(`${slug}-${season}rd-season`);
      slugVariants.push(`${slug}-${season}th-season`);
    }
  }

  const cleanSlugs = slugVariants.filter((s, i, a) => s.length > 2 && a.indexOf(s) === i);
  const suffixes = isMovie
    ? ["-episodio-1", "-pelicula-1", "-pelicula"]
    : [`-episodio-${episode}`, `-${episode}`];

  for (const slug of cleanSlugs) {
    const score = computeMatchScore(slug, slug, allTitles, isMovie);
    if (score < 0.4) continue;

    for (const suffix of suffixes) {
      const epUrl = `${base}/ver/${slug}${suffix}`;
      try {
        const res = await externalFetch(epUrl, {
          method: "HEAD",
          timeoutMs: 5000,
          proxy: "auto",
          headers: { "User-Agent": ua }
        });
        if (res.status === 200) {
          console.log(`[MonosChinos] Direct slug match: ${epUrl}`);
          return epUrl;
        }
      } catch {
        // try next
      }
    }
  }

  // 2. Search directory
  const searchQueries: string[] = [];
  for (const t of allTitles) {
    searchQueries.push(t);
    if (season > 1) {
      searchQueries.push(`${t} season ${season}`);
      searchQueries.push(`${t} ${season}`);
    }
  }
  const cleanQueries = searchQueries.filter((q, i, a) => q.length > 2 && a.indexOf(q) === i).slice(0, 4);

  const foundCandidates = new Map<string, { slug: string; title: string }>();

  for (const term of cleanQueries) {
    if (foundCandidates.size > 0) break;
    try {
      const searchUrl = `${base}/buscar?q=${encodeURIComponent(term)}`;
      const res = await externalFetch(searchUrl, {
        timeoutMs: 6000,
        proxy: "auto",
        headers: { "User-Agent": ua }
      });
      if (!res.ok) continue;

      const html = await res.text();
      const linkRegex = /href=["'](?:https?:\/\/monoschinos(?:\.st|2\.com))?\/anime\/([^"'/]+)["']/g;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const foundSlug = m[1];
        if (foundSlug && !foundCandidates.has(foundSlug)) {
          foundCandidates.set(foundSlug, { slug: foundSlug, title: foundSlug.replace(/-/g, " ") });
        }
      }
    } catch (e: any) {
      console.warn(`[MonosChinos] Search error for "${term}":`, e.message);
    }
  }

  if (foundCandidates.size === 0) return null;

  const scored = Array.from(foundCandidates.values())
    .map((item) => {
      const score = computeMatchScore(item.slug, item.title, allTitles, isMovie);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  console.log(`[MonosChinos] Scored candidates:`, scored.map(s => `${s.item.slug} -> score: ${s.score.toFixed(2)}`));

  for (const { item, score } of scored) {
    if (score < 0.4) break;

    for (const suffix of suffixes) {
      const epUrl = `${base}/ver/${item.slug}${suffix}`;
      try {
        const res = await externalFetch(epUrl, {
          method: "HEAD",
          timeoutMs: 5000,
          proxy: "auto",
          headers: { "User-Agent": ua }
        });
        if (res.status === 200) {
          console.log(`[MonosChinos] Search match approved (score ${score.toFixed(2)}): ${epUrl}`);
          return epUrl;
        }
      } catch {
        // try next
      }
    }
  }

  return null;
}
