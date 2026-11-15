// Enemies, projectiles and pickups.
import { ctx } from './ppu.js';
import { sfx } from './audio.js';
import { G } from './state.js';
import { burst, shake, hitstop, text as ftext } from './fx.js';
import { T } from './stage.js';
import { clamp } from './util.js';

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const DEF = {
  mossling: { hp: 2, w: 16, h: 16, anim: 'walk', ai: 'walker', speed: 0.45, ember: 2 },
  sporebat: { hp: 1, w: 14, h: 12, anim: 'fly', ai: 'flyer', ember: 2, fly: true },
  bramble: { hp: 3, w: 14, h: 20, anim: 'idle', ai: 'shooter', ember: 3 },
  jelly: { hp: 2, w: 14, h: 16, anim: 'swim', ai: 'bobber', ember: 2, fly: true },
  crab: { hp: 3, w: 22, h: 16, anim: 'walk', ai: 'walker', speed: 0.6, shield: true, ember: 3 },
  drip: { hp: 1, w: 12, h: 12, anim: 'hang', ai: 'dropper', ember: 2 },
  skink: { hp: 2, w: 20, h: 12, anim: 'run', ai: 'leaper', speed: 1.4, ember: 3 },
  wasp: { hp: 2, w: 14, h: 14, anim: 'fly', ai: 'diver', ember: 3, fly: true },
  wraith: { hp: 3, w: 14, h: 24, anim: 'float', ai: 'teleporter', ember: 4, fly: true },
  sentry: { hp: 4, w: 18, h: 20, anim: 'aim', ai: 'turret', ember: 4 },
  hopper: { hp: 3, w: 14, h: 18, anim: 'hop', ai: 'hopper', ember: 3 },
  roller: { hp: 5, w: 18, h: 18, anim: 'roll', ai: 'roller', speed: 1.6, ember: 4 },
  knight: { hp: 6, w: 14, h: 28, anim: 'walk', ai: 'knight', speed: 0.7, ember: 6, shield: 0.5 },
  eye: { hp: 4, w: 18, h: 18, anim: 'look', ai: 'eye', ember: 5, fly: true },
  hound: { hp: 4, w: 24, h: 14, anim: 'run', ai: 'hound', speed: 0.6, ember: 5 },
};

export class Enemy {
  constructor(scene, type, x, y) {
    const D = DEF[type]; this.D = D; this.type = type; this.scene = scene;
    this.w = D.w; this.h = D.h; this.x = x - D.w / 2; this.y = y - D.h; this.vx = 0; this.vy = 0;
    this.hp = D.hp; this.face = -1; this.t = Math.random() * 100 | 0; this.flash = 0; this.dead = false;
    this.ox = this.x; this.oy = this.y; this.state = 0; this.timer = 0; this.alpha = 1; this.anim = D.anim;
    if (D.ai === 'dropper') { // cling to the nearest ceiling above
      const st = scene.stage; let ty = Math.floor(this.y / T);
      for (let k = 0; k < 9 && ty > 0; k++, ty--) if (st.solid(Math.floor((this.x + 6) / T), ty - 1)) { this.y = ty * T; this.state = 0; break; }
      if (!st.solid(Math.floor((this.x + 6) / T), ty - 1)) this.state = 2;
    }
  }
  get cx() { return this.x + this.w / 2; } get cy() { return this.y + this.h / 2; }
  update() {
    const S = this.scene, st = S.stage, P = S.player, D = this.D;
    this.t++; if (this.flash > 0) this.flash--;
    if (this.stun > 0) { this.stun--; this.vx *= 0.85; if (!D.fly) { this.vy = Math.min(this.vy + 0.4, 6); } else this.vy *= 0.85; st.move(this); return; }
    const dx = P.cx - this.cx, dy = P.cy - this.cy, dist = Math.hypot(dx, dy);
    const ground = () => { this.vy = Math.min(this.vy + 0.4, 6); st.move(this); };
    const edgeAhead = () => !st.solidPx(this.face > 0 ? this.x + this.w + 2 : this.x - 2, this.y + this.h + 4) && !'=F'.includes(st.tile(Math.floor((this.face > 0 ? this.x + this.w + 2 : this.x - 2) / T), Math.floor((this.y + this.h + 4) / T)));
    switch (D.ai) {
      case 'walker':
        this.vx = this.face * D.speed; ground();
        if (this.onGround && (this.hitWall || edgeAhead())) this.face *= -1;
        break;
      case 'flyer':
        this.x = this.ox + Math.sin(this.t / 50) * 40; this.y = this.oy + Math.sin(this.t / 13) * 10;
        this.face = Math.cos(this.t / 50) > 0 ? 1 : -1; break;
      case 'shooter':
        ground(); this.face = dx > 0 ? 1 : -1;
        if (dist < 170 && this.t % 110 === 0) { this.anim = 'shoot'; this.timer = 16; S.enemyShot(this.cx + this.face * 6, this.y + 6, clamp(dx / 50, -3, 3), -4.2, 'seed', { grav: 0.16 }); sfx('shot_e'); }
        if (this.timer > 0 && --this.timer === 0) this.anim = 'idle'; break;
      case 'bobber':
        this.y = this.oy + Math.sin(this.t / 30) * 22; this.x = this.ox + Math.sin(this.t / 70) * 8; this.face = dx > 0 ? 1 : -1; break;
      case 'dropper':
        if (this.state === 0) { if (Math.abs(dx) < 22 && dy > 0 && dy < 180) { this.state = 1; this.anim = 'fall'; sfx('shot_e'); } }
        else if (this.state === 1) { this.vy = Math.min(this.vy + 0.35, 6); st.move(this); if (this.onGround) { this.state = 2; this.anim = 'hang'; burst(this.cx, this.y + this.h, 6, { col: '#8e6', speed: 1.2 }); } }
        else { this.vx = this.face * 0.35; ground(); if (this.onGround && (this.hitWall || edgeAhead())) this.face *= -1; }
        break;
      case 'leaper':
        if (this.onGround && Math.abs(dx) < 120 && this.t % 70 === 0) { this.vy = -5; this.face = dx > 0 ? 1 : -1; this.vx = this.face * 2.2; }
        if (this.onGround) { this.vx = this.face * D.speed; if (this.hitWall || edgeAhead()) this.face *= -1; }
        ground(); break;
      case 'diver':
        if (this.state === 0) { this.x = this.ox + Math.sin(this.t / 40) * 20; this.y = this.oy + Math.sin(this.t / 15) * 6; this.face = dx > 0 ? 1 : -1;
          if (dist < 110 && this.t > 60) { this.state = 1; this.timer = 20; } }
        else if (this.state === 1) { this.x += Math.sin(this.t) * 1; if (--this.timer <= 0) { this.state = 2; const a = Math.atan2(dy, dx); this.vx = Math.cos(a) * 4; this.vy = Math.sin(a) * 4; sfx('glide'); } }
        else if (this.state === 2) { this.x += this.vx; this.y += this.vy; this.vx *= 0.985; this.vy *= 0.985; if (Math.hypot(this.vx, this.vy) < 1.2 || st.solidPx(this.cx, this.cy)) { this.state = 3; } }
        else { this.x += (this.ox - this.x) * 0.04; this.y += (this.oy - this.y) * 0.04; if (Math.hypot(this.ox - this.x, this.oy - this.y) < 4) { this.state = 0; this.t = 0; } }
        break;
      case 'teleporter':
        this.timer++;
        if (this.state === 0) { this.alpha = 1; this.y = this.oy + Math.sin(this.t / 20) * 4; this.face = dx > 0 ? 1 : -1;
          if (this.timer > 90 && dist < 180) { S.enemyShot(this.cx, this.cy, 0, 0, 'orb', { aim: 2.0, spread: [-0.3, 0, 0.3] }); sfx('shot_e'); this.state = 1; this.timer = 0; } }
        else if (this.state === 1) { this.alpha = 1 - this.timer / 30; if (this.timer >= 30) { this.state = 2; this.timer = 0; this.ox = clamp(P.cx + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 40), 16, st.w * T - 16) - this.w / 2; this.oy = P.y - 30; this.x = this.ox; this.y = this.oy; } }
        else { this.alpha = this.timer / 30; if (this.timer >= 30) { this.state = 0; this.timer = 0; } }
        break;
      case 'turret': {
        ground(); const a = Math.atan2(dy, dx); this.dir = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
        if (dist < 190 && this.t % 100 === 0) { const ang = this.dir * Math.PI / 4; S.enemyShot(this.cx + Math.cos(ang) * 12, this.y + 7 + Math.sin(ang) * 12, Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, 'orb'); sfx('shot_e'); }
        break; }
      case 'hopper':
        if (this.onGround) { this.vx = 0; this.anim = 'hop'; if (this.t % 60 === 0 && dist < 170) { this.face = dx > 0 ? 1 : -1; this.vy = -6; this.vx = this.face * 1.6; } }
        ground(); break;
      case 'roller':
        this.vx = this.face * D.speed; ground(); if (this.hitWall || (this.onGround && edgeAhead())) this.face *= -1;
        if (this.t % 6 === 0) burst(this.cx, this.y + this.h, 1, { col: '#fc6', speed: 1, angle: -Math.PI / 2 - this.face, spread: 0.6, life: 10, glow: true });
        break;
      case 'knight':
        if (this.state === 0) { this.face = dx > 0 ? 1 : -1; this.vx = Math.abs(dx) > 30 ? this.face * D.speed : 0; this.anim = 'walk'; if (Math.abs(dx) < 50 && Math.abs(dy) < 30 && this.t % 50 === 0) { this.state = 1; this.timer = 18; this.vx = 0; } }
        else if (this.state === 1) { if (--this.timer <= 0) { this.state = 2; this.timer = 20; this.vx = this.face * 3.2; this.anim = 'lunge'; sfx('slash'); } }
        else { this.vx *= 0.9; if (--this.timer <= 0) this.state = 0; }
        ground(); if (this.onGround && edgeAhead()) this.vx = 0;
        break;
      case 'eye':
        this.x = this.ox + Math.sin(this.t / 60) * 30; this.y = this.oy + Math.cos(this.t / 45) * 14;
        if (dist < 200 && this.t % 120 === 0) { S.enemyShot(this.cx, this.cy, 0, 0, 'orb', { aim: 1.6, homing: 0.06, life: 200 }); sfx('laser'); }
        break;
      case 'hound':
        if (this.state === 0) { this.vx = 0; this.face = dx > 0 ? 1 : -1; if (Math.abs(dy) < 24 && Math.abs(dx) < 150 && this.t % 30 === 0) { this.state = 1; this.timer = 12; sfx('roar'); } }
        else if (this.state === 1) { if (--this.timer <= 0) { this.state = 2; this.timer = 50; } }
        else { this.vx = this.face * 3.4; if (this.hitWall || edgeAhead() || --this.timer <= 0) { this.state = 0; this.vx = 0; this.t = 1; } if (this.t % 3 === 0) burst(this.cx - this.face * 10, this.y + this.h, 1, { col: '#a7f', speed: 0.6, life: 14 }); }
        ground(); break;
    }
    if (this.y > st.h * T + 40) this.dead = true;
    // contact damage
    if (this.alpha > 0.5 && overlap(this, P) && !P.dead) {
      if (P.atk === 'down' && P.vy > 0 && P.bottom < this.cy) { /* pogo handled by attack */ }
      else if (P.hurt(1, this.cx)) { /* */ }
    }
  }
  // returns 'hit' | 'block' | null
  damage(n, src, kind) {
    if (this.alpha < 0.5) return null;
    const D = this.D;
    if (D.shield && kind !== 'down' && kind !== 'big' && kind !== 'up') {
      const fromFront = (src.cx - this.cx) * this.face > 0;
      if (fromFront && (D.shield === true || Math.random() < D.shield)) { sfx('clang'); this.vx = -this.face * 1.5; burst(this.cx + this.face * 8, this.cy, 5, { col: ['#fff', '#ffa'], speed: 2, life: 12 }); this.flash = 2; return 'block'; }
    }
    this.hp -= n; this.flash = 8; sfx('hit'); hitstop(3);
    burst(this.cx, this.cy, 6, { col: ['#fff', '#ffd27a'], speed: 2.2, life: 14 });
    if (!D.fly && D.ai !== 'turret') { this.vx = (this.cx < src.cx ? -1 : 1) * 2.2; this.vy = -2; this.stun = 10; }
    if (this.hp <= 0) this.kill();
    return 'hit';
  }
  kill() {
    this.dead = true; sfx('kill'); shake(2);
    burst(this.cx, this.cy, 16, { col: ['#fff', '#ffcf6a', '#ff7a3a', '#6a4a8a'], speed: 3, life: 30, up: 1 });
    this.scene.dropEmbers(this.cx, this.cy, this.D.ember);
  }
  draw(cx, cy) {
    const A = this.type === 'roller' ? null : G.assets.creatures.enemy[this.type];
    let img;
    if (!A) { const f = G.assets.obj.gearBlade; img = f[Math.floor(this.t / 3 * (this.face > 0 ? 1 : -1) % 4 + 4) % 4]; }
    else {
      const set = this.flash > 0 ? A.W : this.face > 0 ? A.R : A.L;
      let frames = set[this.anim] || set[this.D.anim];
      let i;
      if (this.type === 'sentry') i = this.dir || 0, frames = (this.flash > 0 ? A.W : A.R).aim;
      else if (this.type === 'hopper') i = !this.onGround ? 2 : this.t % 60 > 48 ? 1 : 0;
      else i = Math.floor(this.t / 8) % frames.length;
      img = frames[Math.min(i, frames.length - 1)];
    }
    const dx = Math.round(this.cx - img.width / 2 - cx), dy = Math.round(this.y + this.h - img.height + 1 - cy);
    if (this.alpha < 1) ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.drawImage(img, dx, this.D.fly ? Math.round(this.cy - img.height / 2 - cy) : dy);
    ctx.globalAlpha = 1;
    if (this.type === 'knight' && this.state === 1) { ctx.fillStyle = '#ff6ab0'; ctx.fillRect(Math.round(this.cx - cx) - 1, Math.round(this.y - cy) - 8, 2, 4); }
  }
}

// ------------------------------------------------------------------ projectiles
export class Shot {
  constructor(x, y, vx, vy, kind, o = {}) {
    Object.assign(this, { x, y, vx, vy, kind, r: o.r ?? 4, grav: o.grav || 0, life: o.life ?? 240, homing: o.homing || 0, dmg: o.dmg ?? 1, friendly: !!o.friendly, pierce: !!o.pierce, t: 0, dead: false, breakable: o.breakable ?? true });
  }
  update(S) {
    this.t++; this.vy += this.grav;
    if (this.homing) { const P = S.player, a = Math.atan2(P.cy - this.y, P.cx - this.x), sp = Math.hypot(this.vx, this.vy); const cur = Math.atan2(this.vy, this.vx); let d = a - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const n = cur + clamp(d, -this.homing, this.homing); this.vx = Math.cos(n) * sp; this.vy = Math.sin(n) * sp; }
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
    if (this.kind !== 'wave' && this.kind !== 'laser' && S.stage.solidPx(this.x, this.y) && this.t > 2) { this.dead = true; burst(this.x, this.y, 4, { col: '#fda', speed: 1.2, life: 12 }); }
  }
  get box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  draw(cx, cy) {
    const O = G.assets.obj; let img;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    switch (this.kind) {
      case 'seed': img = O.seed; break;
      case 'orb': img = O.orb[(this.t >> 2) & 1]; break;
      case 'bubble': img = O.bubble[(this.t >> 3) & 1]; break;
      case 'sun': img = O.sunshot[(this.t >> 1) % 3]; break;
      case 'big': img = O.bigshot[(this.t >> 1) & 1]; break;
      case 'gear': img = O.gearBlade[(this.t >> 1) & 3]; break;
      case 'wave': ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,200,0.8)'; ctx.fillRect(x - 3, y - 14, 6, 28); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x - 1, y - 12, 2, 24); ctx.globalCompositeOperation = 'source-over'; return;
      default: ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, 4, 4); return;
    }
    if (this.vx < 0 && (this.kind === 'sun')) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore(); }
    else ctx.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
  }
}

// ------------------------------------------------------------------ pickups
export class Item {
  constructor(kind, x, y, o = {}) { Object.assign(this, { kind, x, y, vx: o.vx || 0, vy: o.vy || 0, phys: !!o.phys, t: o.t || 0, id: o.id, dead: false, life: o.life || 0, w: 8, h: 8 }); }
  update(S) {
    this.t++;
    const P = S.player;
    if (this.phys) {
      this.vy = Math.min(this.vy + 0.25, 4); this.x += this.vx; this.vx *= 0.97;
      this.y += this.vy; if (S.stage.solidPx(this.x, this.y + 4) || '=F'.includes(S.stage.tile(Math.floor(this.x / T), Math.floor((this.y + 4) / T)))) { this.y = Math.floor((this.y + 4) / T) * T - 4; this.vy *= -0.45; }
      const d = Math.hypot(P.cx - this.x, P.cy - this.y);
      if (this.t > 30 && d < 48) { this.x += (P.cx - this.x) * 0.2; this.y += (P.cy - this.y) * 0.2; }
      if (this.life && this.t > this.life) this.dead = true;
    }
    if (Math.abs(P.cx - this.x) < 11 && Math.abs(P.cy - this.y) < 15 && (!this.phys || this.t > 12)) S.collect(this);
  }
  draw(cx, cy) {
    const O = G.assets.obj;
    const bob = this.phys ? 0 : Math.round(Math.sin(this.t / 15) * 2);
    let img;
    if (this.kind === 'ember') img = O.ember[(this.t >> 3) % 6];
    else if (this.kind === 'mote') img = O.mote[(this.t >> 3) % 4];
    else img = O.heart[(this.t >> 4) & 1];
    if (this.life && this.t > this.life - 60 && (this.t >> 2) & 1) return;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy + bob);
    if (this.kind !== 'ember') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = this.kind === 'mote' ? 'rgba(255,200,80,0.18)' : 'rgba(255,60,90,0.16)'; ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(this.t / 10) * 2, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
  }
}
