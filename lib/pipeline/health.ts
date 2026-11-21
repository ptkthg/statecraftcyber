export interface UpdateHealthRecord {
  lastAttemptAt: Date | null;
  lastCollectionAt: Date | null;
  lastPublicationAt: Date | null;
  status: string;
}

export function hasSuccessfulCollection(sources: string[], metrics: Record<string, { status: string; requests: number; collected: number }>) {
  const values = Object.entries(metrics).filter(([name]) => sources.some(source => name === source || name.startsWith(source + ' / '))).map(([, metric]) => metric);
  // Injected collectors without instrumentation are used by local fixtures. In
  // production every adapter is instrumented; skipped configuration is not success.
  return Object.keys(metrics).length ? values.some(m => m.status === 'success' && m.requests > 0 || m.status === 'partial' && m.collected > 0) : sources.length > 0;
}
export function updateHealth(record: UpdateHealthRecord | null, now = new Date()) {
  const stale = !record?.lastCollectionAt || +now - +record.lastCollectionAt > 3 * 3600000;
  const interrupted = record?.status === 'running' && (!record.lastAttemptAt || +now - +record.lastAttemptAt > 16 * 60000);
  return {
    status: stale || interrupted || record?.status === 'failed' || record?.status === 'interrupted' ? 'degraded' : record?.status === 'partial' ? 'partial' : 'ok',
    stale,
    lastAttemptAt: record?.lastAttemptAt ?? null,
    lastCollectionAt: record?.lastCollectionAt ?? null,
    lastPublicationAt: record?.lastPublicationAt ?? null,
    lastOutcome: record?.status ?? 'never_run',
    publicationWarning: !record?.lastPublicationAt || +now - +record.lastPublicationAt > 24 * 3600000,
  };
}
