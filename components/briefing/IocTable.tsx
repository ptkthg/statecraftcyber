"use client";

import { CopyButton } from "./CopyButton";
import type { Ioc } from "@/lib/types";

interface Props {
  iocs: Ioc[];
}

const IOC_TYPE_LABELS: Record<string, string> = {
  ip: "Endereço IP",
  domain: "Domínio",
  url: "URL",
  hash: "Hash",
  email: "E-mail",
  file: "Arquivo",
  c2: "Servidor C2",
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-dim",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "confirmado",
  medium: "provável",
  low: "suspeito",
};

export function IocTable({ iocs }: Props) {
  if (iocs.length === 0) {
    return <EmptyIocState />;
  }

  const byType: Record<string, Ioc[]> = {};
  for (const ioc of iocs) {
    if (!byType[ioc.type]) byType[ioc.type] = [];
    byType[ioc.type].push(ioc);
  }

  const allValues = iocs.map((i) => i.value).join("\n");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#666]">
          Adicione ao SIEM, EDR e firewall.
          {iocs.length > 15 && ` ${iocs.length} indicadores.`}
        </p>
        <CopyButton text={allValues} label="Copiar todos" />
      </div>

      {Object.entries(byType).map(([type, list]) => (
        <div key={type}>
          <div className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">
            {IOC_TYPE_LABELS[type] ?? type} ({list.length})
          </div>
          <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl overflow-hidden">
            {list.map((ioc, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0 group"
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CONFIDENCE_DOT[ioc.confidence] ?? "bg-dim"}`} />
                <code className="text-[11px] font-mono text-[#A1A1AA] flex-1 break-all" title={ioc.value}>
                  {ioc.value}
                </code>
                <span className="text-[10px] text-[#666] flex-shrink-0 font-medium">
                  {CONFIDENCE_LABELS[ioc.confidence] ?? ioc.confidence}
                </span>
                <CopyButton text={ioc.value} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyIocState() {
  return (
    <div className="bg-[#0D0D0D] border border-white/[0.06] rounded-xl px-5 py-6 text-center">
      <p className="text-sm text-[#A1A1AA]">
        Nenhum IOC estruturado foi identificado na fonte original.
      </p>
      <p className="text-xs text-[#666] mt-1.5 leading-relaxed">
        Consulte a fonte diretamente para busca manual de indicadores.
      </p>
    </div>
  );
}
