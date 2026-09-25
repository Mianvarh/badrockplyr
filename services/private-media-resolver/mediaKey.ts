import type { PrivateMediaType } from "./types";

export function normalizePrivateMediaType(value: string | undefined): PrivateMediaType | null {
  if (value === "movie" || value === "tv") return value;
  return null;
}

export function normalizeOptionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function buildPrivateMediaKey(input: {
  tmdbId: string | number;
  mediaType: PrivateMediaType;
  season?: number | null;
  episode?: number | null;
}) {
  const season = input.mediaType === "tv" ? input.season ?? 0 : 0;
  const episode = input.mediaType === "tv" ? input.episode ?? 0 : 0;
  return `${String(input.tmdbId).trim()}:${input.mediaType}:s${season}:e${episode}`;
}

export function normalizeLanguage(value: string | undefined) {
  return (value || "unknown").trim().toLowerCase();
}

export function normalizeQuality(value: string | undefined) {
  return (value || "auto").trim().toLowerCase();
}
