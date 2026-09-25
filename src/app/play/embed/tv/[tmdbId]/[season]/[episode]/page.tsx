import React from "react";
import { prisma } from "@/lib/prisma";
import EmbedPlayer from "@/app/play/embed/EmbedPlayer";
import { MAX_VIDEO_OPTIONS, orderPlaybackOptions } from "@/lib/playbackUrlPolicy";

interface PageProps {
  params: Promise<{
    tmdbId: string;
    season: string;
    episode: string;
  }>;
}

export const revalidate = 0;

export default async function TVEmbedPlayerPage({ params }: PageProps) {
  const { tmdbId, season, episode } = await params;

  const sNum = Number(season);
  const epNum = Number(episode);

  // 1. Fetch TV media item along with online video variants
  const mediaItem = await prisma.mediaItem.findFirst({
    where: {
      tmdbId,
      mediaType: { in: ["tv", "anime"] },
      season: sNum,
      episode: epNum
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
        <h2 className="text-lg font-bold">Episodio no indexado</h2>
        <p className="text-xs text-zinc-500 mt-2 max-w-sm">
          Este episodio (T{season} E{episode}) de TMDB ID {tmdbId} no está registrado en la base de datos de Badrockplyr.
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

  // Query all episodes for this show so the "Episodes" drawer and "Next Ep." work
  const showEpisodes = await prisma.mediaItem.findMany({
    where: {
      tmdbId,
      mediaType: { in: ["tv", "anime"] }
    },
    orderBy: [
      { season: "asc" },
      { episode: "asc" }
    ],
    select: {
      id: true,
      season: true,
      episode: true,
      episodeTitle: true,
      episodeStillPath: true,
      overview: true
    }
  });

  const nextEp = showEpisodes.find(
    (ep) =>
      (ep.season === sNum && (ep.episode ?? 0) === epNum + 1) ||
      ((ep.season ?? 0) === sNum + 1 && (ep.episode ?? 0) === 1)
  );

  const nextEpisodeUrl = nextEp
    ? `/play/embed/tv/${tmdbId}/${nextEp.season}/${nextEp.episode}`
    : null;

  return (
    <EmbedPlayer
      title={mediaItem.title}
      originalTitle={mediaItem.originalTitle}
      mediaType={mediaItem.mediaType as any}
      season={sNum}
      episode={epNum}
      episodeTitle={mediaItem.episodeTitle}
      backdropPath={mediaItem.backdropPath || mediaItem.episodeStillPath}
      posterPath={mediaItem.posterPath}
      overview={mediaItem.episodeOverview || mediaItem.overview}
      variants={variants}
      initialVariantId={mediaItem.selectedPlayback?.videoVariantId}
      mediaItemId={mediaItem.id}
      allEpisodes={showEpisodes.map((ep) => ({
        id: ep.id,
        season: ep.season || 1,
        episode: ep.episode || 1,
        episodeTitle: ep.episodeTitle,
        episodeStillPath: ep.episodeStillPath,
        overview: ep.overview,
        url: `/play/embed/tv/${tmdbId}/${ep.season}/${ep.episode}`
      }))}
      nextEpisodeUrl={nextEpisodeUrl}
    />
  );
}
