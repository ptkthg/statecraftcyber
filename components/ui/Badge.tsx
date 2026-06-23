import type { ReactNode } from "react";

type Variant = "critical" | "high" | "medium" | "low" | "neutral" | "green";

const STYLES: Record<Variant, string> = {
  critical: "text-white bg-brand border-transparent",
  high:     "text-orange-400 bg-orange-600/10 border-orange-600/20",
  medium:   "text-yellow-400 bg-yellow-600/10 border-yellow-600/20",
  low:      "text-blue-400 bg-blue-600/10 border-blue-600/20",
  neutral:  "text-dim bg-white/[0.04] border-white/[0.08]",
  green:    "text-green-400 bg-green-600/10 border-green-600/20",
};

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold uppercase tracking-wider ${STYLES[variant]} ${className}`}>
      {children}
    </span>
  );
}
