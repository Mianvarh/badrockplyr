/**
 * Ensure Minimum Embeds Continuous Loop Script
 * 
 * Verifies that every media item in the system has at least 2 functional, reproducible embeds.
 * Sweeps variants to mark dead streams OFFLINE, and automatically triggers expanded re-scraping
 * (with new sources and safety net fallback) for any title with < 2 active embeds.
 *
 * Usage:
 *   npx tsx scripts/ensure-minimum-embeds-loop.ts [--once] [--interval=120] [--target-min=2]
 */

import { prisma } from "../src/lib/prisma";
import { checkVideoAvailability } from "../src/services/videoAvailabilityService";
import { runScrapeForGeneratedLink } from "../src/app/actions/generatorActions";

// CLI arguments parsing
const args = process.argv.slice(2);
const runOnce = args.includes("--once");
const intervalArg = args.find(a => a.startsWith("--interval="));
const targetMinArg = args.find(a => a.startsWith("--target-min="));

const intervalSeconds = intervalArg ? Math.max(10, parseInt(intervalArg.split("=")[1], 10) || 120) : 120;
const targetMinEmbeds = targetMinArg ? Math.max(1, parseInt(targetMinArg.split("=")[1], 10) || 2) : 2;

let isShuttingDown = false;

process.on("SIGINT", () => {
  console.log("\n[LOOP] Señal de terminación recibida (SIGINT). Cerrando gracefully...");
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  console.log("\n[LOOP] Señal de terminación recibida (SIGTERM). Cerrando gracefully...");
  isShuttingDown = true;
});

async function sweepAndEnsureEmbeds(iteration: number) {
  const startedAt = new Date();
  console.log(`\n======================================================================`);
  console.log(`[LOOP # ${iteration}] INICIANDO BARRIDO Y GARANTÍA DE MÍNIMO ${targetMinEmbeds} EMBEDS`);
  console.log(`[LOOP # ${iteration}] Timestamp: ${startedAt.toISOString()}`);
  console.log(`======================================================================`);

  // 1. Fetch all MediaItems with their variants and generatedLinks
  const mediaItems = await prisma.mediaItem.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      videoVariants: {
        include: { sourceSite: true }
      },
      generatedLinks: true
    }
  });

  console.log(`[LOOP] Analizando ${mediaItems.length} títulos en la biblioteca...`);

  let deadVariantsCount = 0;
  let healthyVariantsCount = 0;
  let itemsBelowThreshold = 0;
  let itemsRestoredCount = 0;

  // 2. Health check of all currently marked ONLINE variants
  console.log(`\n--- FASE 1: Verificación de disponibilidad de links en vivo ---`);
  const allOnlineVariants: { item: typeof mediaItems[0]; variant: typeof mediaItems[0]["videoVariants"][0] }[] = [];
  for (const item of mediaItems) {
    for (const v of item.videoVariants.filter(x => x.status === "ONLINE")) {
      allOnlineVariants.push({ item, variant: v });
    }
  }

  console.log(`[LOOP] Verificando ${allOnlineVariants.length} variantes online concurrentemente (lotes de 6)...`);
  const BATCH_SIZE = 6;
  for (let i = 0; i < allOnlineVariants.length; i += BATCH_SIZE) {
    if (isShuttingDown) break;
    const batch = allOnlineVariants.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async ({ item, variant: v }) => {
      try {
        const liveStatus = await checkVideoAvailability(v.videoUrl);
        if (liveStatus !== "ONLINE") {
          console.log(`[CAÍDO] Marcando OFFLINE: ${v.sourceSite?.name || 'Unknown'} | "${item.title}" | ${v.videoUrl.substring(0, 70)}...`);
          await prisma.videoVariant.update({
            where: { id: v.id },
            data: { status: "OFFLINE" }
          });
          v.status = "OFFLINE";
          deadVariantsCount++;
        } else {
          healthyVariantsCount++;
        }
      } catch (err: any) {
        console.warn(`[CHECK ERROR] ${v.videoUrl}:`, err.message);
      }
    }));
  }

  // 3. Evaluate each MediaItem against targetMinEmbeds
  console.log(`\n--- FASE 2: Garantía de mínimo ${targetMinEmbeds} embeds reproducibles por video ---`);
  for (const item of mediaItems) {
    if (isShuttingDown) break;

    // Refresh active variants list after health-check
    const activeVariants = item.videoVariants.filter(v => v.status === "ONLINE");
    const count = activeVariants.length;

    const label = `[${(item.mediaType || "MEDIA").toUpperCase()}] "${item.title}" (TMDB: ${item.tmdbId}, S${item.season || "-"}E${item.episode || "-"})`;

    if (count < targetMinEmbeds) {
      itemsBelowThreshold++;
      console.log(`\n⚠️  ${label} tiene solo ${count} embeds activos (< ${targetMinEmbeds}).`);
      
      const link = item.generatedLinks[0];
      if (!link) {
        console.warn(`[SKIP] No se encontró GeneratedLink para ${label}. Omitiendo re-scrapeo.`);
        continue;
      }

      console.log(`🔄 Re-scrapeando con fuentes expandidas (MonosChinos, Cuevana, Pelis Juanita, VidLink, Videasy, etc.)...`);
      try {
        const scrapeResult = await runScrapeForGeneratedLink(link.id);
        console.log(`   Resultado: ${scrapeResult.success ? "Éxito" : "Aviso"} - ${scrapeResult.message || scrapeResult.error}`);

        // Re-check variants in database
        const updatedVariants = await prisma.videoVariant.findMany({
          where: { mediaItemId: item.id, status: "ONLINE" },
          include: { sourceSite: true }
        });

        if (updatedVariants.length >= targetMinEmbeds) {
          itemsRestoredCount++;
          console.log(`✅ ${label} RESTAURADO exitosamente: Ahora cuenta con ${updatedVariants.length} embeds funcionales:`);
          for (const uv of updatedVariants) {
            console.log(`    - [${uv.language}] ${uv.quality} | ${uv.sourceSite?.name || 'Fuente'} | ${uv.videoUrl.substring(0, 80)}...`);
          }
        } else {
          console.warn(`⚠️ ${label} luego de re-scrapeo tiene ${updatedVariants.length} embeds.`);
        }
      } catch (scrapeErr: any) {
        console.error(`❌ Error durante el re-scrapeo de ${label}:`, scrapeErr.message);
      }
    } else {
      console.log(`✔️  ${label}: Cumple con ${count} embeds activos.`);
    }
  }

  const finishedAt = new Date();
  const summaryMessage = `Iteración #${iteration} completada en ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)}s. ` +
    `Verificados: ${healthyVariantsCount} vivos, ${deadVariantsCount} caídos. ` +
    `Títulos con déficit: ${itemsBelowThreshold}, Restaurados: ${itemsRestoredCount}.`;

  console.log(`\n======================================================================`);
  console.log(`[RESUMEN CICLO #${iteration}] ${summaryMessage}`);
  console.log(`======================================================================\n`);

  // Log job to database
  try {
    await prisma.refreshJobLog.create({
      data: {
        startedAt,
        finishedAt,
        status: itemsBelowThreshold === itemsRestoredCount ? "COMPLETED" : "RUNNING",
        message: summaryMessage
      }
    });
  } catch (logErr) {
    // Ignore db logging error
  }
}

async function main() {
  console.log(`=== INICIANDO SERVICIO DE GARANTÍA DE EMBEDS EN BUCLE CONTINUO ===`);
  console.log(`Configuración: runOnce=${runOnce}, interval=${intervalSeconds}s, targetMinEmbeds=${targetMinEmbeds}`);

  let iteration = 1;

  while (!isShuttingDown) {
    try {
      await sweepAndEnsureEmbeds(iteration);
    } catch (loopErr: any) {
      console.error(`[CRITICAL ERROR] Error en iteración #${iteration}:`, loopErr);
    }

    if (runOnce || isShuttingDown) {
      console.log("[LOOP] Modo único completado o apagado solicitado. Finalizando proceso.");
      break;
    }

    iteration++;
    console.log(`[LOOP] Esperando ${intervalSeconds} segundos para el próximo ciclo de revisión...`);
    await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
