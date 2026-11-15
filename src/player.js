// Ione: movement, combat and the abilities gathered from the wardens.
import { held, pressed, released, rumble } from './input.js';
import { ctx } from './ppu.js';
import { sfx } from './audio.js';
import { G } from './state.js';
import { burst, shake, hitstop, flash } from './fx.js';
import { approach, clamp } from './util.js';
import { T } from './stage.js';

const K = {
  run: 2.55, accG: 0.34, decG: 0.5, accA: 0.26, decA: 0.12,
  grav: 0.36, gravCut: 0.9, gravFall: 0.5, maxFall: 6.2,
  jump: 6.55, djump: 5.9, coyote: 6, buffer: 8,
  dashV: 5.4, dashT: 12, wallSlide: 1.3, wallJumpX: 3.1, wallJumpY: 6.2,
  swim: 2.8, waterGrav: 0.11, waterFall: 1.3, waterRun: 1.6,
  spring: 9.6,
};
// slash data: frames, active window, hitbox (relative, facing right), damage
const SL = {
  slash1: { n: 4, len: 15, a0: 3, a1: 8, box: [6, -22, 26, 22], dmg: 1, next: 'slash2' },
  slash2: { n: 4, len: 15, a0: 3, a1: 8, box: [6, -24, 26, 24], dmg: 1, next: 'slash3' },
  slash3: { n: 5, len: 22, a0: 5, a1: 11, box: [4, -28, 32, 30], dmg: 2, next: null, lunge: 2.2 },
  air: { n: 4, len: 15, a0: 2, a1: 9, box: [4, -24, 28, 26], dmg: 1 },
  up: { n: 4, len: 15, a0: 2, a1: 9, box: [-10, -46, 26, 28], dmg: 1 },
  down: { n: 1, len: 26, a0: 1, a1: 26, box: [-4, -6, 18, 20], dmg: 2, down: true },
};

export class Player {
  constructor(scene, x, y) {
    this.scene = scene; this.w = 10; this.h = 22;
    this.x = x - this.w / 2; this.y = y - this.h; this.vx = 0; this.vy = 0;
    this.face = 1; this.onGround = true; this.coyote = 0; this.buffer = 0; this.jumpHeld = false;
    this.airJumps = 0; this.dash = 0; this.dashCD = 0; this.canDash = true;
    this.atk = null; this.atkT = 0; this.combo = 0; this.comboT = 0; this.hitSet = new Set();
    this.charge = 0; this.shotCD = 0;
    this.hp = G.save.maxHp; this.inv = 0; this.hurtT = 0; this.lock = 0;
    this.anim = 'idle'; this.animT = 0; this.wall = 0; this.inWater = false;
    this.safe = { x: this.x, y: this.y }; this.dead = false; this.frozen = false;
    this.trail = [];
  }
  get cx() { return this.x + this.w / 2; } get cy() { return this.y + this.h / 2; } get bottom() { return this.y + this.h; }
  get ab() { return G.save.abilities; }

  update() {
    const st = this.scene.stage;
    if (this.dead) { this.vy += 0.3; this.y += this.vy; this.animT++; return; }
    if (this.frozen) { this.vx = 0; this.vy = Math.min(this.vy + K.grav, K.maxFall); st.move(this); this.setAnim(this.onGround ? 'idle' : 'fall'); return; }
    if (this.inv > 0) this.inv--; if (this.lock > 0) this.lock--; if (this.dashCD > 0) this.dashCD--; if (this.shotCD > 0) this.shotCD--;
    if (this.comboT > 0) this.comboT--; else this.combo = 0;
    const L = held.left && !this.lock, R = held.right && !this.lock, dir = (R ? 1 : 0) - (L ? 1 : 0);
    this.inWater = st.water(this.cx, this.cy);

    // ---- hurt stun
    if (this.hurtT > 0) {
      this.hurtT--; this.vy = Math.min(this.vy + K.grav, K.maxFall); this.vx *= 0.92; st.move(this); this.setAnim('hurt'); this.afterMove(); return;
    }
    // ---- dash
    if (pressed.dash && this.ab.dash && this.canDash && this.dashCD === 0 && !this.atk) {
      this.dash = K.dashT; this.canDash = false; this.dashCD = 20; this.vy = 0; if (dir) this.face = dir;
      this.inv = Math.max(this.inv, 8); sfx('dash'); burst(this.cx, this.cy, 8, { col: ['#fff', '#9ff'], speed: 1.5, g: 0, life: 18 });
    }
    if (this.dash > 0) {
      this.dash--; this.vx = this.face * K.dashV; this.vy = 0;
      if (G.frame % 2 === 0) this.trail.push({ x: this.x, y: this.y, f: this.frameImg(), t: 12 });
      st.move(this); if (this.hitWall) this.dash = 0;
      if (this.dash === 0) this.vx = this.face * K.run;
      this.setAnim('dash'); this.afterMove(); return;
    }
    // ---- horizontal
    const maxV = this.inWater ? K.waterRun : K.run;
    if (!this.atk || !this.onGround || this.atk === 'air' || this.atk === 'up' || this.atk === 'down' || (this.atk !== 'slash3' && dir === this.face)) {
      const cap = this.atk && this.onGround ? maxV * 0.75 : maxV; // walk forward while slashing
      if (dir) {
        const acc = this.onGround ? K.accG : K.accA;
        if (Math.sign(this.vx) !== dir && this.vx !== 0) this.vx = approach(this.vx, 0, this.onGround ? K.decG + acc : acc);
        this.vx = approach(this.vx, dir * cap, acc);
        if (!this.atk) this.face = dir;
      } else this.vx = approach(this.vx, 0, this.onGround ? K.decG : K.decA);
    } else this.vx = approach(this.vx, 0, 0.35);
    if (Math.abs(this.vx) > maxV && !this.dash) this.vx = approach(this.vx, Math.sign(this.vx) * maxV, 0.2);

    // ---- jump
    if (pressed.jump) this.buffer = K.buffer; else if (this.buffer > 0) this.buffer--;
    if (this.onGround) { this.coyote = K.coyote; this.airJumps = this.ab.double ? 1 : 0; this.canDash = true; }
    else if (this.coyote > 0) this.coyote--;
    this.wall = 0;
    if (!this.onGround && this.ab.wall && !this.inWater) {
      if (st.wallBeside(this, 1) && (R || this.wallStick > 0)) this.wall = 1; else if (st.wallBeside(this, -1) && (L || this.wallStick > 0)) this.wall = -1;
    }
    if (this.buffer > 0 && !held.down) {
      if (this.inWater && !st.water(this.cx, this.y - 6)) { this.doJump(K.jump * 0.92); sfx('splash'); burst(this.cx, this.y + 8, 8, { col: '#bff', speed: 1.5, up: 1.5 }); }
      else if (this.inWater) { this.vy = -K.swim; this.buffer = 0; sfx('splash'); burst(this.cx, this.y, 4, { col: '#bff', speed: 1, up: 1 }); }
      else if (this.coyote > 0) { this.doJump(K.jump); this.coyote = 0; }
      else if (this.wall) { this.vy = -K.wallJumpY; this.vx = -this.wall * K.wallJumpX; this.face = -this.wall; this.lock = 9; this.buffer = 0; this.jumpHeld = true; sfx('jump'); burst(this.wall > 0 ? this.x + this.w : this.x, this.y + this.h - 4, 6, { col: '#ddd', speed: 1.2 }); this.airJumps = this.ab.double ? 1 : 0; this.canDash = true; }
      else if (this.airJumps > 0) { this.airJumps--; this.doJump(K.djump, true); }
    }
    // drop through ledges with down+jump
    let drop = false;
    if (this.onGround && held.down && pressed.jump) { drop = true; this.y += 2; this.onGround = false; }
    if (!held.jump) this.jumpHeld = false;

    // ---- gravity
    if (this.inWater) { this.vy = Math.min(this.vy + K.waterGrav, K.waterFall); }
    else {
      let g = this.vy < 0 ? (this.jumpHeld ? K.grav : K.gravCut) : K.gravFall;
      if (this.atk === 'down') g = K.gravFall * 1.3;
      this.vy = Math.min(this.vy + g, this.wall && this.vy > 0 ? K.wallSlide : K.maxFall);
      if (this.wall && this.vy > 0 && G.frame % 5 === 0) burst(this.wall > 0 ? this.x + this.w : this.x, this.y + 4, 1, { col: '#ccc', speed: 0.4, g: 0.05 });
    }
    // ---- attacks
    this.updateAttack(dir);
    this.updateShot();
    // ---- move
    if (this.groundMover) { this.x += this.groundMover.dx; this.y += this.groundMover.dy; }
    const vyBefore = this.vy;
    st.move(this, { dropThrough: drop });
    if (this.landed) { if (vyBefore > 3) { sfx('land'); burst(this.cx, this.bottom, 5, { col: '#cbb', speed: 1, angle: -Math.PI / 2, spread: 2.5, life: 16 }); } this.landT = 6; if (this.atk === 'down') this.endAttack(); }
    if (this.hitCeil) this.jumpHeld = false;
    this.wallStick = this.wall ? 6 : Math.max(0, (this.wallStick || 0) - 1);
    // springs
    for (const s of st.springs) {
      if (this.vy >= 0 && this.cx > s.x && this.cx < s.x + T && this.bottom >= s.y + 6 && this.bottom <= s.y + 18) {
        this.vy = -K.spring; this.y = s.y - this.h; s.t = 12; this.jumpHeld = false; this.airJumps = this.ab.double ? 1 : 0; this.canDash = true; sfx('djump'); this.onGround = false;
      }
    }
    this.afterMove();
    // ---- animation
    if (this.atk) this.setAnim(this.atk);
    else if (this.wall && this.vy > 0) this.setAnim('wall');
    else if (this.charge > 18) this.setAnim('charge');
    else if (!this.onGround) this.setAnim(this.inWater ? (G.frame % 40 < 20 ? 'jump' : 'fall') : this.vy < 0 ? 'jump' : 'fall');
    else if (this.landT > 0) { this.landT--; this.setAnim('land'); }
    else if (Math.abs(this.vx) > 0.4) { this.setAnim('run'); if (this.animT % 16 === 0) sfx('step'); }
    else this.setAnim('idle');
  }
  doJump(v, air) {
    this.vy = -v; this.buffer = 0; this.jumpHeld = true; this.onGround = false;
    sfx(air ? 'djump' : 'jump');
    if (air) burst(this.cx, this.bottom, 10, { col: ['#fff', '#ffe0a0'], speed: 1.6, angle: Math.PI / 2, spread: 2.4, g: 0, life: 18 });
    else burst(this.cx, this.bottom, 4, { col: '#cbb', speed: 0.8, angle: -Math.PI / 2, spread: 2, life: 12 });
  }
  afterMove() {
    const st = this.scene.stage;
    if (this.onGround && !this.groundMover && !st.hazardAt(this)) {
      const l = st.solidPx(this.x, this.bottom + 2) || st.tile(Math.floor(this.x / T), Math.floor((this.bottom + 2) / T)) === '=';
      const r = st.solidPx(this.x + this.w, this.bottom + 2) || st.tile(Math.floor((this.x + this.w) / T), Math.floor((this.bottom + 2) / T)) === '=';
      if (l && r) this.safe = { x: this.x, y: this.y };
    }
    if (st.hazardAt(this)) {
      if (this.atk === 'down' && this.vy > 0) { this.pogo(); }
      else { this.hurt(1, this.cx, false, true); if (!this.dead) { this.x = this.safe.x; this.y = this.safe.y; this.vx = this.vy = 0; this.hurtT = 0; } }
    }
    if (this.y > st.h * T + 24) { // fell into the abyss
      this.hurt(1, this.cx, false, true);
      if (!this.dead) { this.x = this.safe.x; this.y = this.safe.y; this.vx = this.vy = 0; this.hurtT = 0; this.scene.stage.cam.y = this.y - 120; }
    }
    this.x = clamp(this.x, 0, st.w * T - this.w);
  }

  updateAttack(dir) {
    if (pressed.attack && (!this.atk || (this.atkT > SL[this.atk].a1 && SL[this.atk].next && this.onGround))) {
      let kind;
      if (!this.onGround && held.down && !this.inWater) kind = 'down';
      else if (held.up) kind = 'up';
      else if (!this.onGround) kind = 'air';
      else kind = this.atk && SL[this.atk].next ? SL[this.atk].next : (this.comboT > 0 && this.combo === 1 ? 'slash2' : this.comboT > 0 && this.combo === 2 ? 'slash3' : 'slash1');
      this.atk = kind; this.atkT = 0; this.hitSet.clear();
      if (kind === 'slash1') this.combo = 1; else if (kind === 'slash2') this.combo = 2; else if (kind === 'slash3') this.combo = 3;
      this.comboT = 30;
      if (SL[kind].lunge) this.vx = this.face * SL[kind].lunge;
      if (kind === 'down') this.vy = Math.max(this.vy, 2);
      sfx(kind === 'slash3' ? 'slash3' : 'slash');
    }
    if (!this.atk) return;
    const S = SL[this.atk];
    this.atkT++;
    if (this.atkT >= S.a0 && this.atkT <= S.a1) {
      const [bx, by, bw, bh] = S.box;
      const box = this.face > 0 ? { x: this.cx + bx, y: this.bottom + by, w: bw, h: bh } : { x: this.cx - bx - bw, y: this.bottom + by, w: bw, h: bh };
      if (S.down) { box.x = this.cx - 9; box.y = this.bottom - 4; box.w = 18; box.h = 16; }
      this.hitbox = box;
      const hit = this.scene.attack(box, S.dmg, this, this.hitSet, this.atk);
      if (hit) {
        if (S.down) this.pogo();
        else if (this.onGround) this.vx -= this.face * 0.8;
        else if (this.atk === 'air') this.vy = Math.min(this.vy, -1.2);
      }
      // break cracked blocks
      const st = this.scene.stage;
      for (let ty = Math.floor(box.y / T); ty <= Math.floor((box.y + box.h) / T); ty++) for (let tx = Math.floor(box.x / T); tx <= Math.floor((box.x + box.w) / T); tx++) {
        if (st.breakTile(tx, ty)) { sfx('break'); shake(3); burst(tx * T + 8, ty * T + 8, 8, { img: G.assets.obj.debris, speed: 2.5, up: 1.5, g: 0.25, life: 40 }); }
      }
    } else this.hitbox = null;
    if (this.atkT >= S.len) this.endAttack();
  }
  endAttack() { this.atk = null; this.atkT = 0; this.hitbox = null; }
  pogo() { this.vy = -5.6; this.jumpHeld = true; this.airJumps = this.ab.double ? 1 : 0; this.canDash = true; this.endAttack(); sfx('djump'); }

  updateShot() {
    if (!this.ab.shot) return;
    if (held.shoot) { this.charge++; if (this.charge === 40) { sfx('charged'); flash(2, '255,200,120'); } else if (this.charge === 12) sfx('charge');
      if (this.charge > 12 && G.frame % 3 === 0) { const a = Math.random() * 6.28; this.scene.particles(this.cx + Math.cos(a) * 14, this.cy + Math.sin(a) * 14, this.charge >= 40); }
    }
    if (released.shoot && this.shotCD === 0) {
      const big = this.charge >= 40;
      this.scene.playerShot(this.cx + this.face * 10, this.cy - 2, this.face, big);
      this.shotCD = big ? 20 : 10; sfx(big ? 'bigshot' : 'shoot'); if (big) { shake(3); this.vx -= this.face * 1.5; }
      this.charge = 0; this.setAnim('shoot'); this.shootT = 10;
    }
    if (!held.shoot) this.charge = 0;
  }

  hurt(dmg, fromX, knock = true, force = false) {
    if ((this.inv > 0 && !force) || this.dead) return false;
    if (G.debug.god) { this.inv = 30; return false; }
    this.hp -= dmg; this.inv = 80; sfx('hurt'); rumble(60); shake(5); hitstop(5); flash(3, '255,60,60');
    burst(this.cx, this.cy, 12, { col: ['#fff', '#f66', '#fa0'], speed: 2.5, life: 24 });
    this.endAttack(); this.dash = 0; this.charge = 0;
    if (knock) { this.vx = (this.cx < fromX ? -1 : 1) * 2.4; this.vy = -3.5; this.hurtT = 16; }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.vy = -5; this.animT = 0; this.scene.onPlayerDeath(); }
    return true;
  }

  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } else this.animT++; }
  frameImg(white = false) {
    const H = G.assets.hero;
    let name = this.anim, i = 0;
    if (this.shootT > 0) { this.shootT--; if (!this.atk && this.onGround && Math.abs(this.vx) < 0.4) name = 'shoot'; }
    const set = H.R[name] ? name : 'idle';
    const n = H.R[set].length;
    if (set === 'idle') i = Math.floor(this.animT / 12) % n;
    else if (set === 'run') i = Math.floor(this.animT / 4) % n;
    else if (SL[set]) i = Math.min(n - 1, Math.floor(this.atkT / (SL[set].len / n)));
    if (white) return H.W[set][i + (this.face > 0 ? 0 : n)];
    return (this.face > 0 ? H.R : H.L)[set][i];
  }
  draw(cx, cy) {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i]; t.t--; if (t.t <= 0) { this.trail.splice(i, 1); continue; }
      ctx.globalAlpha = t.t / 24; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(t.f, Math.round(t.x + this.w / 2 - 16 - cx), Math.round(t.y + this.h - 31 - cy));
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (this.inv > 0 && !this.dead && (this.inv >> 2) % 2 === 0 && this.hurtT === 0) return;
    const img = this.frameImg();
    const dx = Math.round(this.x + this.w / 2 - 16 - cx), dy = Math.round(this.y + this.h - 31 - cy);
    ctx.drawImage(img, dx, dy);
    if (this.charge > 18) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.charge >= 40 ? (G.frame % 6 < 3 ? 0.6 : 0.25) : 0.2; ctx.drawImage(this.frameImg(true), dx, dy); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (this.atk && this.hitbox && SL[this.atk]) this.drawArc(cx, cy);
    if (G.debug.showHit) { ctx.strokeStyle = '#0f0'; ctx.strokeRect(this.x - cx + .5, this.y - cy + .5, this.w, this.h); if (this.hitbox) { ctx.strokeStyle = '#f00'; ctx.strokeRect(this.hitbox.x - cx, this.hitbox.y - cy, this.hitbox.w, this.hitbox.h); } }
  }
  drawArc(cx, cy) { // sword trail: additive crescent (colour math)
    const b = this.hitbox, k = this.atkT / SL[this.atk].a1;
    const x = this.cx - cx, y = this.cy - cy - 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,236,190,${0.55 - k * 0.3})`; ctx.lineWidth = this.atk === 'slash3' ? 4 : 3;
    ctx.beginPath();
    if (this.atk === 'down') { ctx.moveTo(x - 6, y + 10); ctx.lineTo(x, y + 26); ctx.lineTo(x + 6, y + 10); }
    else if (this.atk === 'up') ctx.arc(x, y, 22, -Math.PI * 0.95, -Math.PI * 0.05);
    else { const a0 = this.atk === 'slash2' ? 0.9 : -0.9, a1 = -a0; const r = this.atk === 'slash3' ? 28 : 22; if (this.face > 0) ctx.arc(x + 2, y, r, Math.min(a0, a1) * 1.4, Math.max(a0, a1) * 1.1); else ctx.arc(x - 2, y, r, Math.PI - Math.max(a0, a1) * 1.1, Math.PI - Math.min(a0, a1) * 1.4); }
    ctx.stroke(); ctx.lineWidth = 1; ctx.globalCompositeOperation = 'source-over';
  }
}
