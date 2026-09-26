import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type TableName =
  | "MediaItem"
  | "SourceSite"
  | "GeneratedLink"
  | "SourceCandidate"
  | "VideoVariant"
  | "SubtitleTrack"
  | "ScrapeResult"
  | "SelectedPlayback"
  | "Setting"
  | "RefreshJobLog";

const sqlitePath = process.env.SQLITE_DATABASE_PATH || "dev.db";
const databaseUrl = process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set POSTGRES_DATABASE_URL (or DATABASE_URL) to the target PostgreSQL connection string.");
}

const tableOrder: TableName[] = [
  "MediaItem",
  "SourceSite",
  "GeneratedLink",
  "SourceCandidate",
  "VideoVariant",
  "SubtitleTrack",
  "ScrapeResult",
  "SelectedPlayback",
  "Setting",
  "RefreshJobLog",
];

const modelMap = {
  MediaItem: "mediaItem",
  SourceSite: "sourceSite",
  GeneratedLink: "generatedLink",
  SourceCandidate: "sourceCandidate",
  VideoVariant: "videoVariant",
  SubtitleTrack: "subtitleTrack",
  ScrapeResult: "scrapeResult",
  SelectedPlayback: "selectedPlayback",
  Setting: "setting",
  RefreshJobLog: "refreshJobLog",
} as const;

function toDate(value: unknown) {
  if (value === null || value === undefined) return value;
  return value instanceof Date ? value : new Date(String(value));
}

function normalizeRow(table: TableName, row: Record<string, unknown>) {
  const dateFields = new Set([
    "createdAt",
    "updatedAt",
    "scrapedAt",
    "selectedAt",
    "startedAt",
    "finishedAt",
  ]);

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (dateFields.has(key)) {
      normalized[key] = toDate(value);
    } else if (typeof value === "bigint") {
      normalized[key] = Number(value);
    } else {
      normalized[key] = value;
    }
  }

  if (table === "RefreshJobLog" && !normalized.finishedAt) {
    normalized.finishedAt = null;
  }

  return normalized;
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true });
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const table of tableOrder) {
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      const modelName = modelMap[table];
      const model = (prisma as any)[modelName];

      let migrated = 0;
      for (const row of rows) {
        await model.upsert({
          where: { id: row.id },
          update: normalizeRow(table, row),
          create: normalizeRow(table, row),
        });
        migrated++;
      }

      const postgresCount = await model.count();
      console.log(`${table}: sqlite=${rows.length} postgres=${postgresCount} migrated=${migrated}`);
      if (postgresCount < rows.length) {
        throw new Error(`PostgreSQL has fewer ${table} records than SQLite.`);
      }
    }
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
