import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUBLIC_BRIEFING_WHERE, PUBLIC_IOC_WHERE } from "../lib/intelligence/publication";
const mocks=vi.hoisted(()=>({briefings:vi.fn(),one:vi.fn(),iocs:vi.fn(),count:vi.fn(),groups:vi.fn(),raw:vi.fn(),cves:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{
 briefing:{findMany:mocks.briefings,findFirst:mocks.one},
 ioc:{findMany:mocks.iocs,count:mocks.count,groupBy:mocks.groups},
 cveCache:{findMany:mocks.cves},$queryRaw:mocks.raw,
}}));
vi.mock("@/lib/live-preview",()=>({getLivePreview:vi.fn().mockResolvedValue(null)}));
vi.mock("@/lib/security/rate-limit",()=>({checkRateLimit:()=>({allowed:true,retryAfterMs:0})}));
describe("public intelligence read boundaries",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.briefings.mockResolvedValue([]);mocks.one.mockResolvedValue(null);mocks.iocs.mockResolvedValue([]);mocks.count.mockResolvedValue(1);mocks.groups.mockResolvedValue([]);mocks.raw.mockResolvedValue([]);mocks.cves.mockResolvedValue([]);});
 it("filters both briefings and latest IOC sidebar entries",async()=>{
  const {GET}=await import("../app/api/briefings/route");
  expect((await GET(new NextRequest("https://example.com/api/briefings"))).status).toBe(200);
  expect(mocks.briefings.mock.calls[0][0].where).toEqual(PUBLIC_BRIEFING_WHERE);
  expect(mocks.iocs.mock.calls[0][0].where).toEqual(PUBLIC_IOC_WHERE);
 });
 it("filters IOC results, counts and group statistics by the parent publication proof",async()=>{
  const {GET}=await import("../app/api/iocs/route");
  await GET(new NextRequest("https://example.com/api/iocs?q=example&type=domain"));
  expect(mocks.iocs.mock.calls[0][0].where).toMatchObject(PUBLIC_IOC_WHERE);
  expect(mocks.count.mock.calls.every(([args])=>args.where.briefing.is.analysisStatus==="validated")).toBe(true);
  expect(mocks.groups.mock.calls[0][0].where).toEqual(PUBLIC_IOC_WHERE);
 });
 it("never exports draft or unvalidated parent indicators",async()=>{
  const {GET}=await import("../app/api/iocs/export/route");
  expect((await GET(new NextRequest("https://example.com/api/iocs/export"))).status).toBe(200);
  expect(mocks.iocs.mock.calls[0][0].where).toMatchObject(PUBLIC_IOC_WHERE);
 });
 it("applies proof checks to full-text search and correlated IOCs",async()=>{
  const {GET}=await import("../app/api/search/route");
  expect((await GET(new NextRequest("https://example.com/api/search?q=CVE-2026-12345"))).status).toBe(200);
  const sql=mocks.raw.mock.calls.map(([parts])=>(parts as string[]).join("?"));
  expect(sql[0]).toContain('"analysisStatus" = \'validated\'');
  expect(sql[0]).toContain('"qualityReport"->>\'publishable\' = \'true\'');
  expect(sql[1]).toContain('"qualityReport"->>\'publishable\' = \'true\'');
  expect(mocks.iocs.mock.calls[0][0].where).toMatchObject(PUBLIC_IOC_WHERE);
  expect(mocks.iocs.mock.calls[1][0].where.briefing.is).toMatchObject(PUBLIC_BRIEFING_WHERE);
 });
 it("returns no editorial detail for a draft or legacy slug",async()=>{
  const {default:Page}=await import("../app/threat-briefings/[slug]/page");
  await expect(Page({params:Promise.resolve({slug:"unvalidated"})})).rejects.toThrow();
  expect(mocks.one.mock.calls[0][0].where).toMatchObject({...PUBLIC_BRIEFING_WHERE,slug:"unvalidated"});
 });
});