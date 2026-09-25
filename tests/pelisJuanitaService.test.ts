import { describe, expect, it } from "vitest";
import {
  extractPelisJuanitaCandidates,
  extractPelisJuanitaStreamRows,
  isPelisJuanitaUrl,
} from "../src/services/pelisJuanitaService";

describe("pelisJuanitaService", () => {
  it("recognizes the current and legacy domains", () => {
    expect(isPelisJuanitaUrl("https://pelisjuanita.com/movies/")).toBe(true);
    expect(isPelisJuanitaUrl("https://full-online.xyz/movies/")).toBe(true);
    expect(isPelisJuanitaUrl("https://example.com/movies/")).toBe(false);
  });

  it("extracts movie and series candidates independently", () => {
    const html = `
      <a href="/series/ver-serie/silo">Silo 2023 serie</a>
      <a href="/movies/pelicula/asilo-del-miedo">Asilo del Miedo 2018</a>
    `;

    expect(extractPelisJuanitaCandidates(html, "tv")).toEqual([{ slug: "silo", label: "Silo 2023 serie" }]);
    expect(extractPelisJuanitaCandidates(html, "movie")).toEqual([{ slug: "asilo-del-miedo", label: "Asilo del Miedo 2018" }]);
  });

  it("keeps clean player options, normalizes language and prioritizes Voe", () => {
    const html = `
      <div class="row-download" data-tipo="stream" data-idioma="subtitulada" data-url="https://streamwish.to/e/sub123"></div>
      <div class="row-download" data-tipo="stream" data-idioma="latino" data-url="https://voe.sx/e/latin123"></div>
      <div class="row-download" data-tipo="stream" data-idioma="latino" data-url="https://doodstream.com/e/noisy"></div>
    `;

    expect(extractPelisJuanitaStreamRows(html)).toEqual([
      { url: "https://voe.sx/e/latin123", language: "LATINO", quality: "HD" },
      { url: "https://streamwish.to/e/sub123", language: "JAPANESE", quality: "HD" },
    ]);
  });
});
