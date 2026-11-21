import {expect,it} from 'vitest';
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
