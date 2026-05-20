interface Props {
  text: string;
  severity?: "critical" | "high" | "medium" | "low";
}

const SEVERITY_SUMMARY: Record<string, string> = {
  critical: "border-red-600 bg-red-600/[0.04]",
  high:     "border-orange-500 bg-orange-500/[0.03]",
  medium:   "border-yellow-500 bg-yellow-500/[0.03]",
  low:      "border-blue-500 bg-blue-500/[0.03]",
};

const SEVERITY_LABEL_COLOR: Record<string, string> = {
  critical: "text-red-500",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-blue-400",
};

export function ExecutiveSummary({ text, severity = "high" }: Props) {
  const style = SEVERITY_SUMMARY[severity] ?? SEVERITY_SUMMARY.high;
  const labelColor = SEVERITY_LABEL_COLOR[severity] ?? SEVERITY_LABEL_COLOR.high;

  return (
    <div className={`border-l-2 rounded-r-lg px-5 py-4 mb-8 ${style}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${labelColor}`}>
        Resumo Executivo
      </div>
      <p className="text-sm text-[#C0C0C0] leading-relaxed">{text}</p>
    </div>
  );
}
