import { describe, expect, it } from "vitest";
import { readTMDBApiKey } from "@/services/tmdbService";
import { normalizeRelayLanguage } from "@/services/languageNormalizer";

describe("readTMDBApiKey", () => {
  it("treats blank and quoted blank values as missing", () => {
    expect(readTMDBApiKey(undefined)).toBeNull();
    expect(readTMDBApiKey("")).toBeNull();
    expect(readTMDBApiKey('\"\"')).toBeNull();
    expect(readTMDBApiKey("''")).toBeNull();
  });

  it("removes matching quotes from a configured key", () => {
    expect(readTMDBApiKey('\"valid-key\"')).toBe("valid-key");
    expect(readTMDBApiKey(" valid-key ")).toBe("valid-key");
  });
});

describe("normalizeRelayLanguage", () => {
  it("uses the original language for subtitled sources", () => {
    expect(normalizeRelayLanguage("Subtitulado", "en")).toBe("ENGLISH");
    expect(normalizeRelayLanguage("Subtitulado", "ja")).toBe("JAPANESE");
  });

  it("keeps explicit Spanish audio labels", () => {
    expect(normalizeRelayLanguage("Latino", "en")).toBe("LATINO");
    expect(normalizeRelayLanguage("Castellano", "en")).toBe("CASTELLANO");
  });
});
