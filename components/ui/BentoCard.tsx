import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  /** Quando presente, o card inteiro é clicável e mostra o footlink (UX hard rule: affordance). */
  href?: string;
  /** Texto do footlink — obrigatório junto com href. */
  action?: string;
  /** Label uppercase do canto sup. esquerdo. */
  label?: string;
  labelClassName?: string;
  /** Período padronizado do canto sup. direito (ex.: "últimas 24h"). */
  period?: string;
}

export function BentoCard({ children, className, href, action, label, labelClassName, period }: Props) {
  const inner = (
    <>
      {(label || period) && (
        <div className="flex items-center justify-between mb-3">
          {label && (
            <span className={cn("text-[11px] font-bold uppercase tracking-[0.1em] text-dim", labelClassName)}>
              {label}
            </span>
          )}
          {period && <span className="text-[11px] font-mono text-dim">{period}</span>}
        </div>
      )}
      {children}
      {href && action && (
        <span className="mt-auto flex items-center gap-1.5 pt-3.5 text-[12.5px] font-semibold text-cold transition-colors group-hover:text-white">
          {action}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      )}
    </>
  );
  const base = cn(
    "relative flex flex-col overflow-hidden rounded-[20px] border border-white/[0.05] bg-raised p-6",
    "transition-all duration-200",
    href && "group cursor-pointer hover:-translate-y-0.5 hover:bg-overlay hover:border-white/10 hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)]",
    className
  );
  return href ? <Link href={href} className={base}>{inner}</Link> : <div className={base}>{inner}</div>;
}
