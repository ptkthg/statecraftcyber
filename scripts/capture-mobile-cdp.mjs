import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = resolve('screenshots-refactor');
const profile = await mkdtemp(resolve(root, '.chrome-qa-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new','--disable-gpu','--disable-software-rasterizer','--remote-debugging-port=9225','--remote-allow-origins=*',`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let target;
  for (let i=0; i<40; i++) {
    try { const response = await fetch('http://127.0.0.1:9225/json/list'); const tabs = await response.json(); target = tabs.find((item) => item.type === 'page'); if (target) break; } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!target) throw new Error('Chrome DevTools indisponível');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
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
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params })); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const pages = [['home','/'],['briefings','/threat-briefings'],['campanhas','/campanhas'],['cves','/cves'],['iocs','/iocs'],['noticias','/noticias'],['sobre','/sobre'],['metodologia','/metodologia']];
  const snapshotFile = resolve('.qa', 'live-preview.json');
  if (existsSync(snapshotFile)) {
    const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
    if (snapshot.briefings.briefings[0]) pages.push(['briefing-detail', `/threat-briefings/${snapshot.briefings.briefings[0].slug}`]);
    if (snapshot.news.articles[0]) pages.push(['news-detail', `/noticias/${snapshot.news.articles[0].slug}`]);
  }
  for (const [name, route] of pages) {
    await send('Page.navigate', { url: `http://localhost:3146${route}` });
    await new Promise((done) => setTimeout(done, 1900));
    await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    const metrics = await send('Runtime.evaluate', { expression: '({width: innerWidth, scrollWidth: document.documentElement.scrollWidth})', returnByValue: true });
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const output = resolve(root, `editorial-${name}-mobile.png`);
    await writeFile(output, Buffer.from(screenshot.data, 'base64'));
    process.stdout.write(`${name}: ${JSON.stringify(metrics.result.value)} ${output}\n`);
  }
} finally {
  ws?.close();
  chrome.kill();
  const expected = `${root}${sep}`;
  if (profile.startsWith(expected) && profile !== root) await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
}
