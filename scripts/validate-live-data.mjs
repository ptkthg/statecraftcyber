// Read-only smoke test for the public data contract used by the editorial UI.
const origin = (process.argv[2] ?? 'https://statecraftcyber.vercel.app').replace(/\/$/, '');

async function get(path) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

const health = await get('/api/health');
assert(health.status === 'ok' && health.database === 'ok', 'Banco da origem indisponível');

const briefings = await get('/api/briefings?limit=50');
assert(Array.isArray(briefings.briefings), 'Briefings: lista ausente');
assert(briefings.briefings.length > 0, 'Briefings: lista vazia');
assert(briefings.briefings.every((item) => item.id && item.slug && item.title && item.summary && item.sourceUrl), 'Briefings: campos editoriais incompletos');
assert(briefings.briefings.every((item) => ['critical', 'high', 'medium', 'low'].includes(item.severity)), 'Briefings: severidade desconhecida');

const iocs = await get('/api/iocs?page=1');
assert(Array.isArray(iocs.results) && iocs.results.length > 0, 'IOCs: lista vazia');
assert(iocs.total > 0 && iocs.stats.total >= iocs.total, 'IOCs: contagens inválidas');
assert(iocs.results.every((item) => item.value && item.type && item.briefingSlug && item.briefingTitle), 'IOCs: relação com briefing ausente');

const first = iocs.results[0];
const typeFiltered = await get(`/api/iocs?type=${encodeURIComponent(first.type)}`);
assert(typeFiltered.results.length > 0 && typeFiltered.results.every((item) => item.type === first.type), 'IOCs: filtro por tipo falhou');

const query = first.value.slice(0, Math.min(8, first.value.length));
const searched = await get(`/api/iocs?q=${encodeURIComponent(query)}`);
assert(searched.results.some((item) => item.value.toLowerCase().includes(query.toLowerCase())), 'IOCs: busca textual falhou');

const page2 = await get('/api/iocs?page=2');
assert(page2.page === 2 && Array.isArray(page2.results), 'IOCs: paginação falhou');
assert(page2.results.every((item) => !iocs.results.some((firstPage) => firstPage.value === item.value && firstPage.briefingSlug === item.briefingSlug)), 'IOCs: páginas duplicadas');

const exported = await get('/api/iocs/export');
assert(Array.isArray(exported.results) && exported.results.length > 0, 'IOCs: exportação vazia');
assert(exported.results.some((item) => item.value === first.value), 'IOCs: registro não encontrado na exportação');

const [cves, news] = await Promise.all([get('/api/cves'), get('/api/noticias')]);
assert(Array.isArray(cves.cves), 'CVEs: lista ausente');
assert(Array.isArray(news.articles), 'Notícias: lista ausente');

const report = {
  origin,
  health: health.status,
  publishedBriefings: health.briefings.published,
  testedBriefings: briefings.briefings.length,
  totalIocs: iocs.stats.total,
  iocPageSize: iocs.results.length,
  iocTypeFilter: first.type,
  iocSearchMatches: searched.total,
  iocPage2: page2.results.length,
  exportedIocs: exported.results.length,
  cves: cves.cves.length,
  news: news.articles.length,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--snapshot')) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const directory = resolve('.qa');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'live-preview.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    origin,
    briefings,
    iocs: exported.results,
    cves,
    news,
  }));
  console.log('Prévia pública salva em .qa/live-preview.json');
}
