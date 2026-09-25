import { describe, expect, it } from "vitest";
import {
  classifyPlaybackUrl,
  isPrivateIp,
  isAllowedExternalHost,
  isResolvableHost,
  parseHttpUrl,
} from "../src/lib/urlPolicy";

describe("urlPolicy", () => {
  it("classifies playback urls", () => {
    expect(classifyPlaybackUrl("<iframe></iframe>")).toBe("html");
    expect(classifyPlaybackUrl("https://cdn.example/video.m3u8")).toBe("direct");
    expect(classifyPlaybackUrl("https://filemoon.sx/e/abc")).toBe("iframe");
  });

  it("blocks private network IP literals", () => {
    expect(() => parseHttpUrl("http://127.0.0.1:3000")).toThrow();
    expect(() => parseHttpUrl("http://192.168.1.10")).toThrow();
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("recognizes supported resolver hosts", () => {
    expect(isAllowedExternalHost("pelisjuanita.com")).toBe(true);
    expect(isAllowedExternalHost("pfabiwmfmeza.dramiyos-cdn.com")).toBe(true);
    expect(isAllowedExternalHost("o5czhgnohwluyzcb.acek-cdn.com")).toBe(true);
    expect(isAllowedExternalHost("strm2.uqload.vc")).toBe(true);
    expect(isAllowedExternalHost("www.mp4upload.com")).toBe(true);
    expect(isResolvableHost("https://filemoon.sx/e/abc")).toBe(true);
    expect(isResolvableHost("https://untrusted.example/e/abc")).toBe(true);
    expect(isResolvableHost("ftp://filemoon.sx/e/abc")).toBe(false);
  });
});
