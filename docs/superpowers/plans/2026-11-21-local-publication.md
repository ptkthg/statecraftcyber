# Local PostgreSQL and public snapshots implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. User explicitly requested execution of the local migration and publication approach; do not ask them to approve it again.

**Goal:** Run collection and storage on the installed local PostgreSQL and serve a durable public copy on the existing Vercel site.

**Architecture:** PostgreSQL at 127.0.0.1:5432 stores the complete archive and LangGraph checkpoints. A local scheduled worker exports an allowlisted, versioned public snapshot and deploys an isolated copy of the application to the already-linked Vercel project. Vercel reads the bundled snapshot without connecting to Neon or the user's computer. Failed collection/deployment preserves the previous live deployment.

**Tech Stack:** PostgreSQL 17.12, existing Prisma/Next.js/LangGraph, Windows Task Scheduler, existing Vercel CLI/account.

**Spec:** User-approved four steps in conversation: restore and verify backup; local collection/LangGraph; publish approved content on Vercel; verify all public content. Original reliability/quality requirements in docs/RELIABLE_UPDATES_PRD.md remain binding.

## Global constraints

- No new account, remote database exposure, paid infrastructure, or deletion of source data.
- Preserve existing publication and evidence gates. Never publish drafts or internal operational tables.
- No secrets, raw backup, credentials, or local data directory in deployment/Git.
- User reference images and screenshots remain untouched. Existing feature branch is already isolated and clean apart from those files.
- Original collection timestamps remain distinct from snapshot export time; stale local collection must remain visible.
- Neon remains intact; backup covers 14:42 UTC and later rows may be unavailable due quota. Recollect current sources and disclose the recovery cutoff.

## Review focus

1. Snapshot must never include drafts, source payloads, credentials or internal run errors.
2. CVE filters/search/detail and news/briefing detail must work without any database on Vercel.
3. An offline PC or failed deployment keeps last publication live and reports stale collection.
4. Local job overlap, restart, expired lease and partially failed feeds must not prevent publishing usable approved content.
5. Restore is transactional into an empty database, with checksum/count verification; repeat restore cannot duplicate or overwrite existing records.

## Task 1: Restore archive and establish local operations

Files: scripts/local/restore-backup.mjs, scripts/local/with-database.ps1, scripts/local/run-local.ps1, scripts/local/install-schedule.ps1, docs/LOCAL_OPERATIONS.md.

- [ ] Verify backup SHA-256 and empty local application database, load DPAPI credential only into process environment.
- [ ] Restore all original public tables and Prisma migration metadata, apply additive migration, verify table counts; retain verified recovery report locally.
- [ ] Initialize local checkpoint schema and local backup rotation with pg_dump, never delete original backup.
- [ ] Provide Windows hourly nonoverlapping task and startup catch-up; logs and credentials outside Git. Local runner uses npm run updates:local then exports/publishes even after a partial source run; failed DB/invalid snapshot fails closed.

## Task 2: Public snapshot contract and reader

Files: lib/publication/snapshot.ts, lib/publication/export.ts, scripts/export-publication.ts, lib/live-preview.ts, lib/news-store.ts, lib/ai-briefing.ts integration only if necessary, app news/briefing details, next.config.ts, .vercelignore, tests.

- [ ] Add schemaVersion=1 snapshot, immutable generatedAt, true collection metadata, approved briefings/details and active IOCs, safe CveDetail records, news and approved cached enrichment.
- [ ] Test publication gate and allowlist omission of secrets/internal fields, invalid snapshots and stale collection time before implementation.
- [ ] Export atomically to data/publication/current.json, allowlist only public DTOs, read snapshot in explicit STATECRAFT_DATA_SOURCE=snapshot mode. Include file in Next server tracing.
- [ ] Reuse existing read-only QA listing paths while preserving full production detail rendering. Snapshot read failure must never trigger remote collection or AI.

Interface consumed by Task 3: getPublishedSnapshot(): Promise<PublishedSnapshot|null> from lib/publication/snapshot.ts. PublishedSnapshot has schemaVersion:1, capturedAt:string, origin:string, briefings:{briefings:PublishedBriefing[],trending:PublishedBriefing[],latestIocs:LiveIoc[]}, iocs:EnrichedIoc[], news:{articles:NewsArticle[],lastCollectionAt:string|null}, cves:CveDetail[], updates: {key:string,status:string,lastAttemptAt:string|null,lastCollectionAt:string|null,lastSuccessAt:string|null,lastPublicationAt:string|null}[], lastRun:{runAt:string,success:boolean,briefingsCreated:number,durationMs:number|null}|null. PublishedBriefing includes full public briefing presentation with ISO date strings, affectedRegions/affectedSectors and structuredContent; no raw source snapshot.

## Task 3: Remaining public surfaces

Files: lib/cves/query.ts, lib/cves/get-cve-detail.ts, lib/cves/relationships.ts, lib/home-stats.ts, app/api/search/route.ts, app/sitemap.ts, app/api/health/route.ts, app/admin/status/page.tsx and admin API snapshot guard, tests.

- [ ] Add early getPublishedSnapshot branches before DB/network access; reuse pure CVE filtering/pagination and search merging.
- [ ] Derive related evidence from exported public structured quality only, keep unverified associations absent.
- [ ] Health reports local-snapshot data source and original update timestamps; stale snapshot/collection is degraded, with no false claim that a remote database is healthy.
- [ ] Cloud admin mutation endpoints return a clear local-processing response rather than attempting Neon updates. No UI redesign.
- [ ] Test database-independent filter/search/health paths and no generation on public reads.

## Task 4: Local worker, isolated publication and cutover

Files: scripts/run-local-updates.ts, scripts/publish-local.mjs, package.json, docs/LOCAL_OPERATIONS.md, .qa operational scripts.

- [ ] Run existing worker locally with checkpoint persistence and local validation, refresh CVE cache locally on a bounded schedule.
- [ ] Publish only an isolated staging checkout of HEAD plus public snapshot, exclude .env/.qa/credentials and reference material. Use existing Vercel authentication and --prod; do not auto-commit user changes.
- [ ] Verify exact deployed snapshot identity and representative news/CVE/briefing/IOC endpoints after deploy before reporting success. Preserve failed job diagnostics locally.
- [ ] Run tests/lint/build, independent review, actual restored database worker, backup smoke, production deploy and verify, then install/verify schedule.
- [ ] Disable obsolete cloud DB worker (already UPDATES_ENABLED=false); keep public watchdog active.
