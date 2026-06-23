import { describe, it, expect } from "vitest";
import { classifyNewsTitle, aggregateRegions, summarizeCriticalTags } from "@/lib/home-stats";

describe("classifyNewsTitle", () => {
  it("classifica títulos acionáveis como alert", () => {
    expect(classifyNewsTitle("Microsoft corrige 67 falhas no Patch Tuesday")).toBe("alert");
    expect(classifyNewsTitle("Cisco publica patch para falha explorada")).toBe("alert");
    expect(classifyNewsTitle("Fortinet: atualização urgente para FortiOS")).toBe("alert");
    expect(classifyNewsTitle("Falha zero-day explorada ativamente em VPNs")).toBe("alert");
  });
  it("classifica o resto como context", () => {
    expect(classifyNewsTitle("Nacional ucraniano admite envolvimento em ransomware")).toBe("context");
    expect(classifyNewsTitle("ANPD multa empresa por vazamento de dados")).toBe("context");
  });
});

describe("aggregateRegions", () => {
  it("agrega briefings por região com contagem por severidade", () => {
    const rows = aggregateRegions([
      { affectedRegions: ["Europa"], severity: "critical" },
      { affectedRegions: ["Europa", "LATAM"], severity: "low" },
      { affectedRegions: ["LATAM"], severity: "medium" },
    ]);
    expect(rows).toEqual([
      { region: "Europa", critical: 1, medium: 0, low: 1, total: 2 },
      { region: "LATAM", critical: 0, medium: 1, low: 1, total: 2 },
    ]);
  });
  it("conta high como medium (3 faixas visuais) e ordena por críticos depois total", () => {
    const rows = aggregateRegions([
      { affectedRegions: ["Ásia"], severity: "high" },
      { affectedRegions: ["Global"], severity: "critical" },
    ]);
    expect(rows[0].region).toBe("Global");
    expect(rows[1]).toEqual({ region: "Ásia", critical: 0, medium: 1, low: 0, total: 1 });
  });
  it("retorna lista vazia sem briefings", () => {
    expect(aggregateRegions([])).toEqual([]);
  });
});

describe("summarizeCriticalTags", () => {
  it("monta resumo a partir das tags dos críticos", () => {
    const s = summarizeCriticalTags([
      { tags: ["exploração-ativa", "cisa-kev"] },
      { tags: ["ransomware"] },
      { tags: ["exploração-ativa"] },
    ]);
    expect(s).toBe("2 explorados ativamente · 1 com ransomware · 1 no KEV/CISA");
  });
  it("omite categorias zeradas e retorna null se todas zeradas", () => {
    expect(summarizeCriticalTags([{ tags: ["ransomware"] }])).toBe("1 com ransomware");
    expect(summarizeCriticalTags([{ tags: ["phishing"] }])).toBeNull();
  });
});
