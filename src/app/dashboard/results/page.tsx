import React from "react";
import { prisma } from "@/lib/prisma";
import {
  Activity,
  AlertCircle,
  Play,
  Globe,
  ExternalLink,
  Sparkles,
  Info,
  Subtitles
} from "lucide-react";
import Link from "next/link";
import { ManualVideoForm, DeleteVariantButton, MoveVariantOrderButtons } from "./ManualVideoForm";

export const revalidate = 0;
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ mediaItemId?: string }>;
}

export default async function ResultsPage({ searchParams }: PageProps) {
  const { mediaItemId } = await searchParams;

  // Query specific or general candidates
  const candidates = await prisma.sourceCandidate.findMany({
    where: mediaItemId ? { mediaItemId } : {},
    orderBy: { createdAt: "desc" },
    include: {
      mediaItem: true,
      sourceSite: true
    }
  });

  // Query specific or general video variants
  const variants = await prisma.videoVariant.findMany({
    where: mediaItemId ? { mediaItemId } : {},
    orderBy: [
      { sortOrder: "asc" },
      { isSelected: "desc" },
      { createdAt: "asc" }
    ],
    include: {
      mediaItem: {
        select: {
          tmdbId: true,
          mediaType: true,
          season: true,
          episode: true,
          title: true
        }
      },
      sourceSite: true,
      subtitleTracks: true
    }
  });

  // Fetch current media item details if filtered
  const mediaItem = mediaItemId
    ? await prisma.mediaItem.findUnique({ where: { id: mediaItemId } })
    : null;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resultados de Búsqueda</h1>
          <p className="text-sm text-zinc-400 mt-1.5">
            {mediaItem
              ? `Fuentes de video detectadas para: "${mediaItem.title}"`
              : "Registro en tiempo real de páginas candidatas y coincidencias de video encontradas por el scraper."}
          </p>
        </div>
        {mediaItem && (
          <Link
            href="/dashboard/generated-links"
            className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors self-start"
          >
            Volver a Biblioteca
          </Link>
        )}
      </div>

      {/* Manual Video Input Form (Only shown if filtering by a single MediaItem) */}
      {mediaItemId && (
        <ManualVideoForm 
          mediaItemId={mediaItemId} 
          initialVariants={variants.map((v) => ({
            id: v.id,
            language: v.language,
            quality: v.quality,
            siteName: v.sourceSite.name
          }))}
        />
      )}

      {/* Main Grid: Detected Video Variants & Subtitles */}
      <div className="space-y-5">
        <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Play className="h-4 w-4 text-cyan-400" />
          Variantes de Video Detectadas (URLs Directas)
        </h2>

        {variants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
            <AlertCircle className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 font-medium">No se han extra?do videos de reproducci?n a?n</p>
            <p className="text-xs text-zinc-500 mt-1">
              Ejecuta &quot;Buscar fuentes ahora&quot; desde la biblioteca de enlaces para poblar esta secci?n.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {variants.map((v, index) => (
              <div
                key={v.id}
                className={`bg-zinc-900 border rounded-xl p-5 hover:border-zinc-700/60 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  v.isSelected
                    ? "border-cyan-500/20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-cyan-950/10 shadow-[0_0_15px_-4px_rgba(6,182,212,0.15)]"
                    : "border-zinc-800"
                }`}
              >
                {/* Variant Info */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-400 font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-850">
                      {v.sourceSite.name}
                    </span>
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase bg-zinc-850 text-zinc-300 border-zinc-700">
                      {v.language}
                    </span>
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase bg-cyan-950/20 text-cyan-400 border-cyan-500/20">
                      {v.quality}
                    </span>
                    {v.isSelected && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_-2px_rgba(16,185,129,0.2)]">
                        ★ Principal (Fallback)
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      v.status === "ONLINE"
                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-950/20 text-rose-400 border-rose-500/20"
                    }`}>
                      {v.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500 font-mono truncate max-w-lg">
                      Origen: <a href={v.candidateUrl} target="_blank" rel="noreferrer" className="text-zinc-400 hover:underline">{v.candidateUrl}</a>
                    </p>
                    <p className="text-xs text-zinc-400 font-mono truncate max-w-xl">
                      Video URL: <span className="text-cyan-400 font-bold select-all">{v.videoUrl}</span>
                    </p>
                  </div>

                  {/* Subtitle tracks */}
                  {v.subtitleTracks.length > 0 && (
                    <div className="flex items-center gap-1.5 pt-2">
                      <Subtitles className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Subtítulos:</span>
                      {v.subtitleTracks.map((sub) => (
                        <span
                          key={sub.id}
                          className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-950 border border-zinc-800 text-zinc-400"
                        >
                          {sub.language} ({sub.format.toUpperCase()})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Action Buttons */}
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
                  {/* Open in embed player */}
                  <Link
                    href={
                      v.mediaItem.mediaType === "movie"
                        ? `/play/embed/movie/${v.mediaItem.tmdbId}`
                        : `/play/embed/tv/${v.mediaItem.tmdbId}/${v.mediaItem.season}/${v.mediaItem.episode}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/30 border border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-950/50 text-cyan-400 hover:text-cyan-300 text-xs font-semibold rounded-lg transition-all shadow-[0_0_12px_-4px_rgba(6,182,212,0.2)]"
                    title="Abrir en el reproductor embed"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Abrir Reproductor
                  </Link>
                  {/* Raw direct link */}
                  <a
                    href={v.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100 text-xs font-semibold rounded-lg transition-all"
                    title="Abrir URL de video directamente"
                  >
                    URL Directa
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  
                  {/* Order adjustment buttons */}
                  {mediaItemId && (
                    <MoveVariantOrderButtons
                      variantId={v.id}
                      isFirst={index === 0}
                      isLast={index === variants.length - 1}
                    />
                  )}
                  
                  {/* Delete button */}
                  <DeleteVariantButton variantId={v.id} mediaItemId={mediaItemId || v.mediaItemId} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Checked Candidates Metadata */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-400" />
          Páginas Web Analizadas (Candidatas)
        </h2>

        {candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
            <AlertCircle className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 font-medium">No se han analizado páginas candidatas</p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl bg-zinc-900/25 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4">Título</th>
                    <th className="p-4">Fuente</th>
                    <th className="p-4">Página URL</th>
                    <th className="p-4">Match</th>
                    <th className="p-4">TMDB ID</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850 text-sm">
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-900/40 transition-colors"
                    >
                      <td className="p-4 font-medium text-zinc-300">
                        {c.mediaItem.title}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-mono bg-zinc-850 border border-zinc-800 text-zinc-400">
                          {c.sourceSite.name}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-zinc-400 max-w-xs truncate">
                        <a
                          href={c.candidateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline text-cyan-400"
                        >
                          {c.candidateUrl}
                        </a>
                      </td>
                      <td className="p-4 font-mono text-xs text-zinc-300">
                        {c.matchScore !== null ? `${(c.matchScore * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-4 font-mono text-xs text-zinc-400">
                        {c.matchTmdbId || "—"}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-mono border ${
                          c.status === "FOUND"
                            ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                            : c.status === "PROCESSING"
                            ? "bg-amber-950/20 text-amber-400 border-amber-500/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Scraper Info Box */}
      <div className="flex items-start gap-3 p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
        <Info className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-zinc-400">
          <p className="font-semibold text-zinc-300">¿Qué representa esta consola?</p>
          <p className="mt-0.5">
            Muestra el resultado completo del scraper. En la parte superior verás las URLs de video directas extraídas de las páginas (las cuales se utilizarán en el reproductor). En la parte inferior, verás el log de las páginas web (candidatas) inspeccionadas para encontrar dicho contenido.
          </p>
        </div>
      </div>
    </div>
  );
}
