import { describe, it, expect } from "vitest";
import {
  decodePelisFlixServer,
  extractPelisFlixStreamRows,
  isPelisFlixUrl
} from "../src/services/pelisFlixService";

describe("PelisFlix Service", () => {
  describe("isPelisFlixUrl", () => {
    it("identifies PelisFlix URLs", () => {
      expect(isPelisFlixUrl("https://pelisflix.lat/pelicula/interstellar/")).toBe(true);
      expect(isPelisFlixUrl("https://www1.pelisflix.lat/serie/breaking-bad-zpya/")).toBe(true);
      expect(isPelisFlixUrl("https://cuevana3i.you/pelicula/interstellar")).toBe(false);
    });
  });

  describe("decodePelisFlixServer", () => {
    it("decodes direct base64 server URL", () => {
      const base64Voe = Buffer.from("https://voe.sx/e/tugzhf5qhz4d").toString("base64");
      expect(decodePelisFlixServer(base64Voe)).toBe("https://voe.sx/e/tugzhf5qhz4d");
    });

    it("unwraps nupload.my/iframe/?url= to extract direct host URL", () => {
      const wrapped = "https://nupload.my/iframe/?url=https%3A%2F%2Fvoe.sx%2Fe%2Ftugzhf5qhz4d";
      const base64Wrapped = Buffer.from(wrapped).toString("base64");
      expect(decodePelisFlixServer(base64Wrapped)).toBe("https://voe.sx/e/tugzhf5qhz4d");
    });

    it("handles plain URL if not base64", () => {
      expect(decodePelisFlixServer("https://nupload.my/watch/abc12345")).toBe("https://nupload.my/watch/abc12345");
    });

    it("returns null on empty or invalid inputs", () => {
      expect(decodePelisFlixServer("")).toBeNull();
      expect(decodePelisFlixServer("invalid_text_without_protocol")).toBeNull();
    });
  });

  describe("extractPelisFlixStreamRows", () => {
    it("extracts and prioritizes Voe streams over generic embeds", () => {
      const voePayload = Buffer.from("https://nupload.my/iframe/?url=https%3A%2F%2Fvoe.sx%2Fe%2Fvoe123").toString("base64");
      const nuploadLatino = Buffer.from("https://nupload.my/watch/nupload123").toString("base64");
      const nuploadCastellano = Buffer.from("https://nupload.my/watch/nupload456").toString("base64");

      const mockHtml = `
        <div class="player-options">
          <ul>
            <li data-server="${nuploadLatino}">Opción 1 · Latino Reproducir</li>
            <li data-server="${voePayload}">Opción 2 · Latino Reproducir</li>
            <li data-server="${nuploadCastellano}">Opción 1 · Español Castellano Reproducir</li>
          </ul>
        </div>
      `;

      const rows = extractPelisFlixStreamRows(mockHtml);
      expect(rows.length).toBe(3);
      // Voe should be prioritized first
      expect(rows[0].url).toBe("https://voe.sx/e/voe123");
      expect(rows[0].quality).toBe("1080p");
      expect(rows[0].language).toBe("LATINO");

      // Verify languages
      const languages = rows.map((r) => r.language);
      expect(languages).toContain("LATINO");
      expect(languages).toContain("CASTELLANO");
    });
  });
});
