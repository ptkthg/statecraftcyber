import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const qaRoot = resolve('.qa');
const profile = await mkdtemp(resolve(qaRoot, '.chrome-ui-'));
const downloads = await mkdtemp(resolve(qaRoot, '.downloads-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--disable-software-rasterizer',
  '--remote-debugging-port=9226', '--remote-allow-origins=*',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
let ws;

try {
  let target;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:9226/json/list');
      target = (await response.json()).find((item) => item.type === 'page');
      if (target) break;
    } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!target) throw new Error('Chrome DevTools indisponível');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    ws.addEventListener('open', done, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id);
    if (message.error) promise.reject(new Error(message.error.message));
    else promise.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

  await send('Page.navigate', { url: 'http://localhost:3146/iocs' });
  await wait(1800);
  const initial = await evaluate('({rows: document.querySelectorAll(\'[aria-label="Lista de IOCs"] .group\').length, total: document.body.innerText.includes("80 REGISTROS INDEXADOS")})');
  assert(initial.rows === 25 && initial.total, 'IOC: primeira página ou total não renderizados');

  await evaluate('document.querySelector("#ioc-search").focus()');
  await send('Input.insertText', { text: '4b531' });
  await wait(850);
  const searched = await evaluate('({rows: document.querySelectorAll(\'[aria-label="Lista de IOCs"] .group\').length, hit: document.querySelector(\'[aria-label="Lista de IOCs"]\').innerText.includes("4b531")})');
  assert(searched.rows === 1 && searched.hit, 'IOC: busca na interface falhou');

  await evaluate('document.querySelector(\'[aria-label="Limpar busca"]\').click()');
  await wait(500);
  await evaluate('Array.from(document.querySelectorAll(\'[aria-label="Filtrar por tipo de IOC"] button\')).find((button) => button.textContent.trim().startsWith("IP")).click()');
  await wait(650);
  const filtered = await evaluate('({rows: document.querySelectorAll(\'[aria-label="Lista de IOCs"] .group\').length, label: document.querySelector(\'[aria-label="Lista de IOCs"]\').innerText})');
  assert(filtered.rows === 1 && filtered.label.includes('IP'), 'IOC: filtro por IP falhou');

  for (const format of ['CSV', 'JSON', 'TXT']) {
    await evaluate(`document.querySelector('[aria-label="Exportar IOCs em ${format}"]').click()`);
    await wait(600);
  }
  const files = await readdir(downloads);
  for (const extension of ['csv', 'json', 'txt']) {
    assert(files.some((file) => file.endsWith(`.${extension}`)), `IOC: download ${extension} ausente`);
  }
  const csvFile = files.find((file) => file.endsWith('.csv'));
  assert((await readFile(resolve(downloads, csvFile), 'utf8')).includes('tipo,valor'), 'IOC: CSV inválido');
  await evaluate('document.querySelector(\'[aria-label="Exportar IOCs em KQL"]\').click()');
  await wait(600);
  const kql = await evaluate('document.querySelector("[role=dialog]")?.innerText ?? ""');
  assert(kql.includes('ioc_ips'), 'IOC: KQL não gerado');

  await send('Page.navigate', { url: 'http://localhost:3146/threat-briefings' });
  await wait(1500);
  const briefings = await evaluate('({total: document.body.innerText.includes("49 PUBLICADOS"), categories: Array.from(document.querySelectorAll("button")).some((button) => button.textContent.includes("Malware"))})');
  assert(briefings.total && briefings.categories, 'Briefings: dados e filtros não renderizados');
  await evaluate('document.querySelector("#briefing-search").focus()');
  await send('Input.insertText', { text: 'Vidar' });
  await wait(350);
  const briefingSearch = await evaluate('document.body.innerText.includes("Indicadores ativos de Vidar")');
  assert(briefingSearch, 'Briefings: busca não encontrou título real');

  console.log(JSON.stringify({ initialIocRows: initial.rows, searchedIocRows: searched.rows, filteredIpRows: filtered.rows, downloads: files.map((file) => file.split('.').at(-1)).sort(), kql: 'ok', briefings: 'ok' }, null, 2));
} finally {
  ws?.close();
  chrome.kill();
  for (const directory of [profile, downloads]) {
    if (!directory.startsWith(qaRoot + sep)) throw new Error('Limpeza fora do diretório de QA');
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
