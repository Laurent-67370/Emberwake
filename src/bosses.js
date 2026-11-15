// The five wardens. Each boss exposes: update(), draw(cx,cy), hurtboxes()
// -> [{x,y,w,h,weak?}], damage(n, src, kind), plus hp/max/name for the HUD.
import { ctx, W, H, affine, regs } from './ppu.js';
import { sfx } from './audio.js';
import { G } from './state.js';
import { burst, shake, hitstop, flash } from './fx.js';
import { overlap } from './actors.js';
import { rumble } from './input.js';
import { clamp } from './util.js';

const TAU = Math.PI * 2;
class Boss {
  constructor(scene, name, hp) { this.scene = scene; this.name = name; this.hp = this.max = hp; this.t = 0; this.flash = 0; this.dead = false; this.dying = 0; this.phase = 0; this.state = 'intro'; this.st = 0; }
  get P() { return this.scene.player; }
  go(s) { this.state = s; this.st = 0; }
  baseDamage(n) {
    this.hp -= n; this.flash = 6; sfx('bosshit'); hitstop(4); shake(2);
    if (this.hp <= 0 && !this.dying) { this.hp = 0; this.dying = 1; rumble(400); this.scene.onBossDefeated(this); }
    return 'hit';
  }
  touch(box, dmg = 1) { if (overlap(box, this.P)) this.P.hurt(dmg, box.x + box.w / 2); }
  dieAnim(cx, cy, r = 30) {
    this.dying++;
    if (this.dying % 6 === 0) { sfx('boom'); burst(cx + (Math.random() - 0.5) * r * 2, cy + (Math.random() - 0.5) * r * 2, 14, { col: ['#fff', '#ffd27a', '#ff7a3a'], speed: 3, life: 30, glow: true }); shake(4); }
    if (this.dying > 150) this.dead = true;
  }
  sprite(set, name, i = 0, white = false) { const A = G.assets.creatures.boss[this.key]; return (white ? A.W : set > 0 ? A.R : A.L)[name][i]; }
}

// ------------------------------------------------------------------ 1. Thornback
class Thornback extends Boss {
  constructor(s) { super(s, 'Dos-d’Épines, le Sanglier-Scarabée', 26); this.key = 'thornback'; this.x = 190; this.y = 208; this.face = -1; this.vx = 0; this.vy = 0; this.anim = 'walk'; }
  update() {
    this.t++; this.st++; if (this.flash > 0) this.flash--;
    if (this.dying) { this.anim = 'stun'; return this.dieAnim(this.x, this.y - 28); }
    const P = this.P, enr = this.hp < this.max / 2;
    switch (this.state) {
      case 'intro': if (this.st === 1) sfx('roar'); if (this.st > 70) this.go('walk'); break;
      case 'walk':
        this.anim = 'walk'; this.face = P.cx > this.x ? 1 : -1; this.vx = this.face * 0.8;
        if (this.st > 70) this.go(['charge', 'seeds', 'leap'][(this.t / 71 | 0) % 3]); break;
      case 'charge':
        this.anim = 'charge';
        if (this.st < 30) { this.vx = 0; if (this.st % 6 === 0) burst(this.x - this.face * 30, this.y, 2, { col: '#a87', speed: 1, angle: -Math.PI / 2, spread: 1.5 }); }
        else { this.vx = this.face * (enr ? 5 : 4.2); if (this.st % 4 === 0) shake(1.5); }
        if (this.st > 30 && (this.x < 46 || this.x > 210)) { this.x = clamp(this.x, 46, 210); this.vx = 0; sfx('boom'); shake(8); this.go('stun');
          for (let i = 0; i < (enr ? 5 : 3); i++) this.scene.enemyShot(30 + Math.random() * 196, 20, 0, 1, 'seed', { grav: 0.12 }); }
        break;
      case 'stun': this.anim = 'stun'; this.vx = 0; if (this.st > 90) this.go('walk'); break;
      case 'seeds':
        this.anim = 'walk'; this.vx = 0;
        if (this.st % 24 === 12 && this.st < 80) { sfx('shot_e'); for (let k = -1; k <= 1; k++) this.scene.enemyShot(this.x + this.face * 30, this.y - 40, this.face * (1.5 + k * 0.9) + (P.cx - this.x) / 120, -5 - Math.random(), 'seed', { grav: 0.18 }); }
        if (this.st > 100) this.go('walk'); break;
      case 'leap':
        this.anim = 'jump';
        if (this.st === 1) { this.vy = -8; this.vx = (P.cx - this.x) / 45; sfx('roar'); }
        this.vy += 0.36;
        if (this.y >= 208 && this.st > 5) { this.y = 208; this.vy = 0; this.vx = 0; sfx('quake'); shake(10);
          this.scene.enemyShot(this.x - 20, 200, -3, 0, 'wave', { r: 6, life: 80 }); this.scene.enemyShot(this.x + 20, 200, 3, 0, 'wave', { r: 6, life: 80 }); this.go('stun'); this.st = 50; }
        break;
    }
    this.x = clamp(this.x + this.vx, 40, 216); this.y = Math.min(208, this.y + this.vy);
    for (const b of this.boxes()) this.touch(b);
  }
  boxes() { return [{ x: this.x - 32, y: this.y - 44, w: 64, h: 40 }]; }
  hurtboxes() { return [{ x: this.x - 34, y: this.y - 50, w: 68, h: 48, weak: this.state === 'stun' }]; }
  damage(n, src, kind) {
    // the carapace turns blades unless the beast is stunned or struck from above / behind
    const behind = (src.cx - this.x) * this.face < -10;
    if (this.state !== 'stun' && kind !== 'down' && !behind && kind !== 'big') { sfx('clang'); burst(src.cx, src.cy, 5, { col: '#ffa', speed: 2 }); return 'block'; }
    return this.baseDamage(this.state === 'stun' ? n * 2 : n);
  }
  draw(cx, cy) {
    const A = G.assets.creatures.boss.thornback, frames = (this.flash > 0 ? A.W : this.face > 0 ? A.R : A.L)[this.anim];
    const i = this.anim === 'walk' ? (this.t >> 3) % 4 : this.anim === 'charge' ? (this.t >> 2) % 2 : 0;
    let img = frames[i]; if (this.flash > 0) img = A.W[this.anim][i + (this.face > 0 ? 0 : frames.length)] || img;
    const sx = this.anim === 'stun' ? Math.sin(this.t) * 1.5 : 0;
    ctx.drawImage(img, Math.round(this.x - 38 + sx - cx), Math.round(this.y - 57 - cy));
    if (this.state === 'stun' && !this.dying) for (let k = 0; k < 3; k++) { const a = this.t / 10 + k * 2.1; ctx.fillStyle = '#ffe070'; ctx.fillRect(Math.round(this.x + this.face * 22 + Math.cos(a) * 10 - cx), Math.round(this.y - 52 + Math.sin(a) * 3 - cy), 2, 2); }
  }
}

// ------------------------------------------------------------------ 2. Vesper (serpent)
class Vesper extends Boss {
  constructor(s) { super(s, 'Vesper, l’Anguille des Cloches', 30); this.key = 'vesper'; this.hx = 200; this.hy = 230; this.trail = []; this.face = -1; this.mouth = 0; for (let i = 0; i < 60; i++) this.trail.push({ x: 200, y: 260 }); }
  update() {
    this.t++; this.st++; if (this.flash > 0) this.flash--;
    if (this.dying) { this.hy += 0.4; this.pushTrail(); return this.dieAnim(this.hx, this.hy); }
    const P = this.P, enr = this.hp < this.max / 2;
    switch (this.state) {
      case 'intro': this.hy = 230 - Math.min(80, this.st); if (this.st === 40) sfx('roar'); if (this.st > 90) this.go('rise'); break;
      case 'rise': { // surface at one side, spit bubbles
        if (this.st === 1) { this.side = Math.random() < 0.5 ? 1 : -1; this.tx = this.side > 0 ? 210 : 46; this.face = -this.side; }
        this.hx += (this.tx - this.hx) * 0.05; this.hy += ((this.st < 120 ? 120 : 260) - this.hy) * 0.06;
        this.mouth = this.st % 40 > 28 ? 1 : 0;
        if (this.st % 40 === 30 && this.st < 120) { sfx('splash'); const a = Math.atan2(P.cy - this.hy, P.cx - this.hx); for (let k = enr ? -2 : -1; k <= (enr ? 2 : 1); k++) this.scene.enemyShot(this.hx + this.face * 18, this.hy + 4, Math.cos(a + k * 0.25) * 2, Math.sin(a + k * 0.25) * 2, 'bubble', { r: 5, life: 160 }); }
        if (this.st > 150) this.go('lunge'); break; }
      case 'lunge': { // leaps across the arena in an arc
        if (this.st === 1) { this.from = this.hx < 128 ? 30 : 226; this.to = 256 - this.from; this.face = this.to > this.from ? 1 : -1; sfx('roar'); }
        const k = clamp((this.st - 30) / 70, 0, 1);
        if (this.st < 30) { this.hx += (this.from - this.hx) * 0.1; this.hy += (250 - this.hy) * 0.1; if (this.st % 5 === 0) burst(this.from, 160, 3, { col: '#aef', speed: 2, angle: -Math.PI / 2, spread: 0.8 }); }
        else { this.hx = this.from + (this.to - this.from) * k; this.hy = 250 - Math.sin(k * Math.PI) * (enr ? 190 : 165); this.mouth = 1; if (this.st === 30) sfx('splash'); }
        if (this.st > 110) this.go(enr && Math.random() < 0.5 ? 'lunge' : 'rise'); break; }
    }
    this.pushTrail();
    for (const b of this.boxes()) this.touch(b);
  }
  pushTrail() { this.trail.unshift({ x: this.hx, y: this.hy }); this.trail.length = 60; }
  boxes() { const b = [{ x: this.hx - 16, y: this.hy - 12, w: 32, h: 24 }]; for (let i = 6; i < 60; i += 6) { const p = this.trail[i]; if (p.y < 170) b.push({ x: p.x - 7, y: p.y - 7, w: 14, h: 14 }); } return b; }
  hurtboxes() { return [{ x: this.hx - 20, y: this.hy - 16, w: 40, h: 32, weak: true }]; }
  damage(n) { return this.baseDamage(n); }
  draw(cx, cy) {
    const A = G.assets.creatures.boss.vesper, white = this.flash > 0;
    for (let i = 57; i >= 6; i -= 6) { const p = this.trail[i]; if (p.y > 250) continue; const img = i === 57 ? A.R.tail[0] : (white ? A.W : A.R).seg[0]; ctx.drawImage(img, Math.round(p.x - 10 - cx), Math.round(p.y - 10 - cy)); }
    const nx = this.trail[3].x - this.hx;
    const f = nx > 0.3 ? -1 : nx < -0.3 ? 1 : this.face; this.face = f;
    const img = (white ? A.W.head[this.mouth + (f > 0 ? 0 : 2)] : (f > 0 ? A.R : A.L).head[this.mouth]);
    ctx.drawImage(img, Math.round(this.hx - 24 - cx), Math.round(this.hy - 18 - cy));
  }
}

// ------------------------------------------------------------------ 3. Glass Colossus
class Colossus extends Boss {
  constructor(s) { super(s, 'Le Colosse de Verre', 32); this.key = 'colossus'; this.hx = 128; this.hy = -60; this.hands = [{ x: 40, y: 150, side: -1, hp: 6, st: 'idle', t: 0, fist: 0 }, { x: 216, y: 150, side: 1, hp: 6, st: 'idle', t: 0, fist: 0 }]; this.glow = 0; this.laser = null; this.exposed = 0; }
  update() {
    this.t++; this.st++; if (this.flash > 0) this.flash--;
    if (this.dying) { this.hy += 0.3; return this.dieAnim(this.hx, this.hy); }
    const P = this.P, enr = this.hp < this.max / 2;
    this.hy += ((this.exposed > 0 ? 120 : 64) + Math.sin(this.t / 40) * 6 - this.hy) * 0.04;
    this.hx += (128 + Math.sin(this.t / 90) * 40 - this.hx) * 0.03;
    if (this.exposed > 0) this.exposed--;
    if (this.state === 'intro') { if (this.st === 30) sfx('roar'); if (this.st > 100) this.go('fight'); return; }
    for (const h of this.hands) {
      h.t++;
      if (h.hp <= 0) { if (h.st !== 'down') { h.st = 'down'; h.t = 0; } h.y += (230 - h.y) * 0.05; if (h.t > 300) { h.hp = 6; h.st = 'idle'; h.t = 0; } continue; }
      switch (h.st) {
        case 'idle': h.fist = 0; h.x += (this.hx + h.side * 80 - h.x) * 0.05; h.y += (130 + Math.sin(this.t / 30 + h.side) * 8 - h.y) * 0.05;
          if (h.t > (enr ? 70 : 110) + (h.side > 0 ? 40 : 0)) { h.st = 'aim'; h.t = 0; } break;
        case 'aim': h.fist = 1; h.x += (P.cx - h.x) * 0.08; h.y += (60 - h.y) * 0.08; if (h.t > 40) { h.st = 'slam'; h.t = 0; } break;
        case 'slam': h.y += 7; if (h.y >= 192) { h.y = 192; h.st = 'rest'; h.t = 0; sfx('boom'); shake(8); for (const d of [-1, 1]) this.scene.enemyShot(h.x + d * 14, 200, d * 2.6, 0, 'wave', { r: 6, life: 70 }); } break;
        case 'rest': if (h.t > 60) { h.st = 'idle'; h.t = 0; } break;
      }
      this.touch({ x: h.x - 15, y: h.y - 12, w: 30, h: 26 });
    }
    // laser sweep from the eyes when both hands are busy or in phase 2
    if (!this.laser && this.t % (enr ? 260 : 380) === 200) { this.laser = { t: 0, dir: P.cx > this.hx ? -1 : 1 }; sfx('laser'); }
    if (this.laser) {
      const L = this.laser; L.t++; this.glow = 1;
      if (L.t > 40 && L.t < 140) {
        const a = Math.PI / 2 + L.dir * (1.1 - (L.t - 40) / 100 * 2.2);
        L.a = a; const ex = this.hx, ey = this.hy + 2;
        for (let r = 0; r < 300; r += 6) { const px = ex + Math.cos(a) * r, py = ey + Math.sin(a) * r; if (py > 208) { if (L.t % 3 === 0) burst(px, 208, 1, { col: '#ff8', speed: 2, angle: -Math.PI / 2, spread: 1, glow: true }); break; } if (Math.abs(px - P.cx) < 8 && Math.abs(py - P.cy) < 12) P.hurt(1, px); }
      }
      if (L.t > 150) { this.laser = null; this.glow = 0; }
    }
    this.touch({ x: this.hx - 22, y: this.hy - 26, w: 44, h: 50 });
  }
  hurtboxes() { return [{ x: this.hx - 26, y: this.hy - 30, w: 52, h: 60, weak: this.exposed > 0, head: true }, ...this.hands.filter(h => h.hp > 0).map(h => ({ x: h.x - 16, y: h.y - 14, w: 32, h: 28, hand: h }))]; }
  damage(n, src, kind, box) {
    if (box && box.hand) { const h = box.hand; h.hp -= n; this.flash = 4; h.flash = 6; sfx('bosshit'); hitstop(3); burst(h.x, h.y, 6, { col: ['#bef', '#fff'], speed: 2 });
      if (h.hp <= 0) { sfx('break'); shake(6); burst(h.x, h.y, 20, { col: ['#bef', '#fff', '#ec9'], speed: 3, life: 30 }); if (this.hands.every(q => q.hp <= 0)) this.exposed = 360; } return 'hit'; }
    if (this.exposed <= 0 && kind !== 'big') { sfx('clang'); burst(src.cx, src.cy, 4, { col: '#bef', speed: 2 }); return 'block'; }
    return this.baseDamage(this.exposed > 0 ? n * 2 : n);
  }
  draw(cx, cy) {
    const A = G.assets.creatures.boss.colossus;
    if (this.laser && this.laser.a !== undefined && this.laser.t > 40 && this.laser.t < 140) {
      const a = this.laser.a, ex = this.hx - cx, ey = this.hy + 2 - cy;
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, c] of [[9, 'rgba(255,80,60,0.35)'], [5, 'rgba(255,200,120,0.6)'], [2, 'rgba(255,255,230,1)']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * 320, ey + Math.sin(a) * 320); ctx.stroke(); }
      ctx.lineWidth = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const head = this.flash > 0 ? A.W.head[this.glow] : A.R.head[this.glow || (this.exposed > 0 && this.t % 20 < 10 ? 1 : 0)];
    const sc = 1 + Math.sin(this.t / 25) * 0.02;
    affine(head, this.hx - cx, this.hy - cy, Math.sin(this.t / 60) * 0.06, sc);
    for (const h of this.hands) {
      const img = (h.flash > 0 ? A.W : h.side > 0 ? A.L : A.R).hand[h.fist];
      if (h.flash > 0) h.flash--;
      ctx.globalAlpha = h.hp <= 0 ? 0.4 : 1;
      affine(img, h.x - cx, h.y - cy, h.st === 'slam' ? 0 : Math.sin(this.t / 20 + h.side) * 0.15, 1);
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ 4. Horologe (clock)
class Horologe extends Boss {
  constructor(s) { super(s, 'Horloge, le Cœur des Rouages', 34); this.key = 'horologe'; this.x = 128; this.y = 88; this.ah = 0; this.am = Math.PI; this.spin = 0.012; this.open = 0; }
  update() {
    this.t++; this.st++; if (this.flash > 0) this.flash--;
    if (this.dying) { this.spin *= 0.97; this.ah += this.spin; this.am += this.spin * 3; return this.dieAnim(this.x, this.y, 40); }
    const P = this.P, enr = this.hp < this.max / 2;
    if (this.state === 'intro') { this.am += 0.08; this.ah += 0.01; if (this.st === 1) sfx('bell'); if (this.st > 90) this.go('fight'); return; }
    // the hands sweep the room; every 'hour' the core opens and the gears fly
    const sp = enr ? 1.5 : 1;
    this.ah += 0.006 * sp; this.am += 0.022 * sp * (this.state === 'reverse' ? -1.6 : 1);
    if (this.t % 400 === 0) { this.go('reverse'); sfx('bell'); }
    if (this.state === 'reverse' && this.st > 120) this.go('fight');
    this.open = (this.t % 300) > 200 ? 1 : 0;
    if (this.t % 300 === 201) sfx('door');
    if (this.t % (enr ? 90 : 140) === 0) { sfx('shot_e'); for (let k = 0; k < (enr ? 3 : 2); k++) { const a = Math.random() * Math.PI; this.scene.enemyShot(this.x + Math.cos(a) * 40, this.y + Math.sin(a) * 40, Math.cos(a) * 1.6, Math.sin(a) * 1.6 + 0.5, 'gear', { r: 8, grav: 0.05, life: 260, breakable: false }); } }
    // hand hitboxes: sample points along both hands
    for (const [a, len] of [[this.ah, 52], [this.am, 70]]) for (let r = 18; r <= len; r += 8) {
      const px = this.x + Math.cos(a) * r, py = this.y + Math.sin(a) * r;
      if (Math.abs(px - P.cx) < 7 && Math.abs(py - P.cy) < 12) P.hurt(1, px);
    }
  }
  hurtboxes() { return [{ x: this.x - 12, y: this.y - 12, w: 24, h: 24, weak: this.open }]; }
  damage(n, src, kind) { if (!this.open && kind !== 'big') { sfx('clang'); burst(src.cx, src.cy, 4, { col: '#fd8', speed: 2 }); return 'block'; } return this.baseDamage(n); }
  draw(cx, cy) {
    const A = G.assets.creatures.boss.horologe, x = this.x - cx, y = this.y - cy;
    affine(A.R.face[0], x, y, Math.sin(this.t / 80) * 0.05, 1);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,160,60,${0.1 + this.open * 0.2})`; ctx.beginPath(); ctx.arc(x, y, 20 + this.open * 6, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    const hand = (img, a) => { ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(a); ctx.drawImage(img, -4, -6); ctx.restore(); };
    hand(A.R.hour[0], this.ah); hand(A.R.minute[0], this.am);
    const core = this.flash > 0 ? A.W.core[0] : A.R.core[this.open];
    ctx.drawImage(core, Math.round(x - 10), Math.round(y - 10));
  }
}

// ------------------------------------------------------------------ 5. The Eclipse King
class Eclipse extends Boss {
  constructor(s) { super(s, 'Le Roi de l’Éclipse', 36); this.key = 'eclipse'; this.x = 190; this.y = 120; this.face = -1; this.pose = 0; this.alpha = 1; this.fists = []; this.p2 = false; this.ring = 0; }
  update() {
    this.t++; this.st++; if (this.flash > 0) this.flash--;
    const P = this.P;
    if (this.dying) { if (!this.p2) { this.startPhase2(); return; } this.ring += 0.02; return this.dieAnim(128, 80, 50); }
    if (this.state === 'intro') { this.alpha = Math.min(1, this.st / 60); if (this.st === 30) sfx('roar'); if (this.st > 100) this.go('float'); return; }
    if (!this.p2) {
      this.face = P.cx > this.x ? 1 : -1;
      switch (this.state) {
        case 'float': this.pose = 0; this.y = 110 + Math.sin(this.t / 25) * 10; if (this.st > 70) this.go(['wave', 'tele', 'rain'][(this.t / 71 | 0) % 3]); break;
        case 'wave': this.pose = this.st < 20 ? 1 : 2; if (this.st === 20 || this.st === 50) { sfx('slash3'); this.scene.enemyShot(this.x, 196, this.face * 3.2, 0, 'wave', { r: 7, life: 100 }); if (this.hp < this.max / 2) this.scene.enemyShot(this.x, 150, this.face * 3.2, 0, 'wave', { r: 7, life: 100 }); } if (this.st > 80) this.go('float'); break;
        case 'tele': this.alpha = this.st < 25 ? 1 - this.st / 25 : Math.min(1, (this.st - 25) / 25);
          if (this.st === 25) { this.x = clamp(P.cx + (P.cx < 128 ? 70 : -70), 30, 226); this.y = 100; }
          if (this.st === 55) { this.pose = 2; sfx('slash3'); const a = Math.atan2(P.cy - this.y, P.cx - this.x); for (let k = -2; k <= 2; k++) this.scene.enemyShot(this.x, this.y, Math.cos(a + k * 0.22) * 2.6, Math.sin(a + k * 0.22) * 2.6, 'orb'); }
          if (this.st > 80) { this.pose = 0; this.go('float'); } break;
        case 'rain': this.pose = 1; if (this.st % 12 === 0 && this.st < 100) this.scene.enemyShot(20 + Math.random() * 216, -6, 0, 2.2, 'orb', { life: 160 }); if (this.st > 120) this.go('float'); break;
      }
      if (this.alpha > 0.5) this.touch({ x: this.x - 12, y: this.y - 26, w: 24, h: 52 });
    } else {
      // phase 2: the eclipse itself; fists hunt you and bullet rings bloom
      this.ring += 0.012;
      this.y = 76 + Math.sin(this.t / 40) * 6; this.x = 128 + Math.sin(this.t / 70) * 30;
      if (this.t % 70 === 0) { sfx('laser'); const n = this.hp < this.max / 2 ? 14 : 10; for (let k = 0; k < n; k++) { const a = k / n * TAU + this.ring; this.scene.enemyShot(this.x + Math.cos(a) * 44, this.y + Math.sin(a) * 44, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 'orb', { life: 220 }); } }
      for (const f of this.fists) {
        f.t++;
        if (f.st === 0) { f.x += (P.cx + f.side * 50 - f.x) * 0.04; f.y += (P.cy - 60 - f.y) * 0.04; if (f.t > 90) { f.st = 1; f.t = 0; } }
        else if (f.st === 1) { if (f.t < 15) f.x += Math.sin(f.t * 3) * 2; else { f.y += 6; if (f.y > 194) { f.y = 194; f.st = 2; f.t = 0; sfx('boom'); shake(6); } } }
        else if (f.t > 40) { f.st = 0; f.t = 0; }
        this.touch({ x: f.x - 13, y: f.y - 13, w: 26, h: 26 });
      }
      this.touch({ x: this.x - 34, y: this.y - 34, w: 68, h: 68 });
    }
  }
  startPhase2() {
    this.p2 = true; this.dying = 0; this.hp = this.max = 40; this.name = 'L’Éclipse Dévorante'; this.st = 0; this.state = 'p2';
    this.fists = [{ x: 40, y: 80, side: -1, st: 0, t: 0 }, { x: 216, y: 80, side: 1, st: 0, t: 40 }];
    sfx('roar'); flash(20, '255,255,255'); shake(12); this.scene.onPhase2?.();
  }
  hurtboxes() { return this.p2 ? [{ x: this.x - 30, y: this.y - 30, w: 60, h: 60, weak: true }] : [{ x: this.x - 14, y: this.y - 28, w: 28, h: 56 }]; }
  damage(n) { if (this.alpha < 0.6) return null; return this.baseDamage(n); }
  draw(cx, cy) {
    const A = G.assets.creatures.boss.eclipse;
    if (!this.p2) {
      ctx.globalAlpha = this.alpha;
      const img = this.flash > 0 ? A.W.king[this.pose + (this.face > 0 ? 0 : 3)] : (this.face > 0 ? A.R : A.L).king[this.pose];
      ctx.drawImage(img, Math.round(this.x - 24 - cx), Math.round(this.y - 30 - cy));
      ctx.globalAlpha = 1;
    } else {
      const x = this.x - cx, y = this.y - cy;
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + this.ring * 2; ctx.fillStyle = `rgba(255,${120 + k * 8},180,0.16)`; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 70 + Math.sin(this.t / 9 + k) * 10, a, a + 0.18); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      affine(A.R.sun[0], x, y, this.ring, 1 + Math.sin(this.t / 15) * 0.02);
      if (this.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x, y, 40, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      ctx.fillStyle = '#ff5ab0'; ctx.fillRect(Math.round(x - 6 + Math.cos(this.t / 20) * 3), Math.round(y - 3), 3, 3); ctx.fillRect(Math.round(x + 4 + Math.cos(this.t / 20) * 3), Math.round(y - 3), 3, 3);
      for (const f of this.fists) { const img = (f.side > 0 ? A.L : A.R).fist[0]; ctx.drawImage(img, Math.round(f.x - 16 - cx), Math.round(f.y - 16 - cy)); }
    }
  }
}

export const BOSSES = { thornback: Thornback, vesper: Vesper, colossus: Colossus, horologe: Horologe, eclipse: Eclipse };
