CREATE TABLE "MediaItem" (
  "id" TEXT NOT NULL,
  "tmdbId" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "originalTitle" TEXT NOT NULL,
  "overview" TEXT NOT NULL,
  "posterPath" TEXT,
  "backdropPath" TEXT,
  "releaseYear" INTEGER,
  "firstAirYear" INTEGER,
  "genres" TEXT,
  "originalLanguage" TEXT,
  "season" INTEGER,
  "episode" INTEGER,
  "episodeTitle" TEXT,
  "episodeOverview" TEXT,
  "episodeStillPath" TEXT,
  "airDate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedLink" (
  "id" TEXT NOT NULL,
  "mediaItemId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "tmdbId" TEXT NOT NULL,
  "season" INTEGER,
  "episode" INTEGER,
  "playerUrl" TEXT NOT NULL,
  "collectorUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceSite" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "allowedDomain" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "searchMode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "usePlaywright" BOOLEAN NOT NULL DEFAULT false,
  "videoSelector" TEXT,
  "videoAttribute" TEXT,
  "qualitySelector" TEXT,
  "qualityAttribute" TEXT,
  "languageSelector" TEXT,
  "languageAttribute" TEXT,
  "tmdbSelector" TEXT,
  "tmdbAttribute" TEXT,
  "subtitleSelector" TEXT,
  "subtitleAttribute" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceCandidate" (
  "id" TEXT NOT NULL,
  "mediaItemId" TEXT NOT NULL,
  "sourceSiteId" TEXT NOT NULL,
  "candidateUrl" TEXT NOT NULL,
  "matchTitle" TEXT,
  "matchYear" INTEGER,
  "matchTmdbId" TEXT,
  "matchScore" DOUBLE PRECISION,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoVariant" (
  "id" TEXT NOT NULL,
  "mediaItemId" TEXT NOT NULL,
  "sourceSiteId" TEXT NOT NULL,
  "candidateUrl" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "quality" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubtitleTrack" (
  "id" TEXT NOT NULL,
  "videoVariantId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "label" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubtitleTrack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScrapeResult" (
  "id" TEXT NOT NULL,
  "mediaItemId" TEXT NOT NULL,
  "sourceSiteId" TEXT NOT NULL,
  "candidateUrl" TEXT NOT NULL,
  "found" BOOLEAN NOT NULL,
  "message" TEXT,
  "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScrapeResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SelectedPlayback" (
  "id" TEXT NOT NULL,
  "mediaItemId" TEXT NOT NULL,
  "videoVariantId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "quality" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelectedPlayback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshJobLog" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "message" TEXT,
  CONSTRAINT "RefreshJobLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SelectedPlayback_mediaItemId_key" ON "SelectedPlayback"("mediaItemId");
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
CREATE INDEX "MediaItem_tmdbId_mediaType_season_episode_idx" ON "MediaItem"("tmdbId", "mediaType", "season", "episode");
CREATE INDEX "MediaItem_createdAt_idx" ON "MediaItem"("createdAt");
CREATE INDEX "GeneratedLink_tmdbId_type_season_episode_idx" ON "GeneratedLink"("tmdbId", "type", "season", "episode");
CREATE INDEX "GeneratedLink_mediaItemId_idx" ON "GeneratedLink"("mediaItemId");
CREATE INDEX "GeneratedLink_createdAt_idx" ON "GeneratedLink"("createdAt");
CREATE INDEX "SourceSite_active_priority_idx" ON "SourceSite"("active", "priority");
CREATE INDEX "SourceSite_allowedDomain_idx" ON "SourceSite"("allowedDomain");
CREATE INDEX "SourceCandidate_mediaItemId_status_idx" ON "SourceCandidate"("mediaItemId", "status");
CREATE INDEX "SourceCandidate_sourceSiteId_idx" ON "SourceCandidate"("sourceSiteId");
CREATE INDEX "VideoVariant_mediaItemId_status_isSelected_idx" ON "VideoVariant"("mediaItemId", "status", "isSelected");
CREATE INDEX "VideoVariant_sourceSiteId_idx" ON "VideoVariant"("sourceSiteId");
CREATE INDEX "VideoVariant_sortOrder_idx" ON "VideoVariant"("sortOrder");
CREATE INDEX "SubtitleTrack_videoVariantId_idx" ON "SubtitleTrack"("videoVariantId");
CREATE INDEX "ScrapeResult_mediaItemId_idx" ON "ScrapeResult"("mediaItemId");
CREATE INDEX "ScrapeResult_sourceSiteId_idx" ON "ScrapeResult"("sourceSiteId");
CREATE INDEX "ScrapeResult_scrapedAt_idx" ON "ScrapeResult"("scrapedAt");
CREATE INDEX "RefreshJobLog_startedAt_idx" ON "RefreshJobLog"("startedAt");
CREATE INDEX "RefreshJobLog_status_idx" ON "RefreshJobLog"("status");

ALTER TABLE "GeneratedLink" ADD CONSTRAINT "GeneratedLink_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceCandidate" ADD CONSTRAINT "SourceCandidate_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceCandidate" ADD CONSTRAINT "SourceCandidate_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "SourceSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoVariant" ADD CONSTRAINT "VideoVariant_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoVariant" ADD CONSTRAINT "VideoVariant_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "SourceSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubtitleTrack" ADD CONSTRAINT "SubtitleTrack_videoVariantId_fkey" FOREIGN KEY ("videoVariantId") REFERENCES "VideoVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrapeResult" ADD CONSTRAINT "ScrapeResult_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrapeResult" ADD CONSTRAINT "ScrapeResult_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "SourceSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SelectedPlayback" ADD CONSTRAINT "SelectedPlayback_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SelectedPlayback" ADD CONSTRAINT "SelectedPlayback_videoVariantId_fkey" FOREIGN KEY ("videoVariantId") REFERENCES "VideoVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
