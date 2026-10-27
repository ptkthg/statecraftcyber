import type { StructuredBriefing } from "@/lib/types";
const KIND = { observed: "Observada em telemetria própria", reported: "Reportada pela fonte", inferred: "Inferência analítica", unavailable: "Informação indisponível" };
const FIELD: Record<string,string> = { title:"Título",executiveSummary:"Resumo executivo",whatHappened:"O que aconteceu",whyItMatters:"Impacto",whoIsAtRisk:"Exposição",technicalDetails:"Detalhes técnicos",falsePositiveNotes:"Falsos positivos",recommendedActions:"Recomendação",detectionSuggestions:"Detecção" };
export function EvidenceNotes({ briefing }: { briefing: StructuredBriefing }) {
  const quality = briefing.quality;
  if (!quality) return null;
  return <section className="mt-8 border-t border-ink pt-5 text-sm text-body" aria-label="Rastreabilidade da análise">
    <h2 className="font-mono text-sm text-brand">Validação automática de evidências</h2>
    <p className="mt-3 leading-relaxed">As citações foram verificadas contra os registros capturados. Esta verificação demonstra correspondência com a fonte, sem comprovar independentemente suas afirmações ou declarar revisão humana.</p>
    <dl className="mt-4 grid gap-2 text-xs">
      <div><dt className="inline font-semibold">Severidade: </dt><dd className="inline">{quality.risk.cvssScore === 0 ? "nenhuma (CVSS 0.0)" : quality.risk.severityBasis === "cvss" ? "técnica, conforme CVSS da fonte" : quality.risk.severityBasis === "source" ? "classificação reportada pela fonte" : "não estabelecida"}</dd></div>
      <div><dt className="inline font-semibold">Prioridade operacional: </dt><dd className="inline">{{ critical:"Crítica",high:"Alta",medium:"Média",low:"Baixa" }[quality.risk.operationalPriority]} — sugestão independente da confiança e condicionada à exposição local.</dd></div>
    </dl>
    <details className="mt-5">
      <summary className="cursor-pointer py-3 font-mono text-xs">Consultar trechos e fontes utilizados</summary>
      <ol className="space-y-5">
        {(briefing.claims ?? []).map(claim => {
          const source = quality.sources.find(s => s.id === claim.sourceId);
          if (!source || !claim.quote) return null;
          return <li key={claim.field} className="border-t border-dim/30 pt-3">
            <p className="text-xs">{FIELD[claim.field.split(".")[0]] ?? claim.field} · {KIND[claim.kind]}</p>
            <blockquote className="my-2 border-l-2 border-brand pl-3 leading-relaxed">{claim.quote}</blockquote>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{source.name}</a>
            {source.publishedAt && <span className="ml-2 text-xs">Fonte: {new Date(source.publishedAt).toLocaleDateString("pt-BR")}</span>}
          </li>;
        })}
      </ol>
    </details>
    {quality.techniques.length > 0 && <details className="mt-4">
      <summary className="cursor-pointer py-3 font-mono text-xs">Justificativas MITRE ATT&amp;CK</summary>
      <ul className="space-y-4">{quality.techniques.map(t => <li key={t.id}>
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">{t.id} · {t.name}</a>
        <p className="mt-1">{KIND[t.kind]}</p><blockquote className="mt-2 border-l-2 border-brand pl-3">{t.quote}</blockquote>
        <p className="mt-2 text-xs">Catálogo oficial, revisão {t.catalogCommit.slice(0,12)}</p>
      </li>)}</ul>
    </details>}
  </section>;
}