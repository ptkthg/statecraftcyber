import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Shield, Database, Search, Globe, Terminal, Cpu, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Sobre",
};

const pipeline = [
  {
    icon: Database,
    label: "Coleta",
    description: "Ingestão contínua de feeds públicos: CISA KEV, OTX AlienVault, NVD/NIST e outros threat feeds globais.",
  },
  {
    icon: Search,
    label: "Processamento",
    description: "Normalização, classificação por severidade, enriquecimento com CVSS, EPSS e mapeamento MITRE ATT&CK.",
  },
  {
    icon: Terminal,
    label: "Geração",
    description: "Briefings gerados com IA (Groq / LLaMA) em português, com contexto técnico e recomendações acionáveis.",
  },
  {
    icon: Globe,
    label: "Publicação",
    description: "Disponibilizados aqui em tempo real, com IOCs estruturados e links para as fontes primárias.",
  },
];

const sources = [
  {
    name: "CISA KEV",
    desc: "Catálogo de vulnerabilidades com exploração ativa confirmada pela agência de cibersegurança dos EUA. Alta confiança, remediação mandatória para agências federais.",
    url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
  },
  {
    name: "OTX AlienVault",
    desc: "Feed colaborativo de IOCs, pulsos de ameaça e análises de campanhas reportadas pela comunidade global de segurança.",
    url: "https://otx.alienvault.com",
  },
  {
    name: "NVD / NIST",
    desc: "Base nacional de vulnerabilidades com scores CVSS, probabilidade EPSS e informações técnicas detalhadas de cada CVE.",
    url: "https://nvd.nist.gov",
  },
];

export default function SobrePage() {
  return (
    <main className="min-h-screen bg-canvas pt-16">
      {/* Hero */}
      <section className="relative py-20 border-b border-white/[0.04] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
            <span className="text-xs font-semibold text-dim uppercase tracking-widest">Sobre o Projeto</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6 max-w-2xl leading-tight">
            Threat intelligence<br />em português, em tempo real
          </h1>
          <p className="text-body max-w-2xl text-base leading-relaxed">
            A Statecraft é um projeto pessoal de threat intelligence construído do zero:
            uma plataforma que agrega dados de fontes abertas globais e os transforma em
            briefings técnicos em português, com IOCs estruturados e contexto acionável para
            analistas de segurança.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">

        {/* Quem sou */}
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <div className="text-xs font-semibold text-dim uppercase tracking-widest mb-4">O Criador</div>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-5 leading-snug">
              Patrick Santos
            </h2>
            <p className="text-sm text-body leading-relaxed mb-3">
              Analista de segurança com foco em Blue Team: detecção de ameaças, resposta a incidentes
              e operações defensivas. Trabalho com feeds de threat intelligence como CISA KEV e OTX
              AlienVault no dia a dia, e construí a Statecraft para tornar esse tipo de dado mais
              acessível e legível para outros profissionais da área no Brasil.
            </p>
            <p className="text-sm text-body leading-relaxed mb-3">
              A plataforma nasceu de uma necessidade real: a maioria dos feeds de threat intel é em
              inglês, técnica e dispersa entre dezenas de fontes diferentes. A Statecraft centraliza,
              processa e traduz isso em briefings estruturados, sem perder a precisão técnica.
            </p>
            <p className="text-sm text-body leading-relaxed">
              Além dos briefings, estou desenvolvendo um SIEM próprio, construído para refletir
              como detecção e correlação funcionam na prática em ambientes reais de Blue Team.
            </p>
            <a
              href="https://portfolioptk.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-body hover:text-white border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-lg transition-all group"
            >
              <ExternalLink size={13} className="text-red-500" />
              Ver portfólio completo
              <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-0.5 transition-all" />
            </a>
          </div>

          <div className="space-y-3">
            <div className="bg-raised border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center">
                  <Shield size={15} className="text-red-500" />
                </div>
                <h3 className="text-sm font-bold text-white">Blue Team & Defesa</h3>
              </div>
              <p className="text-xs text-body leading-relaxed">
                Detecção de ameaças, análise de IOCs, resposta a incidentes e operações defensivas em ambientes reais.
              </p>
            </div>

            <div className="bg-raised border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center">
                  <Database size={15} className="text-red-500" />
                </div>
                <h3 className="text-sm font-bold text-white">Threat Intelligence</h3>
              </div>
              <p className="text-xs text-body leading-relaxed">
                Consumo e análise de feeds como CISA KEV, OTX AlienVault e NVD. Enriquecimento de IOCs e mapeamento MITRE ATT&CK.
              </p>
            </div>

            <div className="bg-raised border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-orange-600/10 border border-orange-600/20 flex items-center justify-center">
                  <Cpu size={15} className="text-orange-400" />
                </div>
                <h3 className="text-sm font-bold text-white">SIEM Próprio <span className="text-xs font-medium text-orange-400 ml-2 px-1.5 py-0.5 rounded bg-orange-600/10 border border-orange-600/20">EM DESENVOLVIMENTO</span></h3>
              </div>
              <p className="text-xs text-body leading-relaxed">
                Plataforma de detecção e correlação construída do zero, baseada em como Blue Teams reais operam. Em breve disponível neste site.
              </p>
            </div>
          </div>
        </div>

        {/* Como a plataforma funciona */}
        <div>
          <div className="text-xs font-semibold text-dim uppercase tracking-widest mb-4">Como Funciona</div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-3">Do feed bruto ao briefing acionável</h2>
          <p className="text-sm text-body mb-8 max-w-2xl leading-relaxed">
            A plataforma roda um pipeline automatizado que coleta dados de fontes abertas,
            normaliza e enriquece cada ameaça e publica briefings em português atualizados continuamente.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {pipeline.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="relative">
                  {i < pipeline.length - 1 && (
                    <div className="hidden lg:block absolute top-6 left-full w-full h-[1px] bg-gradient-to-r from-red-600/20 to-transparent z-10" />
                  )}
                  <div className="bg-raised border border-white/[0.06] rounded-xl p-5">
                    <div className="w-9 h-9 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center mb-3">
                      <Icon size={16} className="text-red-500" />
                    </div>
                    <div className="text-xs font-bold text-dim font-mono mb-1">{String(i + 1).padStart(2, "0")}</div>
                    <h3 className="text-sm font-bold text-white mb-2">{step.label}</h3>
                    <p className="text-xs text-body leading-relaxed">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fontes */}
        <div>
          <div className="text-xs font-semibold text-dim uppercase tracking-widest mb-4">Fontes de Dados</div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-3">De onde vem a inteligência</h2>
          <p className="text-sm text-body mb-8 max-w-2xl leading-relaxed">
            Todos os feeds são públicos e de alta credibilidade. Cada briefing referencia sua fonte
            original para rastreabilidade completa: você sempre sabe de onde veio o dado.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-raised border border-white/[0.06] hover:bg-overlay rounded-xl p-5 transition-colors"
              >
                <h3 className="text-sm font-bold text-white mb-2 group-hover:text-white transition-colors flex items-center gap-2">
                  {src.name}
                  <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-xs text-body leading-relaxed">{src.desc}</p>
              </a>
            ))}
          </div>
        </div>

        {/* Stack técnica */}
        <div>
          <div className="text-xs font-semibold text-dim uppercase tracking-widest mb-4">Stack Técnica</div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-8">Construído com</h2>
          <div className="flex flex-wrap gap-3">
            {[
              "Next.js 15", "TypeScript", "Tailwind CSS", "PostgreSQL", "Prisma",
              "Groq AI (LLaMA 3.3)", "CISA KEV API", "OTX AlienVault API", "NVD API", "Vercel",
            ].map((tech) => (
              <span
                key={tech}
                className="px-3 py-1.5 text-xs font-medium bg-raised border border-white/[0.08] rounded-lg text-body"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-raised border border-white/[0.06] rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-3">Veja a plataforma em ação</h2>
          <p className="text-body text-sm leading-relaxed mb-6 max-w-md mx-auto">
            Briefings de threat intelligence atualizados em tempo real, em português, sem cadastro.
          </p>
          <Link
            href="/threat-briefings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-all"
          >
            Ver Threat Briefings <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </main>
  );
}
