import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/v1/media/[id]/route";
import { prisma } from "../src/lib/prisma";
import * as apiKeyAuth from "../src/lib/apiKeyAuth";
import * as tmdbService from "../src/services/tmdbService";

describe("REST API v1 (/api/v1/media/[id])", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when API Key is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/media/550");
    const res = await GET(req, { params: Promise.resolve({ id: "550" }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("API Key requerida");
  });

  it("returns 403 when API Key is invalid or inactive", async () => {
    vi.spyOn(apiKeyAuth, "validateApiKey").mockResolvedValue({
      valid: false,
      error: "API Key inactiva o revocada.",
    });

    const req = new NextRequest("http://localhost:3000/api/v1/media/550", {
      headers: { "X-Badrock-Key": "bdrk_live_invalid" },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "550" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("inactiva");
  });

  it("returns clean JSON with servers and VIP source as the last option", async () => {
    vi.spyOn(apiKeyAuth, "validateApiKey").mockResolvedValue({
      valid: true,
      apiKey: {
        id: "key-1",
        key: "bdrk_live_test",
        name: "Test Key",
        allowedDomains: null,
        rateLimitPerMinute: 60,
        requestCount: 0,
        lastUsedAt: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    vi.spyOn(tmdbService, "fetchTMDBExternalIds").mockResolvedValue({
      imdbId: "tt0137523",
    });

    vi.spyOn(prisma.mediaItem, "findFirst").mockResolvedValue({
      id: "media-1",
      tmdbId: "550",
      mediaType: "movie",
      title: "Fight Club",
      originalTitle: "Fight Club",
      overview: "An insomniac office worker...",
      posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
      backdropPath: "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
      releaseYear: 1999,
      firstAirYear: null,
      genres: "Drama",
      originalLanguage: "en",
      season: null,
      episode: null,
      episodeTitle: null,
      episodeOverview: null,
      episodeStillPath: null,
      airDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      videoVariants: [
        {
          id: "v-vip",
          mediaItemId: "media-1",
          sourceSiteId: "private-media-source-id",
          candidateUrl: "PRIVATE_MEDIA",
          videoUrl: "private-media://resolve?tmdbId=550&type=movie",
          language: "LATINO",
          quality: "1080p",
          status: "ONLINE",
          isSelected: false,
          sortOrder: 99,
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceSite: {
            id: "private-media-source-id",
            name: "Servidor VIP (Fuente Propia)",
            allowedDomain: "private-media.local",
            baseUrl: "private-media://resolve",
            searchMode: "TMDB_ID",
            active: true,
            priority: 1,
            usePlaywright: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: "v-1",
          mediaItemId: "media-1",
          sourceSiteId: "cuevana3-source-id",
          candidateUrl: "https://cuevana3.example/movie/550",
          videoUrl: "https://stream.example/video1.m3u8",
          language: "LATINO",
          quality: "HD",
          status: "ONLINE",
          isSelected: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceSite: {
            id: "cuevana3-source-id",
            name: "Cuevana3",
            allowedDomain: "cuevana3.example",
            baseUrl: "https://cuevana3.example",
            searchMode: "TITLE",
            active: true,
            priority: 12,
            usePlaywright: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: "v-2",
          mediaItemId: "media-1",
          sourceSiteId: "pelisflix-source-id",
          candidateUrl: "https://pelisflix.example/movie/550",
          videoUrl: "https://stream.example/video2.mp4",
          language: "LATINO",
          quality: "1080p",
          status: "ONLINE",
          isSelected: false,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceSite: {
            id: "pelisflix-source-id",
            name: "PelisFlix",
            allowedDomain: "pelisflix.example",
            baseUrl: "https://pelisflix.example",
            searchMode: "TITLE",
            active: true,
            priority: 13,
            usePlaywright: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ],
    } as any);

    const req = new NextRequest("http://localhost:3000/api/v1/media/550", {
      headers: { "X-Badrock-Key": "bdrk_live_test" },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "550" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.tmdbId).toBe("550");
    expect(json.data.imdbId).toBe("tt0137523");
    expect(json.data.title).toBe("Fight Club");
    expect(json.data.year).toBe(1999);
    expect(json.data.type).toBe("movie");
    expect(json.data.embedPlayerUrl).toContain("/play/embed/movie/550");
    expect(json.data.embedIframe).toContain("<iframe");

    // Check servers: Servidor VIP must ALWAYS be the last option!
    const servers = json.data.servers;
    expect(servers).toHaveLength(3);
    expect(servers[0].name).toBe("Servidor 1");
    expect(servers[0].source).toBe("Cuevana3");
    expect(servers[1].name).toBe("Servidor 2");
    expect(servers[1].source).toBe("PelisFlix");
    expect(servers[2].name).toBe("Servidor VIP (Fuente Propia)");
    expect(servers[2].source).toBe("Fuente Propia");
    expect(servers[2].isVip).toBe(true);
  });
});
