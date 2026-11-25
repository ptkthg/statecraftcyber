import type { CveEntry } from './fetch-cves';

export const CVE_FRESHNESS_MS = 6 * 3600000;

export function isRecentCve(fetchedAt: string | null | undefined) {
  const age = Date.now() - Date.parse(fetchedAt ?? '');
  return age >= 0 && age < CVE_FRESHNESS_MS;
}

/** Expired exploitation estimates must not influence either list or detail. */
export function withCveFreshness<T extends CveEntry>(cve: T, fetchedAt: string | null | undefined) {
  return isRecentCve(fetchedAt)
    ? { ...cve, dataState: 'fresh' as const }
    : { ...cve, dataState: 'stale' as const, epss: null, epssPercentile: null, aiPriority: null };
}
