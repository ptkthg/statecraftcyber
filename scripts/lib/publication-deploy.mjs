import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, copyFile, writeFile, realpath, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {validPublicationSnapshot} from '../../lib/publication/format.mjs';
const exec=promisify(execFile);
export function safeDeploymentPath(path) {
  const normalized=path.replaceAll('\\','/');
  return !normalized.split('/').some(part=>['.qa','.git','.superpowers','node_modules','screenshots-refactor','imagens referencia'].includes(part)) && !/(^|\/)\.env(?!\.example$)/.test(normalized) && !/-credentials\.xml$/i.test(normalized);
}
export function deploymentEnvironment(env=process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key])=>/^(PATH|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|CI|NO_COLOR|HTTP_PROXY|HTTPS_PROXY|NO_PROXY)$/i.test(key)));
}
export async function stagePublication(repo) {
  const dirty=(await exec('git',['status','--porcelain','--untracked-files=no'],{cwd:repo})).stdout.trim();
  if(dirty) throw new Error('commit_source_changes_before_publication');
  const revision=(await exec('git',['rev-parse','HEAD'],{cwd:repo})).stdout.trim();
  const entries=(await exec('git',['ls-tree','-r','-z',revision],{cwd:repo})).stdout.split('\0').filter(Boolean).map(line=>({mode:line.slice(0,6),path:line.slice(line.indexOf('\t')+1)})).filter(entry=>safeDeploymentPath(entry.path));
  if(entries.some(entry=>!['100644','100755'].includes(entry.mode))) throw new Error('unsafe_archive_file_type');
  const files=entries.map(entry=>entry.path);
  const snapshotText=await readFile(join(repo,'data/publication/current.json'),'utf8');
  const snapshot=JSON.parse(snapshotText);
  if(!validPublicationSnapshot(snapshot) || !(snapshot.cves.length+snapshot.news.articles.length+snapshot.briefings.briefings.length)) throw new Error('publication_snapshot_invalid');
  const age=Date.now()-Date.parse(snapshot.generatedAt);
  if(age>2*3600000 || age < -5*60000) throw new Error('publication_snapshot_expired');
  const sha256=createHash('sha256').update(snapshotText).digest('hex');
  let previous=null;
  try {previous=JSON.parse(await readFile(join(repo,'.qa/publication/last-success.json'),'utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
  if(previous && (Date.parse(snapshot.generatedAt)<Date.parse(previous.live.generatedAt) || snapshot.generatedAt===previous.live.generatedAt && sha256!==previous.sha256)) throw new Error('older_publication_blocked');
  const root=join(repo,'.qa/publication/releases');
  const directory=join(root,randomUUID());
  const app=join(directory,'app');
  const source=join(directory,'source');
  await mkdir(app,{recursive:true});
  await mkdir(source);
  const archive=join(directory,'source.tar');
  await exec('git',['archive','--format=tar','--output',archive,revision],{cwd:repo});
  await exec(process.platform==='win32'?'tar.exe':'tar',['-xf',archive,'-C',source],{cwd:repo});
  for(const file of files) {
    const target=resolve(app,file);
    if(!target.startsWith(app+sep)) throw new Error('unsafe_archive_path');
    await mkdir(resolve(target,'..'),{recursive:true});
    await copyFile(join(source,file),target);
  }
  await mkdir(join(app,'data/publication'),{recursive:true});
  await writeFile(join(app,'data/publication/current.json'),snapshotText,'utf8');
  await mkdir(join(app,'.vercel'),{recursive:true});
  const project=JSON.parse(await readFile(join(repo,'.vercel/project.json'),'utf8'));
  await writeFile(join(app,'.vercel/project.json'),JSON.stringify({projectId:project.projectId,orgId:project.orgId,projectName:project.projectName}),'utf8');
  return {app,directory,root,revision,snapshot,sha256};
}
export async function removePublicationStage(stage,root) {
  const allowed=await realpath(root), target=await realpath(stage);
  if(target===allowed || !target.startsWith(allowed+sep) || resolve(target,'..')!==allowed) throw new Error('unsafe_publication_cleanup');
  await rm(target,{recursive:true,force:true});
}
export async function verifyPublication(origin,snapshot,fetcher=fetch,expectedHash) {
  const json=async(path)=>{
    const response=await fetcher(new URL(path,origin),{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok && path!=='/api/health') throw new Error('publication_endpoint_failed:'+path);
    return response.json();
  };
  const health=await json('/api/health');
  if(!expectedHash || health.snapshotSha256!==expectedHash || health.source!=='local-snapshot' || health.database!=='not_required' || health.snapshotGeneratedAt!==snapshot.generatedAt || health.cves?.cached!==snapshot.cves.length || health.briefings?.published!==snapshot.briefings.briefings.length || health.iocs?.total!==snapshot.iocs.length) throw new Error('publication_identity_mismatch');
  const news=await json('/api/noticias');
  if(news.total!==snapshot.news.articles.length || news.lastCollectionAt!==snapshot.news.lastCollectionAt) throw new Error('publication_news_mismatch');
  const cves=await json('/api/cves?limit=1');
  if(cves.total!==snapshot.cves.length) throw new Error('publication_cves_mismatch');
  const briefings=await json('/api/briefings?limit=1');
  if(!Array.isArray(briefings.briefings) || briefings.briefings.length!==Math.min(1,snapshot.briefings.briefings.length)) throw new Error('publication_briefings_mismatch');
  const iocs=await json('/api/iocs');
  if(iocs.total!==snapshot.iocs.length) throw new Error('publication_iocs_mismatch');
  const paths=['/','/noticias','/campanhas','/threat-briefings','/iocs','/cves'];
  if(snapshot.news.articles[0]) paths.push('/noticias/'+encodeURIComponent(snapshot.news.articles[0].slug));
  if(snapshot.cves[0]) paths.push('/cves/'+encodeURIComponent(snapshot.cves[0].id));
  if(snapshot.briefings.briefings[0]) paths.push('/threat-briefings/'+encodeURIComponent(snapshot.briefings.briefings[0].slug));
  for(const path of paths) {
    const response=await fetcher(new URL(path,origin),{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error('publication_page_failed:'+path);
    await response.arrayBuffer();
  }
  return {status:health.status,pipelines:health.pipelines,generatedAt:health.snapshotGeneratedAt,news:news.total,cves:cves.total,briefings:health.briefings.published,iocs:iocs.total};
}
