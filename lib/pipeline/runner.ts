import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { createUpdateGraph } from './graph';
import { emptyMetrics, Semaphore, withPipeline, remainingMs, errorCode, type RunMetrics } from './context';
import { observe, processEvent, fence, LEASE_KEY, LostLease, type RunOptions } from './service';
import { hash, prepareRecord } from './normalize';
import type { RawThreatItem } from '../threat-sources/types';
import { collectNews } from '../news-store';
import { durableGenerator } from './durable-generation';
import { hasSuccessfulCollection } from './health';
import { generationQueue } from './generation-queue';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const BUDGET = 15 * 60000;
export interface WorkerOptions {
  collect: RunOptions['collect'];
  generate?: RunOptions['generate'];
  generationEnabled?: boolean;
  collectNews?: (db: PrismaClient, owner: string, runId: string) => Promise<{ errors?: string[] } | void>;
  autoPublish: boolean;
  max?: number;
  verify?: () => Promise<void>;
  enrichNews?: () => Promise<void>;
}

export async function runUpdateWorker(db: PrismaClient, checkpointer: BaseCheckpointSaver, options: WorkerOptions) {
  const generationEnabled = options.generationEnabled !== false;
  const owner = randomUUID();
  const acquired = await db.$queryRaw<{ owner: string }[]>`
    INSERT INTO "PipelineLease" (key,owner,"expiresAt")
    VALUES (${LEASE_KEY},${owner},clock_timestamp()+interval '16 minutes')
    ON CONFLICT(key) DO UPDATE SET owner=EXCLUDED.owner,"expiresAt"=EXCLUDED."expiresAt"
    WHERE "PipelineLease"."expiresAt"<clock_timestamp() RETURNING owner`;
  if (!acquired.length) return { status: 'busy' };
  let runId: string | undefined;
  const started = Date.now();
  try {
    // Expired runners are resumable; terminal runs keep their audit trail.
    await db.pipelineRun.updateMany({ where: { engine: 'langgraph', workerAttempts: { gte: 3 }, status: { in: ['running', 'failed'] } }, data: { status: 'abandoned', finishedAt: new Date() } });
    const prior = await db.pipelineRun.findFirst({ where: { engine: 'langgraph', status: { in: ['running', 'failed'] } }, orderBy: { startedAt: 'asc' } });
    const run = prior ?? await db.pipelineRun.create({ data: { engine: 'langgraph', idempotencyKey: 'worker:' + randomUUID() } });
    runId = run.id;
    const metrics: RunMetrics = { ...emptyMetrics(), ...(run.metrics as object) };
    const previousErrors = Array.isArray(run.errors) ? run.errors.filter((x): x is string => typeof x === 'string') : [];
    const errors: string[] = [...previousErrors];
    await db.pipelineRun.update({ where: { id: run.id }, data: { status: 'running', finishedAt: null, workerAttempts: { increment: 1 } } });
    await db.updateHealth.upsert({ where: { key: 'briefings' }, create: { key: 'briefings', runId: run.id, lastAttemptAt: new Date(), status: 'running' }, update: { runId: run.id, lastAttemptAt: new Date(), status: 'running' } });
    const save = async (stage: string) => {
      await db.$transaction(async tx => {
        await fence(tx, owner);
        await tx.pipelineRun.update({ where: { id: run.id }, data: { stage, metrics: json(metrics), errors: json(errors) } });
      });
    };
    const graph = createUpdateGraph({
      collect: async () => {
        errors.length = 0;
        metrics.sources = {};
        await save('collect');
        // News failure must not prevent the threat queue from advancing.
        try { const news = await (options.collectNews ?? collectNews)(db, owner, run.id); if (news?.errors?.length) errors.push(...news.errors.map(code => 'news:' + code)); }
        catch { errors.push('news:collection_failed'); }
        const result = await options.collect();
        metrics.collected = result.items.length;
        errors.push(...result.errors.map(e => e.source + ':' + errorCode(new Error(e.error))));
        const healthy = hasSuccessfulCollection(result.sources, metrics.sources);
        if (!healthy) throw new Error('all_sources_failed');
        const now = new Date();
        const fingerprint = hash([run.id, result.items.map(i => prepareRecord(i).sourceFingerprint)]);
        const batch = result.items.length ? await db.collectionBatch.upsert({ where: { fingerprint }, create: { runId: run.id, fingerprint, items: json(result.items), observedAt: now }, update: {} }) : null;
        await db.$transaction(async tx => {
          await fence(tx, owner);
          await tx.updateHealth.update({ where: { key: 'briefings' }, data: { lastCollectionAt: now } });
        });
        await save('observe');
        return batch ? [batch.id] : [];
      },
      observe: async () => {
        // Reserve at least half the budget for generating and publishing. Old
        // raw snapshots are retained with their cursor rather than discarded.
        const observeDeadline = Date.now() + Math.min(5 * 60000, remainingMs() / 2);
        const batches = await db.collectionBatch.findMany({ where: { complete: false }, orderBy: { createdAt: 'asc' }, take: 10 });
        for (const batch of batches) {
          const items = batch.items as unknown as RawThreatItem[];
          for (let cursor = batch.cursor; cursor < items.length && Date.now() < observeDeadline; cursor++) {
            const item = items[cursor];
            await observe(db, { ...item, publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined, sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : undefined }, run.id, owner, batch.observedAt, { id: batch.id, cursor, total: items.length, firstObservedAt: batch.createdAt });
          }
          if (Date.now() >= observeDeadline) break;
        }
        const queue = generationEnabled
          ? await generationQueue(db, owner, Math.max(1, Math.min(4, options.max ?? 4)))
          : [];
        await save('process');
        return queue;
      },
      process: async eventId => {
        // A checkpoint can resume a queue selected before credentials were unavailable.
        if (!generationEnabled) return;
        if (remainingMs() < 60000) throw new Error('worker_deadline');
        const before = await db.intelligenceEvent.findUniqueOrThrow({ where: { id: eventId } });
        await processEvent(db, eventId, run.id, owner, options.autoPublish, durableGenerator(db, owner, hash([eventId, before.revision, before.materialFingerprint]), options.generate));
        const event = await db.intelligenceEvent.findUniqueOrThrow({ where: { id: eventId }, include: { briefing: true } });
        if (event.briefing?.status === 'published') {
          await db.$transaction(async tx => {
            await fence(tx, owner);
            await tx.updateHealth.update({ where: { key: 'briefings' }, data: { lastPublicationAt: event.briefing!.updatedAt } });
          });
        }
        await save('process');
      },
      enrichNews: async () => {
        if (generationEnabled && options.enrichNews && remainingMs() > 120000) {
          try { await options.enrichNews(); } catch { errors.push('news:enrichment_failed'); }
        }
        await save('verify');
      },
      finish: async () => {
        const unavailable = 'ai:enrichment_unavailable';
        if (!generationEnabled && !errors.includes(unavailable)) errors.push(unavailable);
        await save('verify');
        if (options.verify) await options.verify();
        metrics.deferred = await db.intelligenceEvent.count({ where: { status: { in: ['pending', 'retry'] } } });
        const status = errors.length || metrics.failures || metrics.rejected ? 'partial' : 'success';
        await db.$transaction(async tx => {
          await fence(tx, owner);
          await tx.pipelineRun.update({ where: { id: run.id }, data: { status, stage: 'complete', finishedAt: new Date(), metrics: json(metrics), errors: json(errors) } });
          await tx.updateHealth.update({ where: { key: 'briefings' }, data: { status, lastSuccessAt: new Date() } });
          await tx.cronLog.create({ data: { success: status === 'success', outcome: status, pipelineRunId: run.id, briefingsCreated: metrics.created, sources: Object.keys(metrics.sources), errors, metrics: json(metrics), durationMs: Date.now() - started } });
        });
      },
    }, checkpointer);
    const config = { configurable: { thread_id: run.id }, durability: 'sync' as const, recursionLimit: 30 };
    const checkpoint = await graph.getState(config);
    await withPipeline({ metrics, deadlineAt: started + BUDGET, network: new Semaphore(4) }, () => graph.invoke(checkpoint.createdAt ? null : { collected: [], queue: [], cursor: 0 }, config));
    // A crash after finish committed can leave a complete graph with a running run.
    const final = await db.pipelineRun.findUniqueOrThrow({ where: { id: run.id } });
    if (final.status === 'running') {
      await db.pipelineRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt: new Date(), stage: 'complete' } });
    }
    return { status: final.status === 'running' ? 'success' : final.status, runId: run.id, metrics, previousErrors };
  } catch (error) {
    if (runId && !(error instanceof LostLease)) await db.$transaction(async tx => {
      await fence(tx, owner);
      await tx.pipelineRun.update({ where: { id: runId }, data: { status: 'failed', finishedAt: new Date(), errors: json([errorCode(error)]) } });
      await tx.updateHealth.updateMany({ where: { runId }, data: { status: 'interrupted' } });
    }).catch(() => {});
    throw error;
  } finally {
    await db.pipelineLease.deleteMany({ where: { key: LEASE_KEY, owner } });
  }
}
