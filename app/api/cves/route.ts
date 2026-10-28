import { NextRequest, NextResponse } from "next/server";
import { queryCves, InvalidCveFilter } from "@/lib/cves/query";
import { checkRateLimit } from "@/lib/security/rate-limit";
export { type CveEntry, type VulnType } from "@/lib/cves/fetch-cves";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const { allowed, retryAfterMs } = checkRateLimit("cves:" + ip, 60, 60000);
  if (!allowed)
    return NextResponse.json(
      { error: "Muitas consultas. Tente novamente em instantes." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  try {
    return NextResponse.json(await queryCves(req.nextUrl.searchParams), {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof InvalidCveFilter
            ? error.message
            : "Fontes indisponíveis. Tente novamente.",
      },
      { status: error instanceof InvalidCveFilter ? 400 : 503 },
    );
  }
}
