import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  description?: string;
  /** Itens meta em mono (ex.: "142 publicados · 5 críticos"). O primeiro com `live` ganha dot pulsante. */
  meta?: { text: string; live?: boolean }[];
  children?: ReactNode; // breadcrumb/tags acima do título
}

export function PageHeader({ title, description, meta, children }: Props) {
  return (
    <div className="pb-7 pt-2">
      {children}
      <h1 className="font-display text-[32px] font-bold tracking-tight text-ink mb-2">{title}</h1>
      {description && <p className="max-w-2xl text-[14.5px] leading-relaxed text-body">{description}</p>}
      {meta && meta.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px] text-dim">
          {meta.map((m, i) => (
            <span key={i} className={m.live ? "flex items-center gap-2 text-body" : undefined}>
              {m.live && <span className="h-[7px] w-[7px] rounded-full bg-brand pulse-dot" aria-hidden />}
              {m.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
