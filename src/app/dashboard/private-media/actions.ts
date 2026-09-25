"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/config";
import {
  buildPrivateMediaUrl,
  PRIVATE_MEDIA_CANDIDATE_URL,
  PRIVATE_MEDIA_SOURCE_ID,
  resolvePrivateMedia,
  toPrivateMediaLanguage,
  toPrivateMediaQuality,
  type PrivateMediaType,
} from "@/lib/privateMedia";
import { parsePrivateMediaKey } from "@/lib/privateMediaKeyParser";
import { runPlaybackSelection } from "@/services/playbackSelectionService";
import { fetchTMDBMetadata } from "@/services/tmdbService";

type PrivateMediaProvider = "GOOGLE_DRIVE" | "ONEDRIVE";
type PrivateMediaStatus = "available" | "pending" | "failed" | "disabled";
type PrivateMediaFolderStatus = "pending_review" | "indexed" | "partial" | "failed" | "disabled";

type PrivateMediaItem = {
  id: string;
  tmdbId: string;
  mediaType: PrivateMediaType;
  season: number | null;
  episode: number | null;
  language: string;
  quality: string;
  provider: PrivateMediaProvider;
  providerFileId: string;
  sourceUrl?: string;
  status: PrivateMediaStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type PrivateMediaFolderPreviewFile = {
  provider: PrivateMediaProvider;
  providerFileId: string;
  sourceUrl?: string;
  name: string;
  path: string[];
  mimeType?: string;
  inferredType: PrivateMediaType;
  season: number | null;
  episode: number | null;
  language: string;
  quality: string;
  groupTitle: string;
};

export type PrivateMediaFolderPreview = {
  provider: PrivateMediaProvider;
  providerFolderId: string;
  sourceUrl: string;
  rootName: string;
  titleCandidate: string;
  seasons: Array<{ season: number; files: number }>;
  files: PrivateMediaFolderPreviewFile[];
  episodes: PrivateMediaFolderPreviewFile[];
  movieGroups: Array<{ title: string; files: PrivateMediaFolderPreviewFile[] }>;
  warnings: string[];
};

export type PrivateMediaFolderImport = {
  id: string;
  provider: PrivateMediaProvider;
  providerFolderId: string;
  sourceUrl: string;
  rootName: string;
  title: string;
  tmdbId?: string;
  mediaType?: PrivateMediaType;
  status: PrivateMediaFolderStatus;
  indexedItems: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type TMDBCandidate = {
  tmdbId: string;
  title: string;
  year: number | null;
  type: PrivateMediaType;
};

type ImportPrivateMediaInput = {
  sourceUrl: string;
  keyword?: string;
  tmdbId?: string;
  type?: PrivateMediaType;
  season?: number | null;
  episode?: number | null;
  language?: string;
  quality?: string;
  provider?: PrivateMediaProvider;
};

type PrivateMediaActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  playerUrl?: string;
  item?: PrivateMediaItem;
};

type FolderPreviewActionResult = {
  success: boolean;
  error?: string;
  preview?: PrivateMediaFolderPreview;
  candidates?: TMDBCandidate[];
};

type FolderConfirmActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  folder?: PrivateMediaFolderImport;
  items?: PrivateMediaItem[];
};

export type PrivateMediaProviderHealth = {
  status: "ok" | "failed" | string;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
  items: number;
  lastErrors: Array<{
    tmdbId: string;
    type: PrivateMediaType;
    season: number | null;
    episode: number | null;
    error?: string;
    updatedAt: string;
  }>;
};

function resolverBaseUrl() {
  return (process.env.PRIVATE_MEDIA_RESOLVER_URL || "http://localhost:3091").replace(/\/+$/, "");
}

function normalizeNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function yearFromDate(value?: string) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

async function searchTMDBCandidates(title: string, type: PrivateMediaType): Promise<TMDBCandidate[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || !title.trim()) return [];

  const endpoint = new URL(`https://api.themoviedb.org/3/search/${type}`);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("language", "es-MX");
  endpoint.searchParams.set("query", title);

  const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return [];
  const data = await response.json() as {
    results?: Array<{
      id?: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
    }>;
  };

  return (data.results || []).slice(0, 5).flatMap((item) => {
    if (!item.id) return [];
    return [{
      tmdbId: String(item.id),
      title: item.title || item.name || `TMDB ${item.id}`,
      year: yearFromDate(item.release_date || item.first_air_date),
      type,
    }];
  });
}

function mergedImportInput(input: ImportPrivateMediaInput) {
  const parsed = input.keyword ? parsePrivateMediaKey(input.keyword) : null;
  const type = input.type || parsed?.type || "movie";

  return {
    sourceUrl: input.sourceUrl.trim(),
    tmdbId: (input.tmdbId || parsed?.tmdbId || "").trim(),
    type,
    season: type === "tv" ? normalizeNumber(input.season ?? parsed?.season ?? 1) || 1 : null,
    episode: type === "tv" ? normalizeNumber(input.episode ?? parsed?.episode ?? 1) || 1 : null,
    language: input.language || parsed?.language || "latino",
    quality: input.quality || parsed?.quality || "auto",
    provider: input.provider || "GOOGLE_DRIVE" as PrivateMediaProvider,
  };
}

async function ensureLocalMediaAndLink(input: {
  tmdbId: string;
  type: PrivateMediaType;
  season: number | null;
  episode: number | null;
}) {
  const mediaWhere = input.type === "movie"
    ? { tmdbId: input.tmdbId, mediaType: "movie", season: null, episode: null }
    : { tmdbId: input.tmdbId, mediaType: { in: ["tv", "anime"] }, season: input.season, episode: input.episode };

  let mediaItem = await prisma.mediaItem.findFirst({ where: mediaWhere });

  if (!mediaItem) {
    const meta = await fetchTMDBMetadata(
      input.tmdbId,
      input.type,
      input.season || undefined,
      input.episode || undefined
    );

    mediaItem = await prisma.mediaItem.create({
      data: {
        tmdbId: input.tmdbId,
        mediaType: input.type,
        title: meta.title,
        originalTitle: meta.originalTitle,
        overview: meta.overview,
        posterPath: meta.posterPath,
        backdropPath: meta.backdropPath,
        releaseYear: meta.releaseYear,
        firstAirYear: meta.firstAirYear,
        genres: meta.genres,
        originalLanguage: meta.originalLanguage,
        season: input.type === "movie" ? null : input.season,
        episode: input.type === "movie" ? null : input.episode,
        episodeTitle: meta.episodeTitle,
        episodeOverview: meta.episodeOverview,
        episodeStillPath: meta.episodeStillPath,
        airDate: meta.airDate,
      },
    });
  }

  const playerUrl = input.type === "movie"
    ? `${appBaseUrl}/play/embed/movie/${input.tmdbId}`
    : `${appBaseUrl}/play/embed/tv/${input.tmdbId}/${input.season || 1}/${input.episode || 1}`;
  const collectorUrl = input.type === "movie"
    ? `${appBaseUrl}/f/embed/movie/${input.tmdbId}`
    : `${appBaseUrl}/f/embed/tv/${input.tmdbId}/${input.season || 1}/${input.episode || 1}`;

  const existingLink = await prisma.generatedLink.findFirst({
    where: {
      mediaItemId: mediaItem.id,
      tmdbId: input.tmdbId,
      type: mediaItem.mediaType,
      season: input.type === "movie" ? null : input.season,
      episode: input.type === "movie" ? null : input.episode,
    },
  });

  if (!existingLink) {
    await prisma.generatedLink.create({
      data: {
        mediaItemId: mediaItem.id,
        tmdbId: input.tmdbId,
        type: mediaItem.mediaType,
        season: input.type === "movie" ? null : input.season,
        episode: input.type === "movie" ? null : input.episode,
        playerUrl,
        collectorUrl,
      },
    });
  }

  return { mediaItem, playerUrl };
}

async function indexPrivateMediaVariant(input: {
  tmdbId: string;
  type: PrivateMediaType;
  season: number | null;
  episode: number | null;
  language: string;
  quality: string;
}) {
  const privateSite = await prisma.sourceSite.upsert({
    where: { id: PRIVATE_MEDIA_SOURCE_ID },
    update: {
      name: "Private Media",
      allowedDomain: "private-media.local",
      baseUrl: "private-media://resolve",
      searchMode: "TMDB_ID",
      active: true,
      priority: 98,
      usePlaywright: false,
    },
    create: {
      id: PRIVATE_MEDIA_SOURCE_ID,
      name: "Private Media",
      allowedDomain: "private-media.local",
      baseUrl: "private-media://resolve",
      searchMode: "TMDB_ID",
      active: true,
      priority: 98,
      usePlaywright: false,
    },
  });

  const resolved = await resolvePrivateMedia({
    tmdbId: input.tmdbId,
    type: input.type,
    season: input.season,
    episode: input.episode,
  });

  if (!resolved?.item || !resolved.playback?.url) {
    throw new Error("La fuente fue importada, pero no pudo resolverse como video reproducible.");
  }

  const { mediaItem, playerUrl } = await ensureLocalMediaAndLink(input);
  const privateUrl = buildPrivateMediaUrl(input);
  const language = toPrivateMediaLanguage(resolved.item.language || input.language);
  const quality = toPrivateMediaQuality(resolved.playback.quality || resolved.item.quality || input.quality);

  await prisma.$transaction(async (tx) => {
    await tx.sourceCandidate.deleteMany({
      where: {
        mediaItemId: mediaItem.id,
        sourceSiteId: privateSite.id,
        candidateUrl: PRIVATE_MEDIA_CANDIDATE_URL,
      },
    });

    await tx.sourceCandidate.create({
      data: {
        mediaItemId: mediaItem.id,
        sourceSiteId: privateSite.id,
        candidateUrl: PRIVATE_MEDIA_CANDIDATE_URL,
        matchTitle: mediaItem.title,
        matchYear: mediaItem.releaseYear || mediaItem.firstAirYear || undefined,
        matchTmdbId: input.tmdbId,
        matchScore: 1,
        status: "FOUND",
      },
    });

    await tx.videoVariant.deleteMany({
      where: {
        mediaItemId: mediaItem.id,
        sourceSiteId: privateSite.id,
        candidateUrl: PRIVATE_MEDIA_CANDIDATE_URL,
      },
    });

    await tx.videoVariant.create({
      data: {
        mediaItemId: mediaItem.id,
        sourceSiteId: privateSite.id,
        candidateUrl: PRIVATE_MEDIA_CANDIDATE_URL,
        videoUrl: privateUrl,
        language,
        quality,
        status: "ONLINE",
        isSelected: false,
        sortOrder: 0,
      },
    });
  });

  await runPlaybackSelection(mediaItem.id);
  return { mediaItem, playerUrl, resolved };
}

export async function importPrivateMediaSource(input: ImportPrivateMediaInput): Promise<PrivateMediaActionResult> {
  try {
    const merged = mergedImportInput(input);
    if (!merged.sourceUrl) return { success: false, error: "Pega un enlace de Drive o OneDrive." };
    if (!merged.tmdbId || !/^\d+$/.test(merged.tmdbId)) return { success: false, error: "Indica un TMDB ID válido." };
    if (merged.type === "tv" && (!merged.season || !merged.episode)) {
      return { success: false, error: "Para series debes indicar temporada y episodio." };
    }

    const response = await fetch(`${resolverBaseUrl()}/api/private-media/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceUrl: merged.sourceUrl,
        tmdbId: merged.tmdbId,
        type: merged.type,
        season: merged.season,
        episode: merged.episode,
        language: merged.language,
        quality: merged.quality,
        provider: merged.provider,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json() as { success?: boolean; item?: PrivateMediaItem; error?: string };
    if (!response.ok || !data.success || !data.item) {
      return { success: false, error: data.error || "No se pudo importar la fuente propia." };
    }

    const indexed = await indexPrivateMediaVariant({
      tmdbId: merged.tmdbId,
      type: merged.type,
      season: merged.season,
      episode: merged.episode,
      language: merged.language,
      quality: merged.quality,
    });

    revalidatePath("/dashboard/private-media");
    revalidatePath("/dashboard/generated-links");
    revalidatePath("/dashboard/movies");
    revalidatePath("/dashboard/results");
    revalidatePath(indexed.playerUrl);

    return {
      success: true,
      message: `Fuente propia importada e indexada como ${toPrivateMediaLanguage(indexed.resolved.item?.language || merged.language)} ${indexed.resolved.playback?.quality || merged.quality}.`,
      playerUrl: indexed.playerUrl,
      item: data.item,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message || "No se pudo importar la fuente propia.",
    };
  }
}

export async function previewPrivateMediaFolder(input: {
  sourceUrl: string;
  provider?: PrivateMediaProvider;
  type?: PrivateMediaType;
}): Promise<FolderPreviewActionResult> {
  try {
    const response = await fetch(`${resolverBaseUrl()}/api/private-media/folders/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceUrl: input.sourceUrl,
        provider: input.provider || "GOOGLE_DRIVE",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });

    const data = await response.json() as { success?: boolean; preview?: PrivateMediaFolderPreview; error?: string };
    if (!response.ok || !data.success || !data.preview) {
      return { success: false, error: data.error || "No se pudo leer la carpeta." };
    }

    const type = input.type || (data.preview.episodes.length ? "tv" : "movie");
    const candidates = await searchTMDBCandidates(data.preview.titleCandidate, type);

    return { success: true, preview: data.preview, candidates };
  } catch (error) {
    return { success: false, error: (error as Error).message || "No se pudo leer la carpeta." };
  }
}

export async function confirmPrivateMediaFolder(input: {
  preview: PrivateMediaFolderPreview;
  tmdbId: string;
  type: PrivateMediaType;
  title?: string;
}): Promise<FolderConfirmActionResult> {
  try {
    const tmdbId = input.tmdbId.trim();
    if (!/^\d+$/.test(tmdbId)) return { success: false, error: "Confirma un TMDB ID valido." };

    const files = input.preview.files.filter((file) => file.inferredType === input.type);
    if (!files.length) return { success: false, error: "El preview no tiene archivos compatibles con ese tipo." };

    const response = await fetch(`${resolverBaseUrl()}/api/private-media/folders/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceUrl: input.preview.sourceUrl,
        provider: input.preview.provider,
        providerFolderId: input.preview.providerFolderId,
        rootName: input.preview.rootName,
        title: input.title || input.preview.titleCandidate,
        tmdbId,
        type: input.type,
        files,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });

    const data = await response.json() as {
      success?: boolean;
      error?: string;
      folder?: PrivateMediaFolderImport;
      items?: PrivateMediaItem[];
    };
    if (!response.ok || !data.success || !data.folder) {
      return { success: false, error: data.error || "No se pudo confirmar la carpeta." };
    }

    revalidatePath("/dashboard/private-media");
    return {
      success: true,
      folder: data.folder,
      items: data.items || [],
      message: `Carpeta indexada: ${data.items?.length || 0} archivo(s) quedaron listos como fuente propia.`,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message || "No se pudo confirmar la carpeta." };
  }
}

export async function listPrivateMediaSources() {
  try {
    const [listResponse, healthResponse, foldersResponse] = await Promise.all([
      fetch(`${resolverBaseUrl()}/api/private-media/list`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${resolverBaseUrl()}/api/private-media/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${resolverBaseUrl()}/api/private-media/folders`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    const data = await listResponse.json() as { success?: boolean; items?: PrivateMediaItem[]; error?: string };
    const folders = await foldersResponse.json() as { success?: boolean; folders?: PrivateMediaFolderImport[] };
    const health = await healthResponse.json() as {
      success?: boolean;
      providers?: {
        GOOGLE_DRIVE?: PrivateMediaProviderHealth;
        ONEDRIVE?: PrivateMediaProviderHealth;
      };
    };

    if (!listResponse.ok || !data.success) {
      return { success: false, items: [], folders: folders.folders || [], health: health.providers || null, error: data.error || "Resolver no disponible." };
    }
    return { success: true, items: data.items || [], folders: folders.folders || [], health: health.providers || null };
  } catch (error) {
    return { success: false, items: [], folders: [], health: null, error: (error as Error).message };
  }
}
