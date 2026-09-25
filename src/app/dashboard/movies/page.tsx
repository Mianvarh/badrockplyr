import React from "react";
import { prisma } from "@/lib/prisma";
import { Film, AlertCircle, Calendar } from "lucide-react";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function MoviesPage() {
  const mediaItems = await prisma.mediaItem.findMany({
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Biblioteca Media</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          Lista de contenido importado desde TMDB para indexación.
        </p>
      </div>

      {mediaItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20 text-center">
          <AlertCircle className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400 font-medium">No hay contenido en la biblioteca</p>
          <p className="text-xs text-zinc-500 mt-1">
            Los títulos se importan automáticamente al generar URLs en el dashboard.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {mediaItems.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700/60 transition-all flex flex-col"
            >
              {/* Cover placeholder / Image */}
              <div className="aspect-video bg-zinc-950 flex items-center justify-center border-b border-zinc-850 relative">
                {item.posterPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film className="h-10 w-10 text-zinc-700" />
                )}
                <div className="absolute top-2 left-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-mono border ${
                    item.mediaType === "movie"
                      ? "bg-blue-950/40 text-blue-400 border-blue-500/20"
                      : item.mediaType === "tv"
                      ? "bg-purple-950/40 text-purple-400 border-purple-500/20"
                      : "bg-pink-950/40 text-pink-400 border-pink-500/20"
                  }`}>
                    {item.mediaType.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-200 line-clamp-1">{item.title}</h3>
                  <p className="text-xs text-zinc-400 font-mono mt-1">TMDB: {item.tmdbId}</p>
                  {item.mediaType !== "movie" && (
                    <p className="text-xs text-cyan-400 font-medium mt-1">
                      Temporada {item.season} • Episodio {item.episode}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500 line-clamp-2 mt-2 leading-relaxed">
                    {item.overview || "Sin descripción disponible."}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-4 pt-3 border-t border-zinc-850">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Año: {item.releaseYear || item.firstAirYear || "N/A"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
