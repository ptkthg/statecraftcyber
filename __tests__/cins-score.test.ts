import { describe, it, expect } from "vitest";
import {
  isValidIpv4,
  parseCinsIps,
  buildCinsItem,
} from "../lib/threat-sources/cins-score";

const NOW = new Date("2026-06-10T12:00:00Z");

describe("isValidIpv4", () => {
  it("aceita IPv4 válido", () => {
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("8.8.8.8")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);
  });

  it("rejeita octetos > 255", () => {
    expect(isValidIpv4("256.1.1.1")).toBe(false);
    expect(isValidIpv4("1.1.1.999")).toBe(false);
  });

  it("rejeita comentários, vazio e lixo", () => {
    expect(isValidIpv4("# comment")).toBe(false);
    expect(isValidIpv4("")).toBe(false);
    expect(isValidIpv4("not-an-ip")).toBe(false);
    expect(isValidIpv4("1.2.3")).toBe(false);
    expect(isValidIpv4("::1")).toBe(false);
  });
});

describe("parseCinsIps", () => {
  it("extrai apenas linhas IPv4 válidas, com trim", () => {
    const text = "# CINS bad guys\n1.2.3.4\n  5.6.7.8  \n\ninvalid\n999.0.0.1\n9.9.9.9";
    expect(parseCinsIps(text)).toEqual(["1.2.3.4", "5.6.7.8", "9.9.9.9"]);
  });

  it("limita a 50 IPs", () => {
    const text = Array.from({ length: 80 }, (_, i) => `10.0.0.${i % 250}`).join("\n");
    expect(parseCinsIps(text)).toHaveLength(50);
  });
});

describe("buildCinsItem", () => {
  it("gera um único item com IOCs ip/medium", () => {
    const item = buildCinsItem(["1.2.3.4", "5.6.7.8"], NOW);
    expect(item).not.toBeNull();
    expect(item!.externalId).toBe("cins-score-2026-06-10");
    expect(item!.severity).toBe("medium");
    expect(item!.sourceName).toBe("CINS Score");
    expect(item!.iocs).toHaveLength(2);
    expect(item!.iocs![0]).toEqual({
      type: "ip",
      value: "1.2.3.4",
      confidence: "medium",
      source: "CINS Score",
    });
  });

  it("retorna null sem IPs", () => {
    expect(buildCinsItem([], NOW)).toBeNull();
  });
});
