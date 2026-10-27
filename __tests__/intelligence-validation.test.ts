import { describe, expect, it } from "vitest";
import { getTechnique, validateTechnique, ATTACK_CATALOG } from "../lib/intelligence/mitre";
import { sourceEvidence } from "../lib/intelligence/evidence";
import { scoreSeverity } from "../lib/severity-scoring";
import { validateBriefing, publicationStatus } from "../lib/intelligence/validation";
import { parseStructuredBriefing } from "../lib/briefing/parse-structured-briefing";
import { iocDisposition } from "../lib/intelligence/ioc-policy";
import { safeCveEnrichment } from "../lib/intelligence/cve-policy";
import { validateTextFields, validTextReport } from "../lib/intelligence/text-validation";
import { groundedFixture, NOW } from "./fixtures/intelligence";

describe("official ATT&CK validation", () => {
  it("uses a pinned official catalog and rejects invented, malformed and deprecated IDs", () => {
    expect(ATTACK_CATALOG.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(getTechnique("T1059.001")?.name).toBe("PowerShell");
    for (const id of ["T9999", "TA0001", "T1059.99", "T1064", "t1059", "T1059.001-extra"]) expect(getTechnique(id)).toBeNull();
  });
  it("rejects a real ID paired with the wrong behavior name", () => {
    const { item } = groundedFixture();
    item.description += "\nThe source reports T1059.001: PowerShell.";
    const result = validateTechnique({ id:"T1059.001",name:"Phishing",kind:"reported",sourceId:"source",quote:"The source reports T1059.001: PowerShell." }, sourceEvidence(item,NOW));
    expect(result.issues.map(i=>i.code)).toContain("mitre.name_mismatch");
  });
  it("distinguishes reported associations from unsupported or observed ones", () => {
    const { item } = groundedFixture();
    const quote = "The source explicitly reports T1059.001: PowerShell.";
    item.description += "\n" + quote;
    const mapping = { id:"T1059.001",name:"PowerShell",kind:"reported" as const,sourceId:"source",quote };
    const sources = sourceEvidence(item,NOW);
    sources[0].techniqueAssertions = [{ id:mapping.id,kind:"reported",quote }];
    expect(validateTechnique(mapping,sources).technique?.kind).toBe("reported");
    expect(validateTechnique(mapping,sourceEvidence(item,NOW)).issues.map(i=>i.code)).toContain("mitre.association_unverified");
    expect(validateTechnique({...mapping,kind:"observed"},sourceEvidence(item,NOW)).issues.map(i=>i.code)).toContain("mitre.not_observed");
    expect(validateTechnique({...mapping,quote:"An invented PowerShell procedure T1059.001."},sourceEvidence(item,NOW)).technique).toBeUndefined();
    expect(validateTechnique({...mapping,id:"T1566",name:"Phishing"},sourceEvidence(item,NOW)).issues.map(i=>i.code)).toContain("mitre.not_reported");
  });
  it("retains inference as inference, but never auto-publishes it", () => {
    const { item, briefing } = groundedFixture();
    item.mitreTechniques=["T1059.001"];
    item.mitreEvidence=[{id:"T1059.001",kind:"inferred",sourceId:"source",quote:briefing.technicalDetails}];
    const result=validateBriefing(item,briefing,NOW);
    expect(result.techniques[0].kind).toBe("inferred");
    expect(result.publishable).toBe(false);
  });
  it("rejects an adapter's bare hardcoded technique IDs", () => {
    const {item,briefing}=groundedFixture();item.mitreTechniques=["T1071","T1090"];
    expect(validateBriefing(item,briefing,NOW).issues.filter(i=>i.code==="mitre.unsupported")).toHaveLength(2);
  });
});

describe("risk dimensions are independent", () => {
  it.each([[0,"low"],[3.9,"low"],[4,"medium"],[6.9,"medium"],[7,"high"],[8.9,"high"],[9,"critical"],[10,"critical"]] as const)("maps CVSS %s without changing confidence", (score,severity) => {
    const {item}=groundedFixture();item.cvssScore=score;
    const risk=scoreSeverity(item,sourceEvidence(item,NOW),NOW);
    expect(risk.severity).toBe(severity);expect(risk.confidence).toBe("medium");
  });
  it("keeps CVSS 4.0 medium despite KEV and high EPSS while raising operational priority", () => {
    const {item}=groundedFixture();Object.assign(item,{cvssScore:4,epssScore:.9,inCisaKev:true});
    const risk=scoreSeverity(item,sourceEvidence(item,NOW),NOW);
    expect(risk.technicalSeverity).toBe("medium");expect(risk.exploitationProbability).toBe(.9);
    expect(risk.operationalPriority).toBe("critical");expect(risk.confidence).toBe("medium");
  });
  it("does not assign CVSS or EPSS to a non-vulnerability event", () => {
    const {item,briefing}=groundedFixture();item.cves=[];
    const report=validateBriefing(item,briefing,NOW);
    expect(report.risk.cvssScore).toBeNull();expect(report.risk.exploitationProbability).toBeNull();
    expect(report.issues.map(i=>i.code)).toEqual(expect.arrayContaining(["metrics.cvss","metrics.epss"]));
  });
  it.each([NaN,Infinity,-1,11])("rejects invalid CVSS %s", cvssScore=>{
    const {item,briefing}=groundedFixture();item.cvssScore=cvssScore;
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("metrics.cvss");
  });
  it.each([NaN,Infinity,-.01,1.01])("rejects invalid EPSS %s", epssScore=>{
    const {item,briefing}=groundedFixture();item.epssScore=epssScore;
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("metrics.epss");
  });
  it("does not derive confidence from high severity, community count or identical primary organizations", () => {
    const {item}=groundedFixture();item.cvssScore=10;item.sourceUrl="https://otx.alienvault.com/pulse/example";
    expect(scoreSeverity(item,sourceEvidence(item,NOW),NOW).confidence).toBe("low");
    item.sourceUrl="https://nvd.nist.gov/vuln/detail/CVE-2026-12345";
    const sources=sourceEvidence(item,NOW);
    sources.push({...sources[0],id:"duplicate-host",url:"https://services.nvd.nist.gov/rest/json/cves/2.0"});
    expect(scoreSeverity(item,sources,NOW).confidence).toBe("medium");
    sources.push({...sources[0],id:"independent",url:"https://www.cisa.gov/known-exploited-vulnerabilities-catalog"});
    expect(scoreSeverity(item,sources,NOW).confidence).toBe("high");
    sources[2].text="An unrelated event without a matching vulnerability identifier, with otherwise ample source text.";
    expect(scoreSeverity(item,sources,NOW).confidence).toBe("medium");
  });
  it("lowers confidence for stale or undated primary material",()=>{
    const {item}=groundedFixture();item.publishedAt=new Date("2025-01-01");
    expect(scoreSeverity(item,sourceEvidence(item,NOW),NOW).confidence).toBe("low");
    item.publishedAt=undefined;
    expect(scoreSeverity(item,sourceEvidence(item,NOW),NOW).confidence).toBe("low");
  });
});

describe("publication evidence gate", () => {
  it("publishes a complete source-bound extraction only when auto publish is enabled",()=>{
    const {item,briefing}=groundedFixture();const report=validateBriefing(item,briefing,NOW);
    expect(report.issues).toEqual([]);expect(report.analysisStatus).toBe("validated");
    expect(publicationStatus(true,report)).toBe("published");expect(publicationStatus(false,report)).toBe("draft");
  });
  it("rejects missing, fabricated or non-entailing quotations and duplicate source IDs",()=>{
    const {item,briefing}=groundedFixture();
    briefing.claims![0].quote="A fabricated quotation not present in the original source.";
    briefing.technicalDetails="A new exploit attributed to an actor without source support.";
    item.evidenceSources=[{...sourceEvidence(item,NOW)[0]}];
    const codes=validateBriefing(item,briefing,NOW).issues.map(i=>i.code);
    expect(codes).toEqual(expect.arrayContaining(["claim.unsupported","claim.semantic_review","source.duplicate_id"]));
  });
  it("retains unsupported translations as enriched drafts",()=>{
    const {item,briefing}=groundedFixture();briefing.whatHappened="An unsupported English translation of the source.";
    const report=validateBriefing(item,briefing,NOW);
    expect(report.analysisStatus).toBe("enriched");expect(report.publishable).toBe(false);
  });
  it("rejects an unlabelled inference and does not confuse a cited hypothesis with a fact",()=>{
    const {item,briefing}=groundedFixture();briefing.claims![1].kind="inferred";
    const codes=validateBriefing(item,briefing,NOW).issues.map(i=>i.code);
    expect(codes).toEqual(expect.arrayContaining(["claim.unlabelled_inference","claim.semantic_review"]));
  });
  it.each(["A fonte original não fornece detalhes suficientes para esta seção.","Não há dados suficientes."])("keeps generic section %s preliminary",value=>{
    const {item,briefing}=groundedFixture();briefing.whatHappened=value;
    expect(validateBriefing(item,briefing,NOW).analysisStatus).toBe("preliminary");
  });
  it("detects repeated essential sections",()=>{
    const {item,briefing}=groundedFixture();briefing.whyItMatters=briefing.whatHappened;
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("content.repeated");
  });
  it("detects contradictory confidence, severity and metric text",()=>{
    const {item,briefing}=groundedFixture();
    briefing.confidenceLevel="high";
    briefing.technicalDetails="Severidade crítica, confiança alta e CVSS: 10.0.";
    const codes=validateBriefing(item,briefing,NOW).issues.map(i=>i.code);
    expect(codes).toEqual(expect.arrayContaining(["severity.contradiction","confidence.contradiction","metrics.contradiction"]));
  });
  it("rejects model-created CVEs, IOCs and techniques even outside structured arrays",()=>{
    const {item,briefing}=groundedFixture();
    briefing.identifiedIocs=[{type:"ip",value:"203.0.113.42",confidence:"high"}];
    briefing.relatedCves.push("CVE-2026-99999");
    briefing.technicalDetails+=" CVE-2026-88888 T9999.";
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toEqual(expect.arrayContaining(["ioc.generated","cve.generated","cve.unsupported","mitre.prose_unsupported"]));
  });
  it("does not recycle generated summaries as original evidence or claim human review",()=>{
    const {item,briefing}=groundedFixture();item.descriptionOrigin="generated";briefing.whatHappened="Conteúdo validado por analistas com revisão humana.";
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toEqual(expect.arrayContaining(["source.generated","review.unsupported"]));
  });
  it("rejects multiple CVEs sharing an unbound scalar metric",()=>{
    const {item,briefing}=groundedFixture();item.cves!.push("CVE-2026-99999");
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("metrics.ambiguous");
  });
  it("does not turn missing actions, invalid JSON or fallback into completed analysis",()=>{
    const {item,briefing}=groundedFixture();briefing.recommendedActions=[];
    expect(validateBriefing(item,briefing,NOW).analysisStatus).toBe("preliminary");
    expect(parseStructuredBriefing("{truncated", {title:"Fallback"})).toBeNull();
    expect(parseStructuredBriefing("[]")).toBeNull();
    expect(parseStructuredBriefing('{"claims":[{"field":"whatHappened","kind":"confirmed"}]}')).toBeNull();
    expect(validateBriefing(item,null,NOW).analysisStatus).toBe("preliminary");
  });
  it("preserves evidence through parsing and never fills absent sections",()=>{
    const {briefing}=groundedFixture();
    expect(parseStructuredBriefing(JSON.stringify(briefing))!.claims).toEqual(briefing.claims);
    expect(parseStructuredBriefing("{}")!.technicalDetails).toBe("");
  });
});

describe("operational and cache safety",()=>{
  const ioc={type:"ip" as const,value:"203.0.113.42",confidence:"high" as const,source:"community",sourceUrl:"https://community.example/list",lastSeen:"2026-10-26T12:00:00Z"};
  it("never authorizes blocking from membership in a community list",()=>{
    expect(iocDisposition(ioc,NOW).action).toBe("review");
    expect(iocDisposition({...ioc,locallyConfirmed:true,sharedInfrastructure:false},NOW).action).toBe("conditional-containment");
  });
  it.each([{lastSeen:undefined},{lastSeen:"2025-01-01"},{lastSeen:"2099-01-01"},{sourceUrl:undefined},{sharedInfrastructure:true}])("requires provenance, recency, local evidence and false-positive context: %j",override=>{
    expect(iocDisposition({...ioc,locallyConfirmed:true,sharedInfrastructure:false,...override},NOW).action).toBe("review");
  });
  it("retains indiscriminate source blocking advice for operational review",()=>{
    const {item,briefing}=groundedFixture();const action="Bloqueie todos os endereços imediatamente sem verificar o contexto.";
    item.description+="\n"+action;briefing.recommendedActions=[action];
    briefing.claims!.find(c=>c.field==="recommendedActions.0")!.quote=action;
    expect(validateBriefing(item,briefing,NOW).issues.map(i=>i.code)).toContain("action.operational_review");
  });
  it("does not accept unverified CVE cache content or stale source fingerprints",()=>{
    const cve={id:"CVE-2026-12345",description:"A source describes the flaw without a patch.",cvssScore:4,epss:.01,inCisaKev:true,ptBrDescription:"An invented technical explanation.",mitigation:"Install version 9.9.",aiPriority:"Baixa"};
    expect(safeCveEnrichment(cve)).toMatchObject({ptBrDescription:null,mitigation:null,aiPriority:"Crítica",severity:"MEDIUM",cvssScore:4});
    const report=validateTextFields(cve.description,{ptBrDescription:cve.description});
    expect(validTextReport(report,cve.description+" changed")).toBe(false);
    expect(validateTextFields("source text",{content:"unsourced details"}).publishable).toBe(false);
    expect(safeCveEnrichment({...cve,ptBrDescription:cve.description,mitigation:"",qualityReport:report}).ptBrDescription).toBe(cve.description);
  });
});