import { Prisma, type PrismaClient } from '@prisma/client';
import type { GeneratedBriefing } from '../briefing-generator';
import { generateBriefingAsync } from '../briefing-generator';
import { fence } from './service';
import { generateSlug, ensureUniqueSlug } from '../deduplication';

export function durableGenerator(db: PrismaClient, owner: string, key: string, generate = generateBriefingAsync): typeof generateBriefingAsync {
  return async (raw, slugs) => {
    const cached = await db.briefingCandidate.findUnique({ where: { key } });
    if (cached) {
      const result = cached.payload as unknown as GeneratedBriefing;
      const slug = ensureUniqueSlug(generateSlug(raw.title), slugs);
      slugs.add(slug);
      return { ...result, slug, sourcePublishedAt: result.sourcePublishedAt ? new Date(result.sourcePublishedAt) : null };
    }
    const result = await generate(raw, slugs);
    // Failed AI responses remain retryable, never cached as completed work.
    if (result.structuredContent && (!result.qualityReport.editorialReport || result.qualityReport.editorialReport.publishable)) await db.$transaction(async tx => {
      await fence(tx, owner);
      await tx.briefingCandidate.upsert({ where: { key }, create: { key, payload: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue }, update: {} });
    });
    return result;
  };
}
