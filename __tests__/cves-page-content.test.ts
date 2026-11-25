import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),snapshot:vi.fn()}));
vi.mock('@/lib/cves/query',()=>({queryCves:mocks.query}));
vi.mock('@/lib/publication/snapshot',()=>({getPublishedSnapshot:mocks.snapshot}));
import Page from '@/app/cves/page';
it('exposes the publication content marker only when CVE data was read',async()=>{
 mocks.snapshot.mockResolvedValue(null);
 mocks.query.mockRejectedValueOnce(new Error('source unavailable'));
 const unavailable=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 expect(unavailable).toContain('Dados indisponíveis');
 expect(unavailable).not.toContain('data-content="cves"');
 mocks.query.mockResolvedValueOnce({cves:[],total:0,page:1,totalPages:1,limit:12,updatedAt:null,coverage:'',types:[],available:true});
 const empty=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 expect(empty).toContain('data-content="cves"');
 expect(empty).toContain('Nenhum resultado nesta combinação');
});
