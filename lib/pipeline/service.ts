import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type SourceRecord } from "@prisma/client";
import { generateBriefingAsync } from "../briefing-generator";
import { generateContentHash } from "../deduplication";
import { publicationStatus } from "../intelligence/validation";
import type { RawIOC, RawThreatItem } from "../threat-sources/types";
import { chooseMatch, eventKey } from "./dedup";
import {
  hash,
  indicatorDelta,
  indicatorKey,
  materialFingerprint,
  normalizeIndicators,
  prepareRecord,
  type EventProfile,
} from "./normalize";
import {
  currentContext,
  emptyMetrics,
  errorCode,
  remainingMs,
  Semaphore,
  withPipeline,
} from "./context";

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export const LEASE_KEY = "intelligence-v2";
export class LostLease extends Error {
  constructor() {
    super("pipeline_lease_lost");
  }
}
export async function fence(tx: Tx, owner: string) {
  const rows = await tx.$queryRaw<
    { owner: string }[]
  >`SELECT owner FROM "PipelineLease" WHERE key=${LEASE_KEY} AND owner=${owner} AND "expiresAt">clock_timestamp() FOR UPDATE`;
  if (!rows.length) throw new LostLease();
}
function restore(value: unknown): RawThreatItem {
  const raw = value as RawThreatItem;
  return {
    ...raw,
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : undefined,
    sourceUpdatedAt: raw.sourceUpdatedAt
      ? new Date(raw.sourceUpdatedAt)
      : undefined,
  };
}
export function needsEnrichment(raw: RawThreatItem) {
  return (
    (raw.description?.trim().length ?? 0) >= 80 &&
    raw.descriptionOrigin !== "generated"
  );
}
export function nextRetry(attempt: number, now = new Date()) {
  return attempt >= 3
    ? null
    : new Date(now.getTime() + 60000 * 2 ** (attempt - 1));
}
export async function observe(
  db: PrismaClient,
  item: RawThreatItem,
  runId: string,
  owner: string,
  now = new Date(),
  batch?: { id: string; cursor: number; total: number; firstObservedAt: Date },
) {
  const p = prepareRecord(item, now),
    metrics = currentContext()?.metrics;
  return db.$transaction(
    async (tx) => {
      await fence(tx, owner);
      const old = await tx.sourceRecord.findUnique({
        where: { identityHash: p.identityHash },
      });
      const newerUpstream =
        !!p.raw.sourceUpdatedAt &&
        (!old?.sourceUpdatedAt || p.raw.sourceUpdatedAt > old.sourceUpdatedAt);
      const stale =
        old &&
        ((p.raw.sourceUpdatedAt &&
          old.sourceUpdatedAt &&
          p.raw.sourceUpdatedAt < old.sourceUpdatedAt) ||
          (now < old.lastObservedAt && !newerUpstream));
      if (stale) {
        // The original late snapshot remains in CollectionBatch for audit; it cannot roll back live state.
        if (batch)
          await tx.collectionBatch.update({
            where: { id: batch.id },
            data: {
              cursor: batch.cursor + 1,
              complete: batch.cursor + 1 >= batch.total,
            },
          });
        if (metrics) {
          metrics.observed++;
          metrics.unchanged++;
        }
        return {
          eventId: old.eventId,
          changed: false,
          materialChanged: false,
          delta: indicatorDelta(
            old.effectiveIocs as unknown as RawIOC[],
            [],
            false,
          ),
          matchRule: "stale-observation",
        };
      }
      const delta = indicatorDelta(
        (old?.effectiveIocs ?? []) as unknown as RawIOC[],
        p.raw.iocs ?? [],
        p.raw.iocSetComplete === true,
      );
      const fingerprint = hash([
        materialFingerprint(p.raw, delta.effective),
        p.issues,
      ]);
      let event = old
        ? await tx.intelligenceEvent.findUniqueOrThrow({
            where: { id: old.eventId },
          })
        : null;
      let matchRule = "source-identity";
      if (!event) {
        const key = eventKey(p.profile, p.identityHash);
        event = await tx.intelligenceEvent.findUnique({
          where: { eventKey: key },
        });
        const candidates = event
          ? []
          : await tx.intelligenceEvent.findMany({
              where: {
                lastObservedAt: { gte: new Date(now.getTime() - 7 * 86400000) },
              },
              select: { id: true, profile: true },
            });
        const decision = chooseMatch(
          p.profile,
          candidates.map((c) => ({
            id: c.id,
            profile: c.profile as unknown as EventProfile,
          })),
        );
        if (!event && decision.match)
          event = await tx.intelligenceEvent.findUniqueOrThrow({
            where: { id: decision.match.id },
          });
        matchRule = event
          ? (decision.match?.decision.rule ?? "canonical-identity")
          : decision.rule;
        if (!event) {
          // Adopt existing content without changing its URL; do not recreate legacy articles.
          const legacy = await tx.briefing.findFirst({
            where: {
              contentHash: generateContentHash(item),
              pipelineEvent: { is: null },
            },
            select: { id: true },
          });
          event = await tx.intelligenceEvent.create({
            data: {
              eventKey: key,
              profile: json(p.profile),
              firstObservedAt: batch?.firstObservedAt ?? now,
              lastObservedAt: now,
              briefingId: legacy?.id,
              relatedEventId: decision.related?.id,
            },
          });
          if (metrics) metrics.eventsCreated++;
        } else if (metrics) metrics.deduplicated++;
      }
      const changed = !old || old.sourceFingerprint !== p.sourceFingerprint;
      const materialChanged = !old || old.materialFingerprint !== fingerprint;
      const sourceData = {
        matchEvidence: json(
          old?.matchEvidence ?? {
            rule: matchRule,
            profile: p.profile,
            relatedEventId: event.relatedEventId,
          },
        ),
        sourceFingerprint: p.sourceFingerprint,
        materialFingerprint: fingerprint,
        rawPayload: json(item),
        effectiveIocs: json(delta.effective),
        entities: json(p.entities),
        qualityIssues: json(p.issues),
        lastObservedAt:
          old && old.lastObservedAt > now ? old.lastObservedAt : now,
        sourcePublishedAt: p.profile.publishedAt
          ? new Date(p.profile.publishedAt)
          : null,
        sourceUpdatedAt:
          p.raw.sourceUpdatedAt && Number.isFinite(+p.raw.sourceUpdatedAt)
            ? p.raw.sourceUpdatedAt
            : null,
      };
      const record = old
        ? await tx.sourceRecord.update({
            where: { id: old.id },
            data: changed
              ? { ...sourceData, revision: { increment: 1 } }
              : { lastObservedAt: now },
          })
        : await tx.sourceRecord.create({
            data: {
              ...sourceData,
              identityHash: p.identityHash,
              legacyHash: generateContentHash(item),
              externalId: item.externalId || p.identityHash,
              sourceName: item.sourceName || "unknown",
              sourceUrl: item.sourceUrl || "",
              eventId: event.id,
              firstObservedAt: batch?.firstObservedAt ?? now,
            },
          });
      if (changed)
        await tx.sourceRevision.create({
          data: {
            recordId: record.id,
            revision: record.revision,
            materialFingerprint: fingerprint,
            rawPayload: json(item),
            entities: json(p.entities),
            observedAt: now,
            runId,
          },
        });
      const records = await tx.sourceRecord.findMany({
        where: { eventId: event.id },
        select: { materialFingerprint: true },
      });
      const combined = hash(
        [...new Set(records.map((r) => r.materialFingerprint))].sort(),
      );
      await tx.intelligenceEvent.update({
        where: { id: event.id },
        data: {
          lastObservedAt:
            event.lastObservedAt > now ? event.lastObservedAt : now,
          ...(materialChanged
            ? {
                materialFingerprint: combined,
                revision: { increment: 1 },
                status: "pending",
                attempts: 0,
                nextAttemptAt: null,
                lastErrorCode: null,
              }
            : {}),
        },
      });
      if (event.briefingId) {
        const previous = await tx.briefing.findUniqueOrThrow({
          where: { id: event.briefingId },
        });
        if (
          materialChanged &&
          !(await tx.briefingRevision.findUnique({
            where: {
              briefingId_revision: {
                briefingId: previous.id,
                revision: previous.revision,
              },
            },
          }))
        )
          await tx.briefingRevision.create({
            data: {
              briefingId: previous.id,
              revision: previous.revision,
              snapshot: json(previous),
              originalSources: json(previous.sourceSnapshot ?? {}),
              changeSummary: { kind: "pre-update-baseline" },
              runId,
            },
          });
        const sourceUpdatedAt =
          sourceData.sourceUpdatedAt &&
          (!previous.sourceUpdatedAt ||
            sourceData.sourceUpdatedAt > previous.sourceUpdatedAt)
            ? sourceData.sourceUpdatedAt
            : previous.sourceUpdatedAt;
        await tx.briefing.update({
          where: { id: event.briefingId },
          data: {
            lastObservedAt:
              previous.lastObservedAt && previous.lastObservedAt > now
                ? previous.lastObservedAt
                : now,
            sourceUpdatedAt,
            updatedAt: previous.updatedAt,
            ...(materialChanged ? { status: "draft" as const } : {}),
          },
        });
        // Only incoming indicators are observed now; a retained partial-set member is not a new sighting.
        for (const ioc of p.raw.iocs ?? []) {
          const key = indicatorKey(ioc)!;
          await tx.ioc.updateMany({
            where: {
              briefingId: event.briefingId,
              type: ioc.type,
              normalized: key.slice(key.indexOf(":") + 1),
              OR: [{ lastObservedAt: null }, { lastObservedAt: { lte: now } }],
            },
            data: {
              lastObservedAt: now,
              ...(ioc.lastSeen && Number.isFinite(Date.parse(ioc.lastSeen))
                ? { sourceLastSeenAt: new Date(ioc.lastSeen) }
                : {}),
            },
          });
        }
      }
      if (batch)
        await tx.collectionBatch.update({
          where: { id: batch.id },
          data: {
            cursor: batch.cursor + 1,
            complete: batch.cursor + 1 >= batch.total,
          },
        });
      if (metrics) {
        metrics.observed++;
        if (!materialChanged) metrics.unchanged++;
      }
      return { eventId: event.id, changed, materialChanged, delta, matchRule };
    },
    { timeout: 15000 },
  );
}
export function compose(records: SourceRecord[]) {
  // A contradictory contributor cannot silently disappear from an otherwise publishable assessment.
  if (
    records.some((r) =>
      (r.qualityIssues as unknown as { severity: string }[]).some(
        (i) => i.severity === "error",
      ),
    )
  )
    return null;
  const valid = records.filter(
    (r) =>
      !(r.qualityIssues as unknown as { severity: string }[]).some(
        (i) => i.severity === "error",
      ),
  );
  const ordered = [...valid].sort(
    (a, b) =>
      Number(b.sourceName === "NVD") - Number(a.sourceName === "NVD") ||
      ((b.rawPayload as unknown as RawThreatItem).description?.length ?? 0) -
        ((a.rawPayload as unknown as RawThreatItem).description?.length ?? 0) ||
      a.id.localeCompare(b.id),
  );
  if (!ordered.length) return null;
  const primary = restore(ordered[0].rawPayload);
  const raw = {
    ...primary,
    iocs: normalizeIndicators(
      valid.flatMap((r) => r.effectiveIocs as unknown as RawIOC[]),
    ),
    inCisaKev: valid.some(
      (r) => (r.rawPayload as unknown as RawThreatItem).inCisaKev,
    ),
    evidenceSources: [
      ...(primary.evidenceSources ?? []),
      ...ordered.slice(1).map((r) => ({
        id: "record-" + r.id,
        name: r.sourceName,
        url: r.sourceUrl,
        text: (r.rawPayload as unknown as RawThreatItem).description,
        retrievedAt: r.lastObservedAt.toISOString(),
        origin: "original" as const,
      })),
    ],
  };
  return raw;
}
export async function processEvent(
  db: PrismaClient,
  eventId: string,
  runId: string,
  owner: string,
  autoPublish: boolean,
  generator = generateBriefingAsync,
) {
  const event = await db.intelligenceEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { records: true, briefing: true },
  });
  const raw = compose(event.records),
    metrics = currentContext()?.metrics;
  if (!raw || !needsEnrichment(raw)) {
    await db.$transaction(async (tx) => {
      await fence(tx, owner);
      await tx.intelligenceEvent.updateMany({
        where: { id: event.id, revision: event.revision },
        data: {
          status: "quarantined",
          lastErrorCode: "insufficient_source_evidence",
          nextAttemptAt: null,
        },
      });
    });
    if (metrics) metrics.rejected++;
    return;
  }
  try {
    const slugs = new Set(
      (await db.briefing.findMany({ select: { slug: true } })).map(
        (r) => r.slug,
      ),
    );
    const briefing = await generator(raw, slugs);
    if (metrics) metrics.generated++;
    const failure = currentContext()?.lastAiFailure;
    if (currentContext()) currentContext()!.lastAiFailure = undefined;
    if (failure && !briefing.structuredContent)
      throw Object.assign(new Error(failure), { code: failure });
    await db
      .$transaction(
        async (tx) => {
          await fence(tx, owner);
          const locked = await tx.intelligenceEvent.updateMany({
            where: {
              id: event.id,
              revision: event.revision,
              materialFingerprint: event.materialFingerprint,
            },
            data: {
              status: "processed",
              processedFingerprint: event.materialFingerprint,
              attempts: 0,
              nextAttemptAt: null,
              lastErrorCode: null,
            },
          });
          if (!locked.count) throw new Error("stale_generation");
          const previous = event.briefingId
            ? await tx.briefing.findUniqueOrThrow({
                where: { id: event.briefingId },
              })
            : null;
          if (
            previous &&
            !(await tx.briefingRevision.findUnique({
              where: {
                briefingId_revision: {
                  briefingId: previous.id,
                  revision: previous.revision,
                },
              },
            }))
          )
            await tx.briefingRevision.create({
              data: {
                briefingId: previous.id,
                revision: previous.revision,
                snapshot: json(previous),
                originalSources: json(previous.sourceSnapshot ?? {}),
                changeSummary: { kind: "legacy-baseline" },
                runId,
              },
            });
          const revision = (previous?.revision ?? 0) + 1;
          const sourceUpdatedAt = event.records.reduce<Date | null>(
            (max, r) =>
              r.sourceUpdatedAt && (!max || r.sourceUpdatedAt > max)
                ? r.sourceUpdatedAt
                : max,
            null,
          );
          const data = {
            title: briefing.title,
            slug: previous?.slug ?? briefing.slug,
            summary: briefing.summary,
            content: briefing.content,
            structuredContent: briefing.structuredContent
              ? json(briefing.structuredContent)
              : Prisma.DbNull,
            severity: briefing.severity,
            category: briefing.category,
            tags: briefing.tags,
            affectedSectors: briefing.affectedSectors,
            affectedRegions: briefing.affectedRegions,
            sourceName: briefing.sourceName,
            sourceUrl: briefing.sourceUrl,
            sourcePublishedAt: briefing.sourcePublishedAt,
            cves: briefing.cves,
            mitreTechniques: briefing.mitreTechniques,
            epssScore: briefing.epssScore ?? null,
            cvssScore: briefing.cvssScore ?? null,
            confidence: briefing.confidence,
            status: publicationStatus(autoPublish, briefing.qualityReport),
            analysisStatus: briefing.analysisStatus,
            qualityReport: json(briefing.qualityReport),
            sourceSnapshot: json(briefing.sourceSnapshot),
            operationalPriority: briefing.operationalPriority,
            severityBasis: briefing.severityBasis,
            contentHash:
              previous?.contentHash ?? hash(["pipeline-event", event.eventKey]),
            readingTime: briefing.readingTime,
            firstObservedAt:
              previous?.firstObservedAt ??
              previous?.createdAt ??
              event.firstObservedAt,
            lastObservedAt: event.lastObservedAt,
            sourceUpdatedAt,
            revision,
          };
          const saved = previous
            ? await tx.briefing.update({ where: { id: previous.id }, data })
            : await tx.briefing.create({ data });
          const inventory = await tx.ioc.findMany({
            where: { briefingId: saved.id },
          });
          const active = new Set<string>(),
            added: string[] = [],
            removed: string[] = [];
          for (const ioc of raw.iocs ?? []) {
            const key = indicatorKey(ioc);
            if (!key) continue;
            active.add(key);
            const normalized = key.slice(key.indexOf(":") + 1),
              old = inventory.find(
                (i) => i.type === ioc.type && i.normalized === normalized,
              );
            const providers = event.records.filter((r) =>
              (r.effectiveIocs as unknown as RawIOC[]).some(
                (i) => indicatorKey(i) === key,
              ),
            );
            const sightings = event.records.filter((r) =>
              ((r.rawPayload as unknown as RawThreatItem).iocs ?? []).some(
                (i) => indicatorKey(i) === key,
              ),
            );
            const lastObservedAt = sightings.reduce(
              (max, r) => (r.lastObservedAt > max ? r.lastObservedAt : max),
              old?.lastObservedAt ?? event.firstObservedAt,
            );
            const firstObservedAt =
              old?.firstObservedAt ??
              old?.createdAt ??
              providers.reduce(
                (min, r) => (r.firstObservedAt < min ? r.firstObservedAt : min),
                event.lastObservedAt,
              );
            const date = ioc.lastSeen ? new Date(ioc.lastSeen) : null;
            const fields = {
              value: ioc.value,
              confidence: ioc.confidence,
              sourceName: ioc.source,
              sourceUrl:
                ioc.sourceUrl ?? providers[0]?.sourceUrl ?? raw.sourceUrl,
              lastObservedAt,
              firstObservedAt,
              sourceLastSeenAt: date && Number.isFinite(+date) ? date : null,
              pipelineManaged: true,
              isActive: true,
              retiredAt: null,
            };
            await tx.ioc.upsert({
              where: {
                type_normalized_briefingId: {
                  type: ioc.type,
                  normalized,
                  briefingId: saved.id,
                },
              },
              update: fields,
              create: {
                ...fields,
                type: ioc.type,
                normalized,
                briefingId: saved.id,
              },
            });
            if (!old?.isActive) added.push(key);
          }
          // A legacy baseline has unknown completeness: retain unaccounted indicators until explicitly reviewed.
          const complete = !previous || previous.revision > 0;
          for (const old of inventory)
            if (
              old.pipelineManaged &&
              old.isActive &&
              !active.has(old.type + ":" + old.normalized)
            ) {
              await tx.ioc.update({
                where: { id: old.id },
                data: { isActive: false, retiredAt: event.lastObservedAt },
              });
              removed.push(old.type + ":" + old.normalized);
            }
          await tx.briefingRevision.create({
            data: {
              briefingId: saved.id,
              revision,
              snapshot: json(saved),
              originalSources: json(
                event.records.map((r) => ({
                  recordId: r.id,
                  revision: r.revision,
                  raw: r.rawPayload,
                  issues: r.qualityIssues,
                  entities: r.entities,
                })),
              ),
              changeSummary: json({
                added,
                removed,
                legacyCompletenessUnknown: !complete,
                relatedEventId: event.relatedEventId,
              }),
              runId,
            },
          });
          await tx.intelligenceEvent.update({
            where: { id: event.id },
            data: { briefingId: saved.id },
          });
          return { added: added.length, removed: removed.length };
        },
        { timeout: Math.max(1000, Math.min(15000, remainingMs() - 1000)) },
      )
      .then((delta) => {
        if (metrics) {
          metrics[event.briefingId ? "updated" : "created"]++;
          metrics.indicatorsAdded += delta.added;
          metrics.indicatorsRemoved += delta.removed;
          if (!briefing.qualityReport.publishable) metrics.rejected++;
        }
      });
  } catch (error) {
    if (error instanceof LostLease) throw error;
    if ((error as Error).message === "stale_generation") {
      if (metrics) metrics.deferred++;
      return;
    }
    const attempts = event.attempts + 1,
      next = nextRetry(attempts),
      code = (error as { code?: string }).code ?? errorCode(error);
    await db.$transaction(async (tx) => {
      await fence(tx, owner);
      await tx.intelligenceEvent.updateMany({
        where: { id: event.id, revision: event.revision },
        data: {
          attempts,
          nextAttemptAt: next,
          status: next ? "retry" : "quarantined",
          lastErrorCode: code,
        },
      });
    });
    if (metrics) metrics.failures++;
  }
}
export interface RunOptions {
  idempotencyKey: string;
  max: number;
  autoPublish: boolean;
  budgetMs?: number;
  collect: () => Promise<{
    items: RawThreatItem[];
    errors: { source: string; error: string }[];
    sources: string[];
  }>;
  generate?: typeof generateBriefingAsync;
}
export async function runPipeline(db: PrismaClient, options: RunOptions) {
  const owner = randomUUID(),
    started = Date.now(),
    budget = Math.min(52000, options.budgetMs ?? 52000),
    metrics = emptyMetrics();
  const acquired = await db.$queryRaw<
    { owner: string }[]
  >`INSERT INTO "PipelineLease" (key,owner,"expiresAt") VALUES (${LEASE_KEY},${owner},clock_timestamp()+interval '55 seconds') ON CONFLICT (key) DO UPDATE SET owner=EXCLUDED.owner,"expiresAt"=EXCLUDED."expiresAt" WHERE "PipelineLease"."expiresAt"<clock_timestamp() RETURNING owner`;
  if (!acquired.length) return { status: "busy", metrics };
  let runId: string | undefined;
  const errors: string[] = [];
  try {
    await db.pipelineRun.updateMany({
      where: {
        status: "running",
        idempotencyKey: { not: options.idempotencyKey },
      },
      data: {
        status: "abandoned",
        finishedAt: new Date(),
        errors: ["lease_expired"],
      },
    });
    const previous = await db.pipelineRun.findUnique({
      where: { idempotencyKey: options.idempotencyKey },
    });
    if (previous && previous.status !== "running")
      return {
        status: "replayed",
        runId: previous.id,
        metrics: previous.metrics,
      };
    const run = previous
      ? await db.pipelineRun.update({
          where: { id: previous.id },
          data: { startedAt: new Date(), finishedAt: null },
        })
      : await db.pipelineRun.create({
          data: { idempotencyKey: options.idempotencyKey },
        });
    runId = run.id;
    let status = "success";
    await withPipeline(
      { metrics, deadlineAt: started + budget, network: new Semaphore(4) },
      async () => {
        try {
          const context = currentContext()!;
          const collected = await withPipeline(
            {
              ...context,
              deadlineAt: Math.min(context.deadlineAt, Date.now() + 22000),
            },
            options.collect,
          );
          metrics.collected = collected.items.length;
          if (collected.items.length) {
            const fingerprint = hash(
              collected.items
                .map((item) => prepareRecord(item).sourceFingerprint)
                .sort(),
            );
            const batch = await db.collectionBatch.findUnique({
              where: { fingerprint },
            });
            await db.collectionBatch.upsert({
              where: { fingerprint },
              create: {
                runId: run.id,
                fingerprint,
                items: json(collected.items),
              },
              update: {
                observedAt: new Date(),
                ...(batch?.complete
                  ? {
                      cursor: 0,
                      complete: false,
                      createdAt: new Date(),
                      items: json(collected.items),
                    }
                  : {}),
              },
            });
          }
          errors.push(...collected.errors.map((e) => e.source + ":" + e.error));
          const batches = await db.collectionBatch.findMany({
            where: { complete: false },
            orderBy: { createdAt: "asc" },
            take: 10,
          });
          for (const batch of batches) {
            const items = batch.items as unknown as RawThreatItem[];
            for (let cursor = batch.cursor; cursor < items.length; cursor++) {
              if (remainingMs() < 14000) {
                metrics.deferred += items.length - cursor;
                break;
              }
              try {
                await observe(
                  db,
                  restore(items[cursor]),
                  run.id,
                  owner,
                  batch.observedAt,
                  {
                    id: batch.id,
                    cursor,
                    total: items.length,
                    firstObservedAt: batch.createdAt,
                  },
                );
              } catch (e) {
                if (e instanceof LostLease) throw e;
                metrics.failures++;
                errors.push("observation:" + errorCode(e));
                break;
              }
            }
          }
          const queue = await db.intelligenceEvent.findMany({
            where: {
              status: { in: ["pending", "retry"] },
              OR: [
                { nextAttemptAt: null },
                { nextAttemptAt: { lte: new Date() } },
              ],
            },
            orderBy: { firstObservedAt: "asc" },
            take: Math.max(1, Math.min(5, options.max)),
            select: { id: true },
          });
          for (const event of queue) {
            if (remainingMs() < 12000) break;
            await processEvent(
              db,
              event.id,
              run.id,
              owner,
              options.autoPublish,
              options.generate,
            );
          }
          metrics.deferred += await db.intelligenceEvent.count({
            where: { status: { in: ["pending", "retry"] } },
          });
          for (const metric of Object.values(metrics.sources))
            if (
              ["failed", "partial"].includes(metric.status) &&
              !errors.some((e) => e.startsWith(metric.name + ":"))
            )
              errors.push(
                metric.name + ":" + (metric.codes.join(",") || metric.status),
              );
          if (errors.length || metrics.failures)
            status =
              collected.items.length ||
              metrics.created ||
              metrics.updated ||
              Object.values(metrics.sources).some((m) => m.status === "success")
                ? "partial"
                : "failed";
        } catch (e) {
          status = "failed";
          errors.push(errorCode(e));
        }
      },
    );
    await db.$transaction(async (tx) => {
      await fence(tx, owner);
      await tx.pipelineRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          metrics: json(metrics),
          errors: json(errors),
        },
      });
      await tx.cronLog.create({
        data: {
          success: status === "success",
          outcome: status,
          pipelineRunId: run.id,
          metrics: json(metrics),
          briefingsCreated: metrics.created,
          errors,
          sources: Object.keys(metrics.sources),
          durationMs: Date.now() - started,
        },
      });
    });
    return { status, runId: run.id, metrics, errors };
  } catch (error) {
    // Leave a durable failed run without exposing credentials or source payloads in HTTP/logs.
    if (runId)
      await db
        .$transaction(async (tx) => {
          await fence(tx, owner);
          await tx.pipelineRun.updateMany({
            where: { id: runId, status: "running" },
            data: {
              status: "failed",
              finishedAt: new Date(),
              metrics: json(metrics),
              errors: json([errorCode(error)]),
            },
          });
        })
        .catch(() => {});
    throw error;
  } finally {
    await db.pipelineLease.deleteMany({ where: { key: LEASE_KEY, owner } });
  }
}
