"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (label) {
    return (
      <button
        onClick={handleCopy}
        className={`flex items-center gap-1.5 text-[11px] font-semibold text-[#888] hover:text-white border border-white/[0.06] hover:border-white/[0.12] px-2.5 py-1 rounded transition-colors ${className}`}
      >
        {copied ? (
          <><Check size={11} className="text-green-500" /> Copiado</>
        ) : (
          <><Copy size={11} /> {label}</>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      title="Copiar"
      className={`p-1 rounded text-[#555] hover:text-[#A1A1AA] hover:bg-white/[0.04] transition-colors flex-shrink-0 ${className}`}
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
    </button>
  );
}
