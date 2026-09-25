import { prisma } from "../src/lib/prisma";
import { checkVideoAvailability } from "../src/services/videoAvailabilityService";

async function sweep() {
  console.log("=== INICIANDO BARRIDO DE VARIANTES EN DB ===");
  const variants = await prisma.videoVariant.findMany({
    where: { status: "ONLINE" },
    include: { mediaItem: true }
  });

  console.log(`Verificando ${variants.length} variantes ONLINE existentes...`);

  let offlineCount = 0;
  let onlineCount = 0;

  for (const v of variants) {
    try {
      const status = await checkVideoAvailability(v.videoUrl);
      if (status !== "ONLINE") {
        console.log(`[DEAD VARIANT] Marcando OFFLINE: ${v.videoUrl} (${v.mediaItem.title})`);
        await prisma.videoVariant.update({
          where: { id: v.id },
          data: { status: "OFFLINE" }
        });
        offlineCount++;
      } else {
        onlineCount++;
      }
    } catch (e: any) {
      console.warn(`Error al verificar ${v.videoUrl}:`, e.message);
    }
  }

  console.log(`\nBarrido completado: ${onlineCount} ONLINE verificadas, ${offlineCount} variantes caídas marcadas como OFFLINE.`);
}

sweep().catch(console.error).finally(() => prisma.$disconnect());
