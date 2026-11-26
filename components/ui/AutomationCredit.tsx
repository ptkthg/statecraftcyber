type Origin = 'source' | 'automated' | 'translated';
interface Props { contentOrigin?: Origin; desk?: string; source: string; sourceUrl: string }
export default function AutomationCredit({ contentOrigin, desk, source, sourceUrl }: Props) {
  if (contentOrigin === 'translated') return <div className="automation-credit">
    <p>Chamada e resumo traduzidos automaticamente de <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source}</a></p>
  </div>;
  if (contentOrigin !== 'automated') return null;
  return <div className="automation-credit">
    {desk && <p className="automation-desk">{desk}</p>}
    <p>Redação automatizada a partir de <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source}</a></p>
  </div>;
}
export function WhyItMatters({ contentOrigin, text }: { contentOrigin?: Origin; text?: string }) {
  if (contentOrigin !== 'automated' || !text) return null;
  return <aside className="editorial-assessment" aria-label="Por que importa">
    <h2>Por que importa</h2><p>{text}</p>
  </aside>;
}
