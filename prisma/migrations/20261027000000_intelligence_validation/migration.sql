BEGIN;
-- Legacy content is retained, but must not imply validation that never occurred.
ALTER TABLE "Briefing"
  ADD COLUMN "analysisStatus" TEXT NOT NULL DEFAULT 'preliminary',
  ADD COLUMN "qualityReport" JSONB,
  ADD COLUMN "sourceSnapshot" JSONB,
  ADD COLUMN "operationalPriority" TEXT,
  ADD COLUMN "severityBasis" TEXT;
UPDATE "Briefing" SET status = 'draft' WHERE status = 'published';
CREATE INDEX "Briefing_status_analysisStatus_createdAt_idx" ON "Briefing"("status", "analysisStatus", "createdAt" DESC);
ALTER TABLE "Briefing" ADD COLUMN IF NOT EXISTS "structuredContent" JSONB;
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_publication_evidence_check" CHECK (
  status <> 'published' OR COALESCE((
    "analysisStatus" = 'validated'
    AND "qualityReport"->>'policyVersion' = 'phase1-v1'
    AND "qualityReport"->>'publishable' = 'true'
    AND jsonb_typeof("sourceSnapshot") = 'object'
    AND jsonb_typeof("structuredContent") = 'object'
    AND "qualityReport"->>'analysisStatus' = 'validated'
    AND jsonb_array_length("qualityReport"->'issues') = 0
    AND jsonb_array_length("qualityReport"->'sources') > 0
    AND confidence::text = "qualityReport"->'risk'->>'confidence'
    AND severity::text = "qualityReport"->'risk'->>'severity'
    AND ("cvssScore" IS NULL OR (cardinality(cves) > 0 AND "cvssScore" >= 0 AND "cvssScore" <= 10))
    AND ("epssScore" IS NULL OR (cardinality(cves) > 0 AND "epssScore" >= 0 AND "epssScore" <= 1))
  ), FALSE)
);

ALTER TABLE "NewsCache" ADD COLUMN "qualityReport" JSONB, ADD COLUMN "sourceSnapshot" JSONB, ADD COLUMN "sourcePublishedAt" TIMESTAMP(3);
ALTER TABLE "CveCache" ADD COLUMN "qualityReport" JSONB;

-- The structuredContent column is repaired above when absent from migration history.
COMMIT;
