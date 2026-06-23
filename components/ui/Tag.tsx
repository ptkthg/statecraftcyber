import type { ReactNode } from "react";

type Variant = "alert" | "warn" | "info" | "plain" | "solid";

const STYLES: Record<Variant, string> = {
  alert: "bg-[rgba(var(--primary-rgb),0.14)] text-brand-soft",
  warn:  "bg-yellow-600/15 text-yellow-400",
  info:  "bg-[rgba(127,163,184,0.12)] text-cold",
  plain: "bg-white/[0.06] text-dim",
  solid: "bg-brand text-white",
};

export function Tag({ variant = "plain", children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${STYLES[variant]}`}>
      {children}
    </span>
  );
}
