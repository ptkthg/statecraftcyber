-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "affectedSectors" TEXT[],
    "affectedRegions" TEXT[],
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePublishedAt" TIMESTAMP(3),
    "iocs" JSONB NOT NULL DEFAULT '[]',
    "cves" TEXT[],
    "mitreTechniques" TEXT[],
    "epssScore" DOUBLE PRECISION,
    "cvssScore" DOUBLE PRECISION,
    "confidence" "Confidence" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'draft',
    "contentHash" TEXT NOT NULL,
    "readingTime" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronLog" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "briefingsCreated" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[],
    "sources" TEXT[],
    "durationMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CronLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_slug_key" ON "Briefing"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_contentHash_key" ON "Briefing"("contentHash");

-- CreateIndex
CREATE INDEX "Briefing_status_severity_idx" ON "Briefing"("status", "severity");

-- CreateIndex
CREATE INDEX "Briefing_status_createdAt_idx" ON "Briefing"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Briefing_category_idx" ON "Briefing"("category");
