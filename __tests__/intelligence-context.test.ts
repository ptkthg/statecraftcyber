import { describe, expect, it } from "vitest";
import { isVerbatimPassage } from "../lib/intelligence/literal-support";
import { validateTextFields } from "../lib/intelligence/text-validation";
import { validateBriefing } from "../lib/intelligence/validation";
import { safeCveEnrichment } from "../lib/intelligence/cve-policy";
import { groundedFixture, NOW } from "./fixtures/intelligence";
describe("context-preserving extraction regressions",()=>{
 it("does not turn negated statements into positive facts using substring citations",()=>{
  const source="Não é correto afirmar que O produto permite execução remota de código.";
  const claim="O produto permite execução remota de código.";
  expect(isVerbatimPassage(source,claim)).toBe(false);
  expect(validateTextFields(source,{content:claim}).publishable).toBe(false);
  const {item,briefing}=groundedFixture();item.description+="\n"+source;briefing.technicalDetails=claim;
  briefing.claims!.find(c=>c.field==="technicalDetails")!.quote=claim;
  expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("claim.unsupported");
 });
 it("does not remove a qualification by using a supported quote but a shorter generated value",()=>{
  const {item,briefing}=groundedFixture();
  const quote="O efeito foi observado somente em laboratório, sem exploração confirmada em ambiente real.";
  item.description+="\n"+quote;
  briefing.technicalDetails="O efeito foi observado";
  briefing.claims!.find(c=>c.field==="technicalDetails")!.quote=quote;
  expect(validateBriefing(item,briefing,NOW).publishable).toBe(false);
 });
 it("accepts an intact source sentence or paragraph",()=>{
  expect(isVerbatimPassage("Heading\nFirst source sentence. Second source sentence.","Second source sentence.")).toBe(true);
  expect(isVerbatimPassage("Heading\nFirst source sentence.","Heading")).toBe(true);
 });
 it("checks narrated EPSS percentage against the canonical probability, including rounding",()=>{
  const {item,briefing}=groundedFixture();
  briefing.technicalDetails="Probabilidade de exploração EPSS: 90.0% reportada na publicação.";
  item.description+="\n"+briefing.technicalDetails;
  briefing.claims!.find(c=>c.field==="technicalDetails")!.quote=briefing.technicalDetails;
  expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("metrics.contradiction");
 });
 it("normalizes stale cache severity and rejects out-of-range probabilities",()=>{
  const cve={id:"CVE-2026-12345",description:"A source record with a zero technical severity.",cvssScore:0,epss:2,epssPercentile:-1,inCisaKev:false};
  expect(safeCveEnrichment(cve)).toMatchObject({cvssScore:0,severity:"NONE",epss:null,epssPercentile:null});
 });
});