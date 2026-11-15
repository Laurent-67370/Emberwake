// Shared Playwright harness: static server + page with the game loaded.
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
export async function open({ width = 1024, height = 900, headless = true } = {}) {
  const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0);
  const port = srv.address().port;
  const browser = await chromium.launch({ headless, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR:', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE:', m.text()); } });
  await page.goto(`http://localhost:${port}/index.html`);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__game && window.__game.ready(), null, { timeout: 120000 });
  console.log('boot ms', Date.now() - t0);
  return { page, browser, errors, close: async () => { await browser.close(); srv.close(); } };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
