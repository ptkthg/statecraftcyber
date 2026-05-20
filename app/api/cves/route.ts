import { NextRequest, NextResponse } from "next/server";
import { fetchCves } from "@/lib/cves/fetch-cves";
import { checkRateLimit } from "@/lib/security/rate-limit";

export { type CveEntry, type VulnType } from "@/lib/cves/fetch-cves";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(`cves:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  try {
    const data = await fetchCves();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("[API /cves]", err);
    return NextResponse.json({ cves: [], total: 0, updatedAt: new Date().toISOString() });
  }
}
