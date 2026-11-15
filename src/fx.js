// Particles, screen shake, hit-stop and flashes.
import { ctx } from './ppu.js';

export const fx = { parts: [], shake: 0, stop: 0, flash: 0, flashCol: '255,255,255' };

export function burst(x, y, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = opt.angle !== undefined ? opt.angle + (Math.random() - 0.5) * (opt.spread ?? 1) : Math.random() * Math.PI * 2;
    const sp = (opt.speed ?? 2) * (0.4 + Math.random() * 0.8);
    fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up ?? 0), g: opt.g ?? 0.12, life: (opt.life ?? 30) * (0.6 + Math.random() * 0.6), max: opt.life ?? 30,
      col: Array.isArray(opt.col) ? opt.col[Math.random() * opt.col.length | 0] : (opt.col || '#fff'), size: opt.size ?? 2, img: opt.img, spin: opt.img ? (Math.random() - 0.5) * 0.3 : 0, rot: 0, drag: opt.drag ?? 0.98, glow: opt.glow });
  }
}
export function text(x, y, str, col = '#fff') { fx.parts.push({ x, y, vx: 0, vy: -0.6, g: 0, life: 50, max: 50, txt: str, col, drag: 0.95 }); }
export function shake(n) { fx.shake = Math.max(fx.shake, n); }
export function hitstop(n) { fx.stop = Math.max(fx.stop, n); }
export function flash(n, col = '255,255,255') { fx.flash = Math.max(fx.flash, n); fx.flashCol = col; }

export function updateFx() {
  const P = fx.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.spin || 0;
    if (--p.life <= 0) P.splice(i, 1);
  }
  if (P.length > 400) P.splice(0, P.length - 400);
  if (fx.shake > 0) fx.shake *= 0.86; if (fx.shake < 0.3) fx.shake = 0;
  if (fx.flash > 0) fx.flash--;
}

export function drawFx(cx, cy, textFn) {
  for (const p of fx.parts) {
    const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
    if (x < -20 || x > 280 || y < -20 || y > 250) continue;
    if (p.txt) { textFn(p.txt, x, y, p.col, 'c'); continue; }
    if (p.img) { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.drawImage(p.img, -p.img.width / 2, -p.img.height / 2); ctx.restore(); continue; }
    const s = p.size * (p.life / p.max > 0.5 ? 1 : 0.6) | 0 || 1;
    if (p.glow) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = p.col; ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
    if (p.glow) ctx.globalCompositeOperation = 'source-over';
  }
}
export function clearFx() { fx.parts.length = 0; fx.shake = 0; fx.stop = 0; fx.flash = 0; }
