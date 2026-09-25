import type { PrivateMediaType } from "@/lib/privateMedia";

export type ParsedPrivateMediaKey = {
  tmdbId: string;
  type: PrivateMediaType;
  season?: number | null;
  episode?: number | null;
  language?: string;
  quality?: string;
};

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function parseEpisodeToken(token: string) {
  const match = token.match(/^s(\d{1,3})e(\d{1,4})$/i);
  if (!match) return null;
  return {
    season: Number(match[1]),
    episode: Number(match[2]),
  };
}

export function parsePrivateMediaKey(value: string): ParsedPrivateMediaKey | null {
  const clean = value.trim();
  if (!clean) return null;

  const tokens = clean
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .split(/[_\s.-]+/)
    .map(normalizeToken)
    .filter(Boolean);

  const tmdbIndex = tokens.findIndex((token) => token === "tmdb");
  if (tmdbIndex === -1 || !tokens[tmdbIndex + 1] || !/^\d+$/.test(tokens[tmdbIndex + 1])) {
    return null;
  }

  const tmdbId = tokens[tmdbIndex + 1];
  let type: PrivateMediaType = "movie";
  let season: number | null = null;
  let episode: number | null = null;
  let language: string | undefined;
  let quality: string | undefined;

  for (const token of tokens.slice(tmdbIndex + 2)) {
    if (token === "movie" || token === "pelicula" || token === "film") {
      type = "movie";
      season = null;
      episode = null;
      continue;
    }

    const episodeToken = parseEpisodeToken(token);
    if (episodeToken) {
      type = "tv";
      season = episodeToken.season;
      episode = episodeToken.episode;
      continue;
    }

    if (["latino", "latin", "castellano", "espanol", "español", "japones", "japanese", "ingles", "english", "sub"].includes(token)) {
      language = token;
      continue;
    }

    if (/^\d{3,4}p$/.test(token) || token === "hd" || token === "sd" || token === "auto") {
      quality = token;
    }
  }

  return {
    tmdbId,
    type,
    season,
    episode,
    language,
    quality,
  };
}
