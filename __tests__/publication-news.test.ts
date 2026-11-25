import {expect,it} from 'vitest';
import {newsForPublication} from '../lib/publication/news';
import {validateTextFields} from '../lib/intelligence/text-validation';
import type {NewsArticle} from '../lib/news-feeds';
const date='2026-11-21T12:00:00Z';
const original:NewsArticle={id:'old',slug:'old-news',title:'Original source title.',summary:'Original source summary.',content:'Original full source paragraph.',url:'https://example.org/news',source:'Source',sourceRegion:'Global',publishedAt:date,tags:[],cves:[],importance:1,type:'Ameaça'};
const source=[original.title,original.summary,original.content].join('\n');
const cached={slug:original.slug,title:original.title,summary:original.summary,content:original.content!,originalUrl:original.url,source:original.source,sourceSnapshot:JSON.parse(JSON.stringify(original)),sourcePublishedAt:new Date(date),qualityReport:JSON.parse(JSON.stringify(validateTextFields(source,{title:original.title,summary:original.summary,content:original.content!})))};
it('retains a validated full historical article even after its RSS row is unavailable',()=>{
  const articles=newsForPublication([], [cached]);
  expect(articles).toHaveLength(1);
  expect(articles[0]).toMatchObject({slug:original.slug,publishedAt:date,content:original.content});
});
it('keeps the approved full body when enriching a current feed record',()=>{
  expect(newsForPublication([original],[cached])[0].content).toBe(original.content);
  expect(newsForPublication([original],[cached])[0].contentOrigin).toBe('automated');
});
it('marks raw feed content as source text and cache-only preview fields as automated',()=>{
  expect(newsForPublication([original],[])[0].contentOrigin).toBe('source');
  const previewSource=original.title+'\n'+original.summary;
  const previewCache={...cached,qualityReport:JSON.parse(JSON.stringify(validateTextFields(previewSource,{title:cached.title,summary:cached.summary})))};
  expect(newsForPublication([original],[previewCache])[0]).toMatchObject({content:original.content,contentOrigin:'automated'});
});
it('does not publish an unsupported candidate or apply old enrichment to changed evidence',()=>{
  expect(newsForPublication([],[{...cached,qualityReport:{...cached.qualityReport,publishable:false},content:'PRIVATE_CANARY'}])).toEqual([]);
  const changed={...original,title:'New source title.',content:'New source paragraph.'};
  expect(newsForPublication([changed],[cached])[0]).toMatchObject({title:changed.title,content:changed.content});
});
