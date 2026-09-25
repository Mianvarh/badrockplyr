import { describe, expect, it } from "vitest";
import { parsePrivateMediaKey } from "../src/lib/privateMediaKeyParser";

describe("parsePrivateMediaKey", () => {
  it("parses tv episode keys", () => {
    expect(parsePrivateMediaKey("tmdb_62560_s01e10_latino_1080p")).toEqual({
      tmdbId: "62560",
      type: "tv",
      season: 1,
      episode: 10,
      language: "latino",
      quality: "1080p",
    });
  });

  it("parses movie keys", () => {
    expect(parsePrivateMediaKey("tmdb_378064_movie_latino_720p")).toEqual({
      tmdbId: "378064",
      type: "movie",
      season: null,
      episode: null,
      language: "latino",
      quality: "720p",
    });
  });

  it("returns null for invalid keys", () => {
    expect(parsePrivateMediaKey("11235_s01e01_latino")).toBeNull();
  });
});
