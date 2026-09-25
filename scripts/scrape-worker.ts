import { Worker, type WorkerOptions } from "bullmq";
import { prisma } from "../src/lib/prisma";
import {
  SCRAPE_GENERATED_LINK,
  SCRAPE_QUEUE_NAME,
  getRedisConnection,
} from "../src/lib/scrapeQueue";
import { runScrapeForGeneratedLink } from "../src/app/actions/generatorActions";

const connection = getRedisConnection();

if (!connection) {
  console.error("REDIS_URL is required to run the scrape worker.");
  process.exit(1);
}

const concurrency = Number(process.env.SCRAPE_WORKER_CONCURRENCY || 2);

const worker = new Worker(
  SCRAPE_QUEUE_NAME,
  async (job) => {
    if (job.name !== SCRAPE_GENERATED_LINK) {
      throw new Error(`Unsupported job: ${job.name}`);
    }

    const linkId = String(job.data.linkId || "");
    if (!linkId) throw new Error("Missing linkId.");

    const log = await prisma.refreshJobLog.create({
      data: {
        status: "RUNNING",
        message: `Queued scrape started for generated link ${linkId}.`,
      },
    });

    try {
      const result = await runScrapeForGeneratedLink(linkId);
      await prisma.refreshJobLog.update({
        where: { id: log.id },
        data: {
          status: result.success ? "COMPLETED" : "FAILED",
          finishedAt: new Date(),
          message: result.message || result.error || `Queued scrape finished for generated link ${linkId}.`,
        },
      });
      return result;
    } catch (error: any) {
      await prisma.refreshJobLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          message: error.message || `Queued scrape failed for generated link ${linkId}.`,
        },
      });
      throw error;
    }
  },
  { connection: connection as unknown as WorkerOptions["connection"], concurrency }
);

worker.on("completed", (job) => {
  console.log(`[scrape-worker] Completed ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`[scrape-worker] Failed ${job?.id}:`, error);
});

console.log(`[scrape-worker] Listening on ${SCRAPE_QUEUE_NAME} with concurrency ${concurrency}.`);
