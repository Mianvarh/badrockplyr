export type PrivateMediaProvider = "GOOGLE_DRIVE" | "ONEDRIVE";
export type PrivateMediaType = "movie" | "tv";
export type PrivateMediaStatus = "available" | "pending" | "failed" | "disabled";
export type PrivateMediaFolderStatus = "pending_review" | "indexed" | "partial" | "failed" | "disabled";

export interface PrivateMediaItem {
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
}

export interface PrivateMediaStore {
  version: 1;
  items: PrivateMediaItem[];
  folders?: PrivateMediaFolderImport[];
}

export interface PrivateMediaFolderImport {
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
}

export interface ImportPrivateMediaInput {
  tmdbId: string | number;
  type?: PrivateMediaType;
  mediaType?: PrivateMediaType;
  season?: string | number | null;
  episode?: string | number | null;
  language?: string;
  quality?: string;
  provider?: PrivateMediaProvider;
  providerFileId?: string;
  sourceUrl?: string;
}

export interface ResolvePrivateMediaQuery {
  tmdbId: string;
  type: PrivateMediaType;
  season?: number | null;
  episode?: number | null;
}

export interface ResolvedPrivateMedia {
  item: PrivateMediaItem;
  playback: {
    url: string;
    contentType: string;
    quality: string;
    provider: PrivateMediaProvider;
    resolvedAt: string;
    cookieHeader?: string;
  };
}

export interface PrivateMediaFolderPreviewFile {
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
}

export interface PrivateMediaFolderPreview {
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
}

export interface PreviewPrivateMediaFolderInput {
  sourceUrl: string;
  provider?: PrivateMediaProvider;
}

export interface ConfirmPrivateMediaFolderInput {
  sourceUrl: string;
  provider?: PrivateMediaProvider;
  providerFolderId?: string;
  rootName?: string;
  tmdbId: string | number;
  type?: PrivateMediaType;
  mediaType?: PrivateMediaType;
  title?: string;
  files: PrivateMediaFolderPreviewFile[];
}
