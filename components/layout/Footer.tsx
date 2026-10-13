import Link from "next/link";
export default function Footer() {
  return <footer className="site-footer"><div className="site-footer-inner">
    <div><Link href="/" className="footer-brand">STATECRAFT</Link><p>Cyber Intelligence · Análise, contexto, decisão.</p></div>
    <nav aria-label="Navegação do rodapé"><Link href="/threat-briefings">Briefings</Link><Link href="/campanhas">Campanhas</Link><Link href="/cves">Vulnerabilidades</Link><Link href="/iocs">Indicadores</Link><Link href="/noticias">Notícias</Link><Link href="/sobre">Sobre</Link><Link href="/metodologia">Metodologia</Link></nav>
    <p>Projeto independente · Fontes abertas e rastreáveis<br /><Link href="/creditos-visuais">Créditos das imagens e do mapa</Link><br />© {new Date().getFullYear()} Statecraft Cyber Intelligence</p>
  </div></footer>;
}
