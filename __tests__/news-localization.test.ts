import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsArticle } from "@/lib/news-feeds";
import { validateTextFields } from "@/lib/intelligence/text-validation";
const mocks=vi.hoisted(()=>({completeNewsJson:vi.fn(),findMany:vi.fn(),createMany:vi.fn()}));
vi.mock("@/lib/news-ai-client",()=>({completeNewsJson:mocks.completeNewsJson}));
vi.mock("@/lib/prisma",()=>({prisma:{newsCache:{findMany:mocks.findMany,createMany:mocks.createMany}}}));
import { localizeNewsArticles, parseNewsTranslations } from "@/lib/news-localization";
function article(slug:string,sourceRegion:"Global"|"Brasil"="Global"):NewsArticle {
 return {id:slug,slug,title:"English "+slug,summary:"Original "+slug,url:"https://example.com/"+slug,source:"Example",sourceRegion,publishedAt:"2026-10-26T12:00:00Z",tags:[],cves:[],importance:1,type:"Ameaça"};
}
describe("news evidence and localization",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.findMany.mockResolvedValue([]);mocks.createMany.mockResolvedValue({count:1});});
 it("parses candidates while rejecting invented slugs and incomplete fields",()=>{
  const result=parseNewsTranslations(JSON.stringify({articles:[{slug:"wanted",title:"Título",summary:"Resumo"},{slug:"invented",title:"Outro",summary:"Outro"},{slug:"bad",title:"",summary:"Resumo"}]}),[article("wanted"),article("bad")]);
  expect([...result.keys()]).toEqual(["wanted"]);
 });
 it("does not present unverified legacy translations or new unsupported text as original facts",async()=>{
  mocks.findMany.mockResolvedValue([{slug:"cached",title:"Já traduzida",summary:"Resumo salvo",qualityReport:null}]);
  mocks.completeNewsJson.mockResolvedValue(JSON.stringify({articles:[{slug:"new",title:"Nova notícia",summary:"Resumo traduzido"}]}));
  const result=await localizeNewsArticles([article("cached"),article("new"),article("br","Brasil")]);
  expect(result.map(a=>a.title)).toEqual(["English cached","English new","English br"]);
  expect(mocks.completeNewsJson).toHaveBeenCalledTimes(1);
  const saved=mocks.createMany.mock.calls[0][0].data[0];
  expect(saved.title).toBe("English new");
  expect(saved.qualityReport.publishable).toBe(false);
  expect(saved.qualityReport.analysisStatus).toBe("enriched");
  expect(saved.qualityReport.unpublishedCandidate.title).toBe("Nova notícia");
  expect(saved.sourceSnapshot.title).toBe("English new");
 });
 it("still retries omissions, but preserves original text when both candidates lack proof",async()=>{
  mocks.completeNewsJson.mockResolvedValueOnce(JSON.stringify({articles:[{slug:"first",title:"Primeira",summary:"Resumo um"}]})).mockResolvedValueOnce(JSON.stringify({title:"Segunda",summary:"Resumo dois"}));
  const result=await localizeNewsArticles([article("first"),article("second")]);
  expect(result.map(a=>a.title)).toEqual(["English first","English second"]);
  expect(mocks.completeNewsJson).toHaveBeenCalledTimes(2);
  expect(mocks.createMany.mock.calls[0][0].data.every((r:{qualityReport:{publishable:boolean}})=>!r.qualityReport.publishable)).toBe(true);
 });
 it("reuses a source-bound verified extraction without another AI call",async()=>{
  const original=article("verified");
  const qualityReport=validateTextFields(original.title+"\n"+original.summary,{title:original.title,summary:original.summary});
  mocks.findMany.mockResolvedValue([{slug:original.slug,title:original.title,summary:original.summary,qualityReport}]);
  expect((await localizeNewsArticles([original]))[0].title).toBe(original.title);
  expect(mocks.completeNewsJson).not.toHaveBeenCalled();
 });
 it("invalidates approval when the upstream source changes",async()=>{
  const original=article("changed");
  const qualityReport=validateTextFields(original.title+"\n"+original.summary,{title:original.title,summary:original.summary});
  mocks.findMany.mockResolvedValue([{slug:original.slug,title:original.title,summary:original.summary,qualityReport}]);
  const next={...original,title:"Updated source title"};
  expect((await localizeNewsArticles([next]))[0].title).toBe(next.title);
 });
});