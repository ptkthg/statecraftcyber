import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  const migrations = (await readdir('prisma/migrations')).filter(n => /^\d/.test(n)).sort();
  for (const migration of migrations) {
    if (migration === '20261121000000_reliable_updates') {
      await db.exec(`INSERT INTO "PipelineRun"(id,"idempotencyKey",status) VALUES('legacy-run','legacy','success'); INSERT INTO "NewsCache"(slug,title,summary,content,source,"originalUrl") VALUES('legacy-news','Original','Summary','Body','Source','https://example.org');`);
    }
    await db.exec(await readFile('prisma/migrations/' + migration + '/migration.sql', 'utf8'));
  }
  assert.equal((await db.query(`SELECT engine FROM "PipelineRun" WHERE id='legacy-run'`)).rows[0].engine, 'legacy');
  assert.equal((await db.query(`SELECT title FROM "NewsCache" WHERE slug='legacy-news'`)).rows[0].title, 'Original');
  await db.exec(`INSERT INTO "NewsArticleRecord"(slug,payload,"publishedAt") VALUES('new','{}','2026-11-21'); INSERT INTO "UpdateHealth"(key,"lastCollectionAt",status) VALUES('news','2026-11-21','success');`);
  await db.exec('BEGIN');
  await db.exec(`UPDATE "UpdateHealth" SET status='failed'; DELETE FROM "NewsArticleRecord"`);
  await db.exec('ROLLBACK');
  assert.equal((await db.query(`SELECT count(*) FROM "NewsArticleRecord"`)).rows[0].count, 1);
  assert.equal((await db.query(`SELECT status FROM "UpdateHealth"`)).rows[0].status, 'success');
  console.log(JSON.stringify({ migrationChain: 'passed', legacyPreserved: true, atomicRollback: true }));
} finally { await db.close(); }
