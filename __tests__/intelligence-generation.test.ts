import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { groundedFixture, NOW } from "./fixtures/intelligence";
const ai=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock("../lib/ai-briefing",async importOriginal=>{
 const actual=await importOriginal<typeof import("../lib/ai-briefing")>();
 return {...actual,generateAiBriefing:ai.generate};
});
import { generateBriefing, generateBriefingAsync } from "../lib/briefing-generator";
import { publicationStatus } from "../lib/intelligence/validation";
describe("generation pipeline quality integration",()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(NOW);ai.generate.mockReset();});
 afterEach(()=>vi.useRealTimers());
 it("keeps source-only fallback preliminary with no fabricated attacks or blocking advice",()=>{
  const {item}=groundedFixture();item.iocs=[{type:"ip",value:"203.0.113.42",confidence:"high",source:"community"}];
  const result=generateBriefing(item,new Set());
  expect(result.analysisStatus).toBe("preliminary");
  expect(publicationStatus(true,result.qualityReport)).toBe("draft");
  expect(result.content).not.toContain("Adicione todos os IOCs");
  expect(result.content).not.toContain("Patch imediato obrigatório");
  expect(result.sourceSnapshot).toBe(item);
 });
 it("uses one canonical confidence for metadata, narrative and structured content",async()=>{
  const {item,briefing}=groundedFixture();
  ai.generate.mockResolvedValue({title:briefing.title,summary:briefing.executiveSummary,content:"untrusted legacy markdown",structuredContent:briefing,evidenceSources:[]});
  const result=await generateBriefingAsync(item,new Set());
  expect(result.analysisStatus).toBe("validated");
  expect(result.confidence).toBe(result.structuredContent!.confidenceLevel);
  expect(result.content).toContain(result.qualityReport.risk.confidenceReason);
  expect(result.content).not.toContain("untrusted legacy markdown");
 });
 it("detects contradictory model confidence before attaching canonical presentation values",async()=>{
  const {item,briefing}=groundedFixture();briefing.confidenceLevel="high";
  ai.generate.mockResolvedValue({title:briefing.title,summary:briefing.executiveSummary,content:"",structuredContent:briefing,evidenceSources:[]});
  const result=await generateBriefingAsync(item,new Set());
  expect(result.qualityReport.issues.map(i=>i.code)).toContain("confidence.contradiction");
  expect(result.structuredContent!.confidenceLevel).toBe("medium");
  expect(result.qualityReport.publishable).toBe(false);
 });
 it("never persists CVSS for a non-CVE event even if an adapter supplied one",()=>{
  const {item}=groundedFixture();item.cves=[];
  const result=generateBriefing(item,new Set());
  expect(result.cvssScore).toBeNull();expect(result.epssScore).toBeNull();
 });
});