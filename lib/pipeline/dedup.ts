import { hash, type EventProfile } from "./normalize";
export interface MatchDecision {
  merge: boolean;
  score: number;
  rule: string;
}
export function jaccard(a: string[], b: string[]): number {
  const x = new Set(a),
    y = new Set(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter((v) => y.has(v)).length / new Set([...x, ...y]).size;
}
export function compareEvents(a: EventProfile, b: EventProfile): MatchDecision {
  const no = (rule: string, score = 0) => ({ merge: false, score, rule });
  if (a.kind !== b.kind) return no("different-kind");
  if (a.exactKey || b.exactKey)
    return a.exactKey && a.exactKey === b.exactKey
      ? { merge: true, score: 1, rule: "canonical-identity" }
      : no("different-canonical-identity");
  if (a.cves.length && b.cves.length && jaccard(a.cves, b.cves) === 0)
    return no("disjoint-cves");
  if (
    a.campaigns.length &&
    b.campaigns.length &&
    jaccard(a.campaigns, b.campaigns) === 0
  )
    return no("disjoint-campaigns");
  const age =
    a.publishedAt && b.publishedAt
      ? Math.abs(+new Date(a.publishedAt) - +new Date(b.publishedAt))
      : Infinity;
  if (age > 72 * 3600000) return no("outside-72h-window");
  if (
    a.url === b.url &&
    /^https?:\/\//.test(a.url) &&
    new URL(a.url).pathname !== "/"
  )
    return { merge: true, score: 1, rule: "same-article-url" };
  const title = jaccard(a.title, b.title),
    body = jaccard(a.body, b.body),
    ioc = jaccard(a.indicators, b.indicators);
  const shared = a.indicators.filter((v) => b.indicators.includes(v)).length;
  const anchored =
    jaccard(a.cves, b.cves) > 0 ||
    jaccard(a.campaigns, b.campaigns) > 0 ||
    (shared >= 3 && ioc >= 0.8);
  const score = 0.4 * title + 0.5 * body + 0.1 * ioc;
  if (a.body.length >= 20 && a.bodyDigest === b.bodyDigest && title === 1)
    return { merge: true, score: 1, rule: "exact-syndication" };
  if (
    anchored &&
    a.body.length >= 12 &&
    b.body.length >= 12 &&
    title >= 0.85 &&
    body >= 0.88
  )
    return { merge: true, score, rule: "anchored-text-similarity" };
  return no(anchored ? "related-but-insufficient" : "no-strong-anchor", score);
}
export function chooseMatch(
  profile: EventProfile,
  candidates: { id: string; profile: EventProfile }[],
) {
  const compared = candidates
    .map((c) => ({ ...c, decision: compareEvents(profile, c.profile) }))
    .sort(
      (a, b) => b.decision.score - a.decision.score || a.id.localeCompare(b.id),
    );
  const eligible = compared.filter((c) => c.decision.merge);
  if (
    eligible.length > 1 &&
    eligible[0].decision.rule === "anchored-text-similarity" &&
    eligible[0].decision.score - eligible[1].decision.score < 0.02
  )
    return { match: null, related: eligible[0], rule: "ambiguous-candidates" };
  return {
    match: eligible[0] ?? null,
    related: compared.find((c) => c.decision.score >= 0.55) ?? null,
    rule: eligible[0]?.decision.rule ?? "new-event",
  };
}
export const eventKey = (profile: EventProfile, identityHash: string) =>
  profile.exactKey ??
  "event:" + hash([profile.kind, profile.url, identityHash]);
