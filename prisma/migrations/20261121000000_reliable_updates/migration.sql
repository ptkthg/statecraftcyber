BEGIN;
ALTER TABLE "PipelineRun" ADD COLUMN "engine" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "PipelineRun" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'collect';
ALTER TABLE "PipelineRun" ADD COLUMN "workerAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "BriefingCandidate" (
  "key" TEXT PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "UpdateHealth" (
  "key" TEXT PRIMARY KEY,
  "lastAttemptAt" TIMESTAMP(3),
  "lastCollectionAt" TIMESTAMP(3),
  "lastPublicationAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'never_run',
  "runId" TEXT
);
CREATE TABLE "NewsArticleRecord" (
  "slug" TEXT PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NewsArticleRecord_publishedAt_idx" ON "NewsArticleRecord"("publishedAt" DESC);
COMMIT;
