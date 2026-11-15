// Graphics toolkit: palettes with hue-shifted ramps, a tiny SDF "3D modeller"
// that renders lit, outlined, dithered sprites (the workstation-render-to-sprite
// pipeline of late SNES games, done at load time), noise, a bitmap font.
import { makeCanvas, ctx } from './ppu.js';

// ---------------------------------------------------------------- random/noise
export { rng } from './util.js';
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 4) {
  let t = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * a; a *= 0.5; f *= 2; }
  return t / (1 - Math.pow(0.5, oct));
}
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.5);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// ---------------------------------------------------------------- colour
export function hex(h) { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const snes = v => (Math.max(0, Math.min(255, Math.round(v))) >> 3) << 3 | 4; // 15-bit colour
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb([h, s, l]) {
  h = ((h % 1) + 1) % 1;
  const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
// A ramp of n colours from deep shadow to highlight around a base colour, with
// shadows shifting cool and highlights shifting warm, as sprite artists did.
export function ramp(base, n = 5, spread = 0.62) {
  const [h, s, l] = rgb2hsl(typeof base === 'string' ? hex(base) : base);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const dl = (t - 0.55) * spread;
    const hh = h + (t < 0.55 ? (0.55 - t) * 0.10 * (h > 0.15 && h < 0.6 ? 1 : -1) : -(t - 0.55) * 0.07 * (h > 0.15 && h < 0.6 ? 1 : -1));
    const ss = Math.min(1, s * (t < 0.2 ? 0.85 : t > 0.85 ? 0.8 : 1.05));
    out.push(hsl2rgb([hh, ss, Math.min(0.96, Math.max(0.04, l + dl))]).map(snes));
  }
  return out;
}
export const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
export const OUTLINE = [20, 12, 28];

// ---------------------------------------------------------------- SDF modeller
// Primitive types (pixel units, x right, y down, z towards the viewer):
//  s: sphere {p,r}   e: ellipsoid {p,r:[rx,ry,rz]}   c: capsule/cone {a,b,r,r2}
//  b: rounded box {p,s:[hx,hy,hz],r,rot}   m: material index into mats
// Optional k: smooth-union radius with what was drawn before (organic joins).
const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] };

function primDist(pr, x, y, z) {
  switch (pr.t) {
    case 's': { const dx = x - pr.p[0], dy = y - pr.p[1], dz = z - pr.p[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - pr.r; }
    case 'e': {
      const dx = (x - pr.p[0]) / pr.r[0], dy = (y - pr.p[1]) / pr.r[1], dz = (z - pr.p[2]) / pr.r[2];
      const k0 = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ex = dx / pr.r[0], ey = dy / pr.r[1], ez = dz / pr.r[2];
      const k1 = Math.sqrt(ex * ex + ey * ey + ez * ez);
      return k1 < 1e-6 ? -Math.min(pr.r[0], pr.r[1], pr.r[2]) : k0 * (k0 - 1) / k1;
    }
    case 'c': {
      const a = pr.a, b = pr.b;
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
      const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz || 1)));
      const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
      const r = pr.r2 === undefined ? pr.r : pr.r + (pr.r2 - pr.r) * h;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    }
    case 'b': {
      let px = x - pr.p[0], py = y - pr.p[1];
      if (pr.rot) { const c = Math.cos(-pr.rot), s = Math.sin(-pr.rot); const t = px * c - py * s; py = px * s + py * c; px = t; }
      const pz = z - pr.p[2], r = pr.r || 0;
      const qx = Math.abs(px) - pr.s[0] + r, qy = Math.abs(py) - pr.s[1] + r, qz = Math.abs(pz) - pr.s[2] + r;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }
    case 'y': { // cylinder along z {p,r,hz}
      const a = Math.hypot(x - pr.p[0], y - pr.p[1]) - pr.r, b = Math.abs(z - pr.p[2]) - pr.hz;
      return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0));
    }
    case 't': { // torus in xy plane {p,R,r}
      const dx = x - pr.p[0], dy = y - pr.p[1], dz = z - pr.p[2];
      const q = Math.sqrt(dx * dx + dy * dy) - pr.R; return Math.sqrt(q * q + dz * dz) - pr.r;
    }
  }
  return 1e9;
}
function bounds(pr) {
  let x0, x1, y0, y1, z0, z1;
  const k = (pr.k || 0) + 1;
  if (pr.t === 's') { x0 = pr.p[0] - pr.r; x1 = pr.p[0] + pr.r; y0 = pr.p[1] - pr.r; y1 = pr.p[1] + pr.r; z0 = pr.p[2] - pr.r; z1 = pr.p[2] + pr.r; }
  else if (pr.t === 'e') { x0 = pr.p[0] - pr.r[0]; x1 = pr.p[0] + pr.r[0]; y0 = pr.p[1] - pr.r[1]; y1 = pr.p[1] + pr.r[1]; z0 = pr.p[2] - pr.r[2]; z1 = pr.p[2] + pr.r[2]; }
  else if (pr.t === 'c') { const r = Math.max(pr.r, pr.r2 ?? pr.r); x0 = Math.min(pr.a[0], pr.b[0]) - r; x1 = Math.max(pr.a[0], pr.b[0]) + r; y0 = Math.min(pr.a[1], pr.b[1]) - r; y1 = Math.max(pr.a[1], pr.b[1]) + r; z0 = Math.min(pr.a[2], pr.b[2]) - r; z1 = Math.max(pr.a[2], pr.b[2]) + r; }
  else if (pr.t === 'y') { x0 = pr.p[0] - pr.r; x1 = pr.p[0] + pr.r; y0 = pr.p[1] - pr.r; y1 = pr.p[1] + pr.r; z0 = pr.p[2] - pr.hz; z1 = pr.p[2] + pr.hz; }
  else if (pr.t === 't') { const r = pr.R + pr.r; x0 = pr.p[0] - r; x1 = pr.p[0] + r; y0 = pr.p[1] - r; y1 = pr.p[1] + r; z0 = pr.p[2] - pr.r; z1 = pr.p[2] + pr.r; }
  else { const e = Math.hypot(pr.s[0], pr.s[1]); const ex = pr.rot ? e : pr.s[0], ey = pr.rot ? e : pr.s[1]; x0 = pr.p[0] - ex; x1 = pr.p[0] + ex; y0 = pr.p[1] - ey; y1 = pr.p[1] + ey; z0 = pr.p[2] - pr.s[2]; z1 = pr.p[2] + pr.s[2]; }
  return [x0 - k, x1 + k, y0 - k, y1 + k, z0 - k, z1 + k];
}
function smin(a, b, k) { if (!k) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// Render a model to a canvas. mats: array of {ramp:[[r,g,b]...], spec?, emit?}
export function model(prims, w, h, mats, opt = {}) {
  const L = norm(opt.light || [-0.55, -0.75, 0.62]);
  const amb = opt.ambient ?? 0.18;
  const rim = opt.rim; // [r,g,b] rim light from behind-right
  const bs = prims.map(bounds);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const mat = new Int16Array(w * h).fill(-1), depth = new Float32Array(w * h);
  const idx = new Uint8Array(w * h);
  let zmax = -1e9, zmin = 1e9;
  for (const b of bs) { zmax = Math.max(zmax, b[5]); zmin = Math.min(zmin, b[4]); }
  const list = [];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = px + 0.5, y = py + 0.5;
    list.length = 0;
    for (let i = 0; i < prims.length; i++) { const b = bs[i]; if (x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3]) list.push(i); }
    if (!list.length) continue;
    let lz0 = -1e9, lz1 = 1e9;
    for (const i of list) { lz0 = Math.max(lz0, bs[i][5]); lz1 = Math.min(lz1, bs[i][4]); }
    const sdf = (X, Y, Z) => {
      let dd = 1e9, mi = -1, best = 1e9;
      for (const i of list) {
        const pr = prims[i], q = primDist(pr, X, Y, Z);
        if (pr.sub) { dd = Math.max(dd, -q); continue; }
        dd = smin(dd, q, pr.k || 0);
        if (q < best) { best = q; mi = i; }
      }
      return [dd, mi];
    };
    let z = lz0, hit = -1;
    for (let it = 0; it < 64 && z > lz1 - 1; it++) {
      const [dd, mi] = sdf(x, y, z);
      if (dd < 0.05) { hit = mi; break; }
      z -= Math.max(0.12, dd);
    }
    if (hit < 0) continue;
    const e = 0.35;
    const nx = sdf(x + e, y, z)[0] - sdf(x - e, y, z)[0];
    const ny = sdf(x, y + e, z)[0] - sdf(x, y - e, z)[0];
    const nz = sdf(x, y, z + e)[0] - sdf(x, y, z - e)[0];
    const n = norm([nx, ny, nz]);
    const M = mats[prims[hit].m || 0];
    let v;
    if (M.emit) v = 0.85 + 0.15 * n[2];
    else {
      const dif = Math.max(0, v3.dot(n, L));
      v = amb + dif * 0.95;
      if (M.spec) { const hv = norm([L[0], L[1], L[2] + 1]); v += Math.pow(Math.max(0, v3.dot(n, hv)), 18) * M.spec; }
      v -= Math.max(0, (zmax - z) / (zmax - zmin + 1)) * 0.12; // depth darkening
    }
    const R = M.ramp, ii = Math.max(0, Math.min(R.length - 1, Math.floor(v * R.length + bayer(px, py) * 0.9)));
    const o = py * w + px;
    mat[o] = prims[hit].m || 0; depth[o] = z; idx[o] = ii;
    let col = R[ii];
    if (rim && n[0] > 0.35 && n[2] < 0.6 && !M.emit) col = mix(col, rim, 0.45);
    d[o * 4] = col[0]; d[o * 4 + 1] = col[1]; d[o * 4 + 2] = col[2]; d[o * 4 + 3] = 255;
  }
  // interior contour lines where depth jumps, then a selective outer outline
  if (opt.contour !== false) {
    for (let py = 1; py < h - 1; py++) for (let px = 1; px < w - 1; px++) {
      const o = py * w + px; if (mat[o] < 0) continue;
      const zz = depth[o];
      if ((mat[o + 1] >= 0 && zz - depth[o + 1] < -3.5) || (mat[o + w] >= 0 && zz - depth[o + w] < -3.5)) {
        const R = mats[mat[o]].ramp, col = R[0];
        d[o * 4] = col[0]; d[o * 4 + 1] = col[1]; d[o * 4 + 2] = col[2];
      }
    }
  }
  if (opt.outline !== false) {
    const ol = opt.outlineColor || OUTLINE;
    const src = new Int16Array(mat);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const o = py * w + px; if (src[o] >= 0) continue;
      let nb = -1;
      if (px > 0 && src[o - 1] >= 0) nb = src[o - 1];
      else if (px < w - 1 && src[o + 1] >= 0) nb = src[o + 1];
      else if (py > 0 && src[o - w] >= 0) nb = src[o - w];
      else if (py < h - 1 && src[o + w] >= 0) nb = src[o + w];
      if (nb < 0) continue;
      const col = mats[nb].emit ? mats[nb].ramp[0] : ol;
      d[o * 4] = col[0]; d[o * 4 + 1] = col[1]; d[o * 4 + 2] = col[2]; d[o * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0]; }
export const mats = (...cols) => cols.map(c => (c && c.ramp) ? c : { ramp: ramp(c, 5) });

// Mirror a canvas horizontally (sprites face right; OBJ h-flip gives left)
export function flipH(src) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}
// Solid-colour silhouette of a sprite (hit flash / colour math)
export function silhouette(src, col) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = css(col); g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Pixel canvas helper: returns {c, set(x,y,rgb), put()}
export function pixels(w, h) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  return {
    c, w, h, d,
    set(x, y, col, a = 255) { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a; },
    get(x, y) { const o = (y * w + x) * 4; return d[o + 3] ? [d[o], d[o + 1], d[o + 2]] : null; },
    put() { g.putImageData(img, 0, 0); return c; },
  };
}

// ---------------------------------------------------------------- bitmap font
const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100',
  '.': '00000000000000000000000000110001100', ',': '00000000000000000000011000010001000', '!': '00100001000010000100001000000000100',
  '?': '01110100010000100010001000000000100', "'": '00100001000100000000000000000000000', '-': '00000000000000011111000000000000000',
  ':': '00000011000110000000011000110000000', '/': '00001000100001000100010000100010000', '×': '00000100010101000100010101000100000',
  '♥': '00000010101111111111011100010000000', '>': '01000001000001000001000100010001000', '<': '00010001000100010000010000010000010',
  '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000', '+': '00000001000010011111001000010000000',
  '"': '01010010100000000000000000000000000', '*': '00000101010111011111011101010100000', '%': '11001110010001000100010001001110011',
  '·': '00000000000000000100000000000000000',
  '◀': '00010001100111011110011100011000010',
  '▶': '01000011000111001111011100110001000',
  '▲': '00000001000111011111000000000000000',
  '▼': '00000111110111000100000000000000000',
  '●': '00000011101111111111111110111000000',
  '○': '00000011101000110001100010111000000',
  '_': '00000000000000000000000000000011111', '=': '00000000001111100000111110000000000', '…': '00000000000000000000000001010110101',
};
const ACC = { acute: '0001000100', grave: '0100000100', circ: '0010001010', trema: '0101000000', cedil: '0010001000' };
const DECOMP = { 'É': ['E', 'acute'], 'È': ['E', 'grave'], 'Ê': ['E', 'circ'], 'Ë': ['E', 'trema'], 'À': ['A', 'grave'], 'Â': ['A', 'circ'],
  'Î': ['I', 'circ'], 'Ï': ['I', 'trema'], 'Ô': ['O', 'circ'], 'Û': ['U', 'circ'], 'Ù': ['U', 'grave'], 'Ç': ['C', 'cedil'], 'Œ': ['O', null] };
const glyphCache = new Map();
function glyph(ch, col) {
  const key = ch + col;
  let c = glyphCache.get(key);
  if (c) return c;
  const p = pixels(6, 11);
  let base = ch, acc = null;
  if (DECOMP[ch]) [base, acc] = DECOMP[ch];
  const bits = FONT[base];
  const rgbc = hex(col);
  if (bits) for (let i = 0; i < 35; i++) if (bits[i] === '1') p.set(i % 5, (i / 5 | 0) + 2, rgbc);
  if (acc) { const a = ACC[acc]; for (let i = 0; i < 10; i++) if (a[i] === '1') p.set(i % 5, acc === 'cedil' ? 9 + (i / 5 | 0) : (i / 5 | 0), rgbc); }
  c = p.put(); glyphCache.set(key, c); return c;
}
// Draw text (uppercase bitmap font). align: 'l' | 'c' | 'r'. Returns width.
export function text(str, x, y, col = '#f4ecff', align = 'l', shadow = '#140c1c', g = ctx) {
  str = String(str).toUpperCase().replace(/[’‘]/g, "'").replace(/Œ/g, 'OE').replace(/[—–]/g, '-').replace(/★/g, '*');
  const w = str.length * 6 - 1;
  let sx = align === 'c' ? Math.round(x - w / 2) : align === 'r' ? x - w : x;
  for (const ch of str) {
    if (ch !== ' ') {
      if (shadow) g.drawImage(glyph(ch, shadow), sx + 1, y - 1);
      g.drawImage(glyph(ch, col), sx, y - 2);
    }
    sx += 6;
  }
  return w;
}
export const textWidth = s => String(s).replace(/Œ/g, 'OE').length * 6 - 1;
