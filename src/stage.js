// Stage runtime: tile collision, movers, breakables, items, camera and the
// layered drawing (parallax BGs, painted terrain, water, foreground).
import { ctx, W, H, regs, gradient, affine } from './ppu.js';
import { paintTerrain, buildTiles, buildBackground } from './art/world.js';
import { G } from './state.js';
import { clamp } from './util.js';

export const T = 16;
const SOLID = new Set(['#', 'B']);

export class Stage {
  constructor(def, realm, opts = {}) {
    this.realm = realm; this.w = def.w ?? def.grid[0].length; this.h = def.h ?? def.grid.length;
    this.grid = def.grid.map(r => r.split(''));
    this.arena = opts.arena || null;
    this.terrain = paintTerrain({ w: this.w, h: this.h, grid: def.grid }, realm);
    this.tctx = this.terrain.getContext('2d');
    this.tiles = G.assets.tiles[realm.id] ||= buildTiles(realm);
    this.bg = G.assets.bgs[realm.id] ||= buildBackground(realm);
    this.movers = (def.movers || []).map(m => ({ x0: m.x * T, y0: m.y * T, x: m.x * T, y: m.y * T, w: m.w * T, h: 8, range: m.range, speed: m.speed, axis: m.axis, t: 0, dx: 0, dy: 0 }));
    this.crumble = new Map(); // key -> timer
    this.items = []; this.spawns = []; this.springs = [];
    this.start = { x: 32, y: 32 }; this.exit = null; this.shrines = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.grid[y][x];
      const px = x * T, py = y * T;
      if (c === 'P') { this.start = { x: px + 8, y: py + 16 }; this.grid[y][x] = '.'; }
      else if (c === 'o' || c === '*' || c === 'H') { this.items.push({ kind: c === 'o' ? 'ember' : c === '*' ? 'mote' : 'heart', x: px + 8, y: py + 8, id: `${x},${y}`, t: Math.random() * 60 }); this.grid[y][x] = '.'; }
      else if (c === 'C') { this.shrines.push({ x: px + 8, y: py + 16, lit: false }); this.grid[y][x] = '.'; }
      else if (c === 'E') { this.exit = { x: px + 8, y: py + 16 }; this.grid[y][x] = '.'; }
      else if (c === 'S') { this.springs.push({ x: px, y: py, t: 0 }); this.grid[y][x] = '.'; }
      else if (c >= '1' && c <= '3') { this.spawns.push({ type: realm.enemies[+c - 1], x: px + 8, y: py + 16 }); this.grid[y][x] = '.'; }
    }
    this.cam = { x: 0, y: 0, minX: 0, maxX: this.w * T - W, minY: 0, maxY: Math.max(0, this.h * T - H + 8) };
    this.time = 0;
  }
  tile(tx, ty) { if (tx < 0 || tx >= this.w) return '#'; if (ty < 0) return this.arena ? '#' : '.'; if (ty >= this.h) return '.'; return this.grid[ty][tx]; }
  solid(tx, ty) { const c = this.tile(tx, ty); return SOLID.has(c); }
  solidPx(x, y) { return this.solid(Math.floor(x / T), Math.floor(y / T)); }
  water(x, y) { return this.tile(Math.floor(x / T), Math.floor(y / T)) === '~'; }

  // Move a body {x,y,w,h,vx,vy} (x,y = top-left) with tile + mover collision.
  move(b, opts = {}) {
    b.hitWall = 0; b.hitCeil = false;
    const wasGround = b.onGround; b.onGround = false; b.groundMover = null;
    // horizontal
    if (b.vx) {
      b.x += b.vx;
      const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
      if (b.vx > 0) { const tx = Math.floor((b.x + b.w) / T); for (let ty = y0; ty <= y1; ty++) if (this.solid(tx, ty)) { b.x = tx * T - b.w; b.hitWall = 1; b.vx = 0; break; } }
      else { const tx = Math.floor(b.x / T); for (let ty = y0; ty <= y1; ty++) if (this.solid(tx, ty)) { b.x = (tx + 1) * T; b.hitWall = -1; b.vx = 0; break; } }
    }
    // vertical
    const prevBottom = b.y + b.h;
    b.y += b.vy;
    const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
    if (b.vy >= 0) {
      const ty = Math.floor((b.y + b.h) / T);
      for (let tx = x0; tx <= x1; tx++) {
        const c = this.tile(tx, ty);
        const oneway = (c === '=' || c === 'F') && !opts.dropThrough && prevBottom <= ty * T + 0.5;
        if (SOLID.has(c) || oneway) {
          b.y = ty * T - b.h; b.vy = 0; b.onGround = true;
          if (c === 'F') this.touchCrumble(tx, ty);
          break;
        }
      }
      if (!b.onGround) for (const m of this.movers) {
        if (b.x + b.w > m.x && b.x < m.x + m.w && prevBottom <= m.y + 1 + Math.max(0, -m.dy) && b.y + b.h >= m.y) { b.y = m.y - b.h; b.vy = 0; b.onGround = true; b.groundMover = m; break; }
      }
    } else {
      const ty = Math.floor(b.y / T);
      for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) { b.y = (ty + 1) * T; b.vy = 0; b.hitCeil = true; break; }
    }
    b.landed = b.onGround && !wasGround;
    return b;
  }
  // is there a wall right next to the body on side dir (-1/1)?
  wallBeside(b, dir) {
    const x = dir > 0 ? b.x + b.w + 1 : b.x - 1;
    return this.solidPx(x, b.y + 3) && this.solidPx(x, b.y + b.h - 3);
  }
  touchCrumble(tx, ty) { const k = tx + ',' + ty; if (!this.crumble.has(k)) this.crumble.set(k, { tx, ty, t: 0 }); }
  breakTile(tx, ty) {
    if (this.tile(tx, ty) !== 'B') return false;
    this.grid[ty][tx] = '.';
    this.tctx.clearRect(tx * T, ty * T, T, T);
    return true;
  }
  hazardAt(b) { // spikes overlapping the lower part of a tile
    const x0 = Math.floor((b.x + 2) / T), x1 = Math.floor((b.x + b.w - 2) / T), y0 = Math.floor((b.y + 4) / T), y1 = Math.floor((b.y + b.h - 1) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tile(tx, ty) === '^') { if (b.y + b.h > ty * T + 7) return true; }
    return false;
  }

  update() {
    this.time++;
    for (const m of this.movers) {
      m.t += m.speed * Math.PI / Math.max(16, m.range);
      const off = (1 - Math.cos(m.t)) / 2 * m.range;
      const nx = m.axis === 'x' ? m.x0 + off : m.x0, ny = m.axis === 'y' ? m.y0 - off : m.y0;
      m.dx = nx - m.x; m.dy = ny - m.y; m.x = nx; m.y = ny;
    }
    for (const [k, c] of this.crumble) {
      c.t++;
      if (c.t === 40) { this.grid[c.ty][c.tx] = '.'; }
      if (c.t > 300 && this.tile(c.tx, c.ty) === '.') { this.grid[c.ty][c.tx] = 'F'; this.crumble.delete(k); }
    }
    for (const s of this.springs) if (s.t > 0) s.t--;
  }

  follow(px, py, face, dt = 1) {
    const c = this.cam;
    const tx = px - W / 2 + face * 24, ty = py - H * 0.58;
    c.x += (tx - c.x) * 0.12; c.y += (ty - c.y) * 0.1;
    c.x = clamp(c.x, c.minX, c.maxX); c.y = clamp(c.y, c.minY, c.maxY);
  }

  // ---------------------------------------------------------------- drawing
  drawBack(cx, cy) {
    const R = this.realm;
    gradient(0, H, R.sky.map(s => [s[0], s[1], s[2], s[3]]), 2);
    const t = this.time;
    for (const L of this.bg) {
      if (L.front) continue;
      if (L.eclipse) this.drawEclipseSky(t);
      if (L.gears) this.drawGears(cx, cy, t);
      const img = L.img, w = img.width;
      let ox = -Math.floor(cx * L.px) % w; if (ox > 0) ox -= w;
      const oy = Math.round(L.y - cy * L.px * 0.4);
      for (let x = ox; x < W; x += w) ctx.drawImage(img, x, oy);
      if (L.falls) { // animated water shimmer on the waterfalls (HDMA-ish colour cycling)
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(80,140,160,0.12)';
        for (let i = 0; i < 4; i++) { const fx0 = ((i * 128 + 54) - Math.floor(cx * L.px)) % w; for (let k = 0; k < 9; k++) { const yy = ((t * 3 + k * 26) % 200) + 20; ctx.fillRect((fx0 + w) % w - (w > W ? 0 : 0), yy, 8, 6); } }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (R.key === 'aqua' || R.key === 'void') this.lightShafts(t, R.key === 'aqua' ? '120,230,220' : '255,120,190');
  }
  drawEclipseSky(t) {
    const x = 180, y = 52;
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 46; r > 26; r -= 4) { ctx.fillStyle = `rgba(255,${90 + r},${150 + r},${0.05 + (46 - r) * 0.006})`; ctx.beginPath(); ctx.arc(x, y, r + Math.sin(t / 20 + r) * 1.5, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0a0410'; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffe8c0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 22.5, 0, 7); ctx.stroke();
  }
  drawGears(cx, cy, t) {
    const gears = G.assets.bigGears;
    const pts = [[40, 60, 0, 0.004], [200, 150, 1, -0.006], [330, 40, 0, 0.005], [470, 170, 1, -0.004]];
    for (const [x, y, k, sp] of pts) {
      const img = gears[k], w = 512;
      let sx = ((x - cx * 0.2) % w + w) % w; if (sx > W + 70) sx -= w;
      ctx.globalAlpha = 0.55; affine(img, sx, y - cy * 0.1, t * sp, 1); ctx.globalAlpha = 1;
    }
  }
  lightShafts(t, rgb) { // colour-math additive shafts, as with the sub-screen + fixed colour
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 90 + t * 0.15) % 360) - 60, a = 0.05 + Math.sin(t / 50 + i) * 0.02;
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 24, 0); ctx.lineTo(x + 90, H); ctx.lineTo(x + 50, H); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawTerrain(cx, cy) {
    const sx = Math.max(0, Math.floor(cx)), sy = Math.max(0, Math.floor(cy));
    const w = Math.min(W + 1, this.terrain.width - sx), h = Math.min(H + 1, this.terrain.height - sy);
    if (w > 0 && h > 0) ctx.drawImage(this.terrain, sx, sy, w, h, Math.round(sx - cx), Math.round(sy - cy), w, h);
    const x0 = Math.floor(cx / T), x1 = Math.ceil((cx + W) / T), y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(this.h - 1, Math.ceil((cy + H) / T));
    const tl = this.tiles;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = this.tile(tx, ty), dx = Math.round(tx * T - cx), dy = Math.round(ty * T - cy);
      if (c === '=') ctx.drawImage(tl.ledge, dx, dy);
      else if (c === 'F') { const cr = this.crumble.get(tx + ',' + ty); const j = cr ? (cr.t % 4 < 2 ? 1 : -1) * (cr.t > 15 ? 1 : 0) : 0; ctx.drawImage(tl.crumble, dx + j, dy); }
      else if (c === '^') ctx.drawImage(tl.spike, dx, dy);
    }
    for (const m of this.movers) {
      for (let i = 0; i < m.w; i += T) ctx.drawImage(tl.ledge, Math.round(m.x + i - cx), Math.round(m.y - cy));
    }
    for (const s of this.springs) ctx.drawImage(tl.spring[s.t > 0 ? 1 : 0], Math.round(s.x - cx), Math.round(s.y - cy));
  }
  drawWater(cx, cy) {
    if (!this.hasWater) { this.hasWater = this.grid.some(r => r.includes('~')) ? 1 : -1; }
    if (this.hasWater < 0) return;
    const AC = this.tiles.water, t = this.time;
    const x0 = Math.floor(cx / T), x1 = Math.ceil((cx + W) / T), y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(this.h - 1, Math.ceil((cy + H) / T));
    ctx.globalCompositeOperation = 'source-over';
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.tile(tx, ty) !== '~') continue;
      const dx = Math.round(tx * T - cx), dy = Math.round(ty * T - cy);
      const surf = this.tile(tx, ty - 1) !== '~';
      ctx.fillStyle = 'rgba(40,140,170,0.42)'; ctx.fillRect(dx, dy + (surf ? 3 : 0), T, surf ? T - 3 : T);
      if (surf) for (let x = 0; x < T; x++) { const wy = Math.round(Math.sin((tx * T + x) * 0.3 + t * 0.08) * 1.2 + 2); ctx.fillStyle = `rgb(${AC[4]})`; ctx.fillRect(dx + x, dy + wy, 1, 1); ctx.fillStyle = 'rgba(160,240,240,0.5)'; ctx.fillRect(dx + x, dy + wy + 1, 1, 2); }
    }
  }
  drawFront(cx, cy) {
    for (const L of this.bg) {
      if (!L.front) continue;
      const img = L.img, w = img.width;
      let ox = -Math.floor(cx * L.px) % w; if (ox > 0) ox -= w;
      for (let x = ox; x < W; x += w) ctx.drawImage(img, x, Math.round(L.y + (H - L.y) * 0 - (cy - this.cam.maxY) * 0.3));
    }
  }
}
