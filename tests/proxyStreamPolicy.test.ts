import { describe, expect, it } from "vitest";
import {
  isHeavyVideoContentType,
  isLikelyHeavyVideoUrl,
  isPlaylistUrl,
  requiresVpsVideoProxy,
  allowsExplicitFallbackRelay,
  shouldBypassProxyForPlayback,
} from "../src/lib/proxyStreamPolicy";

describe("proxyStreamPolicy", () => {
  it("allows playlist-level proxy work while identifying heavy video payloads", () => {
    expect(isPlaylistUrl("https://cdn.example/master.m3u8")).toBe(true);
    expect(isLikelyHeavyVideoUrl("https://cdn.example/segment-1.ts")).toBe(true);
    expect(isLikelyHeavyVideoUrl("https://cdn.example/chunk.m4s")).toBe(true);
    expect(isLikelyHeavyVideoUrl("https://cdn.example/movie.mp4")).toBe(true);
  });

  it("detects heavy video content types", () => {
    expect(isHeavyVideoContentType("video/mp2t")).toBe(true);
    expect(isHeavyVideoContentType("video/mp4")).toBe(true);
    expect(isHeavyVideoContentType("application/vnd.apple.mpegurl")).toBe(false);
  });

  it("identifies streams that cannot play without relaying video through the VPS", () => {
    expect(requiresVpsVideoProxy("https://unlimplay.com/hls/token/master.m3u8")).toBe(true);
    expect(requiresVpsVideoProxy("https://unlimplay.com/stream-ts/token/segment.ts")).toBe(true);
    expect(requiresVpsVideoProxy("https://cdn.example/master.m3u8")).toBe(false);
  });

  it("allows a full relay only when explicitly requested for a known fallback source", () => {
    expect(allowsExplicitFallbackRelay("https://unlimplay.com/stream-ts/token/segment.ts", true)).toBe(true);
    expect(allowsExplicitFallbackRelay("https://unlimplay.com/stream-ts/token/segment.ts", false)).toBe(false);
    expect(allowsExplicitFallbackRelay("https://cdn.example/segment.ts", true)).toBe(false);
  });

  it("bypasses outbound proxy for all video playlists and heavy video streams", () => {
    expect(shouldBypassProxyForPlayback("https://pfabiwmfmeza.dramiyos-cdn.com/master.m3u8")).toBe(true);
    expect(shouldBypassProxyForPlayback("https://o5czhgnohwluyzcb.acek-cdn.com/seg-1.ts")).toBe(true);
    expect(shouldBypassProxyForPlayback("https://strm2.uqload.vc/master.m3u8")).toBe(true);
    expect(shouldBypassProxyForPlayback("https://example.com/stream.mp4")).toBe(true);
  });
});
