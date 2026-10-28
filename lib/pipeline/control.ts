import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "./normalize";
import type { RawThreatItem } from "../threat-sources/types";
export async function requestReprocessing(
  db: PrismaClient,
  events: { id: string; revision: number }[],
  reason: string,
  legacy: RawThreatItem[] = [],
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "PipelineLease" (key,owner,"expiresAt") VALUES ('intelligence-v2','control',clock_timestamp()) ON CONFLICT (key) DO NOTHING`;
    const rows = await tx.$queryRaw<
      { active: boolean }[]
    >`SELECT "expiresAt">clock_timestamp() AS active FROM "PipelineLease" WHERE key='intelligence-v2' FOR UPDATE`;
    if (rows.some((row) => row.active))
      return { status: "busy" as const, count: 0 };
    const selected = await tx.intelligenceEvent.findMany({
      where: { OR: events.map((e) => ({ id: e.id, revision: e.revision })) },
      select: { id: true },
    });
    if (selected.length !== events.length)
      return { status: "conflict" as const, count: 0 };
    const run = await tx.pipelineRun.create({
      data: {
        idempotencyKey: "manual:" + randomUUID(),
        status: "reprocess_requested",
        finishedAt: new Date(),
        metrics: { events, reason, legacy: legacy.length },
        errors: [],
      },
    });
    for (const event of events)
      await tx.intelligenceEvent.update({
        where: { id: event.id },
        data: {
          status: "pending",
          attempts: 0,
          nextAttemptAt: null,
          lastErrorCode: null,
        },
      });
    if (legacy.length)
      await tx.collectionBatch.create({
        data: {
          runId: run.id,
          fingerprint: hash([run.id, legacy]),
          items: JSON.parse(JSON.stringify(legacy)) as Prisma.InputJsonValue,
        },
      });
    return {
      status: "queued" as const,
      count: events.length + legacy.length,
      runId: run.id,
    };
  });
}
