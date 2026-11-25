import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { getPublishedSnapshot } from "@/lib/publication/snapshot";
import CveExplorer from "@/components/cves/CveExplorer";
import { queryCves } from "@/lib/cves/query";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CVEs",
  alternates: { canonical: "/cves" },
  description:
    "Radar de vulnerabilidades com filtros combinados, CVSS, EPSS e exploração documentada.",
};
export default async function CvesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams))
    if (v !== undefined) params.set(k, Array.isArray(v) ? v[0] : v);
  let data;
  try {
    data = await queryCves(params);
  } catch {
    data = {
      cves: [],
      total: 0,
      page: 1,
      totalPages: 1,
      limit: 12,
      updatedAt: null,
      coverage: "Dados publicados indisponíveis. Tente novamente mais tarde.",
      types: [],
      available: false,
    };
  }
  const snapshot = await getPublishedSnapshot().catch(() => null);
  const capturedAt = snapshot?.capturedAt ?? snapshot?.generatedAt ?? data.updatedAt;
  return (
    <main className="editorial-page page-shell cve-editorial-page" data-content={data.available === false ? undefined : "cves"}>
      <PageHeader eyebrow="VULNERABILIDADES EM CONTEXTO" title="Vulnerabilidades" description="Compare severidade técnica, probabilidade e evidências de exploração nos registros publicados." capturedAt={capturedAt} />
      <div className="section-heading" id="radar-cves">
        <h2>RADAR DE CVEs</h2>
        <span>NVD · FIRST EPSS · CISA KEV</span>
      </div>
      <CveExplorer initialData={data} initialQuery={params.toString()} />
    </main>
  );
}
