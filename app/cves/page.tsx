import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { fetchCves } from "@/lib/cves/fetch-cves";
import CveExplorer from "@/components/cves/CveExplorer";

export const metadata: Metadata = {
  title: "CVEs | Statecraft Cyber Intelligence",
  description: "Vulnerabilidades publicadas nos últimos 7 dias com CVSS, EPSS e status CISA KEV.",
};

const getCves = unstable_cache(fetchCves, ["cves"], { revalidate: 7200 });

export default async function CvesPage() {
  let data = { cves: [] as Awaited<ReturnType<typeof fetchCves>>["cves"], total: 0, updatedAt: new Date().toISOString() };
  try {
    data = await getCves();
  } catch {
    // External APIs unavailable — render empty state
  }

  return (
    <main className="min-h-screen bg-canvas pt-16">
      <CveExplorer initialCves={data.cves} initialUpdatedAt={data.updatedAt} />
    </main>
  );
}
