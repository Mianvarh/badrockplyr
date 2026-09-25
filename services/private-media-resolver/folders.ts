import { normalizeLanguage, normalizeQuality } from "./mediaKey";
import type {
  PrivateMediaFolderPreview,
  PrivateMediaFolderPreviewFile,
  PrivateMediaProvider,
} from "./types";

const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".avi", ".mov"];

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
};

type FolderNode = DriveFile & {
  children?: FolderNode[];
};

type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  parentReference?: { driveId?: string };
  folder?: unknown;
  file?: { mimeType?: string };
  video?: unknown;
};

export function extractGoogleDriveFolderId(value: string) {
  const clean = value.trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(clean) && !clean.includes("/")) return clean;

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }

  const folderMatch = parsed.pathname.match(/\/(?:drive\/)?folders\/([^/?]+)/);
  if (folderMatch?.[1]) return folderMatch[1];

  const id = parsed.searchParams.get("id");
  return id || null;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function buildOneDriveShareId(sharedUrl: string) {
  return `u!${base64UrlEncode(sharedUrl)}`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripExtension(value: string) {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "");
}

export function isVideoFileName(name: string, mimeType?: string) {
  const lower = name.toLowerCase();
  return Boolean(mimeType?.startsWith("video/")) || VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function parseSeasonNumber(name: string) {
  const normalized = normalizeText(name);
  const labeled = normalized.match(/\b(?:temporada|season|temp|temporada|t|s)\s*0*(\d{1,3})\b/);
  if (labeled?.[1]) return Number(labeled[1]);
  if (/^\d{1,3}$/.test(normalized)) return Number(normalized);
  return null;
}

export function parseEpisodeNumber(name: string) {
  const normalized = normalizeText(stripExtension(name));
  const combined = normalized.match(/\bs\s*0*\d{1,3}\s*e\s*0*(\d{1,4})\b/);
  if (combined?.[1]) return Number(combined[1]);

  const labeled = normalized.match(/\b(?:episodio|episode|capitulo|cap|ep|e)\s*0*(\d{1,4})\b/);
  if (labeled?.[1]) return Number(labeled[1]);

  const leading = normalized.match(/^0*(\d{1,4})(?:\b|\s|-)/);
  if (leading?.[1]) return Number(leading[1]);

  return null;
}

export function inferLanguageFromName(name: string) {
  const normalized = normalizeText(name);
  if (/\b(?:latino|lat|espanol latino)\b/.test(normalized)) return "latino";
  if (/\b(?:castellano|espana|spanish)\b/.test(normalized)) return "castellano";
  if (/\b(?:japanese|japones|japon[eé]s|sub)\b/.test(normalized)) return "japanese";
  if (/\b(?:english|ingles|ingl[eé]s|vo)\b/.test(normalized)) return "english";
  return "latino";
}

export function inferQualityFromName(name: string) {
  const normalized = normalizeText(name);
  const pixel = normalized.match(/\b(2160|1080|720|480|360)p?\b/);
  if (pixel?.[1]) return `${pixel[1]}p`;
  if (/\b(?:fhd|full hd)\b/.test(normalized)) return "1080p";
  if (/\bhd\b/.test(normalized)) return "720p";
  return "auto";
}

function isMovieCatalogRoot(name: string) {
  return ["peliculas", "movies", "cine"].includes(normalizeText(name));
}

function groupTitleFromPath(rootName: string, path: string[]) {
  const nonSeasonFolder = path.find((segment) => segment !== rootName && parseSeasonNumber(segment) === null);
  return nonSeasonFolder || stripExtension(path[path.length - 1] || rootName);
}

export function buildFolderPreview(input: {
  provider: PrivateMediaProvider;
  providerFolderId: string;
  sourceUrl: string;
  root: FolderNode;
}): PrivateMediaFolderPreview {
  const files: PrivateMediaFolderPreviewFile[] = [];
  const warnings: string[] = [];

  function walk(node: FolderNode, path: string[], inheritedSeason: number | null) {
    const currentSeason = node.mimeType === GOOGLE_DRIVE_FOLDER_MIME
      ? parseSeasonNumber(node.name) ?? inheritedSeason
      : inheritedSeason;

    if (node.mimeType !== GOOGLE_DRIVE_FOLDER_MIME && isVideoFileName(node.name, node.mimeType)) {
      const movieCatalog = isMovieCatalogRoot(input.root.name);
      const episode = currentSeason ? parseEpisodeNumber(node.name) : null;
      const inferredType = movieCatalog || !currentSeason || !episode ? "movie" : "tv";
      const groupTitle = inferredType === "movie"
        ? groupTitleFromPath(input.root.name, path)
        : input.root.name;

      files.push({
        provider: input.provider,
        providerFileId: node.id,
        sourceUrl: node.webViewLink,
        name: node.name,
        path,
        mimeType: node.mimeType,
        inferredType,
        season: inferredType === "tv" ? currentSeason : null,
        episode: inferredType === "tv" ? episode : null,
        language: normalizeLanguage(inferLanguageFromName(path.join(" "))),
        quality: normalizeQuality(inferQualityFromName(path.join(" "))),
        groupTitle,
      });
      return;
    }

    for (const child of node.children || []) {
      walk(child, [...path, child.name], currentSeason);
    }
  }

  walk(input.root, [input.root.name], null);

  const episodeFiles = files.filter((file) => file.inferredType === "tv");
  const seasonMap = new Map<number, number>();
  for (const file of episodeFiles) {
    if (file.season) seasonMap.set(file.season, (seasonMap.get(file.season) || 0) + 1);
  }

  const movieMap = new Map<string, PrivateMediaFolderPreviewFile[]>();
  for (const file of files.filter((entry) => entry.inferredType === "movie")) {
    movieMap.set(file.groupTitle, [...(movieMap.get(file.groupTitle) || []), file]);
  }

  if (!files.length) warnings.push("No se detectaron archivos de video en la carpeta.");
  if (files.length >= 500) warnings.push("El preview llego al limite inicial de 500 archivos.");

  return {
    provider: input.provider,
    providerFolderId: input.providerFolderId,
    sourceUrl: input.sourceUrl,
    rootName: input.root.name,
    titleCandidate: isMovieCatalogRoot(input.root.name) ? "Peliculas" : input.root.name,
    seasons: [...seasonMap.entries()].sort((a, b) => a[0] - b[0]).map(([season, count]) => ({ season, files: count })),
    files,
    episodes: episodeFiles.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0)),
    movieGroups: [...movieMap.entries()].map(([title, groupFiles]) => ({ title, files: groupFiles })),
    warnings,
  };
}

async function googleDriveJson<T>(url: URL) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Google Drive API returned HTTP ${response.status}`);
  return data;
}

async function graphJson<T>(url: URL, accessToken: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Microsoft Graph returned HTTP ${response.status}`);
  return data;
}

async function getGraphAccessToken(input: { tenantId: string; clientId: string; clientSecret: string }) {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(input.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Microsoft Graph auth returned HTTP ${response.status}`);
  }
  return data.access_token;
}

async function getGoogleDriveFolder(folderId: string, apiKey: string): Promise<DriveFile> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  return googleDriveJson<DriveFile>(url);
}

async function listGoogleDriveChildren(folderId: string, apiKey: string, pageToken?: string) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`);
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink)");
  url.searchParams.set("pageSize", "100");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return googleDriveJson<{ nextPageToken?: string; files?: DriveFile[] }>(url);
}

export async function previewGoogleDriveFolder(input: {
  sourceUrl: string;
  apiKey: string;
  maxDepth?: number;
  maxFiles?: number;
}) {
  const providerFolderId = extractGoogleDriveFolderId(input.sourceUrl);
  if (!providerFolderId) throw new Error("No pude extraer el ID de carpeta de Google Drive.");

  const maxDepth = input.maxDepth ?? 4;
  const maxFiles = input.maxFiles ?? 500;
  let scannedFiles = 0;

  async function loadNode(file: DriveFile, depth: number): Promise<FolderNode> {
    if (file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME || depth >= maxDepth || scannedFiles >= maxFiles) return file;

    const children: FolderNode[] = [];
    let pageToken: string | undefined;
    do {
      const page = await listGoogleDriveChildren(file.id, input.apiKey, pageToken);
      for (const child of page.files || []) {
        if (scannedFiles >= maxFiles) break;
        if (child.mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
          children.push(await loadNode(child, depth + 1));
        } else {
          scannedFiles += 1;
          children.push(child);
        }
      }
      pageToken = scannedFiles >= maxFiles ? undefined : page.nextPageToken;
    } while (pageToken);

    return { ...file, children };
  }

  const rootFile = await getGoogleDriveFolder(providerFolderId, input.apiKey);
  const root = await loadNode(rootFile, 0);

  return buildFolderPreview({
    provider: "GOOGLE_DRIVE",
    providerFolderId,
    sourceUrl: input.sourceUrl,
    root,
  });
}

function graphItemToNode(item: GraphDriveItem): FolderNode {
  return {
    id: item.webUrl || item.id,
    name: item.name,
    mimeType: item.folder ? GOOGLE_DRIVE_FOLDER_MIME : item.file?.mimeType || (item.video ? "video/mp4" : undefined),
    webViewLink: item.webUrl,
  };
}

export async function previewOneDriveFolder(input: {
  sourceUrl: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  maxDepth?: number;
  maxFiles?: number;
}) {
  const shareId = buildOneDriveShareId(input.sourceUrl);
  const maxDepth = input.maxDepth ?? 4;
  const maxFiles = input.maxFiles ?? 500;
  let scannedFiles = 0;
  const token = await getGraphAccessToken({
    tenantId: input.tenantId,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });

  async function loadSharedRoot() {
    const url = new URL(`https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareId)}/driveItem`);
    return graphJson<GraphDriveItem>(url, token);
  }

  async function listChildren(itemIdPath: string, nextLink?: string) {
    const url = nextLink
      ? new URL(nextLink)
      : new URL(`https://graph.microsoft.com/v1.0/${itemIdPath}/children`);
    return graphJson<{ value?: GraphDriveItem[]; "@odata.nextLink"?: string }>(url, token);
  }

  async function loadNode(item: GraphDriveItem, itemPath: string, depth: number): Promise<FolderNode> {
    const node = graphItemToNode(item);
    if (!item.folder || depth >= maxDepth || scannedFiles >= maxFiles) return node;

    const children: FolderNode[] = [];
    let nextLink: string | undefined;
    do {
      const page = await listChildren(itemPath, nextLink);
      for (const child of page.value || []) {
        if (scannedFiles >= maxFiles) break;
        const driveId = child.parentReference?.driveId;
        const childPath = driveId
          ? `drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(child.id)}`
          : `${itemPath}:/${encodeURIComponent(child.name)}`;
        if (child.folder) {
          children.push(await loadNode(child, childPath, depth + 1));
        } else {
          scannedFiles += 1;
          children.push(graphItemToNode(child));
        }
      }
      nextLink = scannedFiles >= maxFiles ? undefined : page["@odata.nextLink"];
    } while (nextLink);

    return { ...node, children };
  }

  const rootItem = await loadSharedRoot();
  const rootPath = `shares/${encodeURIComponent(shareId)}/driveItem`;
  const root = await loadNode(rootItem, rootPath, 0);

  return buildFolderPreview({
    provider: "ONEDRIVE",
    providerFolderId: shareId,
    sourceUrl: input.sourceUrl,
    root,
  });
}
