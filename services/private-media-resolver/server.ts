import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { previewGoogleDriveFolder, previewOneDriveFolder } from "./folders";
import { extractGoogleDriveFileId, resolveGoogleDriveFile } from "./googleDrive";
import { extractOneDriveFileId, resolveOneDriveFile } from "./oneDrive";
import { normalizeLanguage, normalizeOptionalNumber, normalizePrivateMediaType, normalizeQuality } from "./mediaKey";
import {
  findPrivateMediaItems,
  listPrivateMediaFolders,
  markPrivateMediaItemError,
  markPrivateMediaItemResolved,
  readPrivateMediaStore,
  upsertPrivateMediaFolder,
  upsertPrivateMediaItem,
} from "./store";
import type {
  ConfirmPrivateMediaFolderInput,
  ImportPrivateMediaInput,
  PreviewPrivateMediaFolderInput,
  PrivateMediaProvider,
  PrivateMediaStatus,
  PrivateMediaType,
  ResolvedPrivateMedia,
} from "./types";

const PORT = Number(process.env.PRIVATE_MEDIA_RESOLVER_PORT || 3091);

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function normalizeProvider(value: string | undefined): PrivateMediaProvider {
  if (value === "ONEDRIVE") return "ONEDRIVE";
  return "GOOGLE_DRIVE";
}

function getProviderFileId(input: ImportPrivateMediaInput, provider: PrivateMediaProvider) {
  if (input.providerFileId) return input.providerFileId.trim();
  if (!input.sourceUrl) return null;
  if (provider === "GOOGLE_DRIVE") return extractGoogleDriveFileId(input.sourceUrl);
  return extractOneDriveFileId(input.sourceUrl);
}

async function importPrivateMedia(request: IncomingMessage, response: ServerResponse) {
  const input = (await readJsonBody(request)) as ImportPrivateMediaInput;
  const mediaType = normalizePrivateMediaType(input.mediaType || input.type);
  const provider = normalizeProvider(input.provider);
  const providerFileId = getProviderFileId(input, provider);

  if (!input.tmdbId || !mediaType) {
    return sendJson(response, 400, { success: false, error: "tmdbId and type/movieType are required." });
  }

  if (!providerFileId) {
    return sendJson(response, 400, { success: false, error: `Could not extract a ${provider} file id.` });
  }

  const status: PrivateMediaStatus = "available";
  const item = await upsertPrivateMediaItem({
    tmdbId: String(input.tmdbId).trim(),
    mediaType,
    season: normalizeOptionalNumber(input.season),
    episode: normalizeOptionalNumber(input.episode),
    language: normalizeLanguage(input.language),
    quality: normalizeQuality(input.quality),
    provider,
    providerFileId,
    sourceUrl: input.sourceUrl,
    status,
  });

  return sendJson(response, 201, { success: true, item });
}

async function previewPrivateMediaFolder(request: IncomingMessage, response: ServerResponse) {
  const input = (await readJsonBody(request)) as PreviewPrivateMediaFolderInput;
  const sourceUrl = input.sourceUrl?.trim();
  const provider = normalizeProvider(input.provider);

  if (!sourceUrl) return sendJson(response, 400, { success: false, error: "sourceUrl is required." });
  let preview;
  if (provider === "GOOGLE_DRIVE") {
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
    if (!apiKey) {
      return sendJson(response, 400, {
        success: false,
        error: "GOOGLE_DRIVE_API_KEY is required to preview Drive folders.",
      });
    }
    preview = await previewGoogleDriveFolder({ sourceUrl, apiKey });
  } else {
    const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID;
    const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      return sendJson(response, 400, {
        success: false,
        error: "MICROSOFT_GRAPH_TENANT_ID, MICROSOFT_GRAPH_CLIENT_ID and MICROSOFT_GRAPH_CLIENT_SECRET are required to preview OneDrive folders.",
      });
    }
    preview = await previewOneDriveFolder({ sourceUrl, tenantId, clientId, clientSecret });
  }

  return sendJson(response, 200, { success: true, preview });
}

async function confirmPrivateMediaFolder(request: IncomingMessage, response: ServerResponse) {
  const input = (await readJsonBody(request)) as ConfirmPrivateMediaFolderInput;
  const mediaType = normalizePrivateMediaType(input.mediaType || input.type);
  const provider = normalizeProvider(input.provider);
  const tmdbId = String(input.tmdbId || "").trim();

  if (!tmdbId || !/^\d+$/.test(tmdbId)) return sendJson(response, 400, { success: false, error: "tmdbId is required." });
  if (!mediaType) return sendJson(response, 400, { success: false, error: "type is required." });
  if (!Array.isArray(input.files) || input.files.length === 0) {
    return sendJson(response, 400, { success: false, error: "files are required." });
  }

  const indexed: Awaited<ReturnType<typeof upsertPrivateMediaItem>>[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  for (const file of input.files) {
    const fileType: PrivateMediaType = normalizePrivateMediaType(file.inferredType) || mediaType;
    if (fileType !== mediaType) {
      skipped.push({ name: file.name, reason: "media type mismatch" });
      continue;
    }
    if (mediaType === "tv" && (!file.season || !file.episode)) {
      skipped.push({ name: file.name, reason: "missing season or episode" });
      continue;
    }

    const item = await upsertPrivateMediaItem({
      tmdbId,
      mediaType,
      season: mediaType === "tv" ? normalizeOptionalNumber(file.season) : null,
      episode: mediaType === "tv" ? normalizeOptionalNumber(file.episode) : null,
      language: normalizeLanguage(file.language),
      quality: normalizeQuality(file.quality),
      provider,
      providerFileId: file.providerFileId,
      sourceUrl: file.sourceUrl,
      status: "available",
    });
    indexed.push(item);
  }

  const folder = await upsertPrivateMediaFolder({
    provider,
    providerFolderId: input.providerFolderId || "",
    sourceUrl: input.sourceUrl,
    rootName: input.rootName || input.title || "Private Media Folder",
    title: input.title || input.rootName || "Private Media Folder",
    tmdbId,
    mediaType,
    status: indexed.length === input.files.length ? "indexed" : indexed.length > 0 ? "partial" : "failed",
    indexedItems: indexed.length,
    lastError: skipped.length ? `${skipped.length} files skipped.` : undefined,
  });

  return sendJson(response, 201, { success: true, folder, items: indexed, skipped });
}

async function resolvePrivateMedia(url: URL, response: ServerResponse) {
  const mediaType = normalizePrivateMediaType(url.searchParams.get("type") || undefined);
  const tmdbId = url.searchParams.get("tmdbId")?.trim();

  if (!tmdbId || !mediaType) {
    return sendJson(response, 400, { success: false, error: "tmdbId and type are required." });
  }

  const items = await findPrivateMediaItems({
    tmdbId,
    type: mediaType,
    season: normalizeOptionalNumber(url.searchParams.get("season")),
    episode: normalizeOptionalNumber(url.searchParams.get("episode")),
  });

  if (!items.length) return sendJson(response, 404, { success: false, error: "No private media source was found." });

  const errors: string[] = [];
  for (const item of items) {
    try {
      const playback = item.provider === "ONEDRIVE"
        ? await resolveOneDriveFile(item.providerFileId, item.quality)
        : await resolveGoogleDriveFile(item.providerFileId, item.quality);
      const payload: ResolvedPrivateMedia = {
        item,
        playback: {
          ...playback,
          provider: item.provider,
          resolvedAt: new Date().toISOString(),
        },
      };

      await markPrivateMediaItemResolved(item.id);
      return sendJson(response, 200, { success: true, ...payload });
    } catch (error) {
      const message = (error as Error).message;
      await markPrivateMediaItemError(item.id, message);
      errors.push(`${item.provider}:${message}`);
    }
  }

  return sendJson(response, 502, { success: false, error: "No private media source resolved.", details: errors });
}

async function probeProvider(url: string, okStatus: (status: number) => boolean) {
  const startedAt = Date.now();
  try {
    const result = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    await result.body?.cancel();
    return {
      status: okStatus(result.status) ? "ok" : "failed",
      latencyMs: Date.now() - startedAt,
      httpStatus: result.status,
    };
  } catch (error) {
    return {
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: (error as Error).message,
    };
  }
}

async function health(response: ServerResponse) {
  const store = await readPrivateMediaStore();
  const googleDriveItems = store.items.filter((item) => item.provider === "GOOGLE_DRIVE");
  const oneDriveItems = store.items.filter((item) => item.provider === "ONEDRIVE");
  const [googleProbe, oneDriveProbe] = await Promise.all([
    probeProvider("https://docs.google.com/generate_204", (status) => status === 204 || status === 200),
    probeProvider("https://api.onedrive.com/v1.0/drive", (status) => status < 500),
  ]);

  return sendJson(response, 200, {
    success: true,
    service: "private-media-resolver",
    providers: {
      GOOGLE_DRIVE: {
        ...googleProbe,
        items: googleDriveItems.length,
        lastErrors: googleDriveItems.filter((item) => item.lastError).slice(-5).map((item) => ({
          tmdbId: item.tmdbId,
          type: item.mediaType,
          season: item.season,
          episode: item.episode,
          error: item.lastError,
          updatedAt: item.updatedAt,
        })),
      },
      ONEDRIVE: {
        ...oneDriveProbe,
        items: oneDriveItems.length,
        lastErrors: oneDriveItems.filter((item) => item.lastError).slice(-5).map((item) => ({
          tmdbId: item.tmdbId,
          type: item.mediaType,
          season: item.season,
          episode: item.episode,
          error: item.lastError,
          updatedAt: item.updatedAt,
        })),
      },
    },
    store: { items: store.items.length },
  });
}

async function listPrivateMedia(response: ServerResponse) {
  const store = await readPrivateMediaStore();
  return sendJson(response, 200, {
    success: true,
    items: [...store.items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  });
}

async function listPrivateMediaFolderImports(response: ServerResponse) {
  const folders = await listPrivateMediaFolders();
  return sendJson(response, 200, { success: true, folders });
}

export function createPrivateMediaResolverServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === "/api/private-media/health") return health(response);
      if (request.method === "GET" && url.pathname === "/api/private-media/list") return listPrivateMedia(response);
      if (request.method === "GET" && url.pathname === "/api/private-media/folders") return listPrivateMediaFolderImports(response);
      if (request.method === "POST" && url.pathname === "/api/private-media/import") return importPrivateMedia(request, response);
      if (request.method === "POST" && url.pathname === "/api/private-media/folders/preview") return previewPrivateMediaFolder(request, response);
      if (request.method === "POST" && url.pathname === "/api/private-media/folders/confirm") return confirmPrivateMediaFolder(request, response);
      if (request.method === "GET" && url.pathname === "/api/private-media/resolve") return resolvePrivateMedia(url, response);

      return sendJson(response, 404, { success: false, error: "Not found." });
    } catch (error) {
      return sendJson(response, 500, { success: false, error: (error as Error).message });
    }
  });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  createPrivateMediaResolverServer().listen(PORT, () => {
    console.log(`Private Media Resolver listening on http://localhost:${PORT}`);
  });
}
