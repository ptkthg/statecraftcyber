import Link from "next/link";
import { Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { type Briefing } from "@/data/briefings";
import { cn, formatDate } from "@/lib/utils";

const severityConfig = {
  critical: { label: "Crítico", color: "text-red-500", bg: "bg-red-600/10", border: "border-red-600/20" },
  high: { label: "Alto", color: "text-orange-400", bg: "bg-orange-600/10", border: "border-orange-600/20" },
  medium: { label: "Médio", color: "text-yellow-400", bg: "bg-yellow-600/10", border: "border-yellow-600/20" },
  low: { label: "Baixo", color: "text-green-400", bg: "bg-green-600/10", border: "border-green-600/20" },
};

interface BriefingCardProps {
  briefing: Briefing;
  variant?: "default" | "featured" | "compact";
}

export default function BriefingCard({ briefing, variant = "default" }: BriefingCardProps) {
  const sev = severityConfig[briefing.severity];
  const href = briefing.slug ? `/threat-briefings/${briefing.slug}` : "/threat-briefings";

  if (variant === "compact") {
    return (
      <Link href={href} className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0 group hover:opacity-80 transition-opacity">
        <div className={cn("mt-0.5 w-2 h-2 rounded-full flex-shrink-0", {
          "bg-red-600": briefing.severity === "critical",
          "bg-orange-500": briefing.severity === "high",
          "bg-yellow-500": briefing.severity === "medium",
          "bg-green-500": briefing.severity === "low",
        })} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#D4D4D8] leading-relaxed line-clamp-2 group-hover:text-white transition-colors">
            {briefing.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-[10px] font-medium", sev.color)}>{sev.label}</span>
            <span className="text-[10px] text-[#A1A1AA]">{formatDate(briefing.date)}</span>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "featured") {
    return (
      <Link href={href} className="block card-dark rounded-xl p-6 border border-white/[0.06] hover:border-red-600/20 transition-all duration-300 group">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border", sev.color, sev.bg, sev.border)}>
              <AlertTriangle size={10} />
              {sev.label}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/5 text-[#A1A1AA] border border-white/10">
              {briefing.category}
            </span>
            {briefing.region && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/5 text-[#A1A1AA] border border-white/10">
                {briefing.region}
              </span>
            )}
          </div>
          <span className="text-xs text-[#A1A1AA] font-mono whitespace-nowrap">{formatDate(briefing.date)}</span>
        </div>

        <h3 className="text-lg font-bold text-white mb-3 leading-snug group-hover:text-red-400 transition-colors">
          {briefing.title}
        </h3>
        <p className="text-sm text-[#A1A1AA] leading-relaxed mb-4 line-clamp-3">
          {briefing.summary}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-[#A1A1AA]">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {briefing.readingTime} min
            </span>
            <span>{briefing.author}</span>
          </div>
          <span className="flex items-center gap-1 text-xs text-red-500 group-hover:text-red-400 font-medium transition-colors group-hover:gap-2">
            Ler briefing <ArrowRight size={12} />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="block card-dark rounded-lg p-5 border border-white/[0.06] hover:border-red-600/20 transition-all duration-300 group">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border", sev.color, sev.bg, sev.border)}>
          <AlertTriangle size={9} />
          {sev.label}
        </span>
        <span className="text-[10px] font-medium text-[#A1A1AA] bg-white/5 px-2 py-0.5 rounded border border-white/10">
          {briefing.category}
        </span>
      </div>

      <h3 className="text-sm font-bold text-white mb-2 leading-snug group-hover:text-red-400 transition-colors line-clamp-2">
        {briefing.title}
      </h3>
      <p className="text-xs text-[#A1A1AA] leading-relaxed mb-3 line-clamp-3">
        {briefing.summary}
      </p>

      <div className="flex items-center justify-between text-[10px] text-[#A1A1AA]">
        <div className="flex items-center gap-2">
          <Clock size={10} />
          <span>{briefing.readingTime} min de leitura</span>
          <span>·</span>
          <span>{formatDate(briefing.date)}</span>
        </div>
        <ArrowRight size={12} className="text-red-600 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}
