import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { isProduction, redisUrl } from "@/lib/config";

export const SCRAPE_QUEUE_NAME = "badrockplyr:scrape";
export const SCRAPE_GENERATED_LINK = "SCRAPE_GENERATED_LINK";

let connection: IORedis | null = null;
let queue: Queue | null = null;

export function isScrapeQueueEnabled() {
  return Boolean(redisUrl) && (process.env.SCRAPE_QUEUE_ENABLED === "true" || isProduction);
}

export function getRedisConnection() {
  if (!redisUrl) return null;
  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

export function getScrapeQueue() {
  if (!isScrapeQueueEnabled()) return null;
  const redis = getRedisConnection();
  if (!redis) return null;
  if (!queue) {
    queue = new Queue(SCRAPE_QUEUE_NAME, {
      connection: redis as unknown as QueueOptions["connection"],
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return queue;
}

export async function enqueueScrapeGeneratedLink(linkId: string) {
  const scrapeQueue = getScrapeQueue();
  if (!scrapeQueue) return null;

  return scrapeQueue.add(
    SCRAPE_GENERATED_LINK,
    { linkId },
    {
      jobId: `${SCRAPE_GENERATED_LINK}:${linkId}:${Date.now()}`,
    }
  );
}
