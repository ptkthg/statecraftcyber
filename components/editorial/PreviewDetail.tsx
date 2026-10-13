import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  section: string;
  backHref: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  source: string;
  sourceUrl: string;
  fullUrl: string;
  capturedAt: string;
  image: string;
  imageAlt: string;
  children?: ReactNode;
};

export default function PreviewDetail({ section, backHref, title, summary, category, date, source, sourceUrl, fullUrl, capturedAt, image, imageAlt, children }: Props) {
  return <main className="article-page preview-detail page-shell">
    <nav aria-label="Navegação estrutural"><Link href={backHref}>← {section}</Link></nav>
    <div className="preview-detail-grid">
      <header>
        <p className="eyebrow">{category} / RESUMO PÚBLICO</p>
        <h1>{title}</h1>
        <p className="story-meta">{new Date(date).toLocaleDateString("pt-BR")} · {source}</p>
        <p className="preview-capture">Dados públicos capturados em {new Date(capturedAt).toLocaleString("pt-BR")}</p>
      </header>
      <div className="preview-detail-image"><Image src={image} alt={imageAlt} fill sizes="(max-width: 850px) 100vw, 40vw" /></div>
    </div>
    <div className="preview-detail-body">
      <section><h2>Resumo publicado</h2><p>{summary}</p></section>
      {children}
      <section className="preview-detail-links"><h2>Fontes e leitura completa</h2><p>Esta prévia utiliza somente os campos disponíveis na API pública. Consulte o dossiê publicado para ler o conteúdo integral.</p><a href={fullUrl} target="_blank" rel="noopener noreferrer">Ler dossiê integral ↗</a><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Consultar fonte original ↗</a></section>
    </div>
  </main>;
}
