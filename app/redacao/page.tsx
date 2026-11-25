import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { JournalistMonogram } from '@/components/ui/JournalistByline';
import { JOURNALISTS, ANALYST } from '@/lib/ai/editorial-personas';

export const metadata: Metadata = {
  title: 'Nossa redação',
  description: 'Conheça os personagens editoriais fictícios e o fluxo de redação automatizada do Statecraft.',
  alternates: { canonical: '/redacao' },
};

export default function RedacaoPage() {
  return <main className="editorial-page page-shell newsroom-page">
    <PageHeader eyebrow="TRANSPARÊNCIA" title="Nossa redação" description="Cinco vozes para as notícias e uma mesa para os briefings. O compromisso com os fatos é o mesmo para todas." />
    <p className="newsroom-notice">Os nomes são personagens editoriais fictícios, sem relação com jornalistas reais.</p>
    <section aria-label="Personas editoriais" className="newsroom-roster">
      {[...Object.values(JOURNALISTS), ANALYST].map(persona => <article key={persona.id} id={persona.id} className="newsroom-persona">
        <JournalistMonogram journalist={persona} />
        <div>
          <h2>{persona.name}</h2>
          <p className="journalist-beat">{persona.beat}</p>
          <p className="journalist-disclosure">Persona editorial do Statecraft</p>
          <p className="newsroom-tagline">{persona.tagline}</p>
        </div>
      </article>)}
    </section>
    <section className="newsroom-workflow" aria-labelledby="fluxo-redacao">
      <h2 id="fluxo-redacao">Como uma matéria chega ao site</h2>
      <p>A pauta define a assinatura por sorteio ponderado pelo tipo da notícia. A escolha fica fixa para cada notícia. As fichas de CVE ficam com Rafael Nogueira; os briefings, com a Mesa de Inteligência.</p>
      <p>O Claude Sonnet 5.5 redige a matéria com a voz da persona. O editor de fechamento, o Claude Haiku 5.5, confere os fatos e o checklist editorial. Só publicamos o que tem apoio na fonte; a avaliação fica identificada e separada do relato.</p>
      <p>As assinaturas são personagens de uma redação automatizada, identificada em cada matéria com o link para a fonte original.</p>
      <Link href="/metodologia" className="under-link">Conheça a metodologia →</Link>
    </section>
  </main>;
}
