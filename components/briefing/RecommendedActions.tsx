interface Props {
  actions: string[];
}

export function RecommendedActions({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <ol className="space-y-3">
      {actions.map((action, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-shrink-0 w-5 h-5 rounded bg-white/[0.04] border border-white/[0.08] text-xs font-bold text-dim flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <p className="text-sm text-body leading-relaxed">{action}</p>
        </li>
      ))}
    </ol>
  );
}
