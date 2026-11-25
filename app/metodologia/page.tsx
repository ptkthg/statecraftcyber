import type { Metadata } from "next";
import Link from "next/link";
import {
  Database, Cpu, ShieldCheck, AlertTriangle,
  ArrowRight, ChevronRight, Globe,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getPublishedSnapshot } from "@/lib/publication/snapshot";

export const metadata: Metadata = {
  title: "Metodologia",
  alternates: { canonical: "/metodologia" },
  description:
    "Como a Statecraft coleta, processa e apresenta dados de threat intelligence: fontes, pipeline, papel da IA, normalização de IOCs e limitações.",
};

const SOURCES = [
  { name: "NVD (NIST)",        type: "CVEs",                     detail: "API v2.0 — vulnerabilidades das últimas 72h" },
  { name: "CISA KEV",          type: "Exploits conhecidos",       detail: "Known Exploited Vulnerabilities Catalog" },
  { name: "EPSS (FIRST.org)",  type: "Score de exploração",       detail: "Probabilidade de exploração em 30 dias" },
  { name: "AlienVault OTX",    type: "IOCs e pulsos",             detail: "Open Threat Exchange — feeds de indicadores" },
  { name: "20× RSS feeds",     type: "Notícias",                  detail: "CISA, Google Threat Intelligence, Cisco Talos, CERT.br, Elastic Security Labs e outros" },
];

const PIPELINE = [
  { step: "1", title: "Coleta local horária", desc: "A rotina horária no computador do operador consulta as fontes abertas e grava os dados no PostgreSQL local. O computador precisa estar ligado e conectado para que a rotina execute." },
  { step: "2", title: "Deduplicação e validação", desc: "Os itens são deduplicados e as evidências verificadas antes da publicação. Uma falha de fonte não equivale a uma coleção vazia." },
  { step: "3", title: "Análise com evidências", desc: "Os briefings usam seleção de trechos das fontes, validação de conteúdo e controles de qualidade. A prioridade operacional das CVEs é calculada por regras determinísticas, não pelo modelo." },
  { step: "4", title: "Modelos de briefing", desc: "O padrão é openai/gpt-oss-120b via Groq. Quando não há resposta utilizável, o fallback é anthropic/claude-3.5-haiku via OpenRouter, se configurado. Os modelos podem ser alterados pelo operador." },
  { step: "5", title: "Exportação e publicação", desc: "A rotina local exporta o snapshot público do PostgreSQL e publica o site com esse arquivo. Apenas conteúdo elegível é incluído; a leitura pública não precisa acessar o banco local." },
  { step: "6", title: "Leitura e monitoramento", desc: "As páginas servem o snapshot publicado, sem coleta externa nem geração de texto ao abrir artigos. /api/health retorna estado degradado e HTTP 503 quando o snapshot passa de 3 horas sem publicação, ou quando os pipelines indicam degradação." },
];

const PRIORITIZATION = [
  { label: "P1 · CISA KEV", weight: "Presença reportada no catálogo; avaliar exposição imediatamente" },
  { label: "P2 · Evidência de exploit", weight: "Referência Exploit no NVD, ou CVSS ≥ 9 e EPSS ≥ 10%" },
  { label: "P3 · Sinais de risco", weight: "CVSS ≥ 7 ou EPSS ≥ 10%" },
  { label: "P4 · Demais registros", weight: "Dados disponíveis abaixo dos limiares anteriores" },
  { label: "Dados insuficientes", weight: "CVSS e EPSS ausentes, sem os sinais anteriores" },
];

const IOC_NORMALIZATION = [
  { type: "IP",      rule: "Trim + lowercase. Nenhuma transformação adicional." },
  { type: "Domínio", rule: "Lowercase + remoção de prefixo www." },
  { type: "URL",     rule: "Extração do hostname via URL parser. Se malformada, mantém o valor bruto." },
  { type: "Hash",    rule: "Remove espaços + lowercase. Suporta MD5, SHA-1 e SHA-256." },
  { type: "E-mail",  rule: "Lowercase." },
  { type: "C2",      rule: "Lowercase + trim. Servidor de comando e controle identificado manualmente." },
];

const AI_ROLES = [
  { area: "Briefings", desc: "Seleciona e organiza evidências das fontes em campos estruturados. A validação pode rejeitar conteúdo sem sustentação. A IA pode cometer erros e exige conferência das fontes." },
  { area: "CVEs", desc: "Pode apoiar o enriquecimento textual em português durante o processamento local. CVSS, EPSS e CISA KEV mantêm suas fontes; a prioridade operacional segue regras determinísticas visíveis na plataforma." },
  { area: "Notícias", desc: "O processamento local pode preparar texto validado antes da exportação. No modo snapshot, abrir uma notícia lê apenas o conteúdo publicado e não dispara chamadas ao modelo." },
];

function Section({ id, icon: Icon, title, children }: {
  id: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
          <Icon size={14} className="text-brand" aria-hidden />
        </div>
        <h2 className="text-xl font-display font-bold tracking-tight text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function MetodologiaPage() {
  const snapshot = await getPublishedSnapshot().catch(() => null);
  return (
    <main className="article-page methodology-page min-h-screen bg-canvas pt-16">
      <PageHeader eyebrow="TRANSPARÊNCIA" title="Metodologia" description="Fontes, coleta local, publicação do snapshot e critérios de análise da Statecraft." capturedAt={snapshot?.capturedAt ?? snapshot?.generatedAt ?? null} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Nav rápida */}
          <nav aria-label="Seções da metodologia" className="flex flex-wrap gap-2">
            {[
              ["#fontes", "Fontes"],
              ["#pipeline", "Pipeline"],
              ["#priorizacao", "Priorização"],
              ["#ia", "Papel da IA"],
              ["#iocs", "IOCs"],
              ["#limitacoes", "Limitações"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-dim hover:text-white bg-raised border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
              >
                {label}
                <ChevronRight size={10} aria-hidden />
              </Link>
            ))}
          </nav>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Fontes */}
        <Section id="fontes" icon={Globe} title="Fontes de dados">
          <div className="bg-raised border border-white/[0.06] rounded-xl overflow-hidden">
            {SOURCES.map((s, i) => (
              <div key={i} className="flex flex-wrap items-start gap-4 px-5 py-4 border-b border-white/[0.04] last:border-0">
                <div className="w-36 flex-shrink-0">
                  <p className="text-xs font-bold text-white">{s.name}</p>
                  <p className="text-xs text-brand-soft font-medium mt-0.5">{s.type}</p>
                </div>
                <p className="text-xs text-dim leading-relaxed flex-1">{s.detail}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-dim mt-3 leading-relaxed">
            Todas as fontes são públicas e abertas. A Statecraft não tem acesso a feeds proprietários ou dados classificados.
          </p>
        </Section>

        {/* Pipeline */}
        <Section id="pipeline" icon={Cpu} title="Pipeline de processamento">
          <div className="space-y-3">
            {PIPELINE.map((p) => (
              <div key={p.step} className="flex gap-4 p-5 bg-raised border border-white/[0.06] rounded-xl">
                <div className="w-6 h-6 rounded-full bg-brand/15 border border-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-brand-soft">{p.step}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">{p.title}</p>
                  <p className="text-xs text-dim leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Priorização */}
        <Section id="priorizacao" icon={AlertTriangle} title="Priorização de CVEs">
          <p className="text-xs text-dim leading-relaxed mb-5">
            As regras determinísticas são aplicadas em ordem, sem soma de sinais ou prioridade gerada por IA.
            O limiar EPSS de 10% é uma escolha operacional da Statecraft. EPSS estima a probabilidade em 30 dias;
            não confirma exploração. Dados ausentes não são pontuação zero.
          </p>
          <div className="bg-raised border border-white/[0.06] rounded-xl overflow-hidden">
            {PRIORITIZATION.map((p, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-white/[0.04] last:border-0">
                <span className="text-xs font-mono text-body flex-1">{p.label}</span>
                <span className="text-xs text-dim text-right">{p.weight}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* IA */}
        <Section id="ia" icon={ShieldCheck} title="Papel da inteligência artificial">
          <p className="text-xs text-dim leading-relaxed mb-5">
            Para briefings, os defaults são openai/gpt-oss-120b via Groq e fallback anthropic/claude-3.5-haiku via OpenRouter.
            O processamento ocorre antes da publicação. A interface pública em modo snapshot não gera conteúdo durante a leitura.
          </p>
          <div className="space-y-3">
            {AI_ROLES.map((r) => (
              <div key={r.area} className="p-5 bg-raised border border-white/[0.06] rounded-xl">
                <p className="text-xs font-bold text-white mb-1.5">{r.area}</p>
                <p className="text-xs text-dim leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-yellow-600/[0.06] border border-yellow-600/20 rounded-xl">
            <p className="text-xs text-yellow-300 leading-relaxed">
              <strong>Rastreabilidade:</strong> cada briefing e CVE enriquecido registra quando o conteúdo foi gerado
              e qual é a fonte primária. O campo <code className="font-mono text-xs bg-yellow-600/10 px-1 rounded">enrichedAt</code> em
              CveCache e <code className="font-mono text-xs bg-yellow-600/10 px-1 rounded">enrichedAt</code> em NewsCache
              permitem auditar quando a IA processou cada item.
            </p>
          </div>
        </Section>

        {/* IOCs */}
        <Section id="iocs" icon={Database} title="Normalização de IOCs">
          <p className="text-xs text-dim leading-relaxed mb-5">
            Todos os indicadores de comprometimento passam por normalização antes de serem persistidos
            na tabela relacional <code className="font-mono text-xs bg-white/[0.06] px-1 rounded">Ioc</code>.
            Isso garante deduplicação correta e busca consistente.
          </p>
          <div className="bg-raised border border-white/[0.06] rounded-xl overflow-hidden">
            {IOC_NORMALIZATION.map((n, i) => (
              <div key={i} className="flex items-start gap-4 px-5 py-3.5 border-b border-white/[0.04] last:border-0">
                <span className="w-16 text-xs font-bold text-brand-soft font-mono flex-shrink-0 mt-0.5">{n.type}</span>
                <p className="text-xs text-dim leading-relaxed">{n.rule}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Limitações */}
        <Section id="limitacoes" icon={AlertTriangle} title="Limitações e aviso de uso">
          <div className="space-y-3">
            {[
              {
                title: "Fontes abertas apenas",
                desc: "A Statecraft agrega dados públicos. Não tem acesso a feeds proprietários, inteligência classificada ou dados de fornecedores pagos como Recorded Future, Mandiant ou CrowdStrike.",
              },
              {
                title: "IA pode cometer erros",
                desc: "O modelo pode interpretar incorretamente dados ambíguos, especialmente em CVEs com descrição técnica incompleta na fonte. Sempre valide o conteúdo na fonte primária antes de tomar decisões operacionais.",
              },
              {
                title: "Latência do pipeline",
                desc: "A rotina horária depende do computador do operador. Sem execução ou publicação bem-sucedida, o site continua servindo o último snapshot. Após 3 horas sem publicação, /api/health indica degradação. Consulte a data da coleta e as fontes primárias.",
              },
              {
                title: "Cobertura de IOCs",
                desc: "A publicação de IOCs exige evidência nas fontes e validação do pipeline. A cobertura pode ser incompleta. Valide fonte, confiança, contexto e possíveis falsos positivos antes de bloquear indicadores.",
              },
              {
                title: "Dependência de disponibilidade externa",
                desc: "O pipeline depende de disponibilidade das APIs do NVD, CISA, FIRST.org, OTX e dos RSS feeds. Indisponibilidade de uma fonte é registrada em CronLog mas não interrompe o pipeline.",
              },
            ].map((item) => (
              <div key={item.title} className="p-5 bg-raised border border-white/[0.06] rounded-xl">
                <p className="text-xs font-bold text-white mb-1.5">{item.title}</p>
                <p className="text-xs text-dim leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-5 bg-brand/[0.06] border border-brand/20 rounded-xl">
            <p className="text-xs text-brand-soft leading-relaxed font-medium">
              Dados de Threat Intelligence devem ser validados em fontes primárias antes de qualquer
              ação crítica em produção. A Statecraft é uma ferramenta de apoio à análise, não um sistema de resposta automática.
            </p>
          </div>
        </Section>

        {/* Links */}
        <div className="pt-8 border-t border-white/[0.04] flex flex-wrap gap-4">
          <Link
            href="/threat-briefings"
            className="flex items-center gap-1.5 text-sm text-body hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded"
          >
            Ver Threat Briefings <ArrowRight size={13} aria-hidden />
          </Link>
          <Link
            href="/cves"
            className="flex items-center gap-1.5 text-sm text-body hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded"
          >
            Ver CVEs <ArrowRight size={13} aria-hidden />
          </Link>
          <Link
            href="/sobre"
            className="flex items-center gap-1.5 text-sm text-body hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded"
          >
            Sobre a Statecraft <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </main>
  );
}
