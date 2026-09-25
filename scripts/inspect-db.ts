import { prisma } from "../src/lib/prisma";

async function main() {
  const items = await prisma.mediaItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      videoVariants: {
        include: { sourceSite: true }
      },
      generatedLinks: true
    }
  });

  console.log(`Found ${items.length} recent MediaItems in DB:\n`);
  for (const item of items) {
    console.log(`[${(item.mediaType || "UNKNOWN").toUpperCase()}] "${item.title}" (TMDB: ${item.tmdbId}, S${item.season || "-"}E${item.episode || "-"}, EpTitle: "${item.episodeTitle || "N/A"}")`);
    console.log(`  Variants (${item.videoVariants.length}):`);
    for (const v of item.videoVariants) {
      console.log(`   - [${v.language}] ${v.quality} | Source: ${v.sourceSite?.name} | Status: ${v.status}`);
      console.log(`     URL: ${v.videoUrl.substring(0, 100)}...`);
    }
    console.log("");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
