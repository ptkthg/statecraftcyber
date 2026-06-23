import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  /** Modo cliente: callback ao clicar numa página. */
  onPage?: (n: number) => void;
  /** Modo servidor: gera o href de cada página (ex.: `?tab=alertas&page=2`). */
  hrefFor?: (n: number) => string;
  className?: string;
}

/** Janela compacta de páginas em torno da atual: 1 … 4 5 6 … 12 */
function pageWindow(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

export function Pagination({ page, totalPages, onPage, hrefFor, className }: Props) {
  if (totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);

  const cell = (n: number, active: boolean) =>
    cn(
      "min-w-9 rounded-full border px-3 py-1.5 text-center text-[12.5px] font-semibold transition-colors",
      active
        ? "border-white/20 bg-white/10 text-white"
        : "border-white/[0.05] text-dim hover:border-white/15 hover:text-white"
    );

  const render = (n: number) => {
    const active = n === page;
    if (hrefFor) {
      return (
        <Link key={n} href={hrefFor(n)} aria-current={active ? "page" : undefined} className={cell(n, active)}>
          {n}
        </Link>
      );
    }
    return (
      <button key={n} type="button" aria-current={active ? "page" : undefined} onClick={() => onPage?.(n)} className={cell(n, active)}>
        {n}
      </button>
    );
  };

  const arrow = (label: string, target: number, disabled: boolean) => {
    const cls = cn(
      "rounded-full border border-white/[0.05] px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
      disabled ? "text-dim/40 pointer-events-none" : "text-dim hover:border-white/15 hover:text-white"
    );
    if (hrefFor && !disabled) return <Link key={label} href={hrefFor(target)} className={cls}>{label}</Link>;
    return <button key={label} type="button" disabled={disabled} onClick={() => onPage?.(target)} className={cls}>{label}</button>;
  };

  return (
    <nav className={cn("flex items-center justify-center gap-1.5", className)} aria-label="Paginação">
      {arrow("‹", page - 1, page <= 1)}
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1 text-dim">…</span>
        ) : (
          render(it)
        )
      )}
      {arrow("›", page + 1, page >= totalPages)}
    </nav>
  );
}
