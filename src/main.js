// Boot: build every asset (in slices so the loading bar animates), then run
// the game at a fixed 60 Hz like the console's NTSC frame.
import { ctx, W, H, present, regs } from './ppu.js';
import { poll, setupTouch, pressed, held, bot, onFirstTouch } from './input.js';
import { initAudio, setMuted, state as audioState } from './audio.js';
import { G, newSave } from './state.js';
import { text } from './gfx.js';
import { buildHero } from './art/hero.js';
import { buildCreatures } from './art/creatures.js';
import { buildObjects, buildGear, buildBackground, buildTiles } from './art/world.js';
import { buildMapTexture } from './art/map.js';
import { REALMS } from './realms.js';
import { Title, tickScene, go, PlayScene, MapScene } from './scenes.js';

G.assets = { tiles: {}, bgs: {}, stages: {} };
const steps = [
  ['Ione', () => G.assets.hero = buildHero()],
  ['Créatures', () => G.assets.creatures = buildCreatures()],
  ['Objets', () => { G.assets.obj = buildObjects(); G.assets.bigGears = [buildGear(56, 20, '#6a4a30'), buildGear(36, 14, '#5a3a28')]; }],
  ['Royaumes', () => REALMS.forEach(r => { G.assets.bgs[r.id] = buildBackground(r); G.assets.tiles[r.id] = buildTiles(r); })],
  ['Carte du monde', () => G.assets.mapTex = buildMapTexture()],
];
let stepI = 0, booted = false;
function loadingFrame() {
  ctx.fillStyle = '#07060c'; ctx.fillRect(0, 0, W, H);
  text('SUNKEEPER', 128, 92, '#ffe9a0', 'c');
  const k = stepI / steps.length;
  ctx.fillStyle = '#2a2040'; ctx.fillRect(48, 110, 160, 6); ctx.fillStyle = '#ffb040'; ctx.fillRect(48, 110, 160 * k, 6);
  text(stepI < steps.length ? steps[stepI][0] + '…' : 'Prêt', 128, 124, '#a89cc0', 'c');
  present();
}

// --- fixed-step loop ----------------------------------------------------------
const STEP = 1000 / 60;
let acc = 0, last = performance.now();
const perf = { frames: 0, updates: 0, worst: 0, sum: 0, fpsT: performance.now(), fps: 60 };
function frame(now) {
  requestAnimationFrame(frame);
  if (!booted) {
    loadingFrame();
    if (stepI < steps.length) { steps[stepI][1](); stepI++; }
    else { booted = true; G.scene = new Title(); last = now; }
    return;
  }
  acc += Math.min(100, now - last); last = now;
  let n = 0;
  const f0 = performance.now();
  if (G.turbo) { for (let i = 0; i < G.turbo; i++) { tick(); present(); } n = 1; acc = 0; }
  else while (acc >= STEP && n < 4) { acc -= STEP; n++; tick(); }
  if (n && !G.turbo) present();
  const fdt = (performance.now() - f0) / (G.turbo || n || 1);
  if (n) { perf.fsum = (perf.fsum || 0) + fdt; perf.fn = (perf.fn || 0) + 1; perf.fworst = Math.max(perf.fworst || 0, fdt); }
  perf.frames++;
  if (now - perf.fpsT > 1000) { perf.fps = perf.frames * 1000 / (now - perf.fpsT); perf.frames = 0; perf.fpsT = now; }
}
function tick() {
  const t0 = performance.now();
  if (window.__botTick) window.__botTick();
  poll();
  if (pressed.start || pressed.jump || pressed.attack) initAudio();
  G.frame++;
  tickScene();
  if (G.debug.fps) text(perf.fps.toFixed(0) + ' FPS', 252, 214, '#0f0', 'r');
  const dt = performance.now() - t0;
  perf.updates++; perf.sum += dt; perf.worst = Math.max(perf.worst, dt);
}
requestAnimationFrame(frame);
setupTouch();
onFirstTouch(() => initAudio());

addEventListener('keydown', e => {
  if (e.code === 'KeyF') { const el = document.documentElement; if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); }
  if (e.code === 'KeyM') setMuted(!audioState.muted);
  if (e.code === 'F2') G.debug.fps = !G.debug.fps;
});
addEventListener('pointerdown', () => initAudio(), { once: false });

// --- test hooks for the play-testing bot (tools/playtest.mjs) -----------------
window.__game = {
  G, bot, perf, REALMS, held, pressed,
  ready: () => booted,
  start(ri, mode = 'stage', abilities = null) {
    G.save = newSave();
    for (let i = 0; i < ri; i++) G.save.cleared.push(i);
    if (abilities) Object.assign(G.save.abilities, abilities);
    else { const a = G.save.abilities; a.double = ri >= 1; a.dash = ri >= 2; a.wall = ri >= 3; a.shot = ri >= 4; }
    G.scene = new PlayScene(ri, mode);
  },
  map() { G.save = G.save || newSave(); G.scene = new MapScene(); },
  resetPerf() { perf.updates = 0; perf.sum = 0; perf.worst = 0; perf.fsum = 0; perf.fn = 0; perf.fworst = 0; },
};
