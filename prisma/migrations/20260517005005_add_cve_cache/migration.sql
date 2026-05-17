-- CreateTable
CREATE TABLE "CveCache" (
    "id" TEXT NOT NULL,
    "published" TEXT NOT NULL,
    "lastModified" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cvssScore" DOUBLE PRECISION,
    "cvssVersion" TEXT NOT NULL DEFAULT '',
    "severity" TEXT,
    "epss" DOUBLE PRECISION,
    "epssPercentile" DOUBLE PRECISION,
    "inCisaKev" BOOLEAN NOT NULL DEFAULT false,
    "affectedProducts" TEXT[],
    "nvdUrl" TEXT NOT NULL,
    "vulnType" TEXT NOT NULL,
    "cweId" TEXT NOT NULL DEFAULT '',
    "vulnExplanation" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CveCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CveCache_severity_idx" ON "CveCache"("severity");

-- CreateIndex
CREATE INDEX "CveCache_inCisaKev_idx" ON "CveCache"("inCisaKev");

-- CreateIndex
CREATE INDEX "CveCache_fetchedAt_idx" ON "CveCache"("fetchedAt");
