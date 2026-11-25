import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {SearchResultCard} from '@/components/search/SearchResult';
it('exposes an active search option with a stable id',()=>{
 const html=renderToStaticMarkup(createElement(SearchResultCard,{result:{id:'cve',type:'cve',title:'CVE-2026-1234',href:'/cves/CVE-2026-1234',meta:'Alta',rank:1},selected:true,onSelect:vi.fn(),id:'global-option-0'}));
 expect(html).toContain('role="option"');expect(html).toContain('aria-selected="true"');expect(html).toContain('id="global-option-0"');
});

