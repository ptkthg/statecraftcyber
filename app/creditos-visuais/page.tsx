import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Créditos visuais" };
const credits = [
  { title: "Congresso Nacional, Brasília", author: "Autor não identificado / Acervo Arquivo Nacional", license: "Domínio público. Atribuição solicitada: Domínio público / Acervo Arquivo Nacional.", url: "https://commons.wikimedia.org/wiki/File:Congresso_Nacional_Bras%C3%ADlia_-_BR_RJANRIO_PH_0_FOT_00743_0018,_Acervo_do_Arquivo_Nacional.jpg" },
  { title: "Antena em Teresópolis", author: "Vitor Paladini", license: "Unsplash License", url: "https://unsplash.com/photos/a-satellite-dish-sitting-on-top-of-a-building-Pi3TvIKNmjM" },
  { title: "Porto de Hamburgo", author: "Wolfgang Weiser", license: "Unsplash License", url: "https://unsplash.com/photos/container-ships-and-cranes-at-a-busy-port-azTSkG93BG4" },
  { title: "Racks de servidores", author: "Kevin Ache", license: "Unsplash License", url: "https://unsplash.com/photos/a-rack-of-servers-in-a-server-room-2JJ3wBHu4_0" },
  { title: "Mapa vetorial da América do Sul", author: "Natural Earth", license: "Domínio público", url: "https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/" },
];
export default function VisualCreditsPage() { return <main className="article-page visual-credits"><div className="credit-shell"><p className="eyebrow">STATECRAFT / TRANSPARÊNCIA</p><h1>Créditos visuais.</h1><p>As fotografias são usadas como ilustração editorial. Não documentam os ataques ou campanhas descritos nas matérias. O mapa usa geometrias públicas do Natural Earth; as linhas vermelhas representam uma composição gráfica, não telemetria de ataques.</p><div className="credit-list">{credits.map((item) => <section key={item.title}><h2>{item.title}</h2><p>{item.author} · {item.license}</p><a href={item.url} target="_blank" rel="noopener noreferrer">Ver origem e licença ↗</a></section>)}</div><Link href="/sobre" className="under-link">Sobre o projeto →</Link></div></main>; }
