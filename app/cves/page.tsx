import type { Metadata } from "next";
import EditorialHero from "@/components/editorial/EditorialHero";
import CveExplorer from "@/components/cves/CveExplorer";
import { queryCves } from "@/lib/cves/query";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CVEs | Statecraft Cyber Intelligence",
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
      coverage: "Fontes indisponíveis. Tente atualizar a consulta.",
      types: [],
    };
  }
  return (
    <main className="editorial-page page-shell cve-editorial-page">
      <EditorialHero
        eyebrow="VULNERABILIDADES EM CONTEXTO"
        title="Vulnerabilidades."
        subtitle="Risco real, impacto concreto."
        description="Compare evidências de exploração, probabilidade e severidade técnica. A prioridade é explicada, e os limites dos dados permanecem visíveis."
        image="datacenter"
        imageAlt="Racks de servidores em datacenter, fotografia de Kevin Ache"
        labels={["EXPLORAÇÃO", "SUPERFÍCIE DE ATAQUE", "IMPACTO SETORIAL"]}
        primary={{ label: "Explorar o radar", href: "#radar-cves" }}
        secondary={{
          label: "Critérios de priorização",
          href: "#priorizacao-cves",
        }}
      />
      <div className="section-heading" id="radar-cves">
        <h2>RADAR DE CVEs</h2>
        <span>NVD · FIRST EPSS · CISA KEV</span>
      </div>
      <CveExplorer initialData={data} initialQuery={params.toString()} />
    </main>
  );
}
