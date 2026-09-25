"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGeneratedLink,
  triggerSearchSimulation,
  deleteShowLinks,
  addMultipleManualVideoVariants
} from "@/app/actions/generatorActions";
import {
  Copy,
  Check,
  Search,
  Trash2,
  AlertCircle,
  Link2,
  Film,
  ExternalLink,
  Sparkles,
  Loader2,
  Play,
  ChevronRight,
  ChevronDown,
  Tv,
  Folder,
  FolderOpen,
  Info,
  XCircle,
  Plus
} from "lucide-react";

interface FormattedLink {
  id: string;
  mediaItemId: string;
  title: string;
  posterPath: string | null;
  type: string;
  tmdbId: string;
  season: number | null;
  episode: number | null;
  releaseYear: number | null;
  playerUrl: string;
  collectorUrl: string;
  language: string;
  quality: string;
  status: "Pendiente" | "Buscando" | "Encontrado" | "No encontrado";
  createdAt: string;
  variants?: {
    id: string;
    videoUrl: string;
    language: string;
    quality: string;
    siteName: string;
  }[];
}

interface TableProps {
  initialLinks: FormattedLink[];
}

interface GroupedSeries {
  id: string; // tmdbId-type
  tmdbId: string;
  title: string;
  posterPath: string | null;
  type: string;
  releaseYear: number | null;
  createdAt: string;
  seasons: {
    seasonNumber: number;
    episodes: FormattedLink[];
  }[];
}

export default function GeneratedLinksTable({ initialLinks }: TableProps) {
  const [links, setLinks] = useState<FormattedLink[]>(initialLinks);
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<{ id: string; type: "player" | "collector" } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // State for manual links modal
  const [manualModalLink, setManualModalLink] = useState<FormattedLink | null>(null);
  const [manualUrls, setManualUrls] = useState("");
  const [manualLang, setManualLang] = useState("LATINO");
  const [manualQual, setManualQual] = useState("HD");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualReplaceId, setManualReplaceId] = useState("new");

  // Expanded states
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [expandedSeasons, setExpandedSeasons] = useState<Record<string, boolean>>({});

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "movie" | "tv_anime">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");

  // Batch Scraping state
  const [batchScraping, setBatchScraping] = useState<{
    seriesKey: string;
    currentLinkId: string | null;
    progress: string;
    total: number;
    current: number;
  } | null>(null);
  const cancelBatchRef = useRef<boolean>(false);

  // Auto-clear toast after 4s
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Copy to clipboard helper
  const handleCopy = async (text: string, linkId: string, type: "player" | "collector") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId({ id: linkId, type });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  // Run source scraper search simulation for a single link
  const handleSearch = async (linkId: string) => {
    setLoadingId(linkId);
    setToast(null);

    const res = await triggerSearchSimulation(linkId);

    setLoadingId(null);
    if (res.success) {
      setToast({ type: "success", text: res.message || "Búsqueda finalizada." });
      setLinks((prev) =>
        prev.map((l) =>
          l.id === linkId
            ? {
                ...l,
                status: "Encontrado",
                language: "LATINO",
                quality: "HD"
              }
            : l
        )
      );
    } else {
      setToast({ type: "error", text: res.error || "Error al iniciar la búsqueda." });
    }
  };

  const handleSaveManualLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualModalLink) return;

    const urls = manualUrls
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      alert("Por favor ingresa al menos un enlace de video válido.");
      return;
    }

    setManualLoading(true);
    const res = await addMultipleManualVideoVariants(
      manualModalLink.mediaItemId,
      urls,
      manualLang,
      manualQual,
      manualReplaceId
    );
    setManualLoading(false);

    if (res.success) {
      setToast({
        type: "success",
        text: `Se agregaron ${res.count || urls.length} enlaces manuales correctamente.`
      });
      setLinks((prev) =>
        prev.map((l) =>
          l.id === manualModalLink.id
            ? {
                ...l,
                status: "Encontrado",
                language: manualLang,
                quality: manualQual
              }
            : l
        )
      );
      setManualModalLink(null);
      setManualUrls("");
      router.refresh();
    } else {
      alert(res.error || "Ocurrió un error al guardar los enlaces.");
    }
  };

  // Delete generated link
  const handleDelete = async (linkId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este capítulo de la biblioteca?")) return;

    const res = await deleteGeneratedLink(linkId);
    if (res.success) {
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      setToast({ type: "success", text: "Enlace eliminado correctamente." });
    } else {
      setToast({ type: "error", text: res.error || "Error al intentar eliminar el enlace." });
    }
  };

  // Delete entire TV show or anime
  const handleDeleteShow = async (tmdbId: string, type: string, title: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la serie completa "${title}"? Se borrarán todos sus capítulos de la biblioteca.`)) {
      return;
    }

    setLoadingId(`show-${tmdbId}`);
    const res = await deleteShowLinks(tmdbId, type);
    setLoadingId(null);

    if (res.success) {
      setLinks((prev) => prev.filter((l) => !(l.tmdbId === tmdbId && l.type === type)));
      setToast({ type: "success", text: `Serie "${title}" eliminada de la biblioteca.` });
    } else {
      setToast({ type: "error", text: res.error || "Error al eliminar la serie." });
    }
  };

  // Sequential batch search for all pending episodes in a series
  const handleBatchSearch = async (seriesKey: string, episodes: FormattedLink[]) => {
    if (batchScraping) {
      alert("Ya hay una búsqueda en lote en ejecución.");
      return;
    }

    const pending = episodes.filter((ep) => ep.status !== "Encontrado");
    if (pending.length === 0) {
      setToast({ type: "success", text: "Todos los capítulos de esta serie ya han sido encontrados." });
      return;
    }

    if (!confirm(`¿Deseas buscar fuentes para los ${pending.length} capítulos pendientes en lote? Se procesarán de forma secuencial.`)) {
      return;
    }

    cancelBatchRef.current = false;
    setBatchScraping({
      seriesKey,
      currentLinkId: null,
      progress: `Iniciando búsqueda para ${pending.length} capítulos...`,
      total: pending.length,
      current: 0
    });

    let index = 0;
    for (const ep of pending) {
      if (cancelBatchRef.current) {
        setToast({ type: "error", text: "Búsqueda en lote cancelada por el usuario." });
        break;
      }

      setBatchScraping((prev) =>
        prev
          ? {
              ...prev,
              currentLinkId: ep.id,
              current: index + 1,
              progress: `Scrapeando T${ep.season} E${ep.episode}: "${ep.title}"`
            }
          : null
      );

      // Set status to Buscando locally
      setLinks((prev) =>
        prev.map((l) => (l.id === ep.id ? { ...l, status: "Buscando" } : l))
      );

      try {
        const res = await triggerSearchSimulation(ep.id);
        if (res.success) {
          setLinks((prev) =>
            prev.map((l) =>
              l.id === ep.id
                ? {
                    ...l,
                    status: "Encontrado",
                    language: "LATINO",
                    quality: "HD"
                  }
                : l
            )
          );
        } else {
          setLinks((prev) =>
            prev.map((l) => (l.id === ep.id ? { ...l, status: "No encontrado" } : l))
          );
        }
      } catch (err) {
        console.error(`Error scraping ${ep.id}:`, err);
        setLinks((prev) =>
          prev.map((l) => (l.id === ep.id ? { ...l, status: "No encontrado" } : l))
        );
      }

      index++;
    }

    setBatchScraping(null);
    setToast({
      type: cancelBatchRef.current ? "error" : "success",
      text: cancelBatchRef.current
        ? `Búsqueda en lote cancelada. Se procesaron ${index} capítulos.`
        : `Búsqueda en lote finalizada. Se procesaron ${index} capítulos.`
    });
    router.refresh();
  };

  // Toggle series expansion and default expand its seasons
  const toggleSeries = (key: string, seasons: number[]) => {
    const willExpand = !expandedSeries[key];
    setExpandedSeries((prev) => ({ ...prev, [key]: willExpand }));

    if (willExpand) {
      setExpandedSeasons((prev) => {
        const next = { ...prev };
        seasons.forEach((sNum) => {
          const sKey = `${key}-${sNum}`;
          if (next[sKey] === undefined) {
            next[sKey] = true;
          }
        });
        return next;
      });
    }
  };

  const toggleSeason = (seasonKey: string) => {
    setExpandedSeasons((prev) => ({ ...prev, [seasonKey]: !prev[seasonKey] }));
  };

  // Filter links based on criteria
  const filteredLinks = useMemo(() => {
    return links.filter((link) => {
      // 1. Search Query (Title or TMDB ID)
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        link.title.toLowerCase().includes(query) ||
        link.tmdbId.includes(query);
      if (!matchesSearch) return false;

      // 2. Type Filter
      if (filterType === "movie" && link.type !== "movie") return false;
      if (filterType === "tv_anime" && link.type === "movie") return false;

      // 3. Flat status filter (applied individually first)
      if (filterStatus === "completed" && link.status !== "Encontrado") return false;
      if (filterStatus === "pending" && link.status === "Encontrado") return false;

      return true;
    });
  }, [links, searchQuery, filterType, filterStatus]);

  // Group filtered links
  const { movies, series } = useMemo(() => {
    const moviesList: FormattedLink[] = [];
    const seriesGroupsMap: Record<string, GroupedSeries> = {};

    filteredLinks.forEach((link) => {
      if (link.type === "movie") {
        moviesList.push(link);
      } else {
        const key = `${link.tmdbId}-${link.type}`;
        if (!seriesGroupsMap[key]) {
          seriesGroupsMap[key] = {
            id: key,
            tmdbId: link.tmdbId,
            title: link.title,
            posterPath: link.posterPath,
            type: link.type,
            releaseYear: link.releaseYear,
            createdAt: link.createdAt,
            seasons: []
          };
        }

        // Track latest link createdAt for sorting
        if (link.createdAt > seriesGroupsMap[key].createdAt) {
          seriesGroupsMap[key].createdAt = link.createdAt;
        }

        const seasonNum = link.season || 1;
        let season = seriesGroupsMap[key].seasons.find((s) => s.seasonNumber === seasonNum);
        if (!season) {
          season = { seasonNumber: seasonNum, episodes: [] };
          seriesGroupsMap[key].seasons.push(season);
        }
        season.episodes.push(link);
      }
    });

    // Sort episodes inside seasons, seasons inside groups, and groups by latest link date
    const sortedSeries = Object.values(seriesGroupsMap)
      .map((g) => {
        g.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
        g.seasons.forEach((s) => {
          s.episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
        });
        return g;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Sort movies by date descending
    moviesList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { movies: moviesList, series: sortedSeries };
  }, [filteredLinks]);

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 border animate-in fade-in duration-200 ${
            toast.type === "success"
              ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400"
              : "bg-rose-950/20 border-rose-500/20 text-rose-400"
          }`}
        >
          {toast.type === "success" ? (
            <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="text-xs leading-normal font-medium">{toast.text}</div>
        </div>
      )}

      {/* Batch Scraping Sticky/Floating Banner */}
      {batchScraping && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-zinc-950/90 backdrop-blur border border-cyan-500/30 p-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                Buscando Fuentes en Lote
              </span>
            </div>
            <button
              onClick={() => {
                cancelBatchRef.current = true;
              }}
              className="text-zinc-500 hover:text-rose-400 transition-colors p-0.5 rounded-full hover:bg-zinc-900"
              title="Cancelar búsqueda en lote"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
          <p className="text-[11px] text-zinc-300 truncate font-mono">
            {batchScraping.progress}
          </p>
          <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-400 mb-1">
            <span>Progreso general</span>
            <span className="font-mono">
              {batchScraping.current} / {batchScraping.total} ({Math.round((batchScraping.current / batchScraping.total) * 100)}%)
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
              style={{ width: `${(batchScraping.current / batchScraping.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Search and Filters Header bar */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título o TMDB ID..."
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Content Type Filter */}
          <div className="flex items-center gap-1.5 w-1/2 sm:w-auto">
            <span className="text-[10px] text-zinc-550 font-semibold uppercase tracking-wider hidden md:inline">
              Tipo:
            </span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full sm:w-auto bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-500/60 transition-colors font-semibold cursor-pointer"
            >
              <option value="all">Todos los Tipos</option>
              <option value="movie">Películas</option>
              <option value="tv_anime">Series y Animes</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 w-1/2 sm:w-auto">
            <span className="text-[10px] text-zinc-550 font-semibold uppercase tracking-wider hidden md:inline">
              Estado:
            </span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full sm:w-auto bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-500/60 transition-colors font-semibold cursor-pointer"
            >
              <option value="all">Todos los Estados</option>
              <option value="completed">Scrapeo Completo</option>
              <option value="pending">Con Pendientes</option>
            </select>
          </div>
        </div>
      </div>

      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
          <AlertCircle className="h-9 w-9 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400 font-medium">No se encontraron URLs generadas</p>
          <p className="text-xs text-zinc-500 mt-1">
            Ve al Generador de URL para crear y registrar tu primer enlace.
          </p>
        </div>
      ) : movies.length === 0 && series.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10 text-center">
          <AlertCircle className="h-8 w-8 text-zinc-700 mb-2" />
          <p className="text-xs text-zinc-400">
            Ningún elemento de la biblioteca coincide con los filtros aplicados.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ────────────────── MOVIES SECTION ────────────────── */}
          {movies.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-zinc-350 flex items-center gap-2 uppercase tracking-wider pl-1">
                <Film className="h-4.5 w-4.5 text-cyan-500 shrink-0" />
                Películas ({movies.length})
              </h2>
              <div className="border border-zinc-805 rounded-xl bg-zinc-900/25 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-450 text-[10px] font-bold uppercase tracking-wider">
                        <th className="p-3 w-14 text-center">Poster</th>
                        <th className="p-3">Título</th>
                        <th className="p-3 w-28">TMDB ID</th>
                        <th className="p-3 w-20">Año</th>
                        <th className="p-3">URLs Player / Recolector</th>
                        <th className="p-3 w-28">Idioma</th>
                        <th className="p-3 w-20">Calidad</th>
                        <th className="p-3 w-28">Estado</th>
                        <th className="p-3 w-40 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {movies.map((link) => (
                        <tr
                          key={link.id}
                          className="hover:bg-zinc-900/30 transition-colors align-middle"
                        >
                          {/* Poster */}
                          <td className="p-3">
                            <div className="h-9 w-6 bg-zinc-950 border border-zinc-850 rounded overflow-hidden flex items-center justify-center mx-auto shadow-sm">
                              {link.posterPath ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`https://image.tmdb.org/t/p/w92${link.posterPath}`}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Film className="h-3.5 w-3.5 text-zinc-700" />
                              )}
                            </div>
                          </td>

                          {/* Title */}
                          <td className="p-3 font-semibold text-zinc-100 max-w-[180px] truncate" title={link.title}>
                            {link.title}
                          </td>

                          {/* TMDB ID */}
                          <td className="p-3 font-mono text-xs text-zinc-400">
                            {link.tmdbId}
                          </td>

                          {/* Year */}
                          <td className="p-3 text-xs text-zinc-455">
                            {link.releaseYear || "—"}
                          </td>

                          {/* URLs */}
                          <td className="p-3 space-y-1.5 max-w-[220px]">
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className="text-[10px] font-mono text-cyan-400 truncate">
                                .../play/embed/movie/{link.tmdbId}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(link.playerUrl, link.id, "player")}
                                className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-cyan-400 cursor-pointer shrink-0"
                                title="Copiar URL Player"
                              >
                                {copiedId?.id === link.id && copiedId?.type === "player" ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className="text-[10px] font-mono text-emerald-400 truncate">
                                .../f/embed/movie/{link.tmdbId}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(link.collectorUrl, link.id, "collector")}
                                className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-emerald-400 cursor-pointer shrink-0"
                                title="Copiar URL Recolector"
                              >
                                {copiedId?.id === link.id && copiedId?.type === "collector" ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Language */}
                          <td className="p-3 text-xs text-zinc-300">
                            {link.language}
                          </td>

                          {/* Quality */}
                          <td className="p-3 font-mono text-xs text-zinc-300">
                            {link.quality}
                          </td>

                          {/* Status */}
                          <td className="p-3">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                link.status === "Encontrado"
                                  ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                                  : link.status === "Buscando"
                                  ? "bg-amber-950/20 text-amber-400 border-amber-500/20 animate-pulse"
                                  : link.status === "No encontrado"
                                  ? "bg-rose-950/20 text-rose-400 border-rose-500/20"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
                              }`}
                            >
                              {link.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleSearch(link.id)}
                                disabled={loadingId !== null || batchScraping !== null}
                                className="p-1.5 bg-zinc-950 border border-zinc-800 hover:border-cyan-500/30 text-zinc-450 hover:text-cyan-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Buscar fuentes ahora"
                              >
                                {loadingId === link.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Search className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setManualModalLink(link);
                                  setManualUrls("");
                                  setManualLang("LATINO");
                                  setManualQual("HD");
                                  setManualReplaceId("new");
                                }}
                                className="p-1.5 bg-zinc-950 border border-zinc-800 hover:border-emerald-500/30 text-zinc-450 hover:text-emerald-400 rounded-lg transition-colors cursor-pointer"
                                title="Agregar enlaces manuales"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>

                              <a
                                href={`/play/embed/movie/${link.tmdbId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-1.5 bg-zinc-950 border rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                                  link.status === "Encontrado"
                                    ? "border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/60 shadow-[0_0_8px_-2px_rgba(16,185,129,0.15)]"
                                    : "border-zinc-800 text-zinc-650 cursor-not-allowed"
                                }`}
                                onClick={(e) => {
                                  if (link.status !== "Encontrado") {
                                    e.preventDefault();
                                    alert("Debes ejecutar la búsqueda de fuentes antes de poder abrir el reproductor.");
                                  }
                                }}
                                title={link.status === "Encontrado" ? "Abrir Reproductor" : "Pendiente de Scrapeo"}
                              >
                                <Play className="h-3.5 w-3.5 fill-current" />
                              </a>

                              <button
                                type="button"
                                onClick={() => router.push(`/dashboard/results?mediaItemId=${link.mediaItemId}`)}
                                className="p-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-450 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                                title="Ver resultados scraper"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(link.id)}
                                disabled={loadingId !== null || batchScraping !== null}
                                className="p-1.5 bg-zinc-950 border border-zinc-800 hover:border-rose-500/30 text-zinc-450 hover:text-rose-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar de la biblioteca"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ────────────────── SERIES & ANIMES SECTION ────────────────── */}
          {series.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-zinc-350 flex items-center gap-2 uppercase tracking-wider pl-1">
                <Tv className="h-4.5 w-4.5 text-purple-500 shrink-0" />
                Series y Animes ({series.length})
              </h2>

              <div className="space-y-4">
                {series.map((group) => {
                  // Precompute stats
                  let totalCount = 0;
                  let foundCount = 0;
                  const allEpisodes: FormattedLink[] = [];

                  group.seasons.forEach((season) => {
                    season.episodes.forEach((ep) => {
                      totalCount++;
                      allEpisodes.push(ep);
                      if (ep.status === "Encontrado") {
                        foundCount++;
                      }
                    });
                  });

                  const pendingCount = totalCount - foundCount;
                  const progress = totalCount > 0 ? (foundCount / totalCount) * 100 : 0;
                  const isExpanded = expandedSeries[group.id];

                  return (
                    <div
                      key={group.id}
                      className="bg-zinc-900/35 border border-zinc-805 rounded-xl overflow-hidden shadow-lg hover:border-zinc-700/50 transition-all duration-200"
                    >
                      {/* Main Group Row / Header */}
                      <div
                        onClick={() =>
                          toggleSeries(
                            group.id,
                            group.seasons.map((s) => s.seasonNumber)
                          )
                        }
                        className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 cursor-pointer hover:bg-zinc-800/15 transition-colors select-none"
                      >
                        {/* Info Left */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="h-12 w-8 bg-zinc-950 border border-zinc-850 rounded overflow-hidden shrink-0 flex items-center justify-center shadow">
                            {group.posterPath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`https://image.tmdb.org/t/p/w92${group.posterPath}`}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Tv className="h-4 w-4 text-zinc-650" />
                            )}
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-zinc-100 hover:text-cyan-400 transition-colors text-sm sm:text-base truncate max-w-[260px] sm:max-w-md">
                                {group.title}
                              </h3>
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono border uppercase tracking-wider ${
                                  group.type === "tv"
                                    ? "bg-purple-950/20 text-purple-400 border-purple-500/20"
                                    : "bg-pink-950/20 text-pink-400 border-pink-500/20"
                                }`}
                              >
                                {group.type === "tv" ? "Serie" : "Anime"}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                                TMDB: {group.tmdbId}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400">
                              {group.releaseYear || "—"} • {group.seasons.length}{" "}
                              {group.seasons.length === 1 ? "Temporada" : "Temporadas"} ({totalCount} capítulos)
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar (Stats) */}
                        <div className="flex items-center gap-3 self-start md:self-auto pl-12 md:pl-0 shrink-0">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                              <span className="text-emerald-400">{foundCount}</span>
                              <span className="text-zinc-650">/</span>
                              <span className="text-zinc-500">{totalCount}</span>
                              <span className="text-[10px] text-zinc-500 font-normal">Capítulos</span>
                            </div>
                            <div className="h-1.5 w-28 sm:w-36 bg-zinc-950 rounded-full overflow-hidden border border-zinc-850">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Controls & Chevron */}
                        <div
                          className="flex items-center justify-between md:justify-end gap-3 pl-12 md:pl-0 border-t border-zinc-800/40 md:border-none pt-3 md:pt-0 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            {/* Scrape Batch Button */}
                            <button
                              type="button"
                              onClick={() => handleBatchSearch(group.id, allEpisodes)}
                              disabled={batchScraping !== null || pendingCount === 0}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-950/60 text-cyan-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              title="Buscar fuentes para capítulos pendientes en lote"
                            >
                              {batchScraping?.seriesKey === group.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Procesando ({batchScraping.current}/{batchScraping.total})
                                </>
                              ) : (
                                <>
                                  <Search className="h-3 w-3" />
                                  Buscar Fuentes Lote
                                </>
                              )}
                            </button>

                            {/* Delete All Show Links Button */}
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteShow(group.tmdbId, group.type, group.title)
                              }
                              disabled={
                                batchScraping !== null || loadingId === `show-${group.tmdbId}`
                              }
                              className="p-1.5 bg-zinc-950 border border-zinc-800 hover:border-rose-500/30 text-zinc-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Eliminar serie completa de la biblioteca"
                            >
                              {loadingId === `show-${group.tmdbId}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              toggleSeries(
                                group.id,
                                group.seasons.map((s) => s.seasonNumber)
                              )
                            }
                            className="text-zinc-550 hover:text-zinc-300 transition-colors p-1"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Seasons List */}
                      {isExpanded && (
                        <div className="border-t border-zinc-805 bg-zinc-950/30 p-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          {group.seasons.map((season) => {
                            const seasonKey = `${group.id}-${season.seasonNumber}`;
                            const isSeasonExpanded = expandedSeasons[seasonKey];
                            const seasonFoundCount = season.episodes.filter(
                              (ep) => ep.status === "Encontrado"
                            ).length;
                            const seasonTotalCount = season.episodes.length;

                            return (
                              <div
                                key={season.seasonNumber}
                                className="border border-zinc-850 rounded-lg overflow-hidden bg-zinc-900/10"
                              >
                                {/* Season Header */}
                                <div
                                  onClick={() => toggleSeason(seasonKey)}
                                  className="p-3 bg-zinc-900/50 hover:bg-zinc-800/20 transition-colors flex items-center justify-between cursor-pointer select-none border-b border-zinc-850/40"
                                >
                                  <div className="flex items-center gap-3">
                                    {isSeasonExpanded ? (
                                      <FolderOpen className="h-4 w-4 text-purple-400" />
                                    ) : (
                                      <Folder className="h-4 w-4 text-purple-400" />
                                    )}
                                    <span className="text-xs font-bold text-zinc-200">
                                      Temporada {season.seasonNumber}
                                    </span>
                                    <span className="text-[10px] font-medium text-zinc-500 bg-zinc-950 border border-zinc-850 px-2 py-0.5 rounded-full">
                                      {seasonTotalCount} Capítulos • {seasonFoundCount} Encontrados
                                    </span>
                                  </div>
                                  <div className="text-zinc-500 p-0.5">
                                    {isSeasonExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </div>
                                </div>

                                {/* Season Episodes Table */}
                                {isSeasonExpanded && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[850px] text-xs">
                                      <thead>
                                        <tr className="border-b border-zinc-850 bg-zinc-950/50 text-zinc-500 text-[9px] font-bold uppercase tracking-wider">
                                          <th className="p-3 w-16">Episodio</th>
                                          <th className="p-3">Título Capítulo</th>
                                          <th className="p-3">URLs Player / Recolector</th>
                                          <th className="p-3 w-28">Idioma</th>
                                          <th className="p-3 w-20">Calidad</th>
                                          <th className="p-3 w-28">Estado</th>
                                          <th className="p-3 w-36 text-right">Acciones</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-850/40 bg-zinc-950/20">
                                        {season.episodes.map((ep) => (
                                          <tr
                                            key={ep.id}
                                            className="hover:bg-zinc-900/10 transition-colors align-middle"
                                          >
                                            {/* Ep Number */}
                                            <td className="p-3 font-mono text-zinc-400 font-semibold">
                                              E{ep.episode}
                                            </td>

                                            {/* Ep Title */}
                                            <td
                                              className="p-3 font-medium text-zinc-300 max-w-[200px] truncate"
                                              title={ep.title}
                                            >
                                              {ep.title}
                                            </td>

                                            {/* URLs */}
                                            <td className="p-3 space-y-1.5 max-w-[220px]">
                                              <div className="flex items-center gap-1.5 justify-between">
                                                <span className="text-[9px] font-mono text-cyan-400/90 truncate">
                                                  .../play/embed/tv/{ep.tmdbId}/{ep.season}/{ep.episode}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleCopy(ep.playerUrl, ep.id, "player")
                                                  }
                                                  className="p-1 hover:bg-zinc-850 rounded transition-colors text-zinc-500 hover:text-cyan-400 cursor-pointer shrink-0"
                                                  title="Copiar URL Player"
                                                >
                                                  {copiedId?.id === ep.id &&
                                                  copiedId?.type === "player" ? (
                                                    <Check className="h-3 w-3 text-emerald-400" />
                                                  ) : (
                                                    <Copy className="h-3 w-3" />
                                                  )}
                                                </button>
                                              </div>
                                              <div className="flex items-center gap-1.5 justify-between">
                                                <span className="text-[9px] font-mono text-emerald-400/90 truncate">
                                                  .../f/embed/tv/{ep.tmdbId}/{ep.season}/{ep.episode}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleCopy(ep.collectorUrl, ep.id, "collector")
                                                  }
                                                  className="p-1 hover:bg-zinc-850 rounded transition-colors text-zinc-500 hover:text-emerald-400 cursor-pointer shrink-0"
                                                  title="Copiar URL Recolector"
                                                >
                                                  {copiedId?.id === ep.id &&
                                                  copiedId?.type === "collector" ? (
                                                    <Check className="h-3 w-3 text-emerald-400" />
                                                  ) : (
                                                    <Copy className="h-3 w-3" />
                                                  )}
                                                </button>
                                              </div>
                                            </td>

                                            {/* Language */}
                                            <td className="p-3 text-zinc-400">
                                              {ep.language}
                                            </td>

                                            {/* Quality */}
                                            <td className="p-3 font-mono text-zinc-450">
                                              {ep.quality}
                                            </td>

                                            {/* Status */}
                                            <td className="p-3">
                                              <span
                                                className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-medium border ${
                                                  ep.status === "Encontrado"
                                                    ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                                                    : ep.status === "Buscando"
                                                    ? "bg-amber-950/20 text-amber-400 border-amber-500/20 animate-pulse"
                                                    : ep.status === "No encontrado"
                                                    ? "bg-rose-950/20 text-rose-400 border-rose-500/20"
                                                    : "bg-zinc-850 text-zinc-400 border-zinc-750"
                                                }`}
                                              >
                                                {ep.status}
                                              </span>
                                            </td>

                                            {/* Episode Actions */}
                                            <td className="p-3 text-right">
                                              <div className="flex items-center justify-end gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => handleSearch(ep.id)}
                                                  disabled={
                                                    loadingId !== null || batchScraping !== null
                                                  }
                                                  className="p-1 bg-zinc-950 border border-zinc-800 hover:border-cyan-500/30 text-zinc-450 hover:text-cyan-400 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                  title="Buscar fuentes ahora"
                                                >
                                                  {loadingId === ep.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <Search className="h-3 w-3" />
                                                  )}
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setManualModalLink(ep);
                                                    setManualUrls("");
                                                    setManualLang("LATINO");
                                                    setManualQual("HD");
                                                    setManualReplaceId("new");
                                                  }}
                                                  className="p-1 bg-zinc-950 border border-zinc-800 hover:border-emerald-500/30 text-zinc-450 hover:text-emerald-400 rounded transition-colors cursor-pointer"
                                                  title="Agregar enlaces manuales"
                                                >
                                                  <Plus className="h-3 w-3" />
                                                </button>

                                                <a
                                                  href={`/play/embed/tv/${ep.tmdbId}/${ep.season}/${ep.episode}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className={`p-1 bg-zinc-950 border rounded transition-all flex items-center justify-center cursor-pointer ${
                                                    ep.status === "Encontrado"
                                                      ? "border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/60 shadow-[0_0_8px_-2px_rgba(16,185,129,0.15)]"
                                                      : "border-zinc-800 text-zinc-650 cursor-not-allowed"
                                                  }`}
                                                  onClick={(e) => {
                                                    if (ep.status !== "Encontrado") {
                                                      e.preventDefault();
                                                      alert(
                                                        "Debes ejecutar la búsqueda de fuentes antes de poder abrir el reproductor."
                                                      );
                                                    }
                                                  }}
                                                  title={
                                                    ep.status === "Encontrado"
                                                      ? "Abrir Reproductor Embed"
                                                      : "Pendiente de Scrapeo"
                                                  }
                                                >
                                                  <Play className="h-3 w-3 fill-current" />
                                                </a>

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    router.push(
                                                      `/dashboard/results?mediaItemId=${ep.mediaItemId}`
                                                    )
                                                  }
                                                  className="p-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-705 text-zinc-450 hover:text-zinc-200 rounded transition-colors cursor-pointer"
                                                  title="Ver resultados scraper"
                                                >
                                                  <ExternalLink className="h-3 w-3" />
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleDelete(ep.id)}
                                                  disabled={
                                                    loadingId !== null || batchScraping !== null
                                                  }
                                                  className="p-1 bg-zinc-950 border border-zinc-800 hover:border-rose-500/30 text-zinc-450 hover:text-rose-400 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                  title="Eliminar de la biblioteca"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Manual Links Modal */}
      {manualModalLink && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-zinc-100">
                  Agregar Videos Manuales
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualModalLink(null)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-zinc-400 font-medium">Contenido:</p>
              <p className="text-sm font-semibold text-zinc-200 truncate">
                {manualModalLink.title}
              </p>
              <p className="text-[11px] text-zinc-500 font-mono">
                {manualModalLink.type === "movie"
                  ? `Película (TMDB ID: ${manualModalLink.tmdbId})`
                  : `Serie (TMDB ID: ${manualModalLink.tmdbId}) • Temporada ${manualModalLink.season} • Episodio ${manualModalLink.episode}`}
              </p>
            </div>

            <form onSubmit={handleSaveManualLinks} className="space-y-4 pt-2">
              {/* Replace Select */}
              {manualModalLink.variants && manualModalLink.variants.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-450 uppercase tracking-wider block">
                    Acción / Opción a Reemplazar
                  </label>
                  <select
                    value={manualReplaceId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualReplaceId(val);
                      if (val !== "new") {
                        const target = manualModalLink.variants?.find((v) => v.id === val);
                        if (target) {
                          setManualLang(target.language);
                          setManualQual(target.quality);
                        }
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-305 focus:outline-none focus:border-cyan-500/80 transition-colors font-medium cursor-pointer"
                  >
                    <option value="new">Agregar como nueva opción (Sin reemplazar)</option>
                    {manualModalLink.variants.map((v, idx) => (
                      <option key={v.id} value={v.id}>
                        {`Reemplazar Opción ${idx + 1}: ${v.language} — ${v.quality} (${v.siteName})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-450 uppercase tracking-wider block">
                  Enlaces / Códigos de Iframe (Uno por línea)
                </label>
                <textarea
                  value={manualUrls}
                  onChange={(e) => setManualUrls(e.target.value)}
                  placeholder="https://streamwish.to/e/...&#10;https://filemoon.sx/e/...&#10;(Puedes introducir varios enlaces, uno por línea)"
                  rows={5}
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-cyan-500/80 transition-colors resize-y min-h-[120px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-450 uppercase tracking-wider block">
                    Idioma
                  </label>
                  <select
                    value={manualLang}
                    onChange={(e) => setManualLang(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/80 transition-colors font-medium cursor-pointer"
                  >
                    <option value="LATINO">LATINO (Audio Latino)</option>
                    <option value="JAPANESE">JAPANESE (Subtítulos Español)</option>
                    <option value="CASTELLANO">CASTELLANO (Audio España)</option>
                    <option value="ENGLISH">ENGLISH (Audio Inglés)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-450 uppercase tracking-wider block">
                    Calidad
                  </label>
                  <select
                    value={manualQual}
                    onChange={(e) => setManualQual(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/80 transition-colors font-medium cursor-pointer"
                  >
                    <option value="HD">HD (Alta Definición)</option>
                    <option value="1080p">1080p (Full HD)</option>
                    <option value="720p">720p (Estándar)</option>
                    <option value="2160p">2160p (Ultra HD / 4K)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={() => setManualModalLink(null)}
                  className="px-4 py-2 border border-zinc-850 hover:border-zinc-750 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={manualLoading || !manualUrls.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-emerald-500/10 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {manualLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Agregar Enlaces
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
