import type { Metadata } from "next";
import Link from "next/link";
import {
  Database, Cpu, ShieldCheck, AlertTriangle,
  ArrowRight, ChevronRight, Globe,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Metodologia | Statecraft Cyber Intelligence",
  description:
    "Como a Statecraft coleta, processa e apresenta dados de threat intelligence: fontes, pipeline, papel da IA, normalização de IOCs e limitações.",
};

const SOURCES = [
  { name: "NVD (NIST)",        type: "CVEs",                     detail: "API v2.0 — vulnerabilidades das últimas 72h" },
  { name: "CISA KEV",          type: "Exploits conhecidos",       detail: "Known Exploited Vulnerabilities Catalog" },
  { name: "EPSS (FIRST.org)",  type: "Score de exploração",       detail: "Probabilidade de exploração em 30 dias" },
  { name: "AlienVault OTX",    type: "IOCs e pulsos",             detail: "Open Threat Exchange — feeds de indicadores" },
  { name: "19× RSS feeds",     type: "Notícias",                  detail: "CISA, Krebs, The Hacker News, CERT.br, SANS ISC, Bleeping Computer e outros" },
];

const PIPELINE = [
  { step: "1", title: "Coleta horária", desc: "cron-job.org dispara a rota protegida a cada hora. Dados são coletados de todas as fontes ativas em paralelo." },
  { step: "2", title: "Deduplicação", desc: "Cada item recebe um hash SHA-256 baseado em externalId + source + CVEs. Itens já presentes no banco são descartados antes de qualquer chamada à IA." },
  { step: "3", title: "Priorização", desc: "Itens são ordenados por severidade (Critical → High → Medium), presença no CISA KEV e CVSS score. Uma função de diversificação limita o domínio por fonte." },
  { step: "4", title: "Geração de briefing", desc: "Os itens prioritários são enviados ao LLaMA 3.3 70B via Groq. O modelo gera título, resumo, conteúdo técnico, severidade, IOCs, CVEs e técnicas MITRE ATT&CK em PT-BR." },
  { step: "5", title: "Persistência", desc: "O briefing é salvo no PostgreSQL. IOCs são normalizados e persistidos na tabela relacional Ioc com índices por tipo, valor e confiança." },
  { step: "6", title: "Log de execução", desc: "Cada execução gera um registro em CronLog com status, duração, fontes consultadas, briefings criados e erros por fonte." },
];

const PRIORITIZATION = [
  { label: "CVSS ≥ 9.0 (Critical)",  weight: "Prioridade máxima" },
  { label: "CISA KEV",               weight: "Forçado para o topo — exploração confirmada" },
  { label: "EPSS > 0,5 (50%)",       weight: "Alta probabilidade de exploração ativa" },
  { label: "CVSS 7.0–8.9 (High)",    weight: "Incluído na fila padrão" },
  { label: "CVSS < 7.0 (Medium/Low)",weight: "Baixa prioridade — incluído se houver espaço" },
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
  { area: "Briefings",   desc: "Gera título, resumo executivo, conteúdo técnico, severidade, IOCs, CVEs, técnicas MITRE e recomendações em PT-BR a partir dos dados brutos da fonte." },
  { area: "CVEs",        desc: "Enriquece cada CVE com descrição técnica em PT-BR, mitigação recomendada e prioridade operacional (Crítica/Alta/Média/Baixa) considerando CVSS, EPSS e CISA KEV." },
  { area: "Notícias",    desc: "Quando o usuário abre um artigo, a IA gera uma matéria jornalística completa em PT-BR a partir do RSS feed. O resultado é cacheado em NewsCache para leituras subsequentes." },
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
        <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function MetodologiaPage() {
  return (
    <main className="min-h-screen bg-canvas pt-16">
      {/* Hero */}
      <section className="relative py-14 border-b border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={14} className="text-brand" aria-hidden />
            <span className="text-xs font-semibold text-dim uppercase tracking-widest">Transparência</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4 leading-tight">Metodologia</h1>
          <p className="text-body text-base leading-relaxed max-w-2xl mb-6">
            Como a Statecraft coleta, processa e apresenta dados de threat intelligence.
            Esta página documenta as fontes, o pipeline de dados, o papel da IA e as limitações do sistema.
          </p>

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
      </section>

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
            CVEs são filtrados e ordenados com base em três sinais independentes: CVSS, EPSS e CISA KEV.
            Vulnerabilidades com exploração confirmada têm prioridade incondicional.
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
            O modelo LLaMA 3.3 70B (via Groq) é utilizado em três contextos distintos.
            Em nenhum deles a IA inventa dados — ela processa e reformata informações das fontes primárias.
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
                desc: "O cron executa a cada hora. Ameaças publicadas entre execuções não aparecem imediatamente. Para monitoramento em tempo real, consulte as fontes diretamente.",
              },
              {
                title: "Cobertura de IOCs",
                desc: "IOCs são extraídos automaticamente pela IA a partir do conteúdo das fontes. Indicadores não mencionados explicitamente no texto ou feed não são capturados.",
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
