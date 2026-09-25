import React from "react";
import { prisma } from "@/lib/prisma";
import GeneratedLinksTable from "./GeneratedLinksTable";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function GeneratedLinksPage() {
  // Query all generated links with their associated media item, variants and current selection stats
  const links = await prisma.generatedLink.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      mediaItem: {
        include: {
          selectedPlayback: true,
          sourceCandidates: true,
          videoVariants: {
            orderBy: [
              { sortOrder: "asc" },
              { isSelected: "desc" },
              { createdAt: "asc" }
            ],
            include: {
              sourceSite: true
            }
          }
        }
      }
    }
  });

  // Map database data into the shape expected by the UI table
  const formattedLinks = links.map((link) => {
    // Determine search status based on candidates
    let searchStatus: "Pendiente" | "Buscando" | "Encontrado" | "No encontrado" = "Pendiente";
    if (link.mediaItem.sourceCandidates.length > 0) {
      const hasFound = link.mediaItem.sourceCandidates.some((c) => c.status === "FOUND");
      searchStatus = hasFound ? "Encontrado" : "No encontrado";
    }

    return {
      id: link.id,
      mediaItemId: link.mediaItemId,
      title: link.mediaItem.title,
      posterPath: link.mediaItem.posterPath,
      type: link.type,
      tmdbId: link.tmdbId,
      season: link.season,
      episode: link.episode,
      releaseYear: link.mediaItem.releaseYear || link.mediaItem.firstAirYear || null,
      playerUrl: link.playerUrl,
      collectorUrl: link.collectorUrl,
      language: link.mediaItem.selectedPlayback?.language || "—",
      quality: link.mediaItem.selectedPlayback?.quality || "—",
      status: searchStatus,
      createdAt: link.createdAt.toISOString(),
      variants: link.mediaItem.videoVariants.map((v) => ({
        id: v.id,
        videoUrl: v.videoUrl,
        language: v.language,
        quality: v.quality,
        siteName: v.sourceSite.name
      }))
    };
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Biblioteca de URLs Generadas</h1>
        <p className="text-sm text-zinc-400 mt-1.5">
          Listado general de enlaces embed y recolector generados en el sistema con su estado de búsqueda de fuentes.
        </p>
      </div>

      <GeneratedLinksTable initialLinks={formattedLinks} />
    </div>
  );
}
