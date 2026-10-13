import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { fetchCves } from "@/lib/cves/fetch-cves";
import CveExplorer from "@/components/cves/CveExplorer";
import EditorialHero from "@/components/editorial/EditorialHero";

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
  const observation = [...data.cves].sort((a, b) => Number(b.inCisaKev) - Number(a.inCisaKev) || (b.epss ?? -1) - (a.epss ?? -1)).slice(0, 4);
  const technical = data.cves.filter((item) => item.ptBrDescription || item.mitigation).slice(0, 3);

  return (
    <main className="editorial-page page-shell cve-editorial-page">
      <EditorialHero eyebrow="VULNERABILIDADES EM CONTEXTO" title="Vulnerabilidades." subtitle="Risco real, impacto concreto." description="Análises técnicas e operacionais das principais vulnerabilidades. Priorize com base nos sinais disponíveis de exploração, probabilidade e impacto." image="datacenter" imageAlt="Racks de servidores em datacenter, fotografia de Kevin Ache" labels={["EXPLORAÇÃO", "SUPERFÍCIE DE ATAQUE", "IMPACTO SETORIAL"]} primary={{ label: "Explorar o radar", href: "#radar-cves" }} secondary={{ label: "Metodologia de priorização", href: "/metodologia" }} />
      <div className="section-heading" id="radar-cves"><h2>RADAR DE CVEs</h2><span>NVD · FIRST EPSS · CISA KEV</span></div>
      <div className="cve-layout"><CveExplorer initialCves={data.cves} initialUpdatedAt={data.updatedAt} /><aside className="cve-sidebar"><h2>EM OBSERVAÇÃO</h2>{observation.length ? observation.map((item) => <Link href={`/cves/${item.id}`} key={item.id}><span>{item.severity ?? "SEM SEVERIDADE"} · {item.id}</span><strong>{item.affectedProducts[0]?.replaceAll("_", " ") || item.vulnType}</strong><small>{item.inCisaKev ? "CISA KEV · exploração conhecida" : item.epss == null ? "EPSS indisponível" : `EPSS ${(item.epss * 100).toFixed(1)}% · probabilidade estimada`}</small></Link>) : <p>Sem registros disponíveis.</p>}</aside></div>
      <section className="cve-technical"><div className="section-heading"><h2>ANÁLISES TÉCNICAS</h2><span>FICHAS COM ENRIQUECIMENTO DISPONÍVEL</span></div>{technical.length ? <div className="editorial-three">{technical.map((item) => <article key={item.id}><p className="story-meta">{item.id} · {item.severity ?? "NÃO INFORMADA"}</p><h3><Link href={`/cves/${item.id}`}>{item.affectedProducts[0]?.replaceAll("_", " ") || item.vulnType}</Link></h3><p>{item.ptBrDescription}</p><Link className="under-link" href={`/cves/${item.id}`}>Abrir dossiê →</Link></article>)}</div> : <p className="editorial-empty">Nenhuma análise técnica enriquecida disponível nesta coleta. <Link href="/metodologia">Entenda a metodologia →</Link></p>}</section>
    </main>
  );
}
