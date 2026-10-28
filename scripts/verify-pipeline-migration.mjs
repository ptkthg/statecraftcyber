import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(
  pathToFileURL(
    resolve(
      process.env.PGLITE_MODULE ??
        ".qa/phase1-db/node_modules/@electric-sql/pglite/dist/index.js",
    ),
  ).href
);
const db = new PGlite();
try {
  for (const migration of (await readdir("prisma/migrations"))
    .filter((n) => /^\d/.test(n))
    .sort()) {
    if (migration.startsWith("20261028")) break;
    await db.exec(
      await readFile(
        "prisma/migrations/" + migration + "/migration.sql",
        "utf8",
      ),
    );
  }
  await db.exec(
    `INSERT INTO "Briefing" (id,title,slug,summary,content,severity,category,"sourceName","sourceUrl",confidence,status,"contentHash","createdAt","updatedAt") VALUES ('legacy','Source','legacy','Original summary','Original body','high','event','NVD','https://example.org/report','low','draft','original-hash','2026-01-01','2026-10-01')`,
  );
  await db.exec(
    await readFile(
      "prisma/migrations/20261028000000_intelligence_pipeline/migration.sql",
      "utf8",
    ),
  );
  const legacy = (await db.query(`SELECT * FROM "Briefing" WHERE id='legacy'`))
    .rows[0];
  assert.equal(+new Date(legacy.firstObservedAt), +new Date(legacy.createdAt));
  assert.equal(legacy.sourceUpdatedAt, null);
  assert.equal(legacy.content, "Original body");
  await assert.rejects(
    db.exec(`UPDATE "Briefing" SET status='published' WHERE id='legacy'`),
  );
  await db.exec(
    `INSERT INTO "PipelineRun" (id,"idempotencyKey") VALUES ('run','batch-one'); INSERT INTO "IntelligenceEvent" (id,"eventKey",profile) VALUES ('event','cve:test','{}'); INSERT INTO "SourceRecord" (id,"identityHash","legacyHash","externalId","sourceName","sourceUrl","eventId","materialFingerprint","sourceFingerprint","rawPayload",entities) VALUES ('source','identity','hash','native','NVD','https://example.org','event','material','original','{}','[]'); INSERT INTO "SourceRevision" (id,"recordId",revision,"materialFingerprint","rawPayload",entities,"runId") VALUES ('v1','source',1,'material','{}','[]','run'); INSERT INTO "BriefingRevision" (id,"briefingId",revision,snapshot,"originalSources","changeSummary","runId") VALUES ('b1','legacy',0,'{}','[]','{}','run')`,
  );
  for (const query of [
    `UPDATE "SourceRevision" SET revision=2 WHERE id='v1'`,
    `DELETE FROM "BriefingRevision" WHERE id='b1'`,
    `INSERT INTO "SourceRevision" (id,"recordId",revision,"materialFingerprint","rawPayload",entities,"runId") VALUES ('v2','source',1,'changed','{}','[]','run')`,
    `UPDATE "IntelligenceEvent" SET status='invented' WHERE id='event'`,
    `INSERT INTO "CollectionBatch" (id,"runId",fingerprint,items,cursor) VALUES ('batch','run','batch','[]',1)`,
  ])
    await assert.rejects(db.exec(query));
  const claim = (owner) =>
    db.query(
      `INSERT INTO "PipelineLease" (key,owner,"expiresAt") VALUES ('intelligence-v2',$1,clock_timestamp()+interval '55 seconds') ON CONFLICT(key) DO UPDATE SET owner=EXCLUDED.owner,"expiresAt"=EXCLUDED."expiresAt" WHERE "PipelineLease"."expiresAt"<clock_timestamp() RETURNING owner`,
      [owner],
    );
  assert.equal((await claim("one")).rows.length, 1);
  assert.equal((await claim("two")).rows.length, 0);
  await db.exec(
    `UPDATE "PipelineLease" SET "expiresAt"=clock_timestamp()-interval '1 second'`,
  );
  assert.equal((await claim("two")).rows[0].owner, "two");
  assert.equal(
    (
      await db.query(
        `SELECT owner FROM "PipelineLease" WHERE owner='one' AND "expiresAt">clock_timestamp() FOR UPDATE`,
      )
    ).rows.length,
    0,
  );
  await db.exec("BEGIN");
  await db.exec(
    `UPDATE "Briefing" SET summary='half-written' WHERE id='legacy'`,
  );
  await db.exec("ROLLBACK");
  assert.equal(
    (await db.query(`SELECT summary FROM "Briefing" WHERE id='legacy'`)).rows[0]
      .summary,
    "Original summary",
  );
  console.log(
    JSON.stringify({
      migrationChain: "passed",
      legacyPreserved: true,
      phase1GatePreserved: true,
      appendOnlyHistory: true,
      uniqueVersions: true,
      queueConstraints: true,
      distributedLease: true,
      expiredOwnerFenced: true,
      transactionRollback: true,
    }),
  );
} finally {
  await db.close();
}
