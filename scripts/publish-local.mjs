import { spawn } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stagePublication,deploymentEnvironment,verifyPublication,removePublicationStage,automationBypassSecret,withProtectionBypass } from './lib/publication-deploy.mjs';
import { promoteWithRecovery } from './lib/publication-promote.mjs';
const repo=process.cwd();
const environment=deploymentEnvironment();
function vercel(args,cwd) {
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const command=process.platform==='win32'?'powershell.exe':'npx';
  const argv=process.platform==='win32'?['-NoProfile','-Command','& npx.cmd vercel@59.5.0 '+args.map(quote).join(' ')]:['--yes','vercel@59.5.0',...args];
  return new Promise((resolve,reject)=>{
    const child=spawn(command,argv,{cwd,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',data=>{stdout+=data;if(stdout.length>5*1024*1024)child.kill();});
    child.stderr.on('data',data=>{stderr+=data;if(stderr.length>5*1024*1024)child.kill();});
    child.on('error',reject);
    child.on('close',async(code)=>{
      try {
        await mkdir(join(repo,'.qa/publication'),{recursive:true});
        await writeFile(join(repo,'.qa/publication/vercel-last.log'),stderr,'utf8');
        if(code!==0) reject(new Error('vercel_command_failed'));else resolve(stdout);
      } catch {reject(new Error('publication_log_failed'));}
    });
  });
}
async function main() {
  const stage=await stagePublication(repo);
  console.log(JSON.stringify({stage:'isolated_publication',revision:stage.revision,sha256:stage.sha256,generatedAt:stage.snapshot.generatedAt}));
  const inspectCurrent=async()=>JSON.parse(await vercel(['inspect',stage.snapshot.origin,'--json'],stage.app));
  const previous=await inspectCurrent();
  if(typeof previous.id!=='string' || !previous.id.startsWith('dpl_')) throw new Error('previous_publication_required');
  const output=await vercel(['deploy','--prod','--skip-domain','--yes','--env','STATECRAFT_DATA_SOURCE=snapshot','--build-env','STATECRAFT_DATA_SOURCE=snapshot'],stage.app);
  const urls=output.match(/https:\/\/[a-z0-9-]+\.vercel\.app\b/g);
  const candidate=urls?.at(-1);
  if(!candidate) throw new Error('deployment_url_missing');
  console.log(JSON.stringify({stage:'verify_candidate',url:candidate}));
  const {projectId}=JSON.parse(await readFile(join(stage.app,'.vercel/project.json'),'utf8'));
  const secret=automationBypassSecret(JSON.parse(await vercel(['api','/v9/projects/'+encodeURIComponent(projectId)],stage.app)));
  if(!secret) throw new Error('protection_bypass_missing');
  const candidateFetch=withProtectionBypass(fetch,secret);
  const {verified,live}=await promoteWithRecovery({
    candidate,previous:previous.id,
    promote:deployment=>vercel(['promote',deployment,'--yes'],stage.app),
    verifyCandidate:()=>verifyPublication(candidate,stage.snapshot,candidateFetch,stage.sha256),
    verifyLive:()=>verifyPublication(stage.snapshot.origin,stage.snapshot,fetch,stage.sha256),
    verifyPrevious:async()=>{const restored=await inspectCurrent();if(restored.id!==previous.id)throw new Error('previous_publication_not_restored');return {id:restored.id};},
  });
  const report={completedAt:new Date().toISOString(),revision:stage.revision,sha256:stage.sha256,url:candidate,verified,live};
  await writeFile(join(repo,'.qa/publication/last-success.json'),JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify({stage:'publication_complete',...report}));
  await removePublicationStage(stage.directory,stage.root);
}
main().catch(error=>{console.error('local_publication_failed:'+(error instanceof Error?error.message:'unexpected_error'));process.exitCode=2;});
