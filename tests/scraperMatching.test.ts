import { describe, expect, it } from "vitest";
import { computeMatchScore } from "../src/lib/scraperMatching";

describe("scraper title matching", () => {
  it("accepts movie matches when Episode is part of an alternate movie title", () => {
    const score = computeMatchScore(
      "blue-lock-episode-nagi",
      "blue-lock-episode-nagi",
      [
        "Blue Lock: Episodio Nagi",
        "BLUE LOCK THE MOVIE -EPISODE NAGI-",
        "Blue Lock: Episode Nagi",
      ],
      true
    );

    expect(score).toBeGreaterThanOrEqual(0.4);
  });

  it("rejects generic series pages for a specific movie title", () => {
    const score = computeMatchScore(
      "blue-lock",
      "blue-lock",
      ["Blue Lock: Episodio Nagi", "Blue Lock: Episode Nagi"],
      true
    );

    expect(score).toBeLessThan(0.4);
  });

  it("rejects partial title collisions that only share one generic word", () => {
    const score = computeMatchScore(
      "venganza-silenciosa",
      "venganza-silenciosa",
      ["Una Voz Silenciosa", "A Silent Voice", "Koe no Katachi"],
      true
    );

    expect(score).toBe(0);
  });
});
