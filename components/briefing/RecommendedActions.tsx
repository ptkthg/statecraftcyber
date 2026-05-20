interface Props {
  actions: string[];
}

export function RecommendedActions({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <ol className="space-y-3">
      {actions.map((action, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-shrink-0 w-5 h-5 rounded bg-red-600/10 border border-red-600/20 text-[10px] font-black text-red-400 flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <p className="text-sm text-[#C0C0C0] leading-relaxed">{action}</p>
        </li>
      ))}
    </ol>
  );
}
