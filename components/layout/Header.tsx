"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";

const navigation = [
  { label: "Briefings", href: "/threat-briefings" },
  { label: "Campanhas", href: "/campanhas" },
  { label: "Vulnerabilidades", href: "/cves" },
  { label: "Indicadores", href: "/iocs" },
  { label: "Notícias", href: "/noticias" },
  { label: "Sobre", href: "/sobre" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const search = () => window.dispatchEvent(new Event("open-search"));
  return <header className="site-header">
    <div className="site-header-inner">
      <Link href="/" className="masthead" aria-label="Statecraft Cyber Intelligence, página inicial" onClick={() => setOpen(false)}><span className="masthead-name">STATECRAFT</span><span className="masthead-sub">CYBER INTELLIGENCE</span></Link>
      <nav className="desktop-nav" aria-label="Navegação principal">{navigation.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href || pathname.startsWith(item.href + "/") ? "page" : undefined}>{item.label}</Link>)}</nav>
      <button className="header-search" onClick={search} aria-label="Abrir busca global"><Search size={18} aria-hidden="true" /><span>Buscar...</span></button>
      <div className="header-motto" aria-label="Análise, contexto, decisão">ANÁLISE<br />CONTEXTO<br />DECISÃO</div>
      <button className="mobile-nav-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Fechar menu" : "Abrir menu"}>{open ? <X size={25} /> : <Menu size={25} />}</button>
    </div>
    {open && <nav className="mobile-nav" id="mobile-nav" aria-label="Navegação mobile">{navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={pathname === item.href || pathname.startsWith(item.href + "/") ? "page" : undefined}>{item.label}</Link>)}<button onClick={() => { setOpen(false); search(); }}><Search size={17} /> Buscar no portal</button></nav>}
  </header>;
}
