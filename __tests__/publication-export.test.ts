import { expect, it } from 'vitest';
import { buildPublicSnapshot, type SnapshotInput } from '../lib/publication/export';
import { parsePublishedSnapshot } from '../lib/publication/snapshot';
import { groundedFixture, NOW } from './fixtures/intelligence';
import { generateBriefing } from '../lib/briefing-generator';
import { validateBriefing } from '../lib/intelligence/validation';
const fixture = () => {
  const {item,briefing} = groundedFixture();
  const quality = validateBriefing(item,briefing,NOW);
  const row = {...generateBriefing(item,new Set()),id:'approved',createdAt:NOW,updatedAt:NOW,status:'published',analysisStatus:'validated',qualityReport:quality,structuredContent:{...briefing,quality},sourceSnapshot:{...item,secret:'PRIVATE_CANARY'},operatorSecret:'PRIVATE_CANARY'};
  return {row,input:{briefings:[row],iocs:[],cves:[],news:[],updates:[{key:'news',status:'success',lastCollectionAt:NOW}],lastRun:null} as unknown as SnapshotInput};
};
it('exports approved public presentation and cited passages without private operational fields', () => {
  const {input} = fixture();
  const snapshot=buildPublicSnapshot(input,new Date(+NOW+3600000));
  expect(snapshot.briefings.briefings).toHaveLength(1);
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_CANARY');
  expect(snapshot.briefings.briefings[0].structuredContent?.quality?.sources[0].text).toContain('O fornecedor reportou');
  expect(parsePublishedSnapshot(snapshot)).toBe(snapshot);
});
it('does not publish drafts, unvalidated records, or inactive indicators', () => {
  const {input,row}=fixture();
  input.briefings=[{...row,status:'draft'},{...row,analysisStatus:'enriched'},{...row,qualityReport:{publishable:false}}] as unknown as SnapshotInput['briefings'];
  input.iocs=[{isActive:true,briefingId:'approved',value:'PRIVATE_CANARY'}] as unknown as SnapshotInput['iocs'];
  const snapshot=buildPublicSnapshot(input,NOW);
  expect(snapshot.briefings.briefings).toEqual([]);
  expect(snapshot.iocs).toEqual([]);
});
it('preserves the collection timestamp when a newer snapshot is exported', () => {
  const {input}=fixture();
  const later=new Date(+NOW+86400000);
  const snapshot=buildPublicSnapshot(input,later);
  expect(snapshot.generatedAt).toBe(later.toISOString());
  expect(snapshot.news.lastCollectionAt).toBe(NOW.toISOString());
  expect(snapshot.updates[0].lastCollectionAt).toBe(NOW.toISOString());
});
it('rejects missing or unsupported publication files instead of silently switching to a database', () => {
  expect(()=>parsePublishedSnapshot({schemaVersion:2})).toThrow('publication_snapshot_invalid');
});
it('rejects unapproved records injected into secondary public lists',()=>{
  const {input}=fixture();
  const snapshot=buildPublicSnapshot(input,NOW);
  const forged=structuredClone(snapshot);
  forged.briefings.trending.push({...forged.briefings.briefings[0],slug:'unapproved-draft'});
  expect(()=>parsePublishedSnapshot(forged)).toThrow('publication_snapshot_invalid');
  const orphan=structuredClone(snapshot);
  orphan.briefings.latestIocs.push({type:'ip',value:'192.0.2.1',confidence:'high',sourceName:'Source',briefingSlug:'unapproved-draft',severity:'high'});
  expect(()=>parsePublishedSnapshot(orphan)).toThrow('publication_snapshot_invalid');
});
