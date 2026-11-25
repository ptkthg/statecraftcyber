CREATE TABLE "AiUsageLedger" (
  "id" TEXT PRIMARY KEY, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "model" TEXT NOT NULL, "purpose" TEXT NOT NULL, "itemKey" TEXT NOT NULL, "reservationId" TEXT,
  "inputTokens" INTEGER NOT NULL, "outputTokens" INTEGER NOT NULL,
  "cacheReadTokens" INTEGER NOT NULL, "cacheWriteTokens" INTEGER NOT NULL,
  "batch" BOOLEAN NOT NULL, "costUsd" DOUBLE PRECISION NOT NULL, "deduplicationKey" TEXT
);
CREATE UNIQUE INDEX "AiUsageLedger_deduplicationKey_key" ON "AiUsageLedger"("deduplicationKey");
CREATE INDEX "AiUsageLedger_occurredAt_idx" ON "AiUsageLedger"("occurredAt");
CREATE INDEX "AiUsageLedger_purpose_itemKey_idx" ON "AiUsageLedger"("purpose", "itemKey");
CREATE TABLE "AiReservation" (
  "id" TEXT PRIMARY KEY, "purpose" TEXT NOT NULL, "itemKey" TEXT NOT NULL,
  "periodStart" TEXT NOT NULL, "day" TEXT NOT NULL, "reservedUsd" DOUBLE PRECISION NOT NULL, "liabilityUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiReservation_state_periodStart_idx" ON "AiReservation"("state", "periodStart");
CREATE INDEX "AiReservation_purpose_itemKey_state_idx" ON "AiReservation"("purpose", "itemKey", "state");
CREATE TABLE "AiBatch" (
  "id" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "slugs" TEXT[] NOT NULL,
  "payload" JSONB NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3)
);
CREATE INDEX "AiBatch_type_state_idx" ON "AiBatch"("type", "state");
