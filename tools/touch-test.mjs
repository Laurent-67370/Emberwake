// Multi-touch test on an emulated phone: two fingers landing on the same
// frame (D-pad right + A, then A + X with one thumb between them, then a tap
// shorter than one frame) must all register on the very next game frame.
import { createRequire } from 'module'; const { chromium, devices } = createRequire(import.meta.url)('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); }); }).listen(0);
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7 landscape'] });
const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(`http://localhost:${srv.address().port}/index.html`);
await pg.waitForFunction(() => window.__game && window.__game.ready());
await pg.evaluate(() => window.__game.start(0));
const cdp = await ctx.newCDPSession(pg);
const center = async sel => pg.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const right = await center('#tpL div[data-b=right]'), A = await center('#tpR div[data-b=jump]'), X = await center('#tpR div[data-b=attack]');
const between = { x: (A.x + X.x) / 2, y: (A.y + X.y) / 2 };
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
const frame = () => pg.evaluate(() => new Promise(r => { const f0 = window.__game.G.frame; const w = () => window.__game.G.frame > f0 ? r() : requestAnimationFrame(w); w(); }));
const state = () => pg.evaluate(() => ({ ...window.__game.held }));
let ok = true;
const check = (name, cond) => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name); ok &&= cond; };

await touch('touchStart', [right, A]); await frame();
let s = await state(); check('D-pad droite + A pressés sur la même image', s.right && s.jump);
await touch('touchEnd', []); await frame();
s = await state(); check('relâchement des deux', !s.right && !s.jump);

await touch('touchStart', [between]); await frame();
s = await state(); check('pouce entre A et X : saut + épée', s.jump && s.attack);
await touch('touchEnd', []); await frame();

// tap shorter than a frame: start + end before the game polls
await pg.evaluate(() => { window.__seen = false; const g = window.__game; const o = window.__botTick; window.__botTick = () => { o && o(); }; });
await touch('touchStart', [X]); await touch('touchEnd', []);
await frame();
const seen = await pg.evaluate(() => window.__game.G.scene.player.atk !== null);
check('tape ultra-brève (< 1 image) quand même prise en compte', seen);

// sliding a finger from right to left on the D-pad must not leave "right" stuck
const left = await center('#tpL div[data-b=left]');
await touch('touchStart', [right]); await frame(); await touch('touchMove', [left]); await frame();
s = await state(); check('glisser droite→gauche sans touche bloquée', s.left && !s.right);
await touch('touchEnd', []); await frame();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
await b.close(); srv.close(); process.exit(ok ? 0 : 1);
