import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildPrivateMediaKey } from "./mediaKey";
import type { PrivateMediaFolderImport, PrivateMediaItem, PrivateMediaStore, ResolvePrivateMediaQuery } from "./types";

const defaultStorePath = join(process.cwd(), "services", "private-media-resolver", "data", "private-media.json");

export function getPrivateMediaStorePath() {
  return process.env.PRIVATE_MEDIA_STORE_PATH || defaultStorePath;
}

export async function readPrivateMediaStore(path = getPrivateMediaStorePath()): Promise<PrivateMediaStore> {
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as PrivateMediaStore;
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, items: [], folders: [] };
    throw error;
  }
}

export async function writePrivateMediaStore(store: PrivateMediaStore, path = getPrivateMediaStorePath()) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function upsertPrivateMediaItem(item: Omit<PrivateMediaItem, "id" | "createdAt" | "updatedAt">) {
  const store = await readPrivateMediaStore();
  const now = new Date().toISOString();
  const existingIndex = store.items.findIndex(
    (existing) =>
      existing.provider === item.provider &&
      existing.providerFileId === item.providerFileId &&
      buildPrivateMediaKey(existing) === buildPrivateMediaKey(item)
  );

  const nextItem: PrivateMediaItem =
    existingIndex >= 0
      ? { ...store.items[existingIndex], ...item, updatedAt: now }
      : { id: randomUUID(), ...item, createdAt: now, updatedAt: now };

  if (existingIndex >= 0) {
    store.items[existingIndex] = nextItem;
  } else {
    store.items.push(nextItem);
  }

  await writePrivateMediaStore(store);
  return nextItem;
}

export async function upsertPrivateMediaFolder(folder: Omit<PrivateMediaFolderImport, "id" | "createdAt" | "updatedAt">) {
  const store = await readPrivateMediaStore();
  const now = new Date().toISOString();
  const folders = store.folders || [];
  const existingIndex = folders.findIndex(
    (existing) => existing.provider === folder.provider && existing.providerFolderId === folder.providerFolderId
  );

  const nextFolder: PrivateMediaFolderImport =
    existingIndex >= 0
      ? { ...folders[existingIndex], ...folder, updatedAt: now }
      : { id: randomUUID(), ...folder, createdAt: now, updatedAt: now };

  if (existingIndex >= 0) {
    folders[existingIndex] = nextFolder;
  } else {
    folders.push(nextFolder);
  }

  store.folders = folders;
  await writePrivateMediaStore(store);
  return nextFolder;
}

export async function listPrivateMediaFolders() {
  const store = await readPrivateMediaStore();
  return [...(store.folders || [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function markPrivateMediaItemResolved(id: string) {
  const store = await readPrivateMediaStore();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return null;

  item.status = "available";
  delete item.lastError;
  item.updatedAt = new Date().toISOString();
  await writePrivateMediaStore(store);
  return item;
}

export async function markPrivateMediaItemError(id: string, error: string) {
  const store = await readPrivateMediaStore();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return null;

  item.lastError = error;
  item.updatedAt = new Date().toISOString();
  await writePrivateMediaStore(store);
  return item;
}

export async function findPrivateMediaItems(query: ResolvePrivateMediaQuery) {
  const store = await readPrivateMediaStore();
  const key = buildPrivateMediaKey({
    tmdbId: query.tmdbId,
    mediaType: query.type,
    season: query.season,
    episode: query.episode,
  });

  return store.items
    .filter((item) => buildPrivateMediaKey(item) === key && item.status !== "disabled")
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "available" ? -1 : 1;
      if (left.provider !== right.provider) return left.provider === "GOOGLE_DRIVE" ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}
