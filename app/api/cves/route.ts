import { NextResponse } from "next/server";
import { fetchCves } from "@/lib/cves/fetch-cves";

export { type CveEntry, type VulnType } from "@/lib/cves/fetch-cves";

export const dynamic = "force-dynamic";

export async function GET() {
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
