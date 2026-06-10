import { describe, it, expect } from "vitest";
import {
  mapConfidence,
  mapThreatFoxIoc,
  buildThreatFoxItems,
  type ThreatFoxEntry,
} from "../lib/threat-sources/threatfox";

const NOW = new Date("2026-06-10T12:00:00Z");

function entry(overrides: Partial<ThreatFoxEntry> = {}): ThreatFoxEntry {
  return {
    ioc_value: "1.2.3.4:443",
    ioc_type: "ip_port",
    threat_type: "botnet_cc",
    malware: "win.emotet",
    malware_printable: "Emotet",
    confidence_level: 90,
    first_seen: "2026-06-10 08:00:00 UTC",
    tags: ["emotet"],
    ...overrides,
  };
}

describe("mapConfidence", () => {
  it("75-100 → high", () => {
    expect(mapConfidence(75)).toBe("high");
    expect(mapConfidence(100)).toBe("high");
  });

  it("50-74 → medium", () => {
    expect(mapConfidence(50)).toBe("medium");
    expect(mapConfidence(74)).toBe("medium");
  });

  it("<50 → low", () => {
    expect(mapConfidence(49)).toBe("low");
    expect(mapConfidence(0)).toBe("low");
  });
});

describe("mapThreatFoxIoc", () => {
  it("ip_port → ip, extraindo o IP antes da porta", () => {
    const ioc = mapThreatFoxIoc(entry({ ioc_value: "10.0.0.1:8080", ioc_type: "ip_port" }));
    expect(ioc).toEqual({ type: "ip", value: "10.0.0.1", confidence: "high", source: "ThreatFox" });
  });

  it("domain → domain", () => {
    const ioc = mapThreatFoxIoc(entry({ ioc_value: "evil.com", ioc_type: "domain" }));
    expect(ioc?.type).toBe("domain");
    expect(ioc?.value).toBe("evil.com");
  });

  it("url → url", () => {
    expect(mapThreatFoxIoc(entry({ ioc_value: "http://evil.com/x", ioc_type: "url" }))?.type).toBe("url");
  });

  it("md5_hash e sha256_hash → hash", () => {
    expect(mapThreatFoxIoc(entry({ ioc_type: "md5_hash" }))?.type).toBe("hash");
    expect(mapThreatFoxIoc(entry({ ioc_type: "sha256_hash" }))?.type).toBe("hash");
  });

  it("tipo desconhecido → null", () => {
    expect(mapThreatFoxIoc(entry({ ioc_type: "envelope_from" }))).toBeNull();
  });
});

describe("buildThreatFoxItems", () => {
  it("agrupa por família de malware", () => {
    const items = buildThreatFoxItems(
      [
        entry({ malware: "win.emotet", malware_printable: "Emotet" }),
        entry({ malware: "win.emotet", malware_printable: "Emotet", ioc_value: "5.6.7.8:80" }),
        entry({ malware: "win.qakbot", malware_printable: "QakBot" }),
      ],
      NOW
    );
    expect(items).toHaveLength(2);
    const emotet = items.find((i) => i.externalId === "threatfox-emotet-2026-06-10");
    expect(emotet).toBeDefined();
    expect(emotet!.iocs).toHaveLength(2);
  });

  it("limita ao top 5 de famílias por volume", () => {
    const entries: ThreatFoxEntry[] = [];
    for (let f = 0; f < 7; f++) {
      // família f tem f+1 entradas — fam6 é a maior
      for (let n = 0; n <= f; n++) {
        entries.push(entry({ malware: `fam${f}`, malware_printable: `Fam${f}`, ioc_value: `10.0.${f}.${n}:80` }));
      }
    }
    const items = buildThreatFoxItems(entries, NOW);
    expect(items).toHaveLength(5);
    // as duas menores (fam0, fam1) ficam de fora
    expect(items.some((i) => i.externalId.includes("fam0"))).toBe(false);
    expect(items.some((i) => i.externalId.includes("fam1"))).toBe(false);
  });

  it("limita a 20 IOCs por família", () => {
    const entries = Array.from({ length: 30 }, (_, n) =>
      entry({ ioc_value: `10.1.1.${n}:80` })
    );
    const items = buildThreatFoxItems(entries, NOW);
    expect(items[0].iocs).toHaveLength(20);
  });

  it("severity high para botnet_cc e payload_delivery, medium para demais", () => {
    const [cc] = buildThreatFoxItems([entry({ threat_type: "botnet_cc" })], NOW);
    expect(cc.severity).toBe("high");
    const [pd] = buildThreatFoxItems([entry({ threat_type: "payload_delivery" })], NOW);
    expect(pd.severity).toBe("high");
    const [other] = buildThreatFoxItems([entry({ threat_type: "phishing" })], NOW);
    expect(other.severity).toBe("medium");
  });

  it("ignora entradas com ioc_type não mapeado", () => {
    const items = buildThreatFoxItems([entry({ ioc_type: "envelope_from" })], NOW);
    expect(items).toHaveLength(0);
  });

  it("gera externalId com slug da família e data", () => {
    const [item] = buildThreatFoxItems(
      [entry({ malware: "win.cobalt_strike", malware_printable: "Cobalt Strike" })],
      NOW
    );
    expect(item.externalId).toBe("threatfox-cobalt-strike-2026-06-10");
    expect(item.sourceName).toBe("abuse.ch / ThreatFox");
    expect(item.tags).toContain("threatfox");
  });
});
