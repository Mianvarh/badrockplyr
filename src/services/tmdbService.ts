import { externalFetch } from "@/lib/httpClient";

export interface TMDBMetadata {
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: number | null;
  firstAirYear: number | null;
  genres: string | null;
  originalLanguage: string | null;
  episodeTitle?: string | null;
  episodeOverview?: string | null;
  episodeStillPath?: string | null;
  airDate?: string | null;
  detectedType?: "movie" | "tv";
}

type TMDBGenre = { name: string };
type TMDBMediaResponse = {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genres?: TMDBGenre[];
  original_language?: string | null;
};
type TMDBTranslation = {
  iso_639_1?: string;
  data?: { title?: string; name?: string };
};
type TMDBTranslationsResponse = { translations?: TMDBTranslation[] };
type TMDBEpisodeResponse = {
  name?: string;
  overview?: string;
  still_path?: string | null;
  air_date?: string | null;
};
type TMDBAlternativeTitlesResponse = {
  titles?: Array<{ title?: string }>;
  results?: Array<{ title?: string }>;
};

export function readTMDBApiKey(value = process.env.TMDB_API_KEY): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const unquoted = trimmed.replace(/^(["'])(.*)\1$/, "$2").trim();
  return unquoted || null;
}

export async function fetchTMDBMetadata(
  tmdbId: string,
  mediaType: "movie" | "tv" | "anime",
  season?: number,
  episode?: number
): Promise<TMDBMetadata> {
  const apiKey = readTMDBApiKey();

  if (!apiKey) {
    throw new Error("TMDB_API_KEY no está configurada. Agrega una clave válida antes de generar URLs.");
  }

  const lang = "es-MX";
  // Determine API endpoint types: tv and anime both map to "tv" in TMDB
  let tmdbType: "movie" | "tv" = mediaType === "movie" ? "movie" : "tv";
  let detectedType: "movie" | "tv" = tmdbType;

  try {
    // Fetch main media info
    const mainUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${apiKey}&language=${lang}`;
    let mainRes = await externalFetch(mainUrl, { proxy: "never" });
    if (!mainRes.ok) {
      // Fallback
      const fallbackType = tmdbType === "movie" ? "tv" : "movie";
      const fallbackUrl = `https://api.themoviedb.org/3/${fallbackType}/${tmdbId}?api_key=${apiKey}&language=${lang}`;
      console.log(`[TMDB] Primary endpoint (${tmdbType}) failed for ID ${tmdbId}, trying fallback: ${fallbackType}`);
      const fallbackRes = await externalFetch(fallbackUrl, { proxy: "never" });
      if (fallbackRes.ok) {
        tmdbType = fallbackType;
        detectedType = fallbackType;
        mainRes = fallbackRes;
      } else {
        throw new Error(`TMDB main query failed: ${mainRes.statusText}`);
      }
    }
    const mainData = await mainRes.json() as TMDBMediaResponse;

    const genresString = mainData.genres
      ? mainData.genres.map((g) => g.name).join(", ")
      : null;

    let title = mainData.title || mainData.name || "Sin título";
    const originalTitle = mainData.original_title || mainData.original_name || "Sin título original";
    const originalLanguage = mainData.original_language || null;

    // Check if title fallback is needed: if the returned title is identical to the foreign original title
    if (title === originalTitle && originalLanguage !== "es" && originalLanguage !== "en") {
      try {
        const transUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/translations?api_key=${apiKey}`;
        const transRes = await externalFetch(transUrl, { proxy: "never", timeoutMs: 5000 });
        if (transRes.ok) {
          const transData = await transRes.json() as TMDBTranslationsResponse;
          const translations = transData.translations || [];
          let esTitle = "";
          let enTitle = "";
          for (const item of translations) {
            if (item.iso_639_1 === "es" && item.data && (item.data.title || item.data.name)) {
              esTitle = item.data.title || item.data.name || "";
              break; // use first non-empty Spanish translation
            }
            if (item.iso_639_1 === "en" && item.data && (item.data.title || item.data.name)) {
              enTitle = item.data.title || item.data.name || "";
            }
          }
          if (esTitle) {
            title = esTitle;
          } else if (enTitle) {
            title = enTitle;
          }
        }
      } catch (err) {
        console.error("Error fetching translations fallback in fetchTMDBMetadata:", err);
      }
    }

    const metadata: TMDBMetadata = {
      title,
      originalTitle,
      overview: mainData.overview || "",
      posterPath: mainData.poster_path || null,
      backdropPath: mainData.backdrop_path || null,
      releaseYear: mainData.release_date ? new Date(mainData.release_date).getFullYear() : null,
      firstAirYear: mainData.first_air_date ? new Date(mainData.first_air_date).getFullYear() : null,
      genres: genresString,
      originalLanguage,
      detectedType
    };

    // If series/anime and season/episode are specified, fetch episode info
    if (tmdbType === "tv" && season !== undefined && episode !== undefined) {
      const episodeUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${apiKey}&language=${lang}`;
      const epRes = await externalFetch(episodeUrl, { proxy: "never" });
      if (epRes.ok) {
        const epData = await epRes.json() as TMDBEpisodeResponse;
        metadata.episodeTitle = epData.name || null;
        metadata.episodeOverview = epData.overview || null;
        metadata.episodeStillPath = epData.still_path || null;
        metadata.airDate = epData.air_date || null;
      }
    }

    return metadata;
  } catch (error) {
    console.error("Error fetching TMDB metadata:", error);
    throw new Error(`No se pudieron obtener metadatos válidos de TMDB para el ID ${tmdbId}.`);
  }
}

export async function fetchAlternativeTitles(
  tmdbId: string,
  mediaType: "movie" | "tv" | "anime"
): Promise<string[]> {
  const apiKey = readTMDBApiKey();
  if (!apiKey) {
    return [];
  }

  let tmdbType: "movie" | "tv" = mediaType === "movie" ? "movie" : "tv";
  const titles = new Set<string>();

  try {
    // 1. Fetch English title specifically
    const enUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${apiKey}&language=en-US`;
    let enRes = await externalFetch(enUrl, { proxy: "never", timeoutMs: 5000 });
    if (!enRes.ok) {
      // Fallback
      const fallbackType = tmdbType === "movie" ? "tv" : "movie";
      const fallbackUrl = `https://api.themoviedb.org/3/${fallbackType}/${tmdbId}?api_key=${apiKey}&language=en-US`;
      const fallbackRes = await externalFetch(fallbackUrl, { proxy: "never", timeoutMs: 5000 });
      if (fallbackRes.ok) {
        tmdbType = fallbackType;
        enRes = fallbackRes;
      }
    }

    if (enRes.ok) {
      const enData = await enRes.json() as TMDBMediaResponse;
      const enTitle = enData.title || enData.name;
      if (enTitle) titles.add(enTitle);
      const originalTitle = enData.original_title || enData.original_name;
      if (originalTitle) titles.add(originalTitle);
    }

    // 2. Fetch translations for Spanish (Latino/Spain/etc.) regional titles
    const transUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/translations?api_key=${apiKey}`;
    const transRes = await externalFetch(transUrl, { proxy: "never", timeoutMs: 5000 });
    if (transRes.ok) {
      const transData = await transRes.json() as TMDBTranslationsResponse;
      const list = transData.translations || [];
      for (const item of list) {
        if (item.iso_639_1 === "es" && item.data) {
          const transTitle = item.data.title || item.data.name;
          if (transTitle) {
            titles.add(transTitle);
          }
        }
      }
    }

    // 3. Fetch alternative titles
    const altUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/alternative_titles?api_key=${apiKey}`;
    const altRes = await externalFetch(altUrl, { proxy: "never", timeoutMs: 5000 });
    if (altRes.ok) {
      const altData = await altRes.json() as TMDBAlternativeTitlesResponse;
      const list = altData.titles || altData.results || [];
      for (const item of list) {
        if (item.title && titles.size < 10) {
          titles.add(item.title);
        }
      }
    }
  } catch (error) {
    console.error("Error fetching TMDB alternative titles:", error);
  }

  return Array.from(titles).filter(Boolean);
}

export async function findTMDBByImdbId(imdbId: string): Promise<{
  tmdbId: string;
  mediaType: "movie" | "tv";
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: number | null;
} | null> {
  const apiKey = readTMDBApiKey();
  if (!apiKey) {
    throw new Error("TMDB_API_KEY no está configurada.");
  }

  const cleanId = imdbId.trim();
  const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(cleanId)}?api_key=${apiKey}&external_source=imdb_id&language=es-MX`;

  try {
    const res = await externalFetch(url, { proxy: "never", timeoutMs: 10_000 });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      movie_results?: Array<{
        id: number;
        title?: string;
        original_title?: string;
        overview?: string;
        poster_path?: string | null;
        backdrop_path?: string | null;
        release_date?: string;
      }>;
      tv_results?: Array<{
        id: number;
        name?: string;
        original_name?: string;
        overview?: string;
        poster_path?: string | null;
        backdrop_path?: string | null;
        first_air_date?: string;
      }>;
    };

    const movie = data.movie_results?.[0];
    if (movie) {
      return {
        tmdbId: String(movie.id),
        mediaType: "movie",
        title: movie.title || movie.original_title || "Sin título",
        overview: movie.overview || "",
        posterPath: movie.poster_path || null,
        backdropPath: movie.backdrop_path || null,
        releaseYear: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
      };
    }

    const tv = data.tv_results?.[0];
    if (tv) {
      return {
        tmdbId: String(tv.id),
        mediaType: "tv",
        title: tv.name || tv.original_name || "Sin título",
        overview: tv.overview || "",
        posterPath: tv.poster_path || null,
        backdropPath: tv.backdrop_path || null,
        releaseYear: tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : null,
      };
    }

    return null;
  } catch (error) {
    console.error(`[TMDB] Error buscando IMDb ID ${imdbId}:`, error);
    return null;
  }
}

export async function fetchTMDBExternalIds(
  tmdbId: string,
  mediaType: "movie" | "tv" | "anime"
): Promise<{ imdbId: string | null }> {
  const apiKey = readTMDBApiKey();
  if (!apiKey) return { imdbId: null };

  const endpointType = mediaType === "movie" ? "movie" : "tv";
  const url = `https://api.themoviedb.org/3/${endpointType}/${tmdbId}/external_ids?api_key=${apiKey}`;

  try {
    const res = await externalFetch(url, { proxy: "never", timeoutMs: 8000 });
    if (!res.ok) return { imdbId: null };

    const data = (await res.json()) as { imdb_id?: string | null };
    return { imdbId: data.imdb_id || null };
  } catch (error) {
    console.warn(`[TMDB] Error obteniendo external_ids para TMDB ${tmdbId}:`, error);
    return { imdbId: null };
  }
}

