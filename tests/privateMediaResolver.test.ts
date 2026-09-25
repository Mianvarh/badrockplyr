import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildFolderPreview, extractGoogleDriveFolderId, parseEpisodeNumber, parseSeasonNumber } from "../services/private-media-resolver/folders";
import { extractGoogleDriveFileId, parseGoogleDriveVideoInfo, pickBestGoogleDriveSource } from "../services/private-media-resolver/googleDrive";
import { buildPrivateMediaKey } from "../services/private-media-resolver/mediaKey";
import { buildOneDriveContentUrl, extractOneDriveFileId } from "../services/private-media-resolver/oneDrive";
import { listPrivateMediaFolders, readPrivateMediaStore, upsertPrivateMediaFolder, upsertPrivateMediaItem } from "../services/private-media-resolver/store";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
  delete process.env.PRIVATE_MEDIA_STORE_PATH;
});

describe("private media resolver", () => {
  it("extracts Google Drive file ids from supported link formats", () => {
    expect(extractGoogleDriveFileId("https://drive.google.com/file/d/abc123_DEF456/view?usp=sharing")).toBe("abc123_DEF456");
    expect(extractGoogleDriveFileId("https://drive.google.com/open?id=abc123_DEF456")).toBe("abc123_DEF456");
    expect(extractGoogleDriveFileId("abc123_DEF456")).toBe("abc123_DEF456");
  });

  it("extracts Google Drive folder ids from folder links", () => {
    expect(extractGoogleDriveFolderId("https://drive.google.com/drive/folders/1xp8GrzD2tcVlrMZEMpeQvwyTLbegVe8f?usp=sharing")).toBe("1xp8GrzD2tcVlrMZEMpeQvwyTLbegVe8f");
    expect(extractGoogleDriveFolderId("1xp8GrzD2tcVlrMZEMpeQvwyTLbegVe8f")).toBe("1xp8GrzD2tcVlrMZEMpeQvwyTLbegVe8f");
  });

  it("parses season and episode numbers from folder and file names", () => {
    expect(parseSeasonNumber("Temporada 1")).toBe(1);
    expect(parseSeasonNumber("Season 02")).toBe(2);
    expect(parseSeasonNumber("S03")).toBe(3);
    expect(parseSeasonNumber("1")).toBe(1);
    expect(parseEpisodeNumber("S01E10 Latino 1080p.mkv")).toBe(10);
    expect(parseEpisodeNumber("Capitulo 01.mp4")).toBe(1);
    expect(parseEpisodeNumber("09 - El regreso.webm")).toBe(9);
  });

  it("builds a folder preview with inferred MedaBots episodes", () => {
    const preview = buildFolderPreview({
      provider: "GOOGLE_DRIVE",
      providerFolderId: "folder",
      sourceUrl: "https://drive.google.com/drive/folders/folder",
      root: {
        id: "folder",
        name: "MedaBots",
        mimeType: "application/vnd.google-apps.folder",
        children: [
          {
            id: "season-1",
            name: "Temporada 1",
            mimeType: "application/vnd.google-apps.folder",
            children: [
              { id: "ep1", name: "01 Latino 720p.mp4", mimeType: "video/mp4" },
              { id: "ep2", name: "S01E02 Latino 1080p.mkv", mimeType: "video/x-matroska" },
            ],
          },
        ],
      },
    });

    expect(preview.rootName).toBe("MedaBots");
    expect(preview.seasons).toEqual([{ season: 1, files: 2 }]);
    expect(preview.episodes.map((episode) => [episode.season, episode.episode, episode.language, episode.quality])).toEqual([
      [1, 1, "latino", "720p"],
      [1, 2, "latino", "1080p"],
    ]);
  });

  it("accepts public OneDrive and SharePoint links as provider ids", () => {
    const oneDriveUrl = "https://1drv.ms/v/s!abc123?e=xyz";
    const sharePointUrl = "https://contoso.sharepoint.com/:v:/s/site/abc123?e=xyz";

    expect(extractOneDriveFileId(oneDriveUrl)).toBe(oneDriveUrl);
    expect(extractOneDriveFileId(sharePointUrl)).toBe(sharePointUrl);
    expect(buildOneDriveContentUrl(oneDriveUrl)).toMatch(/^https:\/\/api\.onedrive\.com\/v1\.0\/shares\/u!/);
  });

  it("parses and selects the best Google Drive stream without persisting temporary URLs", () => {
    const body = new URLSearchParams({
      fmt_stream_map: [
        `18|${encodeURIComponent("https://video.example/360.mp4?expire=1")}`,
        `22|${encodeURIComponent("https://video.example/720.mp4?expire=1")}`,
      ].join(","),
    }).toString();

    const parsed = parseGoogleDriveVideoInfo(body);
    const source = pickBestGoogleDriveSource(parsed.sources);

    expect(parsed.error).toBeUndefined();
    expect(source?.quality).toBe("720p");
    expect(source?.url).toContain("720.mp4");
  });

  it("builds stable keys for movies and episodes", () => {
    expect(buildPrivateMediaKey({ tmdbId: 62560, mediaType: "tv", season: 1, episode: 10 })).toBe("62560:tv:s1:e10");
    expect(buildPrivateMediaKey({ tmdbId: 378064, mediaType: "movie" })).toBe("378064:movie:s0:e0");
  });

  it("stores provider file ids instead of resolved playback urls", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "private-media-"));
    process.env.PRIVATE_MEDIA_STORE_PATH = join(tempDir, "store.json");

    await upsertPrivateMediaItem({
      tmdbId: "378064",
      mediaType: "movie",
      season: null,
      episode: null,
      language: "latino",
      quality: "720p",
      provider: "GOOGLE_DRIVE",
      providerFileId: "drive_file_id",
      sourceUrl: "https://drive.google.com/file/d/drive_file_id/view",
      status: "available",
    });

    const store = await readPrivateMediaStore();
    expect(store.items).toHaveLength(1);
    expect(JSON.stringify(store)).not.toContain("videoplayback");
  });

  it("stores OneDrive shared urls as stable provider ids", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "private-media-"));
    process.env.PRIVATE_MEDIA_STORE_PATH = join(tempDir, "store.json");

    await upsertPrivateMediaItem({
      tmdbId: "11235",
      mediaType: "tv",
      season: 1,
      episode: 1,
      language: "latino",
      quality: "720p",
      provider: "ONEDRIVE",
      providerFileId: "https://1drv.ms/v/s!abc123?e=xyz",
      sourceUrl: "https://1drv.ms/v/s!abc123?e=xyz",
      status: "available",
    });

    const store = await readPrivateMediaStore();
    expect(store.items[0].provider).toBe("ONEDRIVE");
    expect(store.items[0].providerFileId).toContain("1drv.ms");
  });

  it("stores confirmed folder imports separately from generated links", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "private-media-"));
    process.env.PRIVATE_MEDIA_STORE_PATH = join(tempDir, "store.json");

    await upsertPrivateMediaFolder({
      provider: "GOOGLE_DRIVE",
      providerFolderId: "folder",
      sourceUrl: "https://drive.google.com/drive/folders/folder",
      rootName: "MedaBots",
      title: "MedaBots",
      tmdbId: "11235",
      mediaType: "tv",
      status: "indexed",
      indexedItems: 2,
    });

    const folders = await listPrivateMediaFolders();
    const store = await readPrivateMediaStore();
    expect(folders).toHaveLength(1);
    expect(folders[0].tmdbId).toBe("11235");
    expect(store.items).toHaveLength(0);
  });
});
