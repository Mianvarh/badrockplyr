import { describe, expect, it } from "vitest";
import {
  classifyPlaybackRoute,
  comparePlaybackRank,
  isCleanPlaybackUrl,
  isUnsafeIframeHost,
  MAX_VIDEO_OPTIONS,
  orderPlaybackOptions,
} from "../src/lib/playbackUrlPolicy";

describe("playbackUrlPolicy", () => {
  it("rejects iframe hosts that require removing sandbox", () => {
    expect(isUnsafeIframeHost("https://nzn3.org/e/abc")).toBe(true);
    expect(isUnsafeIframeHost("https://filemoon.sx/e/abc")).toBe(true);
    expect(isCleanPlaybackUrl("https://filemoon.sx/e/abc")).toBe(false);
  });

  it("allows direct streams and resolvable embeds as clean playback options", () => {
    expect(isCleanPlaybackUrl("https://cdn.example/movie/index.m3u8")).toBe(true);
    expect(isCleanPlaybackUrl("https://cdn.example/movie.mp4")).toBe(true);
    expect(isCleanPlaybackUrl("private-media://resolve?tmdbId=11235&type=tv&season=1&episode=1")).toBe(true);
    expect(isCleanPlaybackUrl("https://voe.sx/e/abc")).toBe(true);
    expect(isCleanPlaybackUrl("https://mega.nz/file/abc#key")).toBe(false);
  });

  it("rejects Goodstream because browser playback currently returns transient 403 errors", () => {
    expect(isCleanPlaybackUrl("https://goodstream.one/embed-abc.html")).toBe(false);
  });

  it("ranks Latino first, then higher quality", () => {
    const sorted = [
      { videoUrl: "https://filemoon.sx/e/abc", quality: "1080p", language: "LATINO" },
      { videoUrl: "https://cdn.example/720.m3u8", quality: "720p", language: "LATINO" },
      { videoUrl: "https://cdn.example/1080.m3u8", quality: "1080p", language: "ENGLISH" },
    ].sort(comparePlaybackRank);

    expect(sorted[0].videoUrl).toContain("720.m3u8");
    expect(MAX_VIDEO_OPTIONS).toBe(4);
  });

  it("orders best scraper first and private media second when an external source exists", () => {
    const sorted = orderPlaybackOptions([
      {
        videoUrl: "https://cdn.example/1080.m3u8",
        candidateUrl: "SCRAPER",
        quality: "1080p",
        language: "LATINO",
        sourceSite: { priority: 20 },
      },
      {
        videoUrl: "private-media://resolve?tmdbId=11235&type=tv&season=1&episode=1",
        candidateUrl: "PRIVATE_MEDIA",
        quality: "720p",
        language: "LATINO",
        sourceSite: { priority: 98 },
      },
      {
        videoUrl: "https://manual.example/video.mp4",
        candidateUrl: "MANUAL",
        quality: "720p",
        language: "LATINO",
        sourceSite: { priority: 99 },
      },
    ]);

    expect(sorted.map((variant) => variant.candidateUrl)).toEqual(["MANUAL", "SCRAPER", "PRIVATE_MEDIA"]);
  });

  it("uses private media as option 1 when it is the only clean playable source", () => {
    const sorted = orderPlaybackOptions([
      {
        videoUrl: "https://filemoon.sx/e/abc",
        candidateUrl: "SCRAPER",
        quality: "1080p",
        language: "LATINO",
      },
      {
        videoUrl: "private-media://resolve?tmdbId=11235&type=tv&season=1&episode=1",
        candidateUrl: "PRIVATE_MEDIA",
        quality: "720p",
        language: "LATINO",
      },
    ]);

    expect(sorted.map((variant) => variant.candidateUrl)).toEqual(["PRIVATE_MEDIA"]);
  });

  it("can order scraper candidates without applying the 4-option playback limit", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      videoUrl: index === 0 ? "https://filemoon.sx/e/noisy" : `https://cdn.example/${index}.m3u8`,
      candidateUrl: `SCRAPER-${index}`,
      quality: "HD",
      language: "LATINO",
    }));

    const sorted = orderPlaybackOptions(candidates, null);

    expect(sorted).toHaveLength(7);
    expect(sorted.map((variant) => variant.candidateUrl)).toContain("SCRAPER-7");
  });

  it("keeps Vimeus wrappers eligible as clean iframe fallbacks", () => {
    expect(isCleanPlaybackUrl("https://vimeus.com/e/serie?tmdb=62560&se=1&ep=10")).toBe(true);
  });

  it("allows canonical OK.ru embeds while rejecting arbitrary OK.ru pages", () => {
    expect(isCleanPlaybackUrl("https://ok.ru/videoembed/3918679312977")).toBe(true);
    expect(classifyPlaybackRoute("https://ok.ru/videoembed/3918679312977")).toBe("iframe_fallback");
    expect(isCleanPlaybackUrl("https://ok.ru/video/3918679312977")).toBe(false);
  });

  it("classifies playback routes for lightweight VPS playback", () => {
    expect(classifyPlaybackRoute("https://cdn.example/master.m3u8")).toBe("manifest_only");
    expect(classifyPlaybackRoute("https://cdn.example/movie.mp4")).toBe("direct_clean");
    expect(classifyPlaybackRoute("https://voe.sx/e/abc")).toBe("iframe_fallback");
    expect(classifyPlaybackRoute("https://filemoon.sx/e/abc")).toBe("rejected");
  });
});
