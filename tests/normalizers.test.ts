import { describe, expect, it } from "vitest";
import { normalizeLanguage } from "../src/services/languageNormalizer";
import { normalizeQuality } from "../src/services/qualityNormalizer";

describe("normalizers", () => {
  it("normalizes supported languages", () => {
    expect(normalizeLanguage("es-419")).toBe("LATINO");
    expect(normalizeLanguage("english")).toBe("ENGLISH");
    expect(normalizeLanguage("castellano")).toBe("CASTELLANO");
    expect(normalizeLanguage("subtitulado")).toBe("JAPANESE");
  });

  it("normalizes supported qualities", () => {
    expect(normalizeQuality("4K")).toBe("2160p");
    expect(normalizeQuality("1080p")).toBe("1080p");
    expect(normalizeQuality("HD")).toBe("HD");
    expect(normalizeQuality("camrip")).toBe("CAM");
  });
});
