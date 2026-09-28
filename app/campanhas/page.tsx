import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Crosshair, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { campaigns } from "@/data/campaigns";

export const metadata: Metadata = {
  title: "Campanhas em acompanhamento | Statecraft Cyber Intelligence",
  description: "Casos documentados de ameaças cibernéticas, com cronologia, técnicas, indicadores e fontes primárias.",
};

export default function CampanhasPage() {
  return (
    <main className="min-h-screen bg-canvas pt-16">
      <div className="mx-auto max-w-[1140px] px-6 pb-24 pt-8">
        <PageHeader
          title="Campanhas em acompanhamento"
          description="Acompanhe casos documentados, seus impactos e medidas de defesa. Cada atribuição e indicador aponta para a investigação original."
          meta={[{ text: `${campaigns.length} casos documentados` }, { text: "revisão editorial em 28 set 2026" }]}
        />
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-white/10 bg-raised p-4 text-sm leading-relaxed text-body">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-brand-soft" aria-hidden />
          <p>“Em acompanhamento” significa que o caso continua relevante para monitoramento. Não confirma atividade em tempo real. Valide os indicadores e a exposição do seu ambiente nas fontes antes de agir.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign, index) => (
            <Link key={campaign.slug} href={`/campanhas/${campaign.slug}`}
              className="group flex flex-col rounded-2xl border border-white/[0.08] bg-raised p-6 transition-colors hover:border-brand/50 hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <div className="mb-7 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wider text-dim">
                <span className="flex items-center gap-2"><Crosshair size={14} className="text-brand" aria-hidden /> Caso {String(index + 1).padStart(2, "0")}</span>
                <span>{campaign.status}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-ink group-hover:text-white">{campaign.title}</h2>
              <p className="mt-1 text-sm font-semibold text-brand-soft">{campaign.actor}</p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-body">{campaign.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {campaign.cves.map((cve) => <span key={cve.id} className="rounded-md border border-brand/20 bg-brand/10 px-2 py-1 font-mono text-[11px] text-brand-soft">{cve.id}</span>)}
                {campaign.techniques.slice(0, 2).map((technique) => <span key={technique.id} className="rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] text-dim">{technique.id}</span>)}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs text-dim">
                <span>Fontes: {campaign.sources.map((source) => source.name.split(" — ")[0]).join(" · ")}</span>
                <span className="flex items-center gap-1 font-semibold text-ink">Ver análise <ArrowUpRight size={14} aria-hidden /></span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
