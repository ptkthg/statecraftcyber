import type { RawIOC } from "../threat-sources/types";
export function iocDisposition(ioc: RawIOC, now = new Date()): { action: "review" | "conditional-containment"; reason: string } {
  const age = now.getTime() - new Date(ioc.lastSeen ?? "").getTime();
  const recent = Number.isFinite(age) && age >= 0 && age <= 7 * 86400000;
  const provenance = !!ioc.sourceUrl && /^https:\/\//.test(ioc.sourceUrl);
  if (ioc.confidence !== "high" || !recent || !provenance || !ioc.locallyConfirmed || ioc.sharedInfrastructure !== false) {
    return { action: "review", reason: "Correlacione o indicador com telemetria local, procedência, última observação e infraestrutura compartilhada; avalie falsos positivos antes de conter. A listagem não autoriza bloqueio automático." };
  }
  return { action: "conditional-containment", reason: "Indicador recente, de alta confiança e confirmado localmente. Avalie contenção temporária e reversível com aprovação operacional e prazo de reavaliação; não aplique bloqueio indiscriminado." };
}
export function safeOperationalActions(iocs: RawIOC[], now = new Date()): string[] {
  return [...new Set(iocs.map(ioc => iocDisposition(ioc, now).reason))];
}