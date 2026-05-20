interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function BriefingSection({ title, children, className }: Props) {
  return (
    <section className={`mt-10 pt-8 border-t border-white/[0.04] ${className ?? ""}`}>
      <h2 className="text-sm font-black text-white uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </section>
  );
}
