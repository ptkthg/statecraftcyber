import Link from 'next/link';
import type { NewsArticle } from '@/lib/news-feeds';
import AutomationCredit from './AutomationCredit';

type Journalist = NonNullable<NewsArticle['journalist']>;

export function JournalistMonogram({ journalist }: { journalist: Journalist }) {
  return <span className="journalist-monogram" style={{ backgroundColor: journalist.color }} aria-hidden="true">{journalist.initials}</span>;
}

interface Props {
  contentOrigin?: NewsArticle['contentOrigin'];
  journalist?: Journalist;
  source: string;
  sourceUrl: string;
  compact?: boolean;
}

export default function JournalistByline({ contentOrigin, journalist, source, sourceUrl, compact = false }: Props) {
  if (contentOrigin === 'translated') return <div className={`journalist-byline${compact ? ' journalist-byline--compact' : ''}`}><AutomationCredit contentOrigin={contentOrigin} source={source} sourceUrl={sourceUrl} /></div>;
  if (contentOrigin !== 'automated') return null;
  return <div className={`journalist-byline${compact ? ' journalist-byline--compact' : ''}`}>
    {journalist && <div className="journalist-identity">
      <JournalistMonogram journalist={journalist} />
      <div>
        <Link href={`/redacao#${journalist.id}`} className="journalist-name">{journalist.name}</Link>
        {!compact && <p className="journalist-beat">{journalist.beat}</p>}
        <p className={compact ? 'sr-only' : 'journalist-disclosure'}>Persona editorial do Statecraft</p>
      </div>
    </div>}
    <AutomationCredit contentOrigin={contentOrigin} source={source} sourceUrl={sourceUrl} />
  </div>;
}
