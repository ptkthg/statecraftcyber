-- CreateTable
CREATE TABLE "Ioc" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "sourceName" TEXT,
    "briefingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ioc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ioc_type_idx" ON "Ioc"("type");

-- CreateIndex
CREATE INDEX "Ioc_normalized_idx" ON "Ioc"("normalized");

-- CreateIndex
CREATE INDEX "Ioc_confidence_idx" ON "Ioc"("confidence");

-- CreateIndex
CREATE INDEX "Ioc_createdAt_idx" ON "Ioc"("createdAt");

-- CreateIndex
CREATE INDEX "Ioc_briefingId_idx" ON "Ioc"("briefingId");

-- CreateIndex
CREATE UNIQUE INDEX "Ioc_type_normalized_briefingId_key" ON "Ioc"("type", "normalized", "briefingId");

-- AddForeignKey
ALTER TABLE "Ioc" ADD CONSTRAINT "Ioc_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
