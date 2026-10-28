import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllSources, fetchEpssScores } from "@/lib/threat-sources";
import { runPipeline } from "@/lib/pipeline/service";
import { withSource } from "@/lib/pipeline/context";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const GET = handleCron;
export const POST = handleCron;
async function handleCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET,
    authorization = req.headers.get("authorization");
  if (!secret || authorization !== "Bearer " + secret)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const key =
    req.headers.get("idempotency-key") ??
    "cron:" + new Date().toISOString().slice(0, 16);
  if (!/^[a-zA-Z0-9:_.-]{1,128}$/.test(key))
    return NextResponse.json(
      { error: "Chave de idempotência inválida" },
      { status: 400 },
    );
  const requested = Number(
    req.nextUrl.searchParams.get("max") ??
      process.env.MAX_HOURLY_BRIEFINGS ??
      4,
  );
  try {
    const result = await runPipeline(prisma, {
      idempotencyKey: key,
      max: Number.isFinite(requested)
        ? Math.max(1, Math.min(5, Math.floor(requested)))
        : 4,
      autoPublish: process.env.AUTO_PUBLISH === "true",
      collect: async () => {
        const result = await fetchAllSources();
        const cves = [...new Set(result.items.flatMap((i) => i.cves ?? []))];
        const scores = await withSource("FIRST EPSS", async () => {
          const map = await fetchEpssScores(cves);
          return Object.entries(map);
        }).then((entries) => Object.fromEntries(entries));
        for (const item of result.items)
          if (item.cves?.length === 1 && item.epssScore === undefined) {
            const cve = item.cves[0],
              score = scores[cve];
            if (score !== undefined) {
              item.epssScore = score;
              item.evidenceSources = [
                ...(item.evidenceSources ?? []).filter((s) => s.id !== "epss"),
                {
                  id: "epss",
                  name: "FIRST EPSS",
                  url: "https://api.first.org/data/v1/epss?cve=" + cve,
                  text: JSON.stringify({ cve, epss: score }),
                  retrievedAt: new Date().toISOString(),
                  origin: "original",
                },
              ];
            }
          }
        return result;
      },
    });
    return NextResponse.json(
      { ok: result.status !== "failed", ...result },
      {
        status:
          result.status === "busy"
            ? 409
            : result.status === "failed"
              ? 500
              : 200,
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "pipeline_failed" },
      { status: 500 },
    );
  }
}
