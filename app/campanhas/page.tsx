import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import EditorialHero from "@/components/editorial/EditorialHero";
import CampaignIndex from "@/components/editorial/CampaignIndex";
import { campaigns } from "@/data/campaigns";

export const metadata: Metadata = { title: "Campanhas", description: "Casos documentados de ameaças cibernéticas com técnicas, contexto e fontes primárias." };
export default function CampanhasPage() {
  const featured = campaigns[0];
  return <main className="editorial-page page-shell">
    <EditorialHero eyebrow="CAMPANHAS / AMÉRICA LATINA" title={<>Campanhas de<br />ameaça.</>} description="Monitoramento e análise de campanhas documentadas com foco no Brasil e na América Latina. Conectamos atores, técnicas, alvos e infraestrutura aos seus impactos locais." image="antena" imageAlt="Antena de telecomunicações em Teresópolis, fotografia de Vitor Paladini" labels={["CAMPANHAS", "ATORES", "INFRAESTRUTURA", "AMÉRICA LATINA"]} primary={{ label: "Ver casos documentados", href: "#campanhas" }} secondary={{ label: "Metodologia e escopo", href: "/metodologia" }} />
    <section className="editorial-section" id="campanhas"><div className="section-heading"><h2>CAMPANHA EM DESTAQUE</h2><span>{campaigns.length} CASOS DOCUMENTADOS</span></div>
      {featured && <div className="campaign-feature">
        <div className="feature-photo"><Image src="/editorial/datacenter-ache.webp" alt="Racks de servidores; imagem editorial ilustrativa" fill sizes="(max-width: 800px) 100vw, 28vw" /></div>
        <div><p className="story-meta">REVISADO EM {new Date(featured.reviewedAt).toLocaleDateString("pt-BR")} · {featured.actor}</p><h3><Link href={`/campanhas/${featured.slug}`}>{featured.title}</Link></h3><p>{featured.summary}</p><Link className="editorial-button" href={`/campanhas/${featured.slug}`}>Ver análise completa →</Link></div>
        <aside><p className="eyebrow">PRINCIPAIS ATRIBUTOS</p><dl><dt>Status</dt><dd>{featured.status}</dd><dt>Ator associado</dt><dd>{featured.actor}</dd><dt>Setores</dt><dd>{featured.sectors.join(", ")}</dd><dt>Técnicas</dt><dd>{featured.techniques.map((technique) => technique.id).join(", ")}</dd><dt>Confiança</dt><dd>Não quantificada</dd><dt>Fonte</dt><dd>{featured.sources[0]?.name}</dd></dl></aside>
      </div>}
      <p className="editorial-note">“Em acompanhamento” indica relevância para monitoramento; não confirma atividade em tempo real. Atribuições e indicadores devem ser avaliados nas fontes originais.</p>
    </section>
    <section className="editorial-section"><div className="section-heading"><h2>TODAS AS CAMPANHAS</h2><span>INVESTIGAÇÕES COM FONTE PRIMÁRIA</span></div><CampaignIndex /></section>
  </main>;
}
