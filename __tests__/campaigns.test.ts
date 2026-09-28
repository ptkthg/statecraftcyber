import { describe, expect, it } from "vitest";
import { campaigns, mentionsCampaign } from "@/data/campaigns";

describe("campaign curation", () => {
  it("keeps each case traceable to primary sources", () => {
    expect(new Set(campaigns.map((campaign) => campaign.slug)).size).toBe(campaigns.length);
    for (const campaign of campaigns) {
      expect(campaign.sources.length).toBeGreaterThan(0);
      expect(campaign.timeline.every((entry) => campaign.sources.some((source) => source.url === entry.source))).toBe(true);
      expect(campaign.indicators.every((ioc) => campaign.sources.some((source) => source.url === ioc.source))).toBe(true);
    }
  });

  it("does not attach generic topic coverage to an attributed campaign", () => {
    const oracle = campaigns.find((campaign) => campaign.slug === "unc6240-oracle-peoplesoft")!;
    expect(mentionsCampaign("Oracle PeopleSoft recebe atualização de rotina", oracle)).toBe(false);
    expect(mentionsCampaign("UNC6240 explora CVE-2026-35273", oracle)).toBe(true);
    const azure = campaigns.find((campaign) => campaign.slug === "storm-3168-azure")!;
    expect(mentionsCampaign("Atualização de segurança para Azure Storage", azure)).toBe(false);
  });
});
