import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminToken } from "@/lib/security/admin-token";
import { requestReprocessing } from "@/lib/pipeline/control";
import type { RawThreatItem } from "@/lib/threat-sources/types";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Existing selectors now enqueue bounded, audited work instead of bypassing the pipeline. */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("admin_token")?.value,
    secret = process.env.ADMIN_SECRET;
  const authorized =
    !!(cookie && secret && verifyAdminToken(cookie, secret)) ||
    !!(
      process.env.CRON_SECRET &&
      req.headers.get("authorization") === "Bearer " + process.env.CRON_SECRET
    );
  if (!authorized)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    last?: number;
    all?: boolean;
    reason?: string;
  } | null;
  if (!body || (!body.slug && !body.last && !body.all))
    return NextResponse.json(
      { error: "Informe slug, last ou all" },
      { status: 400 },
    );
  const rows = await prisma.briefing.findMany({
    where: body.slug ? { slug: body.slug } : { cves: { isEmpty: false } },
    orderBy: { createdAt: "desc" },
    ...(body.all
      ? {}
      : {
          take: body.slug
            ? 1
            : Math.min(20, Math.max(1, Number(body.last) || 1)),
        }),
    select: {
      slug: true,
      sourceSnapshot: true,
      pipelineEvent: { select: { id: true, revision: true } },
    },
  });
  if (body.slug && !rows.length)
    return NextResponse.json(
      { error: "Briefing não encontrado" },
      { status: 404 },
    );
  const events = rows.flatMap((r) =>
    r.pipelineEvent ? [r.pipelineEvent] : [],
  );
  const legacy = rows
    .filter((r) => !r.pipelineEvent && r.sourceSnapshot)
    .map((r) => r.sourceSnapshot as unknown as RawThreatItem);
  const skipped = rows
    .filter((r) => !r.pipelineEvent && !r.sourceSnapshot)
    .map((r) => ({
      slug: r.slug,
      error: "Snapshot original indisponível; recolha a fonte.",
    }));
  const reason =
    typeof body.reason === "string"
      ? body.reason.trim().slice(0, 500)
      : "Solicitação administrativa de regeneração pela API existente.";
  if (reason.length < 10)
    return NextResponse.json({ error: "Motivo insuficiente" }, { status: 400 });
  const result = await requestReprocessing(prisma, events, reason, legacy);
  return NextResponse.json(
    { ...result, regenerated: 0, queued: result.count, skipped },
    { status: result.status === "queued" ? 202 : 409 },
  );
}
