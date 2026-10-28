import { Prisma, type PrismaClient } from "@prisma/client";
import type { CveEntry } from "./fetch-cves";
import { operationalPriority } from "./assessment";
/** One parameterized PostgreSQL upsert preserves validated text when its original source is unchanged. */
export async function saveCveBatch(db: PrismaClient, entries: CveEntry[]) {
  if (!entries.length) return;
  const unique = new Map<string, CveEntry>();
  for (const entry of entries) {
    if (
      !/^CVE-\d{4}-\d{4,}$/.test(entry.id) ||
      !Number.isFinite(Date.parse(entry.published)) ||
      !Number.isFinite(Date.parse(entry.lastModified))
    )
      continue;
    const previous = unique.get(entry.id);
    if (
      !previous ||
      Date.parse(entry.lastModified) > Date.parse(previous.lastModified)
    )
      unique.set(entry.id, entry);
  }
  if (!unique.size) return;
  const rows = [...unique.values()].map((c) => ({
    ...c,
    productSearch: c.affectedProducts.join(" ").replaceAll("_", " "),
    priorityRank: operationalPriority(c).rank,
    recordStatus: c.sourceMetadata?.nvd.status ?? "unknown",
  }));
  await db.$executeRaw(Prisma.sql`
 INSERT INTO "CveCache" (id,published,"lastModified",description,"cvssScore","cvssVersion",severity,epss,"epssPercentile","inCisaKev","affectedProducts","nvdUrl","vulnType","cweId","vulnExplanation","sourceMetadata","productSearch","priorityRank","recordStatus","fetchedAt")
 SELECT r.id,r.published::timestamp,r."lastModified"::timestamp,r.description,r."cvssScore",r."cvssVersion",r.severity,r.epss,r."epssPercentile",r."inCisaKev",ARRAY(SELECT jsonb_array_elements_text(r."affectedProducts")),r."nvdUrl",r."vulnType",r."cweId",r."vulnExplanation",r."sourceMetadata",r."productSearch",r."priorityRank",r."recordStatus",CURRENT_TIMESTAMP
 FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(id text,published text,"lastModified" text,description text,"cvssScore" double precision,"cvssVersion" text,severity text,epss double precision,"epssPercentile" double precision,"inCisaKev" boolean,"affectedProducts" jsonb,"nvdUrl" text,"vulnType" text,"cweId" text,"vulnExplanation" text,"sourceMetadata" jsonb,"productSearch" text,"priorityRank" integer,"recordStatus" text)
 ON CONFLICT(id) DO UPDATE SET
 published=EXCLUDED.published,"lastModified"=EXCLUDED."lastModified",description=EXCLUDED.description,"cvssScore"=EXCLUDED."cvssScore","cvssVersion"=EXCLUDED."cvssVersion",severity=EXCLUDED.severity,epss=EXCLUDED.epss,"epssPercentile"=EXCLUDED."epssPercentile","inCisaKev"=EXCLUDED."inCisaKev","affectedProducts"=EXCLUDED."affectedProducts","nvdUrl"=EXCLUDED."nvdUrl","vulnType"=EXCLUDED."vulnType","cweId"=EXCLUDED."cweId","vulnExplanation"=EXCLUDED."vulnExplanation","sourceMetadata"=EXCLUDED."sourceMetadata","productSearch"=EXCLUDED."productSearch","priorityRank"=EXCLUDED."priorityRank","fetchedAt"=EXCLUDED."fetchedAt","recordStatus"=EXCLUDED."recordStatus",
 "ptBrDescription"=CASE WHEN "CveCache".description=EXCLUDED.description AND "CveCache"."lastModified"=EXCLUDED."lastModified" THEN "CveCache"."ptBrDescription" ELSE NULL END,
 mitigation=CASE WHEN "CveCache".description=EXCLUDED.description AND "CveCache"."lastModified"=EXCLUDED."lastModified" THEN "CveCache".mitigation ELSE NULL END,
 "qualityReport"=CASE WHEN "CveCache".description=EXCLUDED.description AND "CveCache"."lastModified"=EXCLUDED."lastModified" THEN "CveCache"."qualityReport" ELSE NULL END,
 "analysisReady"=CASE WHEN "CveCache".description=EXCLUDED.description AND "CveCache"."lastModified"=EXCLUDED."lastModified" THEN "CveCache"."analysisReady" ELSE false END,
 "enrichedAt"=CASE WHEN "CveCache".description=EXCLUDED.description AND "CveCache"."lastModified"=EXCLUDED."lastModified" THEN "CveCache"."enrichedAt" ELSE NULL END,
 "aiPriority"=NULL
 WHERE "CveCache"."lastModified"<=EXCLUDED."lastModified"
 `);
}
