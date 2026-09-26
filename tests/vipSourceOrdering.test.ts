import { describe, expect, it } from "vitest";
import {
  comparePlaybackRank,
  orderPlaybackOptions,
  isPrivateMediaVariant,
} from "../src/lib/playbackUrlPolicy";

describe("Strict Rule: Fuentes Propias ('Servidor VIP') is ALWAYS the last option", () => {
  it("identifies private media variants correctly", () => {
    expect(
      isPrivateMediaVariant({
        videoUrl: "private-media://resolve?tmdbId=550&type=movie",
        quality: "1080p",
        language: "LATINO",
      })
    ).toBe(true);

    expect(
      isPrivateMediaVariant({
        videoUrl: "https://example.com/video.mp4",
        candidateUrl: "PRIVATE_MEDIA",
        quality: "1080p",
        language: "LATINO",
      })
    ).toBe(true);

    expect(
      isPrivateMediaVariant({
        videoUrl: "https://example.com/video.mp4",
        candidateUrl: "https://example.com/item",
        quality: "1080p",
        language: "LATINO",
        sourceSite: { priority: 1, name: "Servidor VIP (Fuente Propia)" } as any,
      })
    ).toBe(true);

    expect(
      isPrivateMediaVariant({
        videoUrl: "https://example.com/video.mp4",
        candidateUrl: "https://example.com/item",
        quality: "1080p",
        language: "LATINO",
        sourceSite: { priority: 12, name: "Cuevana3" } as any,
      })
    ).toBe(false);
  });

  it("comparePlaybackRank places private/VIP sources at the end of scraped lists", () => {
    const scrapedVariant = {
      videoUrl: "https://cuevana3.example/video.mp4",
      candidateUrl: "https://cuevana3.example",
      quality: "1080p",
      language: "LATINO",
    };

    const vipVariant = {
      videoUrl: "private-media://resolve?tmdbId=550&type=movie",
      candidateUrl: "PRIVATE_MEDIA",
      quality: "1080p",
      language: "LATINO",
    };

    // scraped vs VIP should be negative (scraped comes first)
    expect(comparePlaybackRank(scrapedVariant, vipVariant)).toBeLessThan(0);
    // VIP vs scraped should be positive (VIP goes after scraped)
    expect(comparePlaybackRank(vipVariant, scrapedVariant)).toBeGreaterThan(0);

    const list = [vipVariant, scrapedVariant];
    list.sort(comparePlaybackRank);
    expect(list[0]).toBe(scrapedVariant);
    expect(list[1]).toBe(vipVariant);
  });

  it("orderPlaybackOptions places private media at the end when external sources exist", () => {
    const s1 = {
      videoUrl: "https://site1.example/stream.m3u8",
      candidateUrl: "SITE_1",
      quality: "1080p",
      language: "LATINO",
    };
    const s2 = {
      videoUrl: "https://site2.example/stream.m3u8",
      candidateUrl: "SITE_2",
      quality: "720p",
      language: "LATINO",
    };
    const s3 = {
      videoUrl: "https://site3.example/stream.m3u8",
      candidateUrl: "SITE_3",
      quality: "HD",
      language: "LATINO",
    };
    const vip = {
      videoUrl: "private-media://resolve?tmdbId=550&type=movie",
      candidateUrl: "PRIVATE_MEDIA",
      quality: "1080p",
      language: "LATINO",
    };

    const ordered = orderPlaybackOptions([vip, s1, s2, s3]);
    expect(ordered[ordered.length - 1].candidateUrl).toBe("PRIVATE_MEDIA");
    expect(ordered[0].candidateUrl).toBe("SITE_1");
  });
});
