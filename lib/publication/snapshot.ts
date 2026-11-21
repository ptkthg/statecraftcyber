import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validPublicationSnapshot } from './format.mjs';
import type { LivePreviewSnapshot, PreviewBriefing } from '../live-preview';
import type { StructuredBriefing, Ioc } from '../types';
import type { CveDetail } from '../cves/get-cve-detail';

export interface PublishedBriefing extends PreviewBriefing {
  updatedAt?: string;
  content: string;
  structuredContent: StructuredBriefing | null;
  affectedRegions: string[];
  affectedSectors: string[];
  sourcePublishedAt: string | null;
  iocs: Ioc[];
  mitreTechniques: string[];
  epssScore: number | null;
  cvssScore: number | null;
  confidence: 'high' | 'medium' | 'low';
  operationalPriority: string | null;
  severityBasis: string | null;
}
export interface PublishedUpdate {
  key: string;
  status: string;
  lastAttemptAt: string | null;
  lastCollectionAt: string | null;
  lastSuccessAt: string | null;
  lastPublicationAt: string | null;
}
export interface PublishedSnapshot extends LivePreviewSnapshot {
  /** Runtime integrity of the immutable bundled file; not stored inside that file. */
  snapshotSha256?: string;
  schemaVersion: 1;
  generatedAt: string;
  briefings: { briefings: PublishedBriefing[]; trending: PublishedBriefing[]; latestIocs: LivePreviewSnapshot['briefings']['latestIocs'] };
  news: LivePreviewSnapshot['news'] & { lastCollectionAt: string | null };
  cves: CveDetail[];
  updates: PublishedUpdate[];
  lastRun: { runAt: string; success: boolean; briefingsCreated: number; durationMs: number | null } | null;
}
export function snapshotMode() { return process.env.STATECRAFT_DATA_SOURCE === 'snapshot'; }
let cached: Promise<PublishedSnapshot> | undefined;
export async function getPublishedSnapshot(): Promise<PublishedSnapshot | null> {
  if (!snapshotMode()) return null;
  cached ??= readFile(join(process.cwd(), 'data/publication/current.json'), 'utf8').then(text => ({...parsePublishedSnapshot(JSON.parse(text)),snapshotSha256:createHash('sha256').update(text).digest('hex')}));
  return cached;
}
export function parsePublishedSnapshot(value: unknown): PublishedSnapshot {
  if (!validPublicationSnapshot(value)) throw new Error('publication_snapshot_invalid');
  return value as PublishedSnapshot;
}
