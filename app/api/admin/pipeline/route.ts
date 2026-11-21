import { NextRequest, NextResponse } from "next/server";
import { requestReprocessing } from "@/lib/pipeline/control";
import { localMutationResponse } from "@/lib/publication/admin";
export const dynamic = "force-dynamic";
/** Operational API uses the existing cron bearer; admin cookies are scoped to /admin. */
export async function POST(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET
  )
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const local = localMutationResponse();
  if (local) return local;
  const body = (await req.json().catch(() => null)) as {
    eventId?: string;
    revision?: number;
    reason?: string;
  } | null;
  if (
    !body ||
    typeof body.eventId !== "string" ||
    !Number.isInteger(body.revision) ||
    typeof body.reason !== "string" ||
    body.reason.trim().length < 10 ||
    body.reason.length > 500
  )
    return NextResponse.json(
      { error: "Informe eventId, revision e motivo (10–500 caracteres)" },
      { status: 400 },
    );
  const { prisma } = await import("@/lib/prisma");
  const result = await requestReprocessing(
    prisma,
    [{ id: body.eventId, revision: body.revision! }],
    body.reason.trim(),
  );
  return NextResponse.json(result, {
    status: result.status === "queued" ? 202 : 409,
  });
}
