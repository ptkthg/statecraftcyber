import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PGLITE_MODULE ?? ".qa/phase1-db/node_modules/@electric-sql/pglite/dist/index.js";
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const db = new PGlite(); // In-memory PostgreSQL; no production connection.
try {
  const migrations = (await readdir("prisma/migrations")).filter(n => /^\d/.test(n)).sort();
  for (const migration of migrations) {
    if (migration.startsWith("20261027")) break;
    await db.exec(await readFile("prisma/migrations/" + migration + "/migration.sql", "utf8"));
  }
  await db.exec(`INSERT INTO "Briefing" (id,title,slug,summary,content,severity,category,"sourceName","sourceUrl",confidence,status,"contentHash","updatedAt")
    VALUES ('legacy','Legacy source','legacy','original summary','original content','high','Event','Source','https://example.com','medium','published','legacy-hash',CURRENT_TIMESTAMP)`);
  await db.exec(await readFile("prisma/migrations/20261027000000_intelligence_validation/migration.sql","utf8"));
  const legacy = (await db.query('SELECT status,content,"analysisStatus" FROM "Briefing" WHERE id=$1',["legacy"])).rows[0];
  assert.equal(legacy.status,"draft"); assert.equal(legacy.content,"original content"); assert.equal(legacy.analysisStatus,"preliminary");
  let rejected=0;
  for (const report of [null,{}, {policyVersion:"phase1-v1",publishable:false}, {policyVersion:"old",publishable:true}]) {
    await assert.rejects(db.query('UPDATE "Briefing" SET status=$1,"analysisStatus"=$2,"qualityReport"=$3,"sourceSnapshot"=$4 WHERE id=$5',["published","validated",report,{description:"original"},"legacy"]));
    rejected++;
  }
  await assert.rejects(db.exec(`UPDATE "Briefing" SET status='published',"analysisStatus"='enriched',"qualityReport"='{"policyVersion":"phase1-v1","publishable":true}',"sourceSnapshot"='{}' WHERE id='legacy'`));rejected++;
  await db.exec(`UPDATE "Briefing" SET status='published',"analysisStatus"='validated',"qualityReport"='{"policyVersion":"phase1-v1","publishable":true,"analysisStatus":"validated","issues":[],"sources":[{"id":"source"}],"risk":{"severity":"high","confidence":"medium"}}',"sourceSnapshot"='{"description":"original"}',"structuredContent"='{"title":"source extraction"}' WHERE id='legacy'`);
  assert.equal((await db.query('SELECT status FROM "Briefing" WHERE id=$1',["legacy"])).rows[0].status,"published");
  for(const table of ["Briefing","NewsCache","CveCache"]) {
    const columns = (await db.query('SELECT column_name FROM information_schema.columns WHERE table_name=$1',[table])).rows.map(r=>r.column_name);
    assert(columns.includes("qualityReport"));
    if(table==="Briefing") assert(columns.includes("structuredContent"));
  }
  console.log(JSON.stringify({migrationChain:"passed",legacyPreserved:true,legacyDemoted:true,rejectedInvalidPublications:rejected,validPublication:"accepted",metadataColumns:"present"}));
} finally { await db.close(); }