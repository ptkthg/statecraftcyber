BEGIN;
-- AlterTable
ALTER TABLE "CveCache" ADD COLUMN     "analysisReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priorityRank" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "productSearch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "recordStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "sourceMetadata" JSONB;

-- CreateIndex
CREATE INDEX "CveCache_published_id_idx" ON "CveCache"("published" DESC, "id");

-- CreateIndex
CREATE INDEX "CveCache_cvssScore_id_idx" ON "CveCache"("cvssScore" DESC, "id");

-- CreateIndex
CREATE INDEX "CveCache_epss_id_idx" ON "CveCache"("epss" DESC, "id");

-- CreateIndex
CREATE INDEX "CveCache_priorityRank_published_id_idx" ON "CveCache"("priorityRank", "published" DESC, "id");

-- CreateIndex
CREATE INDEX "CveCache_analysisReady_published_idx" ON "CveCache"("analysisReady", "published" DESC);

UPDATE "CveCache" SET "productSearch"=replace(array_to_string("affectedProducts",' '),'_',' '),"priorityRank"=CASE WHEN "inCisaKev" THEN 0 WHEN "cvssScore">=9 AND epss>=0.1 THEN 1 WHEN "cvssScore">=7 OR epss>=0.1 THEN 2 WHEN "cvssScore" IS NOT NULL OR epss IS NOT NULL THEN 3 ELSE 4 END;
-- Keep legacy classification facets aligned with the corrected CWE mapping.
UPDATE "CveCache" SET "vulnType"='Validação de entrada' WHERE "cweId"='CWE-20';
UPDATE "CveCache" SET "vulnType"='Concorrência' WHERE "cweId"='CWE-362';
-- Only demonstrably source-bound legacy text is counted as available analysis.
UPDATE "CveCache" SET "analysisReady"=coalesce(
 "qualityReport"->>'policyVersion'='phase1-v1' AND "qualityReport"->>'publishable'='true'
 AND "qualityReport"->>'sourceDigest'=encode(sha256(convert_to(to_json(description)::text,'UTF8')),'hex')
 AND length(trim(coalesce("ptBrDescription",'')))>0 AND position("ptBrDescription" in description)>0
 AND (length(trim(coalesce(mitigation,'')))=0 OR position(mitigation in description)>0),false);
ALTER TABLE "CveCache" ADD CONSTRAINT "CveCache_priority_rank_check" CHECK ("priorityRank" BETWEEN 0 AND 4);
COMMIT;
