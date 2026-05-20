import type { Confidence } from "@/lib/types";

interface Props {
  level: Confidence;
  reason: string;
}

const CONFIDENCE_STYLES: Record<Confidence, { label: string; color: string; bg: string; border: string }> = {
  high:   { label: "Alta",  color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20"  },
  medium: { label: "Média", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  low:    { label: "Baixa", color: "text-[#888]",     bg: "bg-white/[0.03]",  border: "border-white/[0.06]"  },
};

export function ConfidenceBlock({ level, reason }: Props) {
  const s = CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.medium;

  return (
    <div className={`rounded-xl px-5 py-4 border ${s.bg} ${s.border}`}>
      <div className={`text-xs font-black uppercase tracking-wider mb-2 ${s.color}`}>
        Confiança {s.label}
      </div>
      <p className="text-sm text-[#A1A1AA] leading-relaxed">{reason}</p>
    </div>
  );
}
