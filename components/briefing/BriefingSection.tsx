interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function BriefingSection({ title, children, className, icon }: Props) {
  return (
    <section className={`mt-8 pt-6 border-t border-white/[0.04] ${className ?? ""}`}>
      <h2 className="flex items-center gap-3 text-base font-black text-white uppercase tracking-wider mb-5">
        <span className="w-0.5 h-4 bg-red-600 rounded-full flex-shrink-0" />
        {icon && <span className="text-red-500">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}
