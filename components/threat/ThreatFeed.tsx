"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Shield, Activity } from "lucide-react";

const feedItems = [
  { type: "critical", message: "Novo C2 detectado: 185.220.101.45 → 47 endpoints afetados", time: "agora" },
  { type: "high", message: "FINTR phishing campaign ativa em 3 países da LATAM", time: "2 min" },
  { type: "medium", message: "CVE-2026-1337 exploit público disponível, patch urgente recomendado", time: "5 min" },
  { type: "critical", message: "Qlin Ransomware staging detectado em setor de saúde", time: "8 min" },
  { type: "high", message: "Acesso privilegiado anômalo detectado: 4 alertas correlacionados", time: "12 min" },
  { type: "medium", message: "DNS tunneling suspeito identificado em 2 endpoints", time: "18 min" },
  { type: "high", message: "Supply chain: pacote npm malicioso com 2.500+ downloads removido", time: "24 min" },
  { type: "critical", message: "UNC3884 movimentação lateral detectada em infraestrutura crítica", time: "31 min" },
];

const typeConfig = {
  critical: { color: "text-red-500", bg: "bg-red-600/10", border: "border-red-600/20", icon: AlertTriangle, dot: "bg-red-600" },
  high: { color: "text-orange-400", bg: "bg-orange-600/10", border: "border-orange-600/20", icon: Shield, dot: "bg-orange-500" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-600/10", border: "border-yellow-600/20", icon: Activity, dot: "bg-yellow-500" },
};

export default function ThreatFeed() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % feedItems.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const visibleItems = Array.from({ length: 5 }, (_, i) => feedItems[(offset + i) % feedItems.length]);

  return (
    <div className="bg-[#0A0A0A] border border-white/5 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-600 blink" />
          <span className="text-xs font-semibold tracking-widest text-white uppercase">
            Feed de Ameaças ao Vivo
          </span>
        </div>
        <span className="text-xs text-[#A1A1AA] font-mono">ATUALIZADO EM TEMPO REAL</span>
      </div>

      {/* Items */}
      <div className="divide-y divide-white/[0.04]">
        {visibleItems.map((item, i) => {
          const config = typeConfig[item.type as keyof typeof typeConfig];
          const Icon = config.icon;
          return (
            <Link
              key={i}
              href="/threat-briefings"
              className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${config.bg} ${config.border} border`}>
                <Icon size={10} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#D4D4D8] leading-relaxed">{item.message}</p>
              </div>
              <span className="flex-shrink-0 text-[10px] text-[#666] font-mono whitespace-nowrap">
                {item.time}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-[#666]">1.247.832 eventos processados hoje</span>
        <Link href="/threat-briefings" className="text-xs text-red-500 hover:text-red-400 font-medium transition-colors">
          Ver todos →
        </Link>
      </div>
    </div>
  );
}
