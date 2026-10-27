import { describe, it, expect } from "vitest";
import { selectNvdCvss } from "../lib/intelligence/cvss";
import { auditStoredBriefing } from "../lib/intelligence/audit";
import { sourceRevision } from "../lib/intelligence/evidence";
import { buildMarkdownFallback } from "../lib/ai-briefing";
import { parseStructuredBriefing } from "../lib/briefing/parse-structured-briefing";
import { groundedFixture, NOW } from "./fixtures/intelligence";
describe("NVD metric selection",()=>{
 it.each([["cvssMetricV40","4.0"],["cvssMetricV31","3.1"],["cvssMetricV30","3.0"],["cvssMetricV2","2.0"]])("reads the standard field %s", (key,version)=>{
  expect(selectNvdCvss({[key]:[{cvssData:{baseScore:7.5,baseSeverity:"HIGH"}}]})).toMatchObject({score:7.5,version,severity:"high",warnings:[]});
 });
 it("selects primary within a version and validates the source severity",()=>{
  expect(selectNvdCvss({cvssMetricV31:[{type:"Secondary",cvssData:{baseScore:9.8,baseSeverity:"CRITICAL"}},{type:"Primary",cvssData:{baseScore:7.5,baseSeverity:"HIGH"}}]}).score).toBe(7.5);
  expect(selectNvdCvss({cvssMetricV40:[{cvssData:{baseScore:4,baseSeverity:"CRITICAL"}}]}).warnings).toHaveLength(1);
 });
 it("falls back from an invalid metric and preserves zero",()=>{
  expect(selectNvdCvss({cvssMetricV40:[{cvssData:{baseScore:Infinity}}],cvssMetricV31:[{cvssData:{baseScore:0,baseSeverity:"NONE"}}]})).toMatchObject({score:0,version:"3.1",warnings:[]});
 });
});
describe("stored-record audit",()=>{
 it("cannot grant retrospective validation to a legacy generated summary",()=>{
  const {item,briefing}=groundedFixture();
  const report=auditStoredBriefing({title:item.title,summary:item.description,content:"old generated prose",severity:"high",confidence:"high",sourceName:item.sourceName,sourceUrl:item.sourceUrl,structuredContent:briefing,sourceSnapshot:null},NOW);
  expect(report.analysisStatus).toBe("preliminary");expect(report.publishable).toBe(false);
  expect(report.issues.map(i=>i.code)).toContain("source.legacy");
 });
 it("detects metadata drift while accepting an intact source-bound record",()=>{
  const {item,briefing}=groundedFixture();
  const row={title:briefing.title,summary:briefing.executiveSummary,content:buildMarkdownFallback(briefing),severity:"high",confidence:"medium",sourceName:item.sourceName,sourceUrl:item.sourceUrl,structuredContent:briefing,sourceSnapshot:item};
  expect(auditStoredBriefing(row,NOW).publishable).toBe(true);
  const issues=auditStoredBriefing({...row,severity:"critical",confidence:"high",summary:"Invented public summary"},NOW).issues.map(i=>i.code);
  expect(issues).toEqual(expect.arrayContaining(["metadata.contradiction","metadata.content_mismatch"]));
 });
 it("distinguishes a changing source revision from retrieval-time noise",()=>{
  const {item}=groundedFixture();
  expect(sourceRevision(item)).not.toBe(sourceRevision({...item,description:item.description+" correction"}));
  expect(sourceRevision(item)).not.toBe(sourceRevision({...item,cvssScore:9.8}));
  expect(sourceRevision({...item,publishedAtOrigin:"retrieval"})).toBe(sourceRevision({...item,publishedAtOrigin:"retrieval",publishedAt:new Date("2026-10-28")}));
 });
 it.each(['{"confidenceLevel":"certain"}','{"technicalDetails":42}','{"recommendedActions":"block everything"}'])("rejects malformed model fields: %s",raw=>{
  expect(parseStructuredBriefing(raw)).toBeNull();
 });
});