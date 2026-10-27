import { Prisma, PrismaClient } from "@prisma/client";
import { auditStoredBriefing } from "../lib/intelligence/audit";
import { publicationStatus } from "../lib/intelligence/validation";
async function main() {
const apply = process.argv.includes("--apply");
const arg = process.argv.indexOf("--limit");
const limit = arg < 0 ? Infinity : Number(process.argv[arg + 1]);
if (!(limit > 0)) throw new Error("--limit deve ser positivo.");
const prisma = new PrismaClient();
try {
  let cursor: string | undefined, count = 0, withheld = 0;
  while (count < limit) {
    const rows = await prisma.briefing.findMany({where:cursor?{id:{gt:cursor}}:{},orderBy:{id:"asc"},take:Math.min(100,limit-count)});
    if (!rows.length) break;
    for (const row of rows) {
      const report=auditStoredBriefing(row);
      if (!report.publishable) withheld++;
      console.log(JSON.stringify({id:row.id,slug:row.slug,analysisStatus:report.analysisStatus,publishable:report.publishable,issues:report.issues.map(i=>i.code)}));
      if (apply) await prisma.briefing.update({where:{id:row.id},data:{
        status:publicationStatus(row.status==="published",report), analysisStatus:report.analysisStatus,
        qualityReport:JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue,
      }});
      count++;
    }
    cursor=rows.at(-1)?.id;
  }
  console.log(JSON.stringify({mode:apply?"apply":"dry-run",audited:count,withheld}));
} finally { await prisma.$disconnect(); }
}
main().catch((error: Error) => { console.error("[Intelligence audit]", error.message); process.exitCode = 1; });
