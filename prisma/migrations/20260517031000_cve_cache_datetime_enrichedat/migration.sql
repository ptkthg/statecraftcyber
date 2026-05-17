-- AlterTable: cast existing ISO-8601 strings to TIMESTAMP(3) in-place
ALTER TABLE "CveCache"
  ALTER COLUMN "published"    TYPE TIMESTAMP(3) USING "published"::timestamp,
  ALTER COLUMN "lastModified" TYPE TIMESTAMP(3) USING "lastModified"::timestamp,
  ADD COLUMN   "enrichedAt"   TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CveCache_enrichedAt_idx" ON "CveCache"("enrichedAt");
