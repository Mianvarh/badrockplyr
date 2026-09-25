import React from "react";
import { prisma } from "@/lib/prisma";
import EmbedPlayer from "@/app/play/embed/EmbedPlayer";
import { MAX_VIDEO_OPTIONS, orderPlaybackOptions } from "@/lib/playbackUrlPolicy";

interface PageProps {
  params: Promise<{ tmdbId: string }>;
}

export const revalidate = 0;

export default async function MovieEmbedPlayerPage({ params }: PageProps) {
  const { tmdbId } = await params;

  // 1. Fetch movie media item along with online video variants
  const mediaItem = await prisma.mediaItem.findFirst({
    where: {
      tmdbId,
      mediaType: "movie"
    },
    include: {
      selectedPlayback: true,
      videoVariants: {
        where: { status: "ONLINE" },
        orderBy: [
          { sortOrder: "asc" },
          { isSelected: "desc" },
          { createdAt: "asc" }
        ],
        include: {
          sourceSite: true,
          subtitleTracks: true
        }
      }
    }
  });

  if (!mediaItem) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-center p-6 text-zinc-300">
        <h2 className="text-lg font-bold">Título no indexado</h2>
        <p className="text-xs text-zinc-500 mt-2 max-w-sm">
          Este contenido no está registrado en la base de datos de Badrockplyr.
        </p>
      </div>
    );
  }

  // Format database variants to match EmbedPlayer expectations
  // Sort so selected (winner) variant is always first → shown as "Opción 1"
  const selectedId = mediaItem.selectedPlayback?.videoVariantId;
  const rawVariants = orderPlaybackOptions(mediaItem.videoVariants).slice(0, MAX_VIDEO_OPTIONS).map((v) => ({
    id: v.id,
    videoUrl: v.videoUrl,
    candidateUrl: v.candidateUrl,
    language: v.language,
    quality: v.quality,
    isSelected: v.isSelected,
    sourceSite: {
      name: v.sourceSite.name,
      allowedDomain: v.sourceSite.allowedDomain
    },
    subtitleTracks: v.subtitleTracks.map((sub) => ({
      id: sub.id,
      url: sub.url,
      language: sub.language,
      format: sub.format,
      label: sub.label
    }))
  }));

  // Winner first, then rest
  const variants = [
    ...rawVariants.filter((v) => v.id === selectedId || v.isSelected),
    ...rawVariants.filter((v) => v.id !== selectedId && !v.isSelected)
  ].slice(0, MAX_VIDEO_OPTIONS);

  return (
    <EmbedPlayer
      title={mediaItem.title}
      originalTitle={mediaItem.originalTitle}
      mediaType="movie"
      backdropPath={mediaItem.backdropPath}
      posterPath={mediaItem.posterPath}
      overview={mediaItem.overview}
      variants={variants}
      initialVariantId={mediaItem.selectedPlayback?.videoVariantId}
      mediaItemId={mediaItem.id}
    />
  );
}
