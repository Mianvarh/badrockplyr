import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  videoVariant: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  selectedPlayback: {
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock("../src/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("runPlaybackSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects the best clean Latino online variant", async () => {
    const { runPlaybackSelection } = await import("../src/services/playbackSelectionService");
    const createdAt = new Date("2026-01-01");

    prismaMock.videoVariant.findMany.mockResolvedValue([
      {
        id: "english",
        mediaItemId: "media",
        language: "ENGLISH",
        quality: "1080p",
        videoUrl: "https://cdn.example/video.m3u8",
        sortOrder: 0,
        createdAt,
        candidateUrl: "AUTO",
        sourceSite: { priority: 10 },
      },
      {
        id: "latino",
        mediaItemId: "media",
        language: "LATINO",
        quality: "HD",
        videoUrl: "https://cdn.example/video.mp4",
        sortOrder: 0,
        createdAt,
        candidateUrl: "AUTO",
        sourceSite: { priority: 1 },
      },
      {
        id: "unsafe",
        mediaItemId: "media",
        language: "LATINO",
        quality: "2160p",
        videoUrl: "https://filemoon.sx/e/abc",
        sortOrder: 0,
        createdAt,
        candidateUrl: "AUTO",
        sourceSite: { priority: 99 },
      },
    ]);
    prismaMock.selectedPlayback.upsert.mockResolvedValue({ id: "selected", videoVariantId: "latino" });

    const result = await runPlaybackSelection("media");

    expect(result?.videoVariantId).toBe("latino");
    expect(prismaMock.videoVariant.update).toHaveBeenCalledWith({
      where: { id: "latino" },
      data: { isSelected: true },
    });
  });

  it("selects the best scraper before private media when both are available", async () => {
    const { runPlaybackSelection } = await import("../src/services/playbackSelectionService");
    const createdAt = new Date("2026-01-01");

    prismaMock.videoVariant.findMany.mockResolvedValue([
      {
        id: "scraper",
        mediaItemId: "media",
        language: "LATINO",
        quality: "1080p",
        videoUrl: "https://cdn.example/video.m3u8",
        sortOrder: 0,
        createdAt,
        candidateUrl: "AUTO",
        sourceSite: { priority: 20 },
      },
      {
        id: "private",
        mediaItemId: "media",
        language: "LATINO",
        quality: "720p",
        videoUrl: "private-media://resolve?tmdbId=11235&type=tv&season=1&episode=1",
        sortOrder: 0,
        createdAt,
        candidateUrl: "PRIVATE_MEDIA",
        sourceSite: { priority: 98 },
      },
    ]);
    prismaMock.selectedPlayback.upsert.mockResolvedValue({ id: "selected", videoVariantId: "scraper" });

    const result = await runPlaybackSelection("media");

    expect(result?.videoVariantId).toBe("scraper");
    expect(prismaMock.videoVariant.update).toHaveBeenCalledWith({
      where: { id: "scraper" },
      data: { isSelected: true },
    });
  });

  it("selects private media when it is the only playable source", async () => {
    const { runPlaybackSelection } = await import("../src/services/playbackSelectionService");
    const createdAt = new Date("2026-01-01");

    prismaMock.videoVariant.findMany.mockResolvedValue([
      {
        id: "unsafe",
        mediaItemId: "media",
        language: "LATINO",
        quality: "1080p",
        videoUrl: "https://filemoon.sx/e/abc",
        sortOrder: 0,
        createdAt,
        candidateUrl: "AUTO",
        sourceSite: { priority: 20 },
      },
      {
        id: "private",
        mediaItemId: "media",
        language: "LATINO",
        quality: "720p",
        videoUrl: "private-media://resolve?tmdbId=11235&type=tv&season=1&episode=1",
        sortOrder: 0,
        createdAt,
        candidateUrl: "PRIVATE_MEDIA",
        sourceSite: { priority: 98 },
      },
    ]);
    prismaMock.selectedPlayback.upsert.mockResolvedValue({ id: "selected", videoVariantId: "private" });

    const result = await runPlaybackSelection("media");

    expect(result?.videoVariantId).toBe("private");
  });

  it("clears selected playback when no online variants exist", async () => {
    const { runPlaybackSelection } = await import("../src/services/playbackSelectionService");
    prismaMock.videoVariant.findMany.mockResolvedValue([]);

    await expect(runPlaybackSelection("media")).resolves.toBeNull();
    expect(prismaMock.selectedPlayback.deleteMany).toHaveBeenCalledWith({ where: { mediaItemId: "media" } });
  });
});
