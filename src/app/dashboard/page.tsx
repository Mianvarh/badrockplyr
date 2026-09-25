import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Film,
  Link2,
  Server,
  Play,
  ArrowRight,
  Plus,
  Compass,
  AlertCircle
} from "lucide-react";

export const revalidate = 0; // Disable caching to always show fresh database stats
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Query database counts
  const mediaCount = await prisma.mediaItem.count();
  const linkCount = await prisma.generatedLink.count();
  const sourceCount = await prisma.sourceSite.count();
  const variantCount = await prisma.videoVariant.count();

  // Get recent links
  const recentLinks = await prisma.generatedLink.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: {
      mediaItem: true
    }
  });

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consola General</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          Resumen operativo del indexador y reproductor multi-fuente Badrockplyr.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-400">Biblioteca Media</span>
            <Film className="h-5 w-5 text-cyan-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold font-mono tracking-tight">{mediaCount}</span>
            <p className="text-xs text-zinc-500 mt-1">Películas, series y animes</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-400">URLs Generadas</span>
            <Link2 className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold font-mono tracking-tight">{linkCount}</span>
            <p className="text-xs text-zinc-500 mt-1">Enlaces embed y recolector</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-400">Fuentes Activas</span>
            <Server className="h-5 w-5 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold font-mono tracking-tight">{sourceCount}</span>
            <p className="text-xs text-zinc-500 mt-1">Dominios scraper configurados</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-400">Variantes de Video</span>
            <Play className="h-5 w-5 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold font-mono tracking-tight">{variantCount}</span>
            <p className="text-xs text-zinc-500 mt-1">Videos detectados online/offline</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-cyan-950/20 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-zinc-200">Acciones de Configuración Rápida</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Comienza inicializando las fuentes o generando un nuevo enlace de reproducción.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <Link
            href="/dashboard/generator"
            className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 hover:border-cyan-500/30 hover:bg-cyan-950/10 rounded-lg group transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Plus className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-zinc-200 group-hover:text-cyan-400 transition-colors">
                  Generar Nuevo Enlace
                </p>
                <p className="text-xs text-zinc-500">Crear URLs embed y de recolector</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-500 group-hover:translate-x-1 transition-transform group-hover:text-cyan-400" />
          </Link>

          <Link
            href="/dashboard/sources"
            className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 hover:border-emerald-500/30 hover:bg-emerald-950/10 rounded-lg group transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Compass className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors">
                  Administrar Fuentes
                </p>
                <p className="text-xs text-zinc-500">Configurar selectores y dominios autorizados</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-500 group-hover:translate-x-1 transition-transform group-hover:text-emerald-400" />
          </Link>
        </div>
      </div>

      {/* Recent Links Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-200">Enlaces Generados Recientemente</h2>
          <Link
            href="/dashboard/generated-links"
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            Ver todos
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentLinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
            <AlertCircle className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 font-medium">No hay enlaces generados aún</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              Usa el Generador de URL para agregar tu primera película, serie o anime de TMDB.
            </p>
            <Link
              href="/dashboard/generator"
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Generar enlace
            </Link>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl bg-zinc-900/25 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs font-semibold">
                    <th className="p-4">Título</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">TMDB ID</th>
                    <th className="p-4">Detalle</th>
                    <th className="p-4">Fecha de Generación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850 text-sm">
                  {recentLinks.map((link) => (
                    <tr
                      key={link.id}
                      className="hover:bg-zinc-900/40 transition-colors"
                    >
                      <td className="p-4 font-medium text-zinc-200">
                        {link.mediaItem.title}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${
                          link.type === "movie"
                            ? "bg-blue-950/20 text-blue-400 border-blue-500/20"
                            : link.type === "tv"
                            ? "bg-purple-950/20 text-purple-400 border-purple-500/20"
                            : "bg-pink-950/20 text-pink-400 border-pink-500/20"
                        }`}>
                          {link.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-zinc-400">
                        {link.tmdbId}
                      </td>
                      <td className="p-4 text-xs text-zinc-400">
                        {link.type !== "movie"
                          ? `T${link.season} E${link.episode}`
                          : "—"}
                      </td>
                      <td className="p-4 text-xs text-zinc-500">
                        {new Date(link.createdAt).toLocaleString("es-ES")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
