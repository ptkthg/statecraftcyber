interface Props {
  suggestions: string[];
}

export function DetectionSuggestions({ suggestions }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {suggestions.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="text-red-500/60 mt-0.5 flex-shrink-0 font-mono text-xs">›</span>
          <p className="text-sm text-[#C0C0C0] leading-relaxed">{s}</p>
        </li>
      ))}
    </ul>
  );
}
