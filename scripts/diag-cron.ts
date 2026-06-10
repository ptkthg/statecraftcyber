import { prisma } from "../lib/prisma";

async function main() {
  const logs = await prisma.cronLog.findMany({
    orderBy: { runAt: "desc" },
    take: 10,
  });
  console.log("=== Últimos 10 CronLogs ===");
  for (const l of logs) {
    console.log(
      `${l.runAt.toISOString()} | success=${l.success} | created=${l.briefingsCreated} | sources=${l.sources.join(",")} | errors=${JSON.stringify(l.errors)}`
    );
  }

  const latest = await prisma.briefing.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, title: true, status: true },
  });
  console.log("\n=== Briefing mais recente ===");
  console.log(latest);

  const counts = await prisma.briefing.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("\n=== Briefings por status ===");
  console.log(counts);

  const total = await prisma.cronLog.count();
  console.log(`\nTotal de cron logs: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
