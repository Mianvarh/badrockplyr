import { describe, expect, it } from "vitest";

import { dedupeOkRuCandidates, extractOkRuVideoId, inferOkRuLanguage, prioritizeVerifiedCatalogCandidate, toOkRuEmbedUrl } from "../src/services/okRuService";

describe("OK.ru source adapter", () => {
  it("normalizes public and mobile video URLs to the popup-free embed URL", () => {
    expect(extractOkRuVideoId("https://ok.ru/video/3918679312977")).toBe("3918679312977");
    expect(toOkRuEmbedUrl("https://m.ok.ru/video/3918679312977")).toBe("https://ok.ru/videoembed/3918679312977");
  });

  it("infers the language labels used by common OK.ru uploads", () => {
    expect(inferOkRuLanguage("Rounders (1998) (C)", "en")).toBe("CASTELLANO");
    expect(inferOkRuLanguage("Pelicula completa latino", "en")).toBe("LATINO");
    expect(inferOkRuLanguage("Anime episodio 1", "ja")).toBe("JAPANESE");
  });

  it("does not expose the same embed twice when search and catalog overlap", () => {
    const candidate = {
      pageUrl: "https://m.ok.ru/video/1",
      embedUrl: "https://ok.ru/videoembed/1",
      title: "Movie (2000)",
      durationSeconds: 5400,
      language: "LATINO" as const,
      quality: "HD" as const,
    };
    expect(dedupeOkRuCandidates([candidate, candidate])).toEqual([candidate]);
  });

  it("reserves option two for a verified catalog source", () => {
    const candidates = [
      { id: "best" },
      { id: "second" },
      { id: "verified", verifiedCatalog: true },
    ];
    expect(prioritizeVerifiedCatalogCandidate(candidates).map((candidate) => candidate.id)).toEqual([
      "best",
      "verified",
      "second",
    ]);
  });
});
