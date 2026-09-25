import { describe, expect, it, vi } from "vitest";

const externalFetchMock = vi.fn();

vi.mock("../src/lib/httpClient", () => ({
  externalFetch: externalFetchMock,
}));

function textResponse(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

function segmentResponse(status = 206) {
  const bytes = new Uint8Array(752);
  bytes[0] = 0x47;
  bytes[188] = 0x47;
  bytes[376] = 0x47;
  bytes[564] = 0x47;
  return {
    ok: status < 400,
    status,
    arrayBuffer: async () => bytes.buffer,
  };
}

function pngSegmentResponse(status = 206) {
  return {
    ok: status < 400,
    status,
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer,
  };
}

describe("validateHlsUrl", () => {
  it("rejects invalid HLS responses that look like HTML", async () => {
    externalFetchMock.mockResolvedValueOnce(textResponse("<html>expired</html>"));
    const { validateHlsUrl } = await import("../src/services/hlsValidator");

    await expect(validateHlsUrl("https://cdn.example/master.m3u8")).resolves.toBe(false);
  });

  it("accepts a playable master playlist with a reachable segment", async () => {
    externalFetchMock
      .mockResolvedValueOnce(textResponse("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia/index.m3u8\n"))
      .mockResolvedValueOnce(textResponse("#EXTM3U\n#EXTINF:6,\nseg-1.ts\n"))
      .mockResolvedValueOnce(segmentResponse(206));

    const { validateHlsUrl } = await import("../src/services/hlsValidator");

    await expect(validateHlsUrl("https://cdn.example/master.m3u8")).resolves.toBe(true);
  });

  it("rejects playlists that contain ad images instead of video segments", async () => {
    externalFetchMock
      .mockResolvedValueOnce(textResponse("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia/index.m3u8\n"))
      .mockResolvedValueOnce(textResponse("#EXTM3U\n#EXTINF:6,\nhttps://ads.example/banner.ts\n"))
      .mockResolvedValueOnce(pngSegmentResponse(206));

    const { validateHlsUrl } = await import("../src/services/hlsValidator");

    await expect(validateHlsUrl("https://cdn.example/master.m3u8")).resolves.toBe(false);
  });
});
