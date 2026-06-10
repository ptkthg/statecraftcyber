import { describe, it, expect } from "vitest";
import {
  buildFeodoItems,
  type FeodoEntry,
} from "../lib/threat-sources/feodo-tracker";

const NOW = new Date("2026-06-10T12:00:00Z");

function entry(overrides: Partial<FeodoEntry> = {}): FeodoEntry {
  return {
    ip_address: "1.2.3.4",
    port: 443,
    status: "online",
    malware: "Emotet",
    first_seen: "2026-06-09 10:00:00",
    last_online: "2026-06-10",
    ...overrides,
  };
}

describe("buildFeodoItems", () => {
  it("inclui apenas entradas com status online", () => {
    const items = buildFeodoItems(
      [entry({ status: "online" }), entry({ status: "offline", ip_address: "5.6.7.8" })],
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0].iocs).toHaveLength(1);
    expect(items[0].iocs![0].value).toBe("1.2.3.4");
  });

  it("agrupa por família de botnet", () => {
    const items = buildFeodoItems(
      [
        entry({ malware: "Emotet" }),
        entry({ malware: "QakBot", ip_address: "9.9.9.9" }),
      ],
      NOW
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.externalId).sort()).toEqual([
      "feodo-emotet-2026-06-10",
      "feodo-qakbot-2026-06-10",
    ]);
  });

  it("limita ao top 5 de famílias e 20 IPs por família", () => {
    const entries: FeodoEntry[] = [];
    for (let f = 0; f < 6; f++) {
      for (let n = 0; n <= f * 5; n++) {
        entries.push(entry({ malware: `Fam${f}`, ip_address: `10.${f}.0.${n}` }));
      }
    }
    const items = buildFeodoItems(entries, NOW);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.iocs!.length).toBeLessThanOrEqual(20);
    }
  });

  it("IOCs são sempre ip com confidence high; severity sempre high", () => {
    const [item] = buildFeodoItems([entry()], NOW);
    expect(item.severity).toBe("high");
    expect(item.iocs![0]).toEqual({
      type: "ip",
      value: "1.2.3.4",
      confidence: "high",
      source: "Feodo Tracker",
    });
    expect(item.sourceName).toBe("abuse.ch / Feodo Tracker");
    expect(item.mitreTechniques).toEqual(["T1071", "T1090"]);
  });

  it("retorna vazio se nada está online", () => {
    expect(buildFeodoItems([entry({ status: "offline" })], NOW)).toHaveLength(0);
  });
});
