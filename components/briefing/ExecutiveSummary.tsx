interface Props {
  text: string;
}

export function ExecutiveSummary({ text }: Props) {
  return (
    <div className="bg-[#0D0D0D] border-l-2 border-red-600 rounded-r-lg px-5 py-4 mb-8">
      <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">
        Resumo Executivo
      </div>
      <p className="text-sm text-[#C0C0C0] leading-relaxed">{text}</p>
    </div>
  );
}
