// Scenes: title, story, Mode 7 overworld, realm card, stage / boss play,
// game over and the ending. `go()` switches scenes through a mosaic fade.
import { ctx, W, H, regs, resetRegs, gradient, mode7, mode7Project, affine, makeCanvas } from './ppu.js';
import { held, pressed, clearPressed } from './input.js';
import { initAudio, playSong, stopSong, sfx, setMuted, state as audioState, musicDuck } from './audio.js';
import { SONGS } from './music.js';
import { G, newSave, loadSave, writeSave, eraseSave, moteCount } from './state.js';
import { text, textWidth, ramp, css, pixels, OUTLINE } from './gfx.js';
import { fx, burst, updateFx, drawFx, clearFx, shake, flash, text as ftext } from './fx.js';
import { REALMS } from './realms.js';
import { buildStage, ARENAS } from './levelgen.js';
import { Stage, T } from './stage.js';
import { Player } from './player.js';
import { Enemy, Shot, Item, overlap } from './actors.js';
import { BOSSES } from './bosses.js';
import { clamp } from './util.js';

// ------------------------------------------------------------------ scene switching
let fade = null;
export function go(make, opt = {}) {
  if (fade) return;
  fade = { t: 0, len: opt.fast ? 12 : 22, make, out: true, mosaic: opt.mosaic ?? true };
}
export function tickScene() {
  if (fade) {
    fade.t++;
    const k = fade.t / fade.len;
    if (fade.out) { regs.brightness = Math.round(15 * (1 - k)); if (fade.mosaic) regs.mosaic = Math.round(k * 10); if (fade.t >= fade.len) { fade.out = false; fade.t = 0; resetRegs(); clearFx(); G.scene = fade.make(); regs.brightness = 0; } }
    else { regs.brightness = Math.round(15 * k); if (fade.mosaic) regs.mosaic = Math.round((1 - k) * 10); if (fade.t >= fade.len) { fade = null; regs.mosaic = 0; regs.brightness = 15; } }
  }
  const s = G.scene;
  if (!fade || !fade.out) s.update(); else s.idle?.();
  s.draw();
  if (fade) { if (fade.out) regs.brightness = Math.min(regs.brightness, Math.round(15 * (1 - fade.t / fade.len))); else regs.brightness = Math.min(regs.brightness, Math.round(15 * fade.t / fade.len)); }
}

// ------------------------------------------------------------------ UI helpers
export function windowBox(x, y, w, h, alpha = 0.86) { // SNES-style message window with gradient
  for (let i = 0; i < h; i += 2) { const k = i / h; ctx.fillStyle = `rgba(${24 + k * 20 | 0},${16 + k * 8 | 0},${60 - k * 24 | 0},${alpha})`; ctx.fillRect(x, y + i, w, 2); }
  ctx.strokeStyle = '#e8d8b0'; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.strokeStyle = '#6a5a8a'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
const LOGO = {};
function bigText(str, scale, top, bot) {
  const k = str + scale + top;
  if (LOGO[k]) return LOGO[k];
  const w = textWidth(str) + 2, h = 12;
  const small = makeCanvas(w, h), sg = small.getContext('2d');
  text(str, 1, 2, '#ffffff', 'l', null, sg);
  const P = pixels(w * scale + 4, h * scale + 4);
  const sd = sg.getImageData(0, 0, w, h).data;
  const R = ramp(top, 6, 0.8), RB = ramp(bot, 4, 0.6);
  for (let y = 0; y < h * scale; y++) for (let x = 0; x < w * scale; x++) {
    const sx = x / scale | 0, sy = y / scale | 0; if (!sd[(sy * w + sx) * 4 + 3]) continue;
    const t = y / (h * scale);
    const col = t < 0.5 ? R[5 - Math.floor(t * 8)] : RB[Math.min(3, Math.floor((t - 0.5) * 8))];
    P.set(x + 2, y + 2, col);
  }
  // outline
  const out = pixels(P.w, P.h);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const c = P.get(x, y); if (c) { out.set(x, y, c); continue; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < P.w && yy < P.h && P.get(xx, yy)) { out.set(x, y, OUTLINE); break; } }
  }
  return LOGO[k] = out.put();
}
function menu(items, sel, x, y, gap = 12) {
  items.forEach((it, i) => {
    const on = i === sel;
    text(it, x, y + i * gap, on ? '#ffe9a0' : '#a89cc0', 'c');
    if (on) { const w = textWidth(it); const b = Math.sin(G.frame / 6) > 0 ? 1 : 0; text('>', x - w / 2 - 10 - b, y + i * gap, '#ffb040'); text('<', x + w / 2 + 5 + b, y + i * gap, '#ffb040'); }
  });
}
function menuNav(sel, n) {
  if (pressed.up) { sfx('menu'); return (sel + n - 1) % n; }
  if (pressed.down) { sfx('menu'); return (sel + 1) % n; }
  return sel;
}
const ok = () => pressed.jump || pressed.start || pressed.attack;

// ------------------------------------------------------------------ title
export class Title {
  constructor() { this.t = 0; this.sel = 0; this.cam = { x: 512, y: 700, angle: 0, height: 60, horizon: 120, fov: 1 }; this.hasSave = !!loadSave(); this.started = false; resetRegs(); if (audioState.song) playSong(SONGS.title); }
  items() { return this.hasSave ? ['Continuer', 'Nouvelle partie', 'Son : ' + (audioState.muted ? 'non' : 'oui')] : ['Nouvelle partie', 'Son : ' + (audioState.muted ? 'non' : 'oui')]; }
  update() {
    this.t++; this.cam.angle += 0.002; this.cam.x = 512 + Math.cos(this.t / 400) * 200; this.cam.y = 512 + Math.sin(this.t / 400) * 200;
    if (!this.started) { if (ok()) { this.started = true; initAudio(); playSong(SONGS.title); sfx('bell'); clearPressed(); } return; }
    const it = this.items();
    this.sel = menuNav(this.sel, it.length);
    if (ok()) {
      const v = it[this.sel];
      if (v.startsWith('Son')) { setMuted(!audioState.muted); sfx('select'); return; }
      sfx('select');
      if (v === 'Continuer') { G.save = loadSave(); go(() => new MapScene()); }
      else { eraseSave(); G.save = newSave(); writeSave(); go(() => new Story(STORY_INTRO, () => new MapScene())); }
    }
  }
  draw() {
    gradient(0, 121, [[0, 20, 10, 40], [0.6, 120, 50, 90], [1, 255, 160, 110]], 2);
    // sun-bell rising behind the logo
    const sy = 112 - Math.min(40, this.t / 6);
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 44; r > 8; r -= 6) { ctx.fillStyle = `rgba(255,${150 + r},${80 + r},0.07)`; ctx.beginPath(); ctx.arc(128, sy, r, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffe8b0'; ctx.beginPath(); ctx.arc(128, sy, 14, 0, 7); ctx.fill();
    mode7(G.assets.mapTex, this.cam, [255, 160, 110], { fogDist: 700 });
    const logo = bigText('SUNKEEPER', 3, '#ffd070', '#c04a30');
    ctx.drawImage(logo, Math.round(128 - logo.width / 2), 34 + Math.round(Math.sin(this.t / 40) * 2));
    text('La cloche du dernier soleil', 128, 78, '#ffe9c8', 'c');
    if (!this.started) { if ((this.t >> 5) & 1) text('Appuyez sur Start', 128, 168, '#fff', 'c'); }
    else { windowBox(68, 146, 120, 12 + this.items().length * 12); menu(this.items(), this.sel, 128, 154); }
    text('(c) 2026 · un jeu original', 128, 212, '#c8b8e0', 'c');
  }
}

// ------------------------------------------------------------------ story cards
const STORY_INTRO = [
  'Il y a mille hivers, la Cloche-Soleil sonnait chaque matin au-dessus de Cindral, et le jour se levait.',
  "Puis vint l'Éclipse. Le Roi d'ombre brisa la cloche en cinq éclats et les confia à cinq gardiens.",
  "Depuis, l'aube ne vient plus. Seule Ione, dernière gardienne des cloches, porte encore une lanterne allumée.",
  "Retrouve les cinq éclats. Fais sonner la cloche. Ramène le matin.",
];
const STORY_END = [
  "Le dernier éclat rejoint les autres. La Cloche-Soleil, entière, tremble entre les mains d'Ione.",
  "Elle sonne une fois — et la nuit se fend comme une coquille.",
  "Sur les cinq royaumes, pour la première fois depuis mille hivers, le jour se lève.",
];
export class Story {
  constructor(pages, next, song = 'title') { this.pages = pages; this.next = next; this.i = 0; this.c = 0; this.t = 0; playSong(SONGS[song]); }
  update() {
    this.t++; this.c += 0.7;
    const full = this.pages[this.i].length;
    if (ok() || held.attack && this.c > full) {
      if (this.c < full) this.c = full;
      else { this.i++; this.c = 0; sfx('menu'); if (this.i >= this.pages.length) { this.i = this.pages.length - 1; go(this.next); } }
    }
  }
  draw() {
    gradient(0, H, [[0, 8, 4, 20], [0.7, 40, 16, 60], [1, 90, 30, 80]], 2);
    const x = 128, y = 70;
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 50; r > 26; r -= 4) { ctx.fillStyle = `rgba(255,${100 + r},${150 + r},0.06)`; ctx.beginPath(); ctx.arc(x, y, r + Math.sin(this.t / 20 + r) * 2, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0a0410'; ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fill();
    windowBox(12, 132, 232, 78);
    wrap(this.pages[this.i].slice(0, Math.floor(this.c)), 22, 142, 212, '#f4ecff');
    if (this.c >= this.pages[this.i].length && (this.t >> 4) & 1) text('>', 232, 198, '#ffb040');
  }
}
function wrap(str, x, y, w, col) {
  const words = str.split(' '); let line = '', yy = y;
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (textWidth(t) > w) { text(line, x, yy, col); yy += 12; line = wd; } else line = t; }
  if (line) text(line, x, yy, col);
}

// ------------------------------------------------------------------ Mode 7 overworld
export class MapScene {
  constructor() {
    this.t = 0; resetRegs();
    const cleared = G.save.cleared.length;
    const at = REALMS[Math.min(cleared, 4)].node;
    this.cam = { x: at[0], y: at[1] + 150, angle: -Math.PI / 2, height: 44, horizon: 64, fov: 0.9 };
    this.speed = 0; this.near = -1; this.bank = 0;
    playSong(SONGS.map);
    writeSave();
  }
  unlocked(i) { return i <= G.save.cleared.length; }
  update() {
    this.t++;
    const c = this.cam;
    const turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    c.angle += turn * 0.028; this.bank += (turn * 0.25 - this.bank) * 0.1;
    this.speed += ((held.up || held.jump ? 2.6 : held.down ? 0 : 1.1) - this.speed) * 0.05;
    c.x = clamp(c.x + Math.cos(c.angle) * this.speed, 40, 984); c.y = clamp(c.y + Math.sin(c.angle) * this.speed, 40, 984);
    // the glider sits ~70px ahead of the camera
    const gx = c.x + Math.cos(c.angle) * 70, gy = c.y + Math.sin(c.angle) * 70;
    this.near = -1;
    REALMS.forEach((r, i) => { if (Math.hypot(r.node[0] - gx, r.node[1] - gy) < 60) this.near = i; });
    if (this.near >= 0 && (pressed.attack || pressed.start) && this.unlocked(this.near)) { sfx('select'); const i = this.near; go(() => new RealmCard(i)); }
    else if (this.near >= 0 && pressed.attack) sfx('clang');
    if (this.t % 50 === 0) sfx('glide');
  }
  draw() {
    const c = this.cam;
    gradient(0, c.horizon + 1, [[0, 12, 6, 36], [0.7, 120, 60, 110], [1, 255, 170, 120]], 2);
    // far panorama strip that scrolls with the camera angle
    const pano = G.assets.bgs[0][0].img, off = Math.round((c.angle / (Math.PI * 2)) * 512 * 2) % 512;
    for (let x = -((off % 512) + 512) % 512; x < W; x += 512) ctx.drawImage(pano, 0, 70, 512, 60, x, c.horizon - 30, 512, 31);
    mode7(G.assets.mapTex, c, [255, 170, 120], { fogDist: 820 });
    // realm landmarks as scaled objects
    const pts = REALMS.map((r, i) => ({ i, r, p: mode7Project(c, r.node[0], r.node[1]) })).filter(o => o.p).sort((a, b) => a.p.scale - b.p.scale);
    for (const { i, r, p } of pts) {
      const s = Math.min(1.3, p.scale * 1.6); if (s < 0.08 || p.x < -60 || p.x > W + 60) continue;
      const ok2 = this.unlocked(i), done = G.save.cleared.includes(i);
      const h = 60 * s;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = done ? 'rgba(255,220,120,0.25)' : ok2 ? 'rgba(160,220,255,0.3)' : 'rgba(120,100,140,0.15)';
      ctx.fillRect(Math.round(p.x - 3 * s - 1), Math.round(p.y - h * 3), Math.max(2, Math.round(6 * s)), Math.round(h * 3));
      ctx.globalCompositeOperation = 'source-over';
      const img = G.assets.obj.shrine[done ? 1 : 0];
      const w = img.width * s, hh = img.height * s;
      ctx.globalAlpha = ok2 ? 1 : 0.45;
      ctx.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - hh), Math.max(1, Math.round(w)), Math.max(1, Math.round(hh)));
      ctx.globalAlpha = 1;
    }
    // glider (Ione under her cloak-wing)
    const hero = G.assets.hero.R.dash[0];
    const gy = 168 + Math.sin(this.t / 20) * 2;
    ctx.fillStyle = 'rgba(0,0,20,0.35)'; ctx.beginPath(); ctx.ellipse(128, 206, 14, 3, 0, 0, 7); ctx.fill();
    affine(hero, 128, gy, -Math.PI / 2 + this.bank, 1.2);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,220,140,0.6)'; ctx.fillRect(127 - Math.round(this.bank * 10), gy + 14, 2, 2 + (this.t >> 2) % 3); ctx.globalCompositeOperation = 'source-over';
    // HUD
    windowBox(4, 4, 248, 20, 0.7);
    for (let i = 0; i < 5; i++) { const img = G.assets.obj.shard[0]; ctx.globalAlpha = G.save.cleared.includes(i) ? 1 : 0.25; ctx.drawImage(img, 8 + i * 18, 2, 16, 16 * img.height / img.width * 0 + 20); }
    ctx.globalAlpha = 1;
    text('Motes ' + moteCount() + '/15', 248, 10, '#ffe9a0', 'r');
    if (this.near >= 0) {
      const r = REALMS[this.near], open = this.unlocked(this.near);
      windowBox(20, 178, 216, 40);
      text(r.name, 128, 186, '#ffe9a0', 'c');
      text(open ? (G.save.cleared.includes(this.near) ? 'Éclat obtenu · X/Start : revisiter' : 'X / Start : entrer') : 'Scellé — vainquez le gardien précédent', 128, 200, open ? '#fff' : '#a89cc0', 'c');
    } else text('◀ ▶ virer   ▲/A accélérer', 128, 212, '#e8dcff', 'c');
  }
}

// ------------------------------------------------------------------ realm title card
export class RealmCard {
  constructor(i) { this.i = i; this.t = 0; stopSong(0.5); sfx('bell'); }
  update() { this.t++; if (this.t > 150 || (this.t > 40 && ok())) go(() => new PlayScene(this.i, 'stage')); }
  draw() {
    const R = REALMS[this.i];
    gradient(0, H, R.sky, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    regs.mosaic = Math.max(0, 8 - Math.floor(this.t / 4));
    text('Royaume ' + (this.i + 1), 128, 80, '#c8b8e0', 'c');
    const lg = bigText(R.name.toUpperCase(), 1, '#ffe9a0', '#ff9a50');
    ctx.drawImage(lg, Math.round(128 - lg.width / 2), 96);
    text(R.sub, 128, 120, '#e8dcff', 'c');
  }
}

// ------------------------------------------------------------------ play (stage or boss)
export class PlayScene {
  constructor(ri, mode, checkpoint = null) {
    this.ri = ri; this.realm = REALMS[ri]; this.mode = mode; resetRegs(); clearFx();
    if (mode === 'stage') {
      const def = (G.assets.stages[ri] ||= buildStage(this.realm));
      this.stage = new Stage(def, this.realm);
    } else {
      this.stage = new Stage({ grid: ARENAS[this.realm.boss] }, this.realm, { arena: this.realm.boss });
      this.stage.cam.maxX = 0; this.stage.cam.maxY = 16;
    }
    const st = this.stage;
    const sp = checkpoint || st.start;
    this.player = new Player(this, sp.x, sp.y);
    this.checkpoint = checkpoint;
    this.enemies = st.spawns.map(s => new Enemy(this, s.type, s.x, s.y));
    const got = G.save.motes[ri] || [], hearts = G.save.hearts[ri] || [];
    this.items = st.items.filter(it => !(it.kind === 'mote' && got.includes(it.id)) && !(it.kind === 'heart' && hearts.includes(it.id))).map(it => new Item(it.kind, it.x, it.y, { id: it.id, t: it.t }));
    if (checkpoint) for (const s of st.shrines) if (s.x <= checkpoint.x + 1) s.lit = true;
    this.shots = []; this.pshots = [];
    this.t = 0; this.paused = false; this.psel = 0; this.end = null; this.banner = 0;
    st.cam.x = clamp(this.player.cx - W / 2, st.cam.minX, st.cam.maxX); st.cam.y = clamp(this.player.cy - H * 0.58, st.cam.minY, st.cam.maxY);
    if (mode === 'boss') { this.boss = new BOSSES[this.realm.boss](this); stopSong(0.3); this.bossSongT = 60; }
    else playSong(SONGS[this.realm.song]);
    this.leaves = [];
  }
  // --- services for actors
  attack(box, dmg, src, hitSet, kind) {
    let hit = false;
    for (const e of this.enemies) {
      if (e.dead || hitSet.has(e) || !overlap(box, e)) continue;
      hitSet.add(e); const r = e.damage(dmg, src, kind); if (r) hit = true;
    }
    if (this.boss && !this.boss.dying && !hitSet.has(this.boss)) {
      for (const hb of this.boss.hurtboxes()) if (overlap(box, hb)) { hitSet.add(this.boss); const r = this.boss.damage(dmg, src, kind, hb); if (r) hit = true; break; }
    }
    for (const s of this.shots) if (s.breakable && !s.dead && overlap(box, s.box)) { s.dead = true; hit = true; sfx('clang'); burst(s.x, s.y, 6, { col: ['#fff', '#fda'], speed: 2 }); }
    return hit;
  }
  enemyShot(x, y, vx, vy, kind, o = {}) {
    if (o.aim) {
      const a = Math.atan2(this.player.cy - y, this.player.cx - x);
      for (const sp of (o.spread || [0])) this.shots.push(new Shot(x, y, Math.cos(a + sp) * o.aim, Math.sin(a + sp) * o.aim, kind, o));
      return;
    }
    this.shots.push(new Shot(x, y, vx, vy, kind, o));
  }
  playerShot(x, y, dir, big) { this.pshots.push(new Shot(x, y, dir * (big ? 4.5 : 6), 0, big ? 'big' : 'sun', { friendly: true, dmg: big ? 3 : 1, pierce: big, r: big ? 9 : 4, life: 70 })); }
  particles(x, y, big) { burst(x, y, 1, { col: big ? '#ffd070' : '#ffeedd', speed: 0.5, g: 0, life: 12, glow: true }); }
  dropEmbers(x, y, n) { for (let i = 0; i < n; i++) this.items.push(new Item('ember', x, y, { phys: true, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 2, life: 420 })); }
  collect(it) {
    it.dead = true;
    const S = G.save;
    if (it.kind === 'ember') { S.embers++; sfx('ember'); burst(it.x, it.y, 4, { col: '#ffcf6a', speed: 1.2, g: 0, life: 12, glow: true }); if (S.embers % 100 === 0) { this.player.hp = Math.min(S.maxHp, this.player.hp + 2); sfx('heart'); ftext(it.x, it.y - 10, '+2 ♥', '#ff7aa0'); } }
    else if (it.kind === 'mote') { (S.motes[this.ri] ||= []).push(it.id); sfx('mote'); flash(4, '255,230,160'); ftext(it.x, it.y - 12, 'Mote solaire ' + (S.motes[this.ri].length) + '/3', '#ffe9a0'); writeSave(); }
    else if (it.kind === 'heart') { (S.hearts[this.ri] ||= []).push(it.id); S.maxHp++; this.player.hp = S.maxHp; sfx('power'); flash(6, '255,120,160'); ftext(it.x, it.y - 12, 'Vase de cœur ! PV max +1', '#ff9ab0'); writeSave(); }
    else if (it.kind === 'shard') { this.end = { t: 0 }; sfx('power'); flash(20, '255,240,200'); }
  }
  onPlayerDeath() { G.save.deaths++; stopSong(1); setTimeout(() => sfx('kill'), 200); this.deathT = 0; }
  onBossDefeated(b) { stopSong(0.5); sfx('roar'); this.player.inv = 999; this.shots.length = 0; }
  onPhase2() { playSong(SONGS.final, { restart: true }); }

  update() {
    if (this.paused) return this.updatePause();
    if (pressed.start && !this.end && !this.player.dead) { this.paused = true; this.psel = 0; sfx('pause'); musicDuck(0.35); return; }
    if (fx.stop > 0) { fx.stop--; return; }
    this.t++; G.save.time += 1 / 60;
    const st = this.stage, P = this.player;
    st.update();
    P.update();
    if (P.dead) { this.deathT++; if (this.deathT === 90) { playSong(SONGS.gameover); } if (this.deathT > 150) go(() => new GameOver(this.ri, this.mode, this.checkpoint)); }
    const cam = st.cam;
    for (const e of this.enemies) { if (e.dead) continue; if (e.cx > cam.x - 120 && e.cx < cam.x + W + 120 && e.cy > cam.y - 140 && e.cy < cam.y + H + 140) e.update(); }
    this.enemies = this.enemies.filter(e => !e.dead);
    for (const s of this.shots) { s.update(this); if (!s.dead && overlap(s.box, P) && P.hurt(s.dmg, s.x)) { if (s.kind !== 'wave') s.dead = true; } }
    this.shots = this.shots.filter(s => !s.dead && s.x > cam.x - 80 && s.x < cam.x + W + 80 && s.y < cam.y + H + 80 && s.y > cam.y - 140);
    for (const s of this.pshots) {
      s.update(this);
      for (const e of this.enemies) if (!e.dead && overlap(s.box, e) && !(s.hitE ||= new Set()).has(e)) { s.hitE.add(e); e.damage(s.dmg, { cx: s.x - s.vx, cy: s.y }, s.kind); if (!s.pierce) s.dead = true; }
      if (this.boss && !this.boss.dying) for (const hb of this.boss.hurtboxes()) if (overlap(s.box, hb) && !(s.hitB)) { s.hitB = true; this.boss.damage(s.dmg, { cx: s.x - s.vx * 4, cy: s.y }, s.kind, hb); if (!s.pierce) s.dead = true; break; }
      for (const q of this.shots) if (q.breakable && !q.dead && overlap(s.box, q.box)) { q.dead = true; if (!s.pierce) s.dead = true; }
    }
    this.pshots = this.pshots.filter(s => !s.dead && s.x > cam.x - 40 && s.x < cam.x + W + 40);
    for (const it of this.items) { if (it.kind === 'shard') it.y = Math.min(188, it.y + 0.5); it.update(this); }
    this.items = this.items.filter(i => !i.dead);
    // shrines (checkpoints)
    for (const s of st.shrines) if (!s.lit && Math.abs(P.cx - s.x) < 16 && Math.abs(P.bottom - s.y) < 24) {
      s.lit = true; this.checkpoint = { x: s.x, y: s.y }; P.hp = Math.min(G.save.maxHp, P.hp + 2); sfx('checkpoint'); flash(4, '255,230,160');
      burst(s.x, s.y - 20, 20, { col: ['#ffe9a0', '#fff'], speed: 2, life: 30, glow: true }); ftext(s.x, s.y - 40, 'Cloche éveillée', '#ffe9a0'); writeSave();
    }
    // exit gate -> boss
    if (st.exit && !this.leaving && Math.abs(P.cx - st.exit.x) < 14 && P.bottom > st.exit.y - 64 && P.bottom <= st.exit.y + 2) {
      this.leaving = true; P.frozen = true; sfx('door'); stopSong(0.8); go(() => new PlayScene(this.ri, 'boss'));
    }
    // boss flow
    if (this.boss) {
      if (this.bossSongT > 0 && --this.bossSongT === 0) { playSong(this.ri === 4 ? SONGS.boss : SONGS.boss); this.banner = 180; }
      if (this.banner > 0) this.banner--;
      this.boss.update();
      if (this.boss.dead && !this.shardOut) {
        this.shardOut = true; this.items.push(new Item('shard', 128, 120, { id: 'shard' }));
        playSong(SONGS.victory);
      }
    }
    if (this.end) {
      this.end.t++; P.frozen = true;
      if (this.end.t === 1) {
        const S = G.save; if (!S.cleared.includes(this.ri)) S.cleared.push(this.ri);
        if (this.realm.gift) S.abilities[this.realm.gift] = true;
        S.maxHp = Math.max(S.maxHp, 5); writeSave();
      }
      if (this.end.t > 60 && (ok() || this.end.t > 600)) {
        if (this.ri === 4) { G.save.beaten = true; writeSave(); go(() => new Story(STORY_END, () => new Ending(), 'ending')); }
        else go(() => new MapScene());
        this.end.t = -9999;
      }
    }
    // camera
    if (this.mode === 'stage') st.follow(P.cx, P.cy, P.face);
    else { st.cam.x = 0; st.cam.y = 16; }
    // realm ambience
    if (this.realm.fx === 'leaves' && this.t % 9 === 0) this.leaves.push({ x: cam.x + Math.random() * 300, y: cam.y - 10, vx: -0.4 - Math.random() * 0.5, vy: 0.5 + Math.random() * 0.4, t: Math.random() * 100, c: Math.random() < 0.5 ? '#e8a040' : '#a8d060' });
    if (this.realm.fx === 'eclipse' && this.t % 4 === 0) burst(cam.x + Math.random() * W, cam.y + H + 4, 1, { col: '#c080ff', speed: 0.3, g: -0.02, life: 120, size: 1, glow: true });
    if (this.realm.fx === 'heat' && this.t % 6 === 0) burst(cam.x + Math.random() * W, cam.y + Math.random() * H, 1, { col: '#ffe0a0', speed: 0.3, g: 0.01, life: 60, size: 1 });
    for (const l of this.leaves) { l.t++; l.x += l.vx + Math.sin(l.t / 20) * 0.5; l.y += l.vy; }
    this.leaves = this.leaves.filter(l => l.y < cam.y + H + 10);
    updateFx();
    // scanline effects
    const tt = this.t;
    regs.lineOffset = null;
    if (this.realm.fx === 'water' && P.inWater) regs.lineOffset = y => Math.sin(y * 0.09 + tt * 0.08) * 1.6, regs.lineOffsetFrom = 0;
    else if (this.realm.fx === 'water' && this.mode === 'boss') { regs.lineOffsetFrom = 160 - 16; regs.lineOffset = y => Math.sin(y * 0.3 + tt * 0.1) * 1.2; }
    else if (this.realm.fx === 'heat') { regs.lineOffsetFrom = 22; regs.lineOffset = y => y < 140 ? Math.sin(y * 0.22 + tt * 0.12) * 0.9 : 0; }
    regs.tint = this.realm.fx === 'eclipse' ? [80, 0, 60, 0.06 + Math.sin(this.t / 40) * 0.03] : null;
  }
  updatePause() {
    const items = ['Reprendre', this.mode === 'stage' ? 'Retour à la carte' : 'Abandonner le combat', 'Son : ' + (audioState.muted ? 'non' : 'oui')];
    this.psel = menuNav(this.psel, items.length);
    if (pressed.start) { this.paused = false; musicDuck(1); sfx('pause'); return; }
    if (ok()) {
      sfx('select');
      if (this.psel === 0) { this.paused = false; musicDuck(1); }
      else if (this.psel === 1) { musicDuck(1); go(() => new MapScene()); this.paused = false; }
      else setMuted(!audioState.muted);
    }
  }
  idle() { updateFx(); }

  draw() {
    const st = this.stage;
    const sx = fx.shake ? (Math.random() - 0.5) * fx.shake * 2 : 0, sy = fx.shake ? (Math.random() - 0.5) * fx.shake * 2 : 0;
    const cx = Math.round(st.cam.x + sx), cy = Math.round(st.cam.y + sy);
    st.drawBack(cx, cy);
    if (this.boss && this.ri === 4 && this.boss.p2) { ctx.fillStyle = 'rgba(10,0,20,0.55)'; ctx.fillRect(0, 0, W, H); }
    if (this.boss && this.realm.boss === 'horologe') this.boss.draw(cx, cy);
    st.drawTerrain(cx, cy);
    for (const s of st.shrines) ctx.drawImage(G.assets.obj.shrine[s.lit ? 1 : 0], Math.round(s.x - 12 - cx), Math.round(s.y - 34 - cy));
    if (st.exit) { ctx.drawImage(G.assets.obj.gate, Math.round(st.exit.x - 20 - cx), Math.round(st.exit.y - 48 - cy)); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,220,140,${0.15 + Math.sin(this.t / 15) * 0.08})`; ctx.fillRect(Math.round(st.exit.x - 12 - cx), Math.round(st.exit.y - 34 - cy), 24, 34); ctx.globalCompositeOperation = 'source-over'; }
    for (const it of this.items) it.kind === 'shard' ? this.drawShard(it, cx, cy) : it.draw(cx, cy);
    if (this.boss && this.realm.boss !== 'horologe') this.boss.draw(cx, cy);
    for (const e of this.enemies) e.draw(cx, cy);
    this.player.draw(cx, cy);
    for (const s of this.pshots) s.draw(cx, cy);
    for (const s of this.shots) s.draw(cx, cy);
    st.drawWater(cx, cy);
    drawFx(cx, cy, (s, x, y, c, a) => text(s, x, y, c, a));
    for (const l of this.leaves) { ctx.fillStyle = l.c; ctx.fillRect(Math.round(l.x - cx), Math.round(l.y - cy), 2, 1); }
    st.drawFront(cx, cy);
    if (fx.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${fx.flashCol},${Math.min(0.6, fx.flash * 0.08)})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    this.drawHUD();
    if (this.paused) { ctx.fillStyle = 'rgba(10,6,20,0.6)'; ctx.fillRect(0, 0, W, H); windowBox(58, 70, 140, 74); text('Pause', 128, 80, '#ffe9a0', 'c'); menu(['Reprendre', this.mode === 'stage' ? 'Retour à la carte' : 'Abandonner le combat', 'Son : ' + (audioState.muted ? 'non' : 'oui')], this.psel, 128, 100); this.drawAbilities(); }
    if (this.end && this.end.t > 30) {
      windowBox(24, 70, 208, this.realm.gift ? 68 : 48);
      text('Éclat de la Cloche-Soleil obtenu !', 128, 80, '#ffe9a0', 'c');
      if (this.realm.gift) { text(this.realm.giftName, 128, 98, '#ffb070', 'c'); text(this.realm.giftText, 128, 112, '#f4ecff', 'c'); }
      if ((this.t >> 4) & 1) text('Appuyez sur un bouton', 128, this.realm.gift ? 126 : 104, '#a89cc0', 'c');
    }
  }
  drawShard(it, cx, cy) {
    const img = G.assets.obj.shard[(this.t >> 3) % 4], x = it.x - cx, y = it.y - cy + Math.sin(this.t / 15) * 3;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + this.t / 40; ctx.fillStyle = 'rgba(255,220,120,0.12)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 40, a, a + 0.2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(img, Math.round(x - 12), Math.round(y - 12));
  }
  drawHUD() {
    const P = this.player, S = G.save;
    ctx.fillStyle = 'rgba(10,6,24,0.55)'; ctx.fillRect(0, 0, W, 16);
    for (let i = 0; i < S.maxHp; i++) drawHeart(4 + i * 10, 4, i < P.hp);
    const emb = G.assets.obj.ember[(this.t >> 3) % 6]; ctx.drawImage(emb, 120, 2);
    text('× ' + S.embers, 134, 6, '#ffd27a');
    const got = (S.motes[this.ri] || []).length;
    const mt = G.assets.obj.mote[0]; ctx.drawImage(mt, 180, 0, 14, 14);
    text(got + '/3', 196, 6, '#ffe9a0');
    if (S.abilities.shot && P.charge > 0) { ctx.fillStyle = '#402a10'; ctx.fillRect(226, 6, 26, 4); ctx.fillStyle = P.charge >= 40 ? (this.t % 6 < 3 ? '#fff' : '#ffb030') : '#ffb030'; ctx.fillRect(226, 6, Math.min(26, P.charge / 40 * 26), 4); }
    if (this.boss && !this.boss.dead && this.bossSongT === 0) {
      const b = this.boss;
      ctx.fillStyle = 'rgba(10,6,24,0.7)'; ctx.fillRect(28, 208, 200, 12);
      ctx.fillStyle = '#3a1020'; ctx.fillRect(30, 214, 196, 4);
      const k = b.hp / b.max; ctx.fillStyle = '#ff4a6a'; ctx.fillRect(30, 214, Math.round(196 * k), 4); ctx.fillStyle = '#ffb0c0'; ctx.fillRect(30, 214, Math.round(196 * k), 1);
      text(b.name, 128, 207, '#f4ecff', 'c');
      if (this.banner > 0) { const a = Math.min(1, this.banner / 30, (180 - this.banner) / 20); ctx.globalAlpha = a; windowBox(16, 60, 224, 30); text(b.name, 128, 70, '#ffe9a0', 'c'); ctx.globalAlpha = 1; }
    }
  }
  drawAbilities() {
    const A = G.save.abilities, L = [['double', 'Double saut'], ['dash', 'Dash'], ['wall', 'Saut mural'], ['shot', 'Tir solaire']];
    windowBox(40, 152, 176, 56);
    L.forEach(([k, n], i) => text((A[k] ? '● ' : '○ ') + n, 52 + (i % 2) * 86, 162 + (i >> 1) * 14, A[k] ? '#ffe9a0' : '#6a5a8a'));
    text('Temps ' + fmtTime(G.save.time) + '  Motes ' + moteCount() + '/15', 128, 192, '#c8b8e0', 'c');
  }
}
function drawHeart(x, y, full) {
  const shape = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  shape.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '#') { ctx.fillStyle = full ? (j < 2 && i < 3 ? '#ffb0c0' : '#ff3a5a') : '#3a2040'; ctx.fillRect(x + i, y + j, 1, 1); } });
  ctx.fillStyle = '#140c1c';
}
export const fmtTime = s => { s = Math.floor(s); return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

// ------------------------------------------------------------------ game over
export class GameOver {
  constructor(ri, mode, cp) { this.ri = ri; this.mode = mode; this.cp = cp; this.t = 0; this.sel = 0; resetRegs(); }
  update() {
    this.t++; if (this.t < 40) return;
    this.sel = menuNav(this.sel, 2);
    if (ok()) { sfx('select'); if (this.sel === 0) go(() => new PlayScene(this.ri, this.mode, this.mode === 'stage' ? this.cp : null)); else go(() => new MapScene()); }
  }
  draw() {
    gradient(0, H, [[0, 10, 4, 16], [1, 40, 10, 30]], 2);
    const lg = bigText('LA LANTERNE VACILLE', 1, '#ff9aa0', '#a03050'); ctx.drawImage(lg, Math.round(128 - lg.width / 2), 70);
    text("Mais elle ne s'éteint pas.", 128, 92, '#c8b8e0', 'c');
    if (this.t >= 40) { windowBox(58, 120, 140, 40); menu([this.mode === 'stage' && this.cp ? 'Reprendre à la cloche' : 'Réessayer', 'Retour à la carte'], this.sel, 128, 130); }
  }
}

// ------------------------------------------------------------------ ending
export class Ending {
  constructor() { this.t = 0; playSong(SONGS.ending); resetRegs(); this.lines = [
    'SUNKEEPER', '', 'Un jeu d’action-plateforme', 'dans l’esprit des 16 bits', '', '— Les gardiens —',
    'Dos-d’Épines', 'Vesper', 'le Colosse de Verre', 'Horloge', 'le Roi de l’Éclipse', '',
    '— Programmation, graphismes, musique —', 'générés par code', '(modélisation 3D → sprites,', 'synthèse sonore façon SPC700)', '',
    'Temps : ' + fmtTime(G.save.time), 'Braises : ' + G.save.embers, 'Motes solaires : ' + moteCount() + ' / 15', 'Chutes : ' + G.save.deaths, '',
    moteCount() >= 15 ? 'Toutes les motes ! Le soleil vous sourit.' : 'Il reste des motes à trouver…', '', '', 'Merci d’avoir joué !'] }
  update() { this.t++; if (this.t > 400 && ok()) go(() => new Title()); }
  draw() {
    const k = Math.min(1, this.t / 600);
    gradient(0, H, [[0, 40 + k * 60, 60 + k * 100, 120 + k * 80], [0.6, 220, 150 + k * 40, 120], [1, 255, 220, 160]], 2);
    const sy = 180 - k * 90;
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 60; r > 10; r -= 8) { ctx.fillStyle = `rgba(255,${180 + r},${120 + r},0.08)`; ctx.beginPath(); ctx.arc(128, sy, r, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(128, sy, 16, 0, 7); ctx.fill();
    const y0 = 230 - this.t * 0.35;
    this.lines.forEach((l, i) => { const y = y0 + i * 14; if (y > -10 && y < H + 10) text(l, 128, Math.round(y), i === 0 ? '#ffe9a0' : '#ffffff', 'c', '#402040'); });
    const hero = G.assets.hero.R.idle[(this.t >> 4) % 4]; ctx.drawImage(hero, 112, 190);
    ctx.fillStyle = '#5a3a3a'; ctx.fillRect(0, 222, W, 2);
  }
}
