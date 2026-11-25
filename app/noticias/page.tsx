import { getStoredNews } from '@/lib/news-store';
import { sortRecentNews } from '@/lib/news-order';
import NewsExplorer from '@/components/news/NewsExplorer';
import PageHeader from '@/components/PageHeader';
import { JOURNALISTS } from '@/lib/ai/editorial-personas';
import { journalistForPersona } from '@/lib/journalists';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notícias', description: 'Notícias de cibersegurança agregadas de fontes especializadas, com origem preservada e contexto para análise.', alternates: { canonical: '/noticias' } };

export default async function NoticiasPage({ searchParams }: { searchParams: Promise<{ tab?: string; jornalista?: string }> }) {
  const { tab, jornalista } = await searchParams;
  const journalists = Object.keys(JOURNALISTS).map(id => journalistForPersona(id)!);
  const selected = journalists.some(persona => persona.id === jornalista) ? jornalista : '';
  let news;
  try { news = await getStoredNews(); } catch {
    return <main className="editorial-page page-shell news-editorial-page"><PageHeader eyebrow="NOTÍCIAS" title="Cobertura em contexto." description="Notícias de cibersegurança com as fontes originais preservadas." /><section role="status"><h2>Fonte de notícias indisponível</h2><p>Não foi possível carregar a publicação. Tente novamente mais tarde.</p></section></main>;
  }
  const articles = sortRecentNews(news.articles);
  return <main className="editorial-page page-shell news-editorial-page" data-content="news">
    <PageHeader eyebrow="NOTÍCIAS" title="Cobertura em contexto." description="Notícias de cibersegurança com as fontes originais preservadas." capturedAt={news.lastCollectionAt} />
    {news.stale && <p className="story-meta" role="status">Atualização atrasada. Exibindo o último conteúdo disponível.</p>}
    {articles.length ? <><div className="section-heading"><h2>ARQUIVO DE NOTÍCIAS</h2><span>FONTES ORIGINAIS NOS ARTIGOS</span></div><NewsExplorer initialArticles={articles} initialTab={tab === 'contexto' ? 'contexto' : 'alertas'} initialJournalist={selected} journalists={journalists} /></> : <section><h2>Nenhuma notícia publicada</h2><p>O arquivo ainda não tem notícias nesta publicação.</p></section>}
  </main>;
}
