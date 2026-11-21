import { updateHealth } from "../pipeline/health";
import type { PublishedSnapshot } from "./snapshot";

function parseDate(value: string | null | undefined) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

export function snapshotHealth(snapshot: PublishedSnapshot, now = new Date()) {
  const pipeline = (key: string) => {
    const published = snapshot.updates.find((update) => update.key === key);
    const record = published ? {
      status: published.status,
      lastAttemptAt: parseDate(published.lastAttemptAt),
      lastCollectionAt: parseDate(published.lastCollectionAt),
      lastPublicationAt: parseDate(published.lastPublicationAt),
    } : null;
    return { ...updateHealth(record, now), lastSuccessAt: parseDate(published?.lastSuccessAt) };
  };
  const pipelines = { briefings: pipeline("briefings"), news: pipeline("news") };
  const generatedAt = parseDate(snapshot.generatedAt);
  const snapshotStale = !generatedAt || +now - +generatedAt > 3 * 3600000;
  const degraded = snapshotStale || Object.values(pipelines).some((record) => record.status === "degraded");

  return {
    status: degraded ? "degraded" : "ok",
    source: "local-snapshot",
    database: "not_required",
    snapshotGeneratedAt: snapshot.generatedAt,
    snapshotSha256: snapshot.snapshotSha256 ?? null,
    snapshotStale,
    pipelines,
    briefings: { published: snapshot.briefings.briefings.length },
    iocs: { total: snapshot.iocs.length },
    cves: { cached: snapshot.cves.length },
    cron: {
      lastRun: snapshot.lastRun?.runAt ?? null,
      lastSuccess: snapshot.lastRun?.success ?? null,
      briefingsLastRun: snapshot.lastRun?.briefingsCreated ?? null,
      durationMs: snapshot.lastRun?.durationMs ?? null,
    },
    updatedAt: now.toISOString(),
  };
}
