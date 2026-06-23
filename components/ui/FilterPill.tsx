"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  active?: boolean;
  /** Pílula de severidade crítica: ativo fica vermelho semântico. */
  critical?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function FilterPill({ active, critical, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        active
          ? critical
            ? "border-[rgba(var(--primary-rgb),0.4)] bg-[rgba(var(--primary-rgb),0.16)] text-brand-soft"
            : "border-white/20 bg-white/10 text-white"
          : "border-white/[0.05] text-dim hover:border-white/15 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
