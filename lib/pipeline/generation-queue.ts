import type { PrismaClient } from '@prisma/client';
import { compose, needsEnrichment, fence } from './service';
import { scoreSeverity } from '../severity-scoring';
import { currentContext } from './context';

/** Reserve generation slots for records that can pass the existing input gates. */
export async function generationQueue(db: PrismaClient, owner: string, max: number) {
  const candidates = await db.intelligenceEvent.findMany({
    where: { status: { in: ['pending', 'retry'] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
    orderBy: { firstObservedAt: 'asc' }, take: 100, include: { records: true },
  });
  const selected: string[] = [];
  for (const event of candidates) {
    if (selected.length >= max) break;
    const raw = compose(event.records);
    const blocked = !raw || !needsEnrichment(raw) ? 'insufficient_source_evidence' : scoreSeverity(raw).severityBasis === 'unavailable' ? 'severity_unavailable' : null;
    if (blocked) {
      await db.$transaction(async tx => {
        await fence(tx, owner);
        await tx.intelligenceEvent.updateMany({ where: { id: event.id, revision: event.revision, status: { in: ['pending', 'retry'] } }, data: { status: 'quarantined', lastErrorCode: blocked, nextAttemptAt: null } });
      });
      const metrics = currentContext()?.metrics;
      if (metrics) metrics.rejected++;
    } else selected.push(event.id);
  }
  return selected;
}
