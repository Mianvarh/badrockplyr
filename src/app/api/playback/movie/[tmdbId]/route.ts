import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAX_VIDEO_OPTIONS, orderPlaybackOptions } from "@/lib/playbackUrlPolicy";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ tmdbId: string }> }
) {
  try {
    const { tmdbId } = await props.params;

    const mediaItem = await prisma.mediaItem.findFirst({
      where: {
        tmdbId,
        mediaType: "movie"
      },
      include: {
        selectedPlayback: {
          include: {
            videoVariant: true
          }
        },
        videoVariants: {
          where: { status: "ONLINE" },
          orderBy: { isSelected: "desc" },
          include: {
            subtitleTracks: true
          }
        }
      }
    });

    const playableVariants = orderPlaybackOptions(mediaItem?.videoVariants || []).slice(0, MAX_VIDEO_OPTIONS);

    if (!mediaItem || playableVariants.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron fuentes de video disponibles." },
        { status: 404 }
      );
    }

    // Format selected
    const selectedVariant = playableVariants.find((variant) => variant.id === mediaItem.selectedPlayback?.videoVariantId);
    const selected = selectedVariant
      ? {
          language: selectedVariant.language,
          quality: selectedVariant.quality,
          videoUrl: selectedVariant.videoUrl
        }
      : {
          language: playableVariants[0].language,
          quality: playableVariants[0].quality,
          videoUrl: playableVariants[0].videoUrl
        };

    // Format languages array
    const languagesMap: Record<string, any> = {};
    for (const v of playableVariants) {
      if (!languagesMap[v.language]) {
        languagesMap[v.language] = {
          language: v.language,
          qualities: []
        };
      }
      languagesMap[v.language].qualities.push({
        quality: v.quality,
        videoUrl: v.videoUrl,
        subtitles: v.subtitleTracks.map((sub) => ({
          url: sub.url,
          language: sub.language,
          format: sub.format
        }))
      });
    }

    const languages = Object.values(languagesMap);

    return NextResponse.json({
      title: mediaItem.title,
      poster: mediaItem.posterPath ? `https://image.tmdb.org/t/p/w500${mediaItem.posterPath}` : null,
      selected,
      languages
    });
  } catch (error: any) {
    console.error("API error in movie playback:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
