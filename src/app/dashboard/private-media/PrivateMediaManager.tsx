"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Check, Database, ExternalLink, FileKey2, FolderSearch, Link2, Loader2, Plus, RotateCcw } from "lucide-react";
import { confirmPrivateMediaFolder, importPrivateMediaSource, previewPrivateMediaFolder } from "@/app/dashboard/private-media/actions";
import type { PrivateMediaFolderImport, PrivateMediaFolderPreview, PrivateMediaProviderHealth, TMDBCandidate } from "@/app/dashboard/private-media/actions";
import { parsePrivateMediaKey } from "@/lib/privateMediaKeyParser";

type PrivateMediaItem = {
  id: string;
  tmdbId: string;
  mediaType: "movie" | "tv";
  season: number | null;
  episode: number | null;
  language: string;
  quality: string;
  provider: "GOOGLE_DRIVE" | "ONEDRIVE";
  providerFileId: string;
  sourceUrl?: string;
  status: "available" | "pending" | "failed" | "disabled";
  lastError?: string;
  updatedAt: string;
};

type Props = {
  initialItems: PrivateMediaItem[];
  initialFolders: PrivateMediaFolderImport[];
  initialHealth?: {
    GOOGLE_DRIVE?: PrivateMediaProviderHealth;
    ONEDRIVE?: PrivateMediaProviderHealth;
  } | null;
  initialError?: string | null;
};

function statusClass(status: PrivateMediaItem["status"]) {
  if (status === "available") return "border-emerald-500/20 bg-emerald-950/30 text-emerald-300";
  if (status === "pending") return "border-amber-500/20 bg-amber-950/30 text-amber-300";
  if (status === "disabled") return "border-zinc-700 bg-zinc-900 text-zinc-400";
  return "border-rose-500/20 bg-rose-950/30 text-rose-300";
}

function playerPath(item: PrivateMediaItem) {
  if (item.mediaType === "movie") return `/play/embed/movie/${item.tmdbId}`;
  return `/play/embed/tv/${item.tmdbId}/${item.season || 1}/${item.episode || 1}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PrivateMediaManager({ initialItems, initialFolders, initialHealth, initialError }: Props) {
  const [items, setItems] = useState(initialItems);
  const [folders, setFolders] = useState(initialFolders);
  const [sourceUrl, setSourceUrl] = useState("");
  const [folderUrl, setFolderUrl] = useState("");
  const [folderProvider, setFolderProvider] = useState<"GOOGLE_DRIVE" | "ONEDRIVE">("GOOGLE_DRIVE");
  const [folderType, setFolderType] = useState<"movie" | "tv">("tv");
  const [folderTmdbId, setFolderTmdbId] = useState("");
  const [folderPreview, setFolderPreview] = useState<PrivateMediaFolderPreview | null>(null);
  const [tmdbCandidates, setTmdbCandidates] = useState<TMDBCandidate[]>([]);
  const [keyword, setKeyword] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [type, setType] = useState<"movie" | "tv">("movie");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [language, setLanguage] = useState("latino");
  const [quality, setQuality] = useState("auto");
  const [provider, setProvider] = useState<"GOOGLE_DRIVE" | "ONEDRIVE">("GOOGLE_DRIVE");
  const [message, setMessage] = useState(initialError || "");
  const [playerUrl, setPlayerUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isFolderPending, startFolderTransition] = useTransition();

  const availableCount = useMemo(() => items.filter((item) => item.status === "available").length, [items]);
  const previewFiles = folderPreview?.files.filter((file) => file.inferredType === folderType) || [];

  const applyKeyword = () => {
    const parsed = parsePrivateMediaKey(keyword);
    if (!parsed) {
      setMessage("No pude leer esa clave. Usa un formato como tmdb_11235_s01e01_latino_720p.");
      return;
    }

    setTmdbId(parsed.tmdbId);
    setType(parsed.type);
    if (parsed.type === "tv") {
      setSeason(String(parsed.season || 1));
      setEpisode(String(parsed.episode || 1));
    }
    if (parsed.language) setLanguage(parsed.language);
    if (parsed.quality) setQuality(parsed.quality);
    setMessage("Clave aplicada al formulario.");
  };

  const submit = () => {
    setMessage("");
    setPlayerUrl("");
    startTransition(async () => {
      const result = await importPrivateMediaSource({
        sourceUrl,
        keyword,
        tmdbId,
        type,
        season: type === "tv" ? Number(season) : null,
        episode: type === "tv" ? Number(episode) : null,
        language,
        quality,
        provider,
      });

      if (!result.success) {
        setMessage(result.error || "No se pudo importar la fuente.");
        return;
      }

      if (result.item) {
        setItems((current) => [result.item!, ...current.filter((item) => item.id !== result.item!.id)]);
      }
      setMessage(result.message || "Fuente propia importada.");
      setPlayerUrl(result.playerUrl || "");
    });
  };

  const previewFolder = () => {
    setMessage("");
    setFolderPreview(null);
    setTmdbCandidates([]);
    startFolderTransition(async () => {
      const result = await previewPrivateMediaFolder({
        sourceUrl: folderUrl,
        provider: folderProvider,
        type: folderType,
      });

      if (!result.success || !result.preview) {
        setMessage(result.error || "No se pudo leer la carpeta.");
        return;
      }

      setFolderPreview(result.preview);
      setTmdbCandidates(result.candidates || []);
      setFolderTmdbId(result.candidates?.[0]?.tmdbId || "");
      setMessage(`Preview listo: ${result.preview.files.length} video(s) detectados.`);
    });
  };

  const confirmFolder = () => {
    if (!folderPreview) return;
    setMessage("");
    startFolderTransition(async () => {
      const result = await confirmPrivateMediaFolder({
        preview: folderPreview,
        tmdbId: folderTmdbId,
        type: folderType,
        title: tmdbCandidates.find((candidate) => candidate.tmdbId === folderTmdbId)?.title || folderPreview.titleCandidate,
      });

      if (!result.success) {
        setMessage(result.error || "No se pudo confirmar la carpeta.");
        return;
      }

      if (result.folder) {
        setFolders((current) => [result.folder!, ...current.filter((folder) => folder.id !== result.folder!.id)]);
      }
      if (result.items?.length) {
        setItems((current) => [
          ...result.items!,
          ...current.filter((item) => !result.items!.some((next) => next.id === item.id)),
        ]);
      }
      setMessage(result.message || "Carpeta indexada.");
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Importar carpeta propia</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Pega una carpeta de Google Drive para detectar temporadas, episodios y dejar esos archivos listos para el scraper.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300 bg-cyan-950/30 border border-cyan-500/20 rounded-full px-2.5 py-1">
            <FolderSearch className="h-3.5 w-3.5" />
            {folders.length} carpetas
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_170px_160px_auto] gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Link de carpeta Google Drive</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
              <input
                value={folderUrl}
                onChange={(event) => setFolderUrl(event.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Provider</label>
            <select
              value={folderProvider}
              onChange={(event) => setFolderProvider(event.target.value as "GOOGLE_DRIVE" | "ONEDRIVE")}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="GOOGLE_DRIVE">Google Drive</option>
              <option value="ONEDRIVE">OneDrive</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Tipo principal</label>
            <select
              value={folderType}
              onChange={(event) => setFolderType(event.target.value as "movie" | "tv")}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="tv">Serie / Anime</option>
              <option value="movie">Peliculas</option>
            </select>
          </div>
          <button
            type="button"
            onClick={previewFolder}
            disabled={isFolderPending}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
          >
            {isFolderPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
            Preview
          </button>
        </div>

        {folderPreview && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 bg-zinc-950/50 grid grid-cols-1 lg:grid-cols-[1fr_260px_auto] gap-3 items-end">
              <div>
                <p className="text-xs text-zinc-500">Titulo detectado</p>
                <h4 className="text-base font-semibold text-zinc-100">{folderPreview.titleCandidate}</h4>
                <p className="text-xs text-zinc-500 mt-1">
                  {folderPreview.seasons.length ? `${folderPreview.seasons.length} temporada(s)` : "Sin temporadas detectadas"} · {previewFiles.length} archivo(s) para confirmar
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Confirmar TMDB ID</label>
                <input
                  value={folderTmdbId}
                  onChange={(event) => setFolderTmdbId(event.target.value)}
                  list="private-media-tmdb-candidates"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
                <datalist id="private-media-tmdb-candidates">
                  {tmdbCandidates.map((candidate) => (
                    <option key={candidate.tmdbId} value={candidate.tmdbId}>
                      {candidate.title}{candidate.year ? ` (${candidate.year})` : ""}
                    </option>
                  ))}
                </datalist>
              </div>
              <button
                type="button"
                onClick={confirmFolder}
                disabled={isFolderPending || !folderTmdbId || previewFiles.length === 0}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {isFolderPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-950/80 text-zinc-500 sticky top-0">
                  <tr>
                    <th className="text-left font-semibold px-4 py-2">Archivo</th>
                    <th className="text-left font-semibold px-4 py-2">Temporada</th>
                    <th className="text-left font-semibold px-4 py-2">Episodio</th>
                    <th className="text-left font-semibold px-4 py-2">Idioma</th>
                    <th className="text-left font-semibold px-4 py-2">Calidad</th>
                  </tr>
                </thead>
                <tbody>
                  {previewFiles.slice(0, 80).map((file) => (
                    <tr key={file.providerFileId} className="border-t border-zinc-800/80">
                      <td className="px-4 py-2 text-zinc-300">{file.name}</td>
                      <td className="px-4 py-2 text-zinc-500">{file.season || "-"}</td>
                      <td className="px-4 py-2 text-zinc-500">{file.episode || "-"}</td>
                      <td className="px-4 py-2 text-zinc-500 uppercase">{file.language}</td>
                      <td className="px-4 py-2 text-zinc-500 uppercase">{file.quality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewFiles.length > 80 && <p className="p-3 text-[11px] text-zinc-500">Mostrando 80 de {previewFiles.length} archivos detectados.</p>}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Importar video propio</h3>
              <p className="text-xs text-zinc-500 mt-1">Google Drive y OneDrive pueden convivir para el mismo contenido.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-950/30 border border-emerald-500/20 rounded-full px-2.5 py-1">
              <Database className="h-3.5 w-3.5" />
              {availableCount} disponibles
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Link de Drive / OneDrive</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Nombre clave</label>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <div className="relative">
                  <FileKey2 className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="tmdb_11235_s01e01_latino_720p"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyKeyword}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg"
                >
                  <RotateCcw className="h-4 w-4" />
                  Aplicar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs text-zinc-400 font-medium">TMDB ID</label>
                <input
                  value={tmdbId}
                  onChange={(event) => setTmdbId(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Tipo</label>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as "movie" | "tv")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="movie">Movie</option>
                  <option value="tv">TV</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Temporada</label>
                <input
                  type="number"
                  min={1}
                  value={season}
                  disabled={type === "movie"}
                  onChange={(event) => setSeason(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 disabled:opacity-50 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Episodio</label>
                <input
                  type="number"
                  min={1}
                  value={episode}
                  disabled={type === "movie"}
                  onChange={(event) => setEpisode(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 disabled:opacity-50 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Calidad</label>
                <select
                  value={quality}
                  onChange={(event) => setQuality(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="auto">Auto</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                  <option value="360p">360p</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[180px_180px_1fr_auto] gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Provider</label>
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as "GOOGLE_DRIVE" | "ONEDRIVE")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="GOOGLE_DRIVE">Google Drive</option>
                  <option value="ONEDRIVE">OneDrive</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">Idioma</label>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="latino">Latino</option>
                  <option value="castellano">Castellano</option>
                  <option value="japanese">Japonés</option>
                  <option value="english">Inglés</option>
                </select>
              </div>
              <div className="text-xs text-zinc-500 pb-2">
                La fuente se guarda como ID base. La URL temporal se resuelve al abrir el reproductor.
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Importar
              </button>
            </div>
          </div>

          {message && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <Check className="h-4 w-4" />
                {message}
              </span>
              {playerUrl && (
                <Link href={playerUrl} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
                  Abrir player
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100">Formato rápido</h3>
          <div className="space-y-2 text-xs text-zinc-400">
            <code className="block bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-300">tmdb_62560_s01e10_latino_1080p</code>
            <code className="block bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-300">tmdb_378064_movie_latino_720p</code>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["GOOGLE_DRIVE", "ONEDRIVE"] as const).map((key) => {
          const health = initialHealth?.[key];
          const ok = health?.status === "ok";
          return (
            <div key={key} className={`border rounded-xl p-4 ${ok ? "bg-emerald-950/10 border-emerald-500/20" : "bg-amber-950/10 border-amber-500/20"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {ok ? <Activity className="h-5 w-5 text-emerald-300 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-amber-300 mt-0.5" />}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">{key.replace("_", " ")}</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      {health ? `${health.items} fuentes. Latencia: ${health.latencyMs ?? "--"} ms.` : "Sin reporte de health."}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${ok ? "border-emerald-500/20 text-emerald-300" : "border-amber-500/20 text-amber-300"}`}>
                  {health?.status || "unknown"}
                </span>
              </div>
              {health?.lastErrors?.length ? (
                <div className="mt-3 space-y-1">
                  {health.lastErrors.slice(0, 2).map((error, index) => (
                    <p key={`${key}-${error.tmdbId}-${index}`} className="text-[11px] text-zinc-500 truncate">
                      {error.tmdbId}{error.type === "tv" ? ` T${error.season} E${error.episode}` : ""}: {error.error}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-zinc-600">Sin errores recientes.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">Fuentes propias indexadas</h3>
          <span className="text-xs text-zinc-500">{items.length} registros</span>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-xs text-zinc-500">No hay fuentes propias cargadas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-950/60 text-zinc-500">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Contenido</th>
                  <th className="text-left font-semibold px-4 py-2">Fuente</th>
                  <th className="text-left font-semibold px-4 py-2">Idioma</th>
                  <th className="text-left font-semibold px-4 py-2">Calidad</th>
                  <th className="text-left font-semibold px-4 py-2">Estado</th>
                  <th className="text-left font-semibold px-4 py-2">Actualizado</th>
                  <th className="text-right font-semibold px-4 py-2">Player</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-800/80">
                    <td className="px-4 py-3 text-zinc-200">
                      {item.tmdbId}
                      {item.mediaType === "tv" ? ` T${item.season || 1} E${item.episode || 1}` : " Movie"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{item.provider.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-zinc-400 uppercase">{item.language}</td>
                    <td className="px-4 py-3 text-zinc-400 uppercase">{item.quality}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatDate(item.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={playerPath(item)} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
                        Abrir
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
