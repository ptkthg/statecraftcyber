import {describe,expect,it} from 'vitest';
import {safeDeploymentPath,deploymentEnvironment,verifyPublication,stagePublication} from '../scripts/lib/publication-deploy.mjs';
import {mkdtemp,writeFile,mkdir,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const publicationFixture=()=>{
  const now=new Date().toISOString();
  return {schemaVersion:1,generatedAt:now,capturedAt:now,cves:[{id:'CVE-2026-1000',description:'Original vulnerability description.',published:now,lastModified:now,fetchedAt:now,dataState:'fresh'}],news:{articles:[],lastCollectionAt:null},briefings:{briefings:[],trending:[],latestIocs:[]},iocs:[],updates:[],lastRun:null,origin:'https://statecraftcyber.vercel.app'};
};
it('excludes local credentials, operational backups and reference material from deployment inputs',()=>{
  for(const path of ['.qa/database.json','.env.production','config/statecraft-credentials.xml','screenshots-refactor/a.png','node_modules/a.js']) expect(safeDeploymentPath(path)).toBe(false);
  expect(safeDeploymentPath('.env.example')).toBe(true);
  expect(safeDeploymentPath('data/publication/current.json')).toBe(true);
  expect(deploymentEnvironment({NODE_ENV:'test',PATH:'safe',APPDATA:'auth',DATABASE_URL:'secret',GROQ_API_KEY:'secret',CRON_SECRET:'secret'})).toEqual({PATH:'safe',APPDATA:'auth'});
});
it('stages safe tracked files while preserving and excluding tracked screenshots and credentials',async()=>{
  const repo=await mkdtemp(join(tmpdir(),'statecraft-stage-test-'));
  try {
    for(const dir of ['.vercel','data/publication','screenshots-refactor']) await mkdir(join(repo,dir),{recursive:true});
    await writeFile(join(repo,'public file.txt'),'public');
    await writeFile(join(repo,'.env.production'),'PRIVATE_CANARY');
    await writeFile(join(repo,'screenshots-refactor/reference.png'),'reference');
    await writeFile(join(repo,'.vercel/project.json'),JSON.stringify({projectId:'test',orgId:'test',projectName:'test'}));
    await writeFile(join(repo,'data/publication/current.json'),JSON.stringify(publicationFixture()));
    execFileSync('git',['init'],{cwd:repo});
    execFileSync('git',['add','public file.txt','.env.production','screenshots-refactor/reference.png'],{cwd:repo});
    execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.org','commit','-m','fixture'],{cwd:repo});
    const stage=await stagePublication(repo);
    expect(await readFile(join(stage.app,'public file.txt'),'utf8')).toBe('public');
    await expect(access(join(stage.app,'.env.production'))).rejects.toThrow();
    await expect(access(join(stage.app,'screenshots-refactor/reference.png'))).rejects.toThrow();
    expect(await readFile(join(repo,'screenshots-refactor/reference.png'),'utf8')).toBe('reference');
    const invalid=publicationFixture(); invalid.origin='https://attacker.example';
    await writeFile(join(repo,'data/publication/current.json'),JSON.stringify(invalid));
    await expect(stagePublication(repo)).rejects.toThrow('publication_snapshot_invalid');
    const stale=publicationFixture(); stale.generatedAt=new Date(Date.now()-3*3600000).toISOString();
    await writeFile(join(repo,'data/publication/current.json'),JSON.stringify(stale));
    await expect(stagePublication(repo)).rejects.toThrow('publication_snapshot_expired');
    const empty=publicationFixture(); empty.cves=[];
    await writeFile(join(repo,'data/publication/current.json'),JSON.stringify(empty));
    await expect(stagePublication(repo)).rejects.toThrow('publication_snapshot_invalid');
    await mkdir(join(repo,'.qa/publication'),{recursive:true});
    await writeFile(join(repo,'.qa/publication/last-success.json'),JSON.stringify({live:{generatedAt:new Date(Date.now()+60000).toISOString()},sha256:'newer'}));
    await writeFile(join(repo,'data/publication/current.json'),JSON.stringify(publicationFixture()));
    await expect(stagePublication(repo)).rejects.toThrow('older_publication_blocked');
  } finally {await rm(repo,{recursive:true,force:true});}
});
it('requires the deployed file hash, not only timestamps and row counts',async()=>{
  const snapshot=publicationFixture();
  const fetcher=async()=>new Response(JSON.stringify({source:'local-snapshot',database:'not_required',snapshotGeneratedAt:snapshot.generatedAt,snapshotSha256:'different',cves:{cached:1},briefings:{published:0},iocs:{total:0}}));
  await expect(verifyPublication('https://example.org',snapshot,fetcher,'expected')).rejects.toThrow('publication_identity_mismatch');
});
it('refuses an older deployment even if all endpoints return HTTP 200',async()=>{
  const snapshot={generatedAt:'2026-11-21T12:00:00Z',cves:[],news:{articles:[]},briefings:{briefings:[]},iocs:[]};
  const fetcher=async()=>new Response(JSON.stringify({source:'local-snapshot',database:'not_required',snapshotGeneratedAt:'2026-11-20T12:00:00Z',cves:{cached:0},briefings:{published:0},iocs:{total:0}}));
  await expect(verifyPublication('https://example.org',snapshot,fetcher)).rejects.toThrow('publication_identity_mismatch');
});

function verificationFetcher(snapshot: ReturnType<typeof publicationFixture>, overrides: Record<string, () => Response> = {}) {
  const visited: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(input instanceof Request ? input.url : input);
    visited.push(url.pathname);
    const key = url.pathname + url.search;
    if (overrides[key]) return overrides[key]();
    const payloads: Record<string, unknown> = {
      '/api/health': { status: 'ok', source: 'local-snapshot', database: 'not_required', snapshotGeneratedAt: snapshot.generatedAt, snapshotSha256: 'expected', cves: { cached: snapshot.cves.length }, briefings: { published: snapshot.briefings.briefings.length }, iocs: { total: snapshot.iocs.length } },
      '/api/noticias': { total: snapshot.news.articles.length, lastCollectionAt: snapshot.news.lastCollectionAt },
      '/api/cves?limit=1': { total: snapshot.cves.length },
      '/api/briefings?limit=1': { briefings: [] },
      '/api/iocs': { total: snapshot.iocs.length },
    };
    if (key in payloads) return Response.json(payloads[key]);
    if (key === '/noticias') return new Response('<main data-content="news">Arquivo publicado</main>');
    if (key === '/cves') return new Response("<main data-content='cves'>Registros publicados</main>");
    if (key === '/campanhas') return new Response('<main><a href="/campanhas/unc6240-oracle-peoplesoft">Campanha</a></main>');
    return new Response('<main>Conteúdo publicado</main>');
  };
  return { fetcher, visited };
}
it('checks a campaign dossier and the editorial information routes after verifying publication identity', async () => {
  const snapshot = publicationFixture();
  const { fetcher, visited } = verificationFetcher(snapshot);
  expect(await verifyPublication('https://example.org', snapshot, fetcher, 'expected')).toMatchObject({ status: 'ok', cves: 1 });
  expect(visited).toEqual(expect.arrayContaining(['/campanhas/unc6240-oracle-peoplesoft', '/metodologia', '/sobre', '/creditos-visuais']));
});
it.each(['/noticias', '/cves'])('rejects a fallback HTTP 200 page without its content marker: %s', async path => {
  const snapshot = publicationFixture();
  const { fetcher } = verificationFetcher(snapshot, { [path]: () => new Response('<main>Conteúdo indisponível</main>') });
  await expect(verifyPublication('https://example.org', snapshot, fetcher, 'expected')).rejects.toThrow('publication_content_missing:' + path);
});
it('rejects a failed campaign dossier even when the campaign index returns HTTP 200', async () => {
  const snapshot = publicationFixture();
  const { fetcher } = verificationFetcher(snapshot, { '/campanhas/unc6240-oracle-peoplesoft': () => new Response('Unavailable', { status: 503 }) });
  await expect(verifyPublication('https://example.org', snapshot, fetcher, 'expected')).rejects.toThrow('publication_page_failed:/campanhas/unc6240-oracle-peoplesoft');
});

describe('protection bypass for candidate verification', () => {
  it('picks only the automation bypass secret and sends it as a header', async () => {
    const { automationBypassSecret, withProtectionBypass } = await import('../scripts/lib/publication-deploy.mjs');
    expect(automationBypassSecret({ protectionBypass: { shareable: { scope: 'shareable-link' }, fictitious_secret: { scope: 'automation-bypass' } } })).toBe('fictitious_secret');
    expect(automationBypassSecret({})).toBeNull();
    const seen: Headers[] = [];
    const fetcher = withProtectionBypass(async (_url: URL | string, init?: RequestInit) => { seen.push(new Headers(init?.headers)); return new Response('{}'); }, 'fictitious_secret');
    await fetcher('https://example.com/api/health', { cache: 'no-store', headers: { accept: 'application/json' } });
    expect(seen[0].get('x-vercel-protection-bypass')).toBe('fictitious_secret');
    expect(seen[0].get('accept')).toBe('application/json');
  });
});
