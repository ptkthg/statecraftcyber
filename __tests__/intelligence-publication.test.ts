import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { groundedFixture, NOW } from "./fixtures/intelligence";
import { validateBriefing } from "../lib/intelligence/validation";
import { generateContentHash } from "../lib/deduplication";
import { generateBriefing } from "../lib/briefing-generator";
const mocks=vi.hoisted(()=>({
 fetch:vi.fn(),epss:vi.fn(),generate:vi.fn(),
 findMany:vi.fn(),create:vi.fn(),update:vi.fn(),upsert:vi.fn(),deleteIocs:vi.fn(),log:vi.fn(),
}));
vi.mock("@/lib/threat-sources",()=>({fetchAllSources:mocks.fetch,fetchEpssScores:mocks.epss}));
vi.mock("@/lib/briefing-generator",async importOriginal=>{
 const actual=await importOriginal<typeof import("../lib/briefing-generator")>();
 return {...actual,generateBriefingAsync:mocks.generate};
});
vi.mock("@/lib/prisma",()=>({prisma:{
 briefing:{findMany:mocks.findMany,create:mocks.create,update:mocks.update},
 ioc:{upsert:mocks.upsert,deleteMany:mocks.deleteIocs},cronLog:{create:mocks.log},
}}));
describe("cron publication staging",()=>{
 beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET","test-phase1");vi.stubEnv("AUTO_PUBLISH","true");
  const {item,briefing}=groundedFixture(),quality=validateBriefing(item,briefing,NOW);
  const generated={...generateBriefing(item,new Set()),title:briefing.title,summary:briefing.executiveSummary,content:"Source-backed content",structuredContent:{...briefing,quality},qualityReport:quality,analysisStatus:quality.analysisStatus};
  mocks.fetch.mockResolvedValue({items:[item],errors:[],sources:["NVD"]});
  mocks.epss.mockResolvedValue({});mocks.generate.mockResolvedValue(generated);
  mocks.findMany.mockResolvedValue([]);mocks.create.mockResolvedValue({id:"created"});
  mocks.update.mockResolvedValue({id:"existing"});mocks.deleteIocs.mockResolvedValue({count:0});mocks.upsert.mockResolvedValue({});mocks.log.mockResolvedValue({});
 });
 afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
 async function run(secret="test-phase1"){
  const {GET}=await import("../app/api/cron/update-briefings/route");
  return GET(new NextRequest("https://example.com/api/cron/update-briefings",{headers:{authorization:"Bearer "+secret}}));
 }
 it("always inserts draft with proof before a separate promotion",async()=>{
  expect((await run()).status).toBe(200);
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({status:"draft",analysisStatus:"validated",qualityReport:{publishable:true},sourceSnapshot:{description:expect.any(String)}});
  expect(mocks.update).toHaveBeenCalledWith({where:{id:"created"},data:{status:"published"}});
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
 });
 it("stores insufficient generation but never promotes it even with AUTO_PUBLISH",async()=>{
  const {item}=groundedFixture();mocks.generate.mockResolvedValue(generateBriefing(item,new Set()));
  const response=await run();const body=await response.json();
  expect(mocks.create.mock.calls[0][0].data).toMatchObject({status:"draft",analysisStatus:"preliminary"});
  expect(mocks.update).not.toHaveBeenCalled();expect(body.errors.join(" ")).toContain("content.missing");
 });
 it("does not expose a half-written briefing when IOC persistence fails",async()=>{
  const generated=await mocks.generate();generated.iocs=[{type:"ip",value:"203.0.113.42",confidence:"low",source:"test"}];
  mocks.generate.mockResolvedValue(generated);mocks.upsert.mockRejectedValue(new Error("IOC write failed"));
  const response=await run();expect(response.status).toBe(200);
  expect(mocks.create.mock.calls[0][0].data.status).toBe("draft");expect(mocks.update).not.toHaveBeenCalled();
 });
 it("keeps a valid extraction in draft when automatic publication is disabled",async()=>{
  vi.stubEnv("AUTO_PUBLISH","false");await run();expect(mocks.update).not.toHaveBeenCalled();
 });
 it("recollects a legacy source under the same identity without duplicating the briefing",async()=>{
  const {item}=groundedFixture();
  mocks.findMany.mockResolvedValueOnce([{id:"existing",slug:"original-slug",contentHash:generateContentHash(item),sourceSnapshot:null}]).mockResolvedValue([]);
  await run();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update.mock.calls[0][0].data).toMatchObject({status:"draft",slug:"original-slug",sourceSnapshot:{description:item.description}});
  expect(mocks.deleteIocs).toHaveBeenCalledWith({where:{briefingId:"existing"}});
 });
 it("fails closed on deduplication read errors instead of assuming an empty database",async()=>{
  mocks.findMany.mockRejectedValueOnce(new Error("DB unavailable"));
  expect((await run()).status).toBe(500);
  expect(mocks.create).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
 });
 it("does not collect, generate or store anything without authentication",async()=>{
  expect((await run("wrong-secret")).status).toBe(401);expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
 });
});