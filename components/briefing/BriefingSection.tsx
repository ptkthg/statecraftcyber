interface Props {
  id?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function BriefingSection({ id, title, children, className, icon }: Props) {
  return (
    <section id={id} className={`mt-8 pt-6 pb-1 border-t border-white/[0.04] ${className ?? ""}`}>
      <h2 className="flex items-center gap-3 text-base font-bold tracking-tight text-white mb-5">
        <span className="w-0.5 h-4 bg-white/10 rounded-full flex-shrink-0" aria-hidden="true" />
        {icon && <span className="text-dim">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
