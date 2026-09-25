import { prisma } from "@/lib/prisma";
import { orderPlaybackOptions } from "@/lib/playbackUrlPolicy";

export async function runPlaybackSelection(mediaItemId: string) {
  // 1. Fetch variants
  const variants = await prisma.videoVariant.findMany({
    where: {
      mediaItemId,
      status: "ONLINE"
    },
    include: {
      sourceSite: true
    }
  });

  const playableVariants = orderPlaybackOptions(variants);

  if (playableVariants.length === 0) {
    // No online playbacks available
    // Delete existing SelectedPlayback if any
    await prisma.selectedPlayback.deleteMany({ where: { mediaItemId } });
    return null;
  }

  const winner = playableVariants[0];

  // 4. Update isSelected flag in VideoVariant
  await prisma.videoVariant.updateMany({
    where: { mediaItemId },
    data: { isSelected: false }
  });

  await prisma.videoVariant.update({
    where: { id: winner.id },
    data: { isSelected: true }
  });

  // 5. Upsert SelectedPlayback
  const selectedPlayback = await prisma.selectedPlayback.upsert({
    where: { mediaItemId },
    update: {
      videoVariantId: winner.id,
      language: winner.language,
      quality: winner.quality,
      status: "ONLINE",
      selectedAt: new Date()
    },
    create: {
      mediaItemId,
      videoVariantId: winner.id,
      language: winner.language,
      quality: winner.quality,
      status: "ONLINE",
      selectedAt: new Date()
    }
  });

  return selectedPlayback;
}
