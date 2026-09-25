import { prisma } from "../src/lib/prisma";
import { runScrapeForGeneratedLink } from "../src/app/actions/generatorActions";

async function run() {
  const items = await prisma.mediaItem.findMany({
    where: {
      title: { contains: "Chainsmoker" },
      episode: { in: [8, 12] }
    },
    include: { generatedLinks: true }
  });

  for (const it of items) {
    console.log("Targeted re-scrape:", it.title, "Ep", it.episode, "Link ID:", it.generatedLinks[0]?.id);
    if (it.generatedLinks[0]) {
      const res = await runScrapeForGeneratedLink(it.generatedLinks[0].id);
      console.log("Result for Ep", it.episode, ":", res);
    }
  }

  const updated = await prisma.videoVariant.findMany({
    where: {
      mediaItem: {
        title: { contains: "Chainsmoker" },
        episode: { in: [8, 12] }
      },
      status: "ONLINE"
    },
    include: { mediaItem: true }
  });

  console.log("Variants found for Ep 8 & 12:", updated.length);
  for (const v of updated) {
    console.log(`[Ep ${v.mediaItem.episode}] ${v.language} ${v.quality} -> ${v.videoUrl}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
