export interface SourceColor {
  dot: string;
  badge: string;
}

export const SOURCE_COLORS: Record<string, SourceColor> = {
  // ── Vendor Labs ──────────────────────────────────────────────────────────────
  "Microsoft Security Blog": { dot: "bg-blue-500",    badge: "text-blue-400 bg-blue-600/10 border-blue-600/20" },
  "Google Mandiant Blog":    { dot: "bg-orange-500",  badge: "text-orange-400 bg-orange-600/10 border-orange-600/20" },
  "Palo Alto Unit 42":       { dot: "bg-brand",     badge: "text-brand-soft bg-brand/10 border-brand/20" },
  "CrowdStrike Blog":        { dot: "bg-rose-600",    badge: "text-rose-300 bg-rose-600/10 border-rose-600/20" },
  "Cisco Talos":             { dot: "bg-sky-500",     badge: "text-sky-400 bg-sky-600/10 border-sky-600/20" },
  "Securelist":              { dot: "bg-emerald-500", badge: "text-emerald-400 bg-emerald-600/10 border-emerald-600/20" },
  "Check Point Research":    { dot: "bg-amber-500",   badge: "text-amber-400 bg-amber-600/10 border-amber-600/20" },
  "Malwarebytes Labs":       { dot: "bg-violet-500",  badge: "text-violet-400 bg-violet-600/10 border-violet-600/20" },
  // ── Notícias gerais ──────────────────────────────────────────────────────────
  "The Hacker News":         { dot: "bg-purple-500",  badge: "text-purple-400 bg-purple-600/10 border-purple-600/20" },
  "BleepingComputer":        { dot: "bg-indigo-500",  badge: "text-indigo-400 bg-indigo-600/10 border-indigo-600/20" },
  "Krebs on Security":       { dot: "bg-orange-400",  badge: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
  "Dark Reading":            { dot: "bg-teal-500",    badge: "text-teal-400 bg-teal-600/10 border-teal-600/20" },
  // ── Governo / CERT ───────────────────────────────────────────────────────────
  "CISA Alerts":             { dot: "bg-blue-400",    badge: "text-blue-300 bg-blue-500/10 border-blue-500/20" },
  "SANS ISC":                { dot: "bg-slate-400",   badge: "text-slate-300 bg-slate-500/10 border-slate-500/20" },
  "CERT.br":                 { dot: "bg-green-500",   badge: "text-green-400 bg-green-600/10 border-green-600/20" },
  "CTIR Gov":                { dot: "bg-yellow-500",  badge: "text-yellow-400 bg-yellow-600/10 border-yellow-600/20" },
  "ANPD":                    { dot: "bg-yellow-400",  badge: "text-yellow-300 bg-yellow-500/10 border-yellow-500/20" },
  // ── Brasil ───────────────────────────────────────────────────────────────────
  "Tempest Security":        { dot: "bg-fuchsia-500", badge: "text-fuchsia-400 bg-fuchsia-600/10 border-fuchsia-600/20" },
  "TI Safe":                 { dot: "bg-lime-500",    badge: "text-lime-400 bg-lime-600/10 border-lime-600/20" },
};

export const SOURCE_FALLBACK: SourceColor = {
  dot:   "bg-dim",
  badge: "text-dim bg-white/[0.04] border-white/[0.08]",
};

export function getSourceColor(source: string): SourceColor {
  return SOURCE_COLORS[source] ?? SOURCE_FALLBACK;
}
