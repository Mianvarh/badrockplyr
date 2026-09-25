import { prisma } from "../src/lib/prisma";

async function main() {
  const items = await prisma.mediaItem.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      videoVariants: {
        where: { status: "ONLINE" },
        include: { sourceSite: true }
      }
    }
  });

  console.log(`\n==================================================`);
  console.log(`REVISIÓN DE EMBEDS ACTIVOS EN DB (${items.length} items)`);
  console.log(`==================================================\n`);

  let countWithLessThan2 = 0;
  let countWith2OrMore = 0;

  for (const item of items) {
    const onlineVariants = item.videoVariants;
    const isUnder = onlineVariants.length < 2;
    if (isUnder) {
      countWithLessThan2++;
      const epInfo = item.season ? `S${item.season}E${item.episode || 1}` : "Pelicula";
      console.log(`⚠️  [${(item.mediaType || "N/A").toUpperCase()}] ${item.title} (${epInfo}, TMDB: ${item.tmdbId}) -> ${onlineVariants.length} embeds`);
      for (const v of onlineVariants) {
        console.log(`     - [${v.language}] ${v.quality} | ${v.sourceSite?.name || 'Unknown'} | ${v.videoUrl.substring(0, 75)}...`);
      }
    } else {
      countWith2OrMore++;
    }
  }

  console.log(`\n--------------------------------------------------`);
  console.log(`RESUMEN:`);
  console.log(`  Items con >= 2 embeds: ${countWith2OrMore}`);
  console.log(`  Items con < 2 embeds:  ${countWithLessThan2}`);
  console.log(`==================================================\n`);
}

main().catch(console.error);
