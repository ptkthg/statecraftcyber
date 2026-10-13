import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.argv[2] ?? 'http://localhost:3146';
const pages = [['home','/'],['briefings','/threat-briefings'],['campanhas','/campanhas'],['cves','/cves'],['iocs','/iocs'],['noticias','/noticias'],['sobre','/sobre'],['metodologia','/metodologia'],['campaign-detail','/campanhas/unc6240-oracle-peoplesoft'],['cve-detail','/cves/CVE-2026-105484']];
const snapshotFile = resolve('.qa', 'live-preview.json');
if (existsSync(snapshotFile)) {
  const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  if (snapshot.briefings.briefings[0]) pages.push(['briefing-detail', `/threat-briefings/${snapshot.briefings.briefings[0].slug}`]);
  if (snapshot.news.articles[0]) pages.push(['news-detail', `/noticias/${snapshot.news.articles[0].slug}`]);
}
for (const [name, route] of pages.filter(([name]) => !process.argv[3] || process.argv[3] === name)) {
  const output = resolve('screenshots-refactor', `editorial-${name}-desktop.png`);
  const result = spawnSync(chrome, ['--headless=new','--disable-gpu','--disable-software-rasterizer','--hide-scrollbars','--window-size=1600,1000',`--screenshot=${output}`,`${base}${route}`], { stdio: 'ignore', timeout: 20000 });
  if (existsSync(output)) process.stdout.write(`${name} desktop: ${output}\n`);
  else process.stderr.write(`${name} desktop: failed (${result.status})\n`);
}
