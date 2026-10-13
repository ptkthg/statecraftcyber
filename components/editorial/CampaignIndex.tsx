"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { campaigns } from "@/data/campaigns";

const visual = ["datacenter", "antena", "porto"] as const;
export default function CampaignIndex() {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");
  const [actor, setActor] = useState("");
  const sectors = [...new Set(campaigns.flatMap((item) => item.sectors))].sort((a,b) => a.localeCompare(b,"pt-BR"));
  const actors = [...new Set(campaigns.map((item) => item.actor))].sort((a,b) => a.localeCompare(b,"pt-BR"));
  const filtered = campaigns.filter((item) => {
    const text = `${item.title} ${item.summary} ${item.actor} ${item.sectors.join(" ")} ${item.cves.map((c) => c.id).join(" ")}`.toLocaleLowerCase("pt-BR");
    return text.includes(query.trim().toLocaleLowerCase("pt-BR")) && (!sector || item.sectors.includes(sector)) && (!actor || item.actor === actor);
  });
  return <><div className="campaign-filters"><label>Buscar campanhas<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Campanha, ator, setor ou CVE" /></label><label>Setor<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="">Todos os setores</option>{sectors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Ator<select value={actor} onChange={(event) => setActor(event.target.value)}><option value="">Todos os atores</option>{actors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><span>{filtered.length} de {campaigns.length} casos</span></div>
    {filtered.length ? <div className="campaign-list">{filtered.map((item) => {
      const index = campaigns.findIndex((campaign) => campaign.slug === item.slug);
      return <article className="campaign-item" key={item.slug}><div className="story-image"><Image src={`/editorial/${visual[index % visual.length]}.webp`} alt="Fotografia documental utilizada como ilustração editorial" fill sizes="(max-width: 700px) 35vw, 16vw" /></div><div><p className="story-meta">{new Date(item.reviewedAt).toLocaleDateString("pt-BR")} · {item.status} · {item.actor}</p><h3><Link href={`/campanhas/${item.slug}`}>{item.title}</Link></h3><p>{item.summary}</p><div className="tech-tags">{item.techniques.map((technique) => <span key={technique.id}>{technique.id}</span>)}{item.cves.map((cve) => <span key={cve.id}>{cve.id}</span>)}</div></div><Link href={`/campanhas/${item.slug}`} className="under-link">Ver dossiê →</Link></article>;
    })}</div> : <p className="editorial-empty">Nenhuma campanha corresponde aos filtros selecionados.</p>}</>;
}
