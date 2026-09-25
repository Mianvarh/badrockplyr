"use client";

import React, { useState, useEffect } from "react";
import { saveMultipleGeneratedLinks } from "@/app/actions/generatorActions";
import {
  Link2,
  Copy,
  Check,
  Save,
  Loader2,
  Info,
  AlertCircle,
  Film,
  Tv,
  Sparkles
} from "lucide-react";

type MediaType = "movie" | "tv" | "anime";

const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export default function GeneratorPage() {
  // Form State
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [tmdbId, setTmdbId] = useState<string>("");
  const [season, setSeason] = useState<string>("1");
  const [episode, setEpisode] = useState<string>("1"); // Used for start episode
  const [generationMode, setGenerationMode] = useState<"single" | "range" | "count" | "season">("single");
  const [endEpisode, setEndEpisode] = useState<string>("12");
  const [episodeCount, setEpisodeCount] = useState<string>("10");

  // Output URLs State
  const [playerUrl, setPlayerUrl] = useState<string>("");
  const [collectorUrl, setCollectorUrl] = useState<string>("");

  // Copy Feedback State
  const [copiedPlayer, setCopiedPlayer] = useState(false);
  const [copiedCollector, setCopiedCollector] = useState(false);

  // Status/Loading State
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto-generate URLs on input change
  useEffect(() => {
    const cleanId = tmdbId.trim() || "{tmdbId}";
    const cleanSeason = mediaType === "movie" ? "" : season.trim() || "{season}";
    const cleanEpisode = mediaType === "movie" ? "" : episode.trim() || "{episode}";

    const baseUrl = appBaseUrl;

    if (mediaType === "movie") {
      setPlayerUrl(`${baseUrl}/play/embed/movie/${cleanId}`);
      setCollectorUrl(`${baseUrl}/f/embed/movie/${cleanId}`);
    } else {
      if (generationMode === "single") {
        setPlayerUrl(`${baseUrl}/play/embed/tv/${cleanId}/${cleanSeason}/${cleanEpisode}`);
        setCollectorUrl(`${baseUrl}/f/embed/tv/${cleanId}/${cleanSeason}/${cleanEpisode}`);
      } else if (generationMode === "range") {
        const start = episode.trim() || "1";
        const end = endEpisode.trim() || "12";
        setPlayerUrl(`${baseUrl}/play/embed/tv/${cleanId}/${cleanSeason}/[${start}...${end}]`);
        setCollectorUrl(`${baseUrl}/f/embed/tv/${cleanId}/${cleanSeason}/[${start}...${end}]`);
      } else if (generationMode === "count") {
        const start = episode.trim() || "1";
        const c = episodeCount.trim() || "10";
        const end = isNaN(Number(start)) || isNaN(Number(c)) ? "X" : String(Number(start) + Number(c) - 1);
        setPlayerUrl(`${baseUrl}/play/embed/tv/${cleanId}/${cleanSeason}/[${start}...${end}]`);
        setCollectorUrl(`${baseUrl}/f/embed/tv/${cleanId}/${cleanSeason}/[${start}...${end}]`);
      } else if (generationMode === "season") {
        setPlayerUrl(`${baseUrl}/play/embed/tv/${cleanId}/${cleanSeason}/[Toda la Temporada]`);
        setCollectorUrl(`${baseUrl}/f/embed/tv/${cleanId}/${cleanSeason}/[Toda la Temporada]`);
      }
    }
  }, [mediaType, tmdbId, season, episode, generationMode, endEpisode, episodeCount]);

  // Handle Copy to Clipboard
  const handleCopy = async (text: string, type: "player" | "collector") => {
    if (text.includes("{")) return; // Don't copy placeholder text
    try {
      await navigator.clipboard.writeText(text);
      if (type === "player") {
        setCopiedPlayer(true);
        setTimeout(() => setCopiedPlayer(false), 2000);
      } else {
        setCopiedCollector(true);
        setTimeout(() => setCopiedCollector(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // Handle Save Link to Database
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmdbId.trim() || isNaN(Number(tmdbId))) {
      setMessage({ type: "error", text: "Por favor ingresa un TMDB ID numérico válido." });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    const s = mediaType === "movie" ? 1 : Number(season);
    const mode = mediaType === "movie" ? "single" : generationMode;
    const startEp = mediaType === "movie" ? undefined : Number(episode);
    const endEp = mediaType === "movie" ? undefined : Number(endEpisode);
    const countVal = mediaType === "movie" ? undefined : Number(episodeCount);

    const res = await saveMultipleGeneratedLinks(tmdbId, mediaType, s, mode, startEp, endEp, countVal);

    setIsLoading(false);
    if (res.success) {
      setMessage({ type: "success", text: res.message || "Enlaces generados y guardados exitosamente." });
      // Reset form fields
      setTmdbId("");
      setSeason("1");
      setEpisode("1");
      setEndEpisode("12");
      setEpisodeCount("10");
    } else {
      setMessage({ type: "error", text: res.error || "Error al intentar generar los enlaces." });
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Generador de URL</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          Genera automáticamente URLs del reproductor y del recolector a partir de IDs de TMDB.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
        {/* Form panel */}
        <div className="md:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl space-y-6">
          <form onSubmit={handleSave} className="space-y-5">
            {/* Media Type */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                Tipo de Contenido
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["movie", "tv", "anime"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMediaType(type);
                      setMessage(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                      mediaType === type
                        ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_-3px_rgba(6,182,212,0.2)]"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {type === "movie" ? (
                      <Film className="h-4 w-4" />
                    ) : (
                      <Tv className="h-4 w-4" />
                    )}
                    {type === "movie" ? "Película" : type === "tv" ? "Serie" : "Anime"}
                  </button>
                ))}
              </div>
            </div>

            {/* TMDB ID */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                TMDB ID
              </label>
              <input
                type="text"
                value={tmdbId}
                onChange={(e) => {
                  setTmdbId(e.target.value);
                  setMessage(null);
                }}
                placeholder="Ej. 1226863"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-750 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 font-mono transition-colors"
                required
              />
            </div>

            {/* Season & Generation Mode (Conditional) */}
            {mediaType !== "movie" && (
              <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                      Temporada
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                      Modo Generación
                    </label>
                    <select
                      value={generationMode}
                      onChange={(e) => setGenerationMode(e.target.value as any)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 transition-colors"
                    >
                      <option value="single">Un solo capítulo</option>
                      <option value="range">Rango de capítulos</option>
                      <option value="count">Cantidad de capítulos</option>
                      <option value="season">Temporada completa</option>
                    </select>
                  </div>
                </div>

                {/* Conditional fields based on generation mode */}
                {generationMode === "single" && (
                  <div className="space-y-1.5 animate-in fade-in duration-150">
                    <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                      Número de Episodio
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={episode}
                      onChange={(e) => setEpisode(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                      required
                    />
                  </div>
                )}

                {generationMode === "range" && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                        Desde Episodio
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={episode}
                        onChange={(e) => setEpisode(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                        Hasta Episodio
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={endEpisode}
                        onChange={(e) => setEndEpisode(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                        required
                      />
                    </div>
                  </div>
                )}

                {generationMode === "count" && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                        Desde Episodio
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={episode}
                        onChange={(e) => setEpisode(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={episodeCount}
                        onChange={(e) => setEpisodeCount(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                        required
                      />
                    </div>
                  </div>
                )}

                {generationMode === "season" && (
                  <div className="p-3 bg-zinc-950/40 border border-zinc-850 rounded-lg text-zinc-500 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-cyan-500/70" />
                    <span>Se consultará TMDB para generar e importar automáticamente todos los episodios de esta temporada.</span>
                  </div>
                )}
              </div>
            )}

            {/* Save Button */}
            <button
              type="submit"
              disabled={isLoading || !tmdbId.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-zinc-50 disabled:text-zinc-500 disabled:border-transparent font-semibold rounded-lg shadow-lg border border-cyan-500/30 transition-all cursor-pointer disabled:cursor-not-allowed text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importando metadatos de TMDB...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Guardar URL en Biblioteca
                </>
              )}
            </button>
          </form>

          {/* Toast Messages */}
          {message && (
            <div className={`p-4 rounded-lg flex items-start gap-3 border animate-in fade-in duration-200 ${
              message.type === "success"
                ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400"
                : "bg-rose-950/20 border-rose-500/20 text-rose-400"
            }`}>
              {message.type === "success" ? (
                <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              )}
              <div className="text-xs leading-normal font-medium">{message.text}</div>
            </div>
          )}
        </div>

        {/* Live URL Output panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-5">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-cyan-400" />
              Vista Previa de URLs
            </h3>

            {/* Player URL box */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider block">
                Player Embed URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={playerUrl}
                  className="flex-1 bg-zinc-950 border border-zinc-805 rounded-lg px-2.5 py-2 text-xs font-mono text-cyan-400 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(playerUrl, "player")}
                  disabled={!tmdbId.trim()}
                  className="p-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copiar URL"
                >
                  {copiedPlayer ? <Check className="h-4.5 w-4.5 text-emerald-400" /> : <Copy className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {/* Collector URL box */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider block">
                Recolector URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={collectorUrl}
                  className="flex-1 bg-zinc-950 border border-zinc-805 rounded-lg px-2.5 py-2 text-xs font-mono text-emerald-400 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(collectorUrl, "collector")}
                  disabled={!tmdbId.trim()}
                  className="p-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copiar URL"
                >
                  {copiedCollector ? <Check className="h-4.5 w-4.5 text-emerald-400" /> : <Copy className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-3 p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
            <Info className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-zinc-400">
              <p className="font-semibold text-zinc-300">¿Cómo funciona?</p>
              <p className="mt-0.5">
                Al guardar, se realiza una petición automática a TMDB para importar el título real, poster, año de lanzamiento y descripción en tu biblioteca.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
