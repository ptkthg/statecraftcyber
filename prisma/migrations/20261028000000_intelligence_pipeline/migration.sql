BEGIN;
-- AlterTable
ALTER TABLE "Briefing" ADD COLUMN     "firstObservedAt" TIMESTAMP(3),
ADD COLUMN     "lastObservedAt" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Ioc" ADD COLUMN     "firstObservedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastObservedAt" TIMESTAMP(3),
ADD COLUMN     "pipelineManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "sourceLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "CronLog" ADD COLUMN     "metrics" JSONB,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "pipelineRunId" TEXT;

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineLease" (
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineLease_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IntelligenceEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "materialFingerprint" TEXT NOT NULL DEFAULT '',
    "processedFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "briefingId" TEXT,
    "relatedEventId" TEXT,

    CONSTRAINT "IntelligenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "legacyHash" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "materialFingerprint" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "effectiveIocs" JSONB NOT NULL DEFAULT '[]',
    "entities" JSONB NOT NULL,
    "qualityIssues" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourcePublishedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRevision" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "materialFingerprint" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "entities" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runId" TEXT NOT NULL,

    CONSTRAINT "SourceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingRevision" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "originalSources" JSONB NOT NULL,
    "changeSummary" JSONB NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionBatch" (
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_idempotencyKey_key" ON "PipelineRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PipelineRun_startedAt_idx" ON "PipelineRun"("startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceEvent_eventKey_key" ON "IntelligenceEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceEvent_briefingId_key" ON "IntelligenceEvent"("briefingId");

-- CreateIndex
CREATE INDEX "IntelligenceEvent_status_nextAttemptAt_idx" ON "IntelligenceEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_identityHash_key" ON "SourceRecord"("identityHash");

-- CreateIndex
CREATE INDEX "SourceRecord_eventId_idx" ON "SourceRecord"("eventId");

-- CreateIndex
CREATE INDEX "SourceRecord_legacyHash_idx" ON "SourceRecord"("legacyHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRevision_recordId_revision_key" ON "SourceRevision"("recordId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingRevision_briefingId_revision_key" ON "BriefingRevision"("briefingId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionBatch_fingerprint_key" ON "CollectionBatch"("fingerprint");

-- CreateIndex
CREATE INDEX "CollectionBatch_complete_createdAt_idx" ON "CollectionBatch"("complete", "createdAt");

-- AddForeignKey
ALTER TABLE "IntelligenceEvent" ADD CONSTRAINT "IntelligenceEvent_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceEvent" ADD CONSTRAINT "IntelligenceEvent_relatedEventId_fkey" FOREIGN KEY ("relatedEventId") REFERENCES "IntelligenceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "IntelligenceEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRevision" ADD CONSTRAINT "SourceRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "SourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRevision" ADD CONSTRAINT "SourceRevision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingRevision" ADD CONSTRAINT "BriefingRevision_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingRevision" ADD CONSTRAINT "BriefingRevision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionBatch" ADD CONSTRAINT "CollectionBatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SourceRecord" ADD COLUMN "matchEvidence" JSONB NOT NULL DEFAULT '{}';
-- Legacy creation time is the only defensible observation baseline; never fabricate a source update.
UPDATE "Briefing" SET "firstObservedAt"="createdAt", "lastObservedAt"="createdAt";
UPDATE "Ioc" SET "firstObservedAt"="createdAt", "lastObservedAt"="createdAt";
ALTER TABLE "IntelligenceEvent" ADD CONSTRAINT "event_revision_nonnegative" CHECK (revision>=0 AND attempts>=0), ADD CONSTRAINT "event_status_valid" CHECK (status IN ('pending','retry','quarantined','processed'));
ALTER TABLE "CollectionBatch" ADD CONSTRAINT "batch_cursor_valid" CHECK (jsonb_typeof(items)='array' AND cursor>=0 AND cursor<=jsonb_array_length(items));
-- Audit versions are append-only, even if application code attempts an accidental overwrite.
CREATE FUNCTION reject_intelligence_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Intelligence audit revisions are append-only'; END; $$;
CREATE TRIGGER source_revision_immutable BEFORE UPDATE OR DELETE ON "SourceRevision" FOR EACH ROW EXECUTE FUNCTION reject_intelligence_revision_mutation();
CREATE TRIGGER briefing_revision_immutable BEFORE UPDATE OR DELETE ON "BriefingRevision" FOR EACH ROW EXECUTE FUNCTION reject_intelligence_revision_mutation();
COMMIT;
