// Painted terrain, parallax backgrounds and world objects for each realm.
import { makeCanvas } from '../ppu.js';
import { ramp, fbm, vnoise, bayer, pixels, model, mix, hex, rng, OUTLINE } from '../gfx.js';

const T = 16;
const solidCh = c => c === '#' || c === 'X' || c === 'B';

// ------------------------------------------------------------------ terrain
// The whole stage's ground is painted once into one big bitmap: each pixel is
// shaded from its distance to open air (lit top-left rim, darker depths),
// textured per realm and dithered into a 6-colour ramp.
export function paintTerrain(stage, realm) {
  const Wp = stage.w * T, Hp = stage.h * T;
  const P = pixels(Wp, Hp);
  const G = ramp(realm.ground, 7, 0.75), TOP = ramp(realm.top, 5, 0.6), DEEP = hex(realm.deep);
  const solid = (tx, ty) => { if (tx < 0 || tx >= stage.w) return true; if (ty < 0) return false; if (ty >= stage.h) return true; return solidCh(stage.grid[ty][tx]); };
  const sp = (px, py) => solid(Math.floor(px / T), Math.floor(py / T));
  const seed = realm.seed;
  for (let ty = 0; ty < stage.h; ty++) for (let tx = 0; tx < stage.w; tx++) {
    if (!solidCh(stage.grid[ty][tx])) continue;
    const brk = stage.grid[ty][tx] === 'B';
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const px = tx * T + x, py = ty * T + y;
      // distances to air (capped) in 4 directions
      let du = 0; while (du < 20 && sp(px, py - du - 1)) du++;
      let dd = 0; while (dd < 8 && sp(px, py + dd + 1)) dd++;
      let dl = 0; while (dl < 8 && sp(px - dl - 1, py)) dl++;
      let dr = 0; while (dr < 8 && sp(px + dr + 1, py)) dr++;
      let v = 0.62 - Math.min(du, 20) / 20 * 0.32;
      if (dl < 2) v += 0.16; if (dr < 2) v -= 0.14; if (dd < 2) v -= 0.18;
      let tex = 0;
      switch (realm.style) {
        case 'earth': { const n = fbm(px / 14, py / 14, seed, 3); tex = (n - 0.5) * 0.5; const st = vnoise(px / 5, py / 5, seed + 9); if (st > 0.78) tex += 0.18; if (st > 0.74 && st < 0.78) tex -= 0.25; break; }
        case 'brick': { const row = Math.floor(py / 8), off = row % 2 ? 8 : 0; const bx = (px + off) % 16, by = py % 8; tex = (bx === 0 || by === 0) ? -0.35 : (bx === 1 || by === 1) ? 0.12 : (vnoise(Math.floor((px + off) / 16), row, seed) - 0.5) * 0.25 + (fbm(px / 6, py / 6, seed, 2) - 0.5) * 0.15; break; }
        case 'strata': { const s = Math.sin(py * 0.55 + fbm(px / 30, py / 30, seed, 2) * 6); tex = s * 0.14 + (fbm(px / 10, py / 4, seed, 3) - 0.5) * 0.3; break; }
        case 'metal': { const bx = px % 32, by = py % 16; tex = (bx === 0 || by === 0) ? -0.3 : (bx === 1 || by === 1) ? 0.15 : 0; if ((bx === 4 || bx === 27) && (by === 4 || by === 11)) tex = 0.35; tex += (fbm(px / 20, py / 20, seed, 2) - 0.5) * 0.12; break; }
        case 'crystal': { const n = vnoise(px / 9, py / 9, seed), m = vnoise(px / 9 + 0.5, py / 9 + 0.5, seed + 3); tex = (n - m) * 0.6; if (Math.abs(n - m) < 0.03) tex = -0.3; break; }
      }
      v += tex;
      if (brk) { const cx = (x + y * 2) % 7; if (cx === 0 || (x === y) || (x === 15 - y && y > 4)) v -= 0.35; }
      let col;
      const topband = du < 4 && !sp(px, py - du - 1);
      if (topband && realm.style !== 'metal') {
        const tv = 0.85 - du * 0.17 + (vnoise(px / 3, 0, seed) - 0.5) * 0.3;
        col = TOP[Math.max(0, Math.min(4, Math.floor(tv * 5 + bayer(px, py) * 0.8)))];
      } else if (topband) {
        col = TOP[Math.max(0, Math.min(4, Math.floor((0.9 - du * 0.22) * 5 + bayer(px, py) * 0.8)))];
      } else {
        const i = Math.floor(v * 7 + bayer(px, py) * 0.9);
        col = i < 0 ? DEEP : G[Math.min(6, i)];
      }
      if (du > 26) col = mix(col, DEEP, 0.5);
      P.set(px, py, col);
    }
  }
  // overhanging grass / moss / sand lips and drips above the top surfaces
  const R = rng(realm.seed);
  for (let tx = 0; tx < stage.w; tx++) for (let ty = 1; ty < stage.h; ty++) {
    if (!solidCh(stage.grid[ty][tx]) || solidCh(stage.grid[ty - 1][tx])) continue;
    for (let x = 0; x < T; x++) {
      const px = tx * T + x, py = ty * T;
      const hgt = realm.style === 'earth' ? Math.floor(vnoise(px / 2.2, 0, seed + 4) * 5) - 1 : realm.style === 'crystal' ? (vnoise(px / 3, 0, seed) > 0.75 ? 4 : 0) : realm.style === 'brick' ? (vnoise(px / 2, 3, seed) > 0.6 ? 2 : 0) : 0;
      for (let k = 1; k <= hgt; k++) P.set(px, py - k, TOP[Math.min(4, 4 - Math.floor(k / 2))]);
      if (hgt > 0) P.set(px, py - hgt - 1, OUTLINE);
      if (realm.style === 'earth' && R() < 0.04) { P.set(px, py - hgt - 1, hex('#ffe070')); }
    }
    // dark outline under overhangs
  }
  for (let tx = 0; tx < stage.w; tx++) for (let ty = 0; ty < stage.h - 1; ty++) {
    if (!solidCh(stage.grid[ty][tx]) || solidCh(stage.grid[ty + 1][tx])) continue;
    for (let x = 0; x < T; x++) {
      const px = tx * T + x, py = ty * T + T;
      P.set(px, py, OUTLINE);
      if (realm.style === 'brick' || realm.style === 'earth') { const len = vnoise(px / 2, 9, seed) > 0.72 ? 1 + Math.floor(vnoise(px, 1, seed) * 5) : 0; for (let k = 1; k <= len; k++) P.set(px, py + k, realm.style === 'earth' ? ramp('#3a7a40', 4)[1 + (k & 1)] : TOP[1]); }
    }
  }
  return P.put();
}

// ------------------------------------------------------------------ tiles (sprites)
export function buildTiles(realm) {
  const t = {};
  const PL = ramp(realm.plat, 5, 0.7), AC = ramp(realm.accent, 5, 0.6);
  // one-way ledge
  let p = pixels(16, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    if (y > 5 && (x < 2 || x > 13)) continue;
    let v = 0.75 - y * 0.12 + (vnoise(x / 3, y, realm.seed) - 0.5) * 0.3;
    if (y === 0) v = 0.95; if (x === 0 || x === 15) v -= 0.2; if (realm.style === 'metal' && (x === 3 || x === 12) && y === 3) v = 1;
    p.set(x, y, y === 7 || (y > 4 && (x === 2 || x === 13)) ? OUTLINE : PL[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x, y))))]);
  }
  t.ledge = p.put();
  // crumbling ledge (cracked)
  p = pixels(16, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    if (y > 4 && ((x * 7 + y * 3) % 5 === 0)) continue;
    let v = 0.7 - y * 0.1 + (vnoise(x / 2, y / 2, realm.seed + 5) - 0.5) * 0.5;
    if (x % 5 === 2 && y > 1) v = 0.05;
    p.set(x, y, y === 7 ? OUTLINE : PL[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x, y))))]);
  }
  t.crumble = p.put();
  // spikes: four lit metal/crystal teeth
  p = pixels(16, 16);
  const SP = ramp(realm.style === 'crystal' ? '#c070e0' : realm.style === 'earth' ? '#b0a090' : '#c8d0e0', 5);
  for (let k = 0; k < 4; k++) for (let y = 0; y < 16; y++) {
    const half = Math.floor((y + 2) / 4.2);
    for (let x = -half; x <= half; x++) {
      const px = k * 4 + 2 + x; if (px < 0 || px > 15) continue;
      p.set(px, y + 0, x === -half || x === half || y === 15 ? OUTLINE : SP[x < 0 ? 4 : x === 0 ? 3 : 1]);
    }
  }
  t.spike = p.put();
  // spring
  t.spring = [0, 1].map(f => {
    const q = pixels(16, 16), M = ramp('#d04040', 5), S = ramp('#c0c8d0', 4);
    const top = f ? 10 : 4;
    for (let y = top; y < 16; y++) for (let x = 2; x < 14; x++) {
      if (y < top + 3) q.set(x, y, y === top ? OUTLINE : M[x < 7 ? 4 : 2]);
      else if (y > 12) q.set(x, y, y === 15 ? OUTLINE : M[1]);
      else if ((y + (x > 7 ? 1 : 0)) % 2 === 0 && x > 3 && x < 12) q.set(x, y, S[x < 8 ? 3 : 1]);
    }
    return q.put();
  });
  // water surface strip (animated by offset at draw time)
  t.water = AC;
  return t;
}

// ------------------------------------------------------------------ objects
const gold = { ramp: ramp('#ffc040', 5), spec: 1 }, white = { ramp: ramp('#fff4d0', 4), emit: true };
export function buildObjects() {
  const o = {};
  o.ember = [0, 1, 2, 3, 4, 5].map(i => {
    const a = i / 6 * Math.PI;
    return model([{ t: 'e', p: [6, 6, 0], r: [Math.max(1, Math.abs(Math.cos(a)) * 4), 4.5, 3], m: 0 }, { t: 's', p: [6 + Math.cos(a) * 1.2, 5, 2], r: 1.4, m: 1 }], 12, 12,
      [{ ramp: ramp('#ff8a30', 5), spec: 1 }, white], { outline: true });
  });
  o.mote = [0, 1, 2, 3].map(i => {
    const P = [{ t: 's', p: [8, 8, 0], r: 4.2, m: 1 }];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + i * 0.4; P.push({ t: 'c', a: [8, 8, 0], b: [8 + Math.cos(a) * 7.5, 8 + Math.sin(a) * 7.5, 0], r: 1.4, r2: 0.3, m: 0 }); }
    return model(P, 16, 16, [gold, white]);
  });
  o.heart = [0, 1].map(i => model([
    { t: 's', p: [5.5, 6, 0], r: 3.6 + i * 0.4, m: 0, k: 2 }, { t: 's', p: [10.5, 6, 0], r: 3.6 + i * 0.4, m: 0, k: 2 },
    { t: 'c', a: [8, 7, 0], b: [8, 13, 0], r: 3.5, r2: 0.6, m: 0, k: 3 }], 16, 16, [{ ramp: ramp('#ff3060', 5), spec: 1.2 }]));
  // bell shrine: stone post with a hanging bell
  const stone = { ramp: ramp('#8a8098', 5) };
  o.shrine = [0, 1].map(lit => model([
    { t: 'b', p: [12, 30, 0], s: [9, 2.5, 5], r: 1, m: 0 },
    { t: 'b', p: [5, 17, 0], s: [1.8, 12, 2], r: 0.6, m: 0 }, { t: 'b', p: [19, 17, 0], s: [1.8, 12, 2], r: 0.6, m: 0 },
    { t: 'b', p: [12, 5, 0], s: [10, 2, 3], r: 1, m: 0 }, { t: 'c', a: [3, 3, 0], b: [21, 3, 0], r: 1.5, m: 0 },
    { t: 'c', a: [12, 7, 0], b: [12, 10, 0], r: 0.6, m: 1 },
    { t: 'c', a: [12, 11, 0], b: [12, 19, 0], r: 2.5, r2: 5.5, m: lit ? 2 : 1, k: 1 }, { t: 's', p: [12, 20.5, 2], r: 1.4, m: lit ? 2 : 1 },
  ], 24, 34, [stone, gold, white]));
  // exit gate: ornate arch
  o.gate = model([
    { t: 'b', p: [4, 26, 0], s: [3.5, 22, 3], r: 1, m: 0 }, { t: 'b', p: [36, 26, 0], s: [3.5, 22, 3], r: 1, m: 0 },
    { t: 't', p: [20, 18, -1], R: 16, r: 3, m: 0 }, { t: 'b', p: [20, 18, -3], s: [13, 4, 1], r: 1, m: 3, sub: false },
    { t: 's', p: [20, 3, 2], r: 3.5, m: 1 }, { t: 's', p: [4, 4, 2], r: 2.5, m: 1 }, { t: 's', p: [36, 4, 2], r: 2.5, m: 1 },
  ], 40, 48, [stone, gold, white, { ramp: ramp('#40306a', 3) }]);
  // breakable debris chunk
  o.debris = model([{ t: 'b', p: [4, 4, 0], s: [3, 2.5, 2.5], r: 1, rot: 0.4, m: 0 }], 8, 8, [{ ramp: ramp('#8a7060', 4) }]);
  // projectiles
  o.seed = model([{ t: 's', p: [5, 5, 0], r: 3.5, m: 0 }, { t: 'c', a: [5, 2, 0], b: [8, 0, 0], r: 0.8, m: 1 }], 10, 10, [{ ramp: ramp('#9a5a2a', 4) }, { ramp: ramp('#6ab040', 4) }]);
  o.orb = [0, 1].map(i => model([{ t: 's', p: [5, 5, 0], r: 3.5 + i * 0.5, m: 0 }, { t: 's', p: [4, 4, 2], r: 1.5, m: 1 }], 10, 10, [{ ramp: ramp('#ff4a8a', 4), emit: true }, white]));
  o.bubble = [0, 1].map(i => model([{ t: 's', p: [6, 6, 0], r: 4.5 - i * 0.4, m: 0 }, { t: 's', p: [4.5, 4.5, 3], r: 1.2, m: 1 }], 12, 12, [{ ramp: ramp('#70c8f0', 4) }, white]));
  o.sunshot = [0, 1, 2].map(i => model([{ t: 'e', p: [10, 6, 0], r: [8 - i, 3.5 + i * 0.4, 3], m: 0 }, { t: 'e', p: [12, 6, 2], r: [4, 2, 1], m: 1 }], 20, 12, [{ ramp: ramp('#ffb030', 4), emit: true }, white], { outline: false }));
  o.bigshot = [0, 1].map(i => model([{ t: 's', p: [12, 12, 0], r: 8 + i, m: 0 }, { t: 's', p: [13, 11, 3], r: 5, m: 1 }], 24, 24, [{ ramp: ramp('#ff9020', 5), emit: true }, white], { outline: false }));
  o.gearBlade = [0, 1, 2, 3].map(i => {
    const P = [{ t: 'y', p: [12, 12, 0], r: 7, hz: 2.5, m: 0 }, { t: 'y', p: [12, 12, 1], r: 2.5, hz: 2.5, m: 1 }];
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + i * Math.PI / 16; P.push({ t: 'b', p: [12 + Math.cos(a) * 8.5, 12 + Math.sin(a) * 8.5, 0], s: [2, 1.6, 2], rot: a, m: 0 }); }
    return model(P, 24, 24, [{ ramp: ramp('#b08a50', 5), spec: 0.8 }, { ramp: ramp('#503020', 3) }]);
  });
  o.shard = [0, 1, 2, 3].map(i => model([
    { t: 'e', p: [12, 12, 0], r: [5 + Math.cos(i * 1.57) * 1.5, 9, 4], m: 0 }, { t: 's', p: [12, 12, 3], r: 3, m: 1 }], 24, 24, [{ ramp: ramp('#ffd060', 5), spec: 1.5 }, white]));
  return o;
}

// ------------------------------------------------------------------ backgrounds
// Each realm: 2-3 painted layers on canvases that wrap horizontally.
export function buildBackground(realm) {
  const L = [];
  const R = rng(realm.seed + 7);
  const lay = (w, h, fn) => { const P = pixels(w, h); fn(P); return P.put(); };
  const ridge = (P, base, amp, scale, seedOff, ramp5, lightDir = 1, stepped = 0) => {
    for (let x = 0; x < P.w; x++) {
      const n = fbm(x / scale, 0, realm.seed + seedOff, 4) + fbm(((x + P.w) % P.w) / scale, 3, realm.seed + seedOff, 2) * 0;
      let top = Math.floor(base - n * amp);
      if (stepped) top = Math.floor(top / stepped) * stepped;
      const slope = fbm((x + 1) / scale, 0, realm.seed + seedOff, 4) - n;
      for (let y = Math.max(0, top); y < P.h; y++) {
        const d = y - top;
        let v = 0.55 - d / P.h * 0.6 + (slope * lightDir < 0 ? 0.15 : -0.05) + (fbm(x / 9, y / 9, realm.seed + seedOff + 1, 3) - 0.5) * 0.3;
        if (d < 2) v += 0.25;
        P.set(x, y, ramp5[Math.max(0, Math.min(ramp5.length - 1, Math.floor(v * ramp5.length + bayer(x, y))))]);
      }
    }
  };
  // seamless helper: wraps noise by blending ends
  switch (realm.key) {
    case 'moss': {
      L.push({ img: lay(512, 160, P => ridge(P, 110, 70, 60, 1, ramp('#4a6a9a', 5, 0.4))), y: 40, px: 0.12 });
      L.push({ img: lay(512, 170, P => { // canopy of round trees
        const C = ramp('#2f6a3a', 6, 0.7), Tk = ramp('#3a2a2a', 4);
        for (let i = 0; i < 26; i++) {
          const cx = (i * 20 + R() * 12) % 512, cy = 50 + R() * 50, r = 18 + R() * 16;
          for (let y = Math.floor(cy); y < 170; y++) for (let x = -3; x <= 3; x++) P.set(Math.floor(cx + x + 512) % 512, y, Tk[x < 0 ? 2 : 1]);
          for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            const d = Math.hypot(x, y * 1.15) + (vnoise((cx + x) / 5, (cy + y) / 5, 3) - 0.5) * 10; if (d > r) continue;
            const v = 0.5 + (-x - y) / r * 0.35 + (vnoise((cx + x) / 3, (cy + y) / 3, 5) - 0.5) * 0.4;
            P.set(Math.floor(cx + x + 512) % 512, Math.floor(cy + y), C[Math.max(0, Math.min(5, Math.floor(v * 6 + bayer(x, y))))]);
          }
        }
        for (let y = 140; y < 170; y++) for (let x = 0; x < 512; x++) P.set(x, y, C[0]);
      }), y: 70, px: 0.35 });
      L.push({ img: lay(512, 60, P => { // foreground ferns
        const C = ramp('#1f4a2a', 4, 0.6);
        for (let i = 0; i < 18; i++) { const cx = R() * 512, hh = 20 + R() * 35; for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.32; for (let s = 0; s < hh; s++) { const x = cx + Math.cos(a) * s, y = 60 + Math.sin(a) * s * (1 - s / hh / 2.5); P.set(Math.floor(x + 512) % 512, Math.floor(y), C[Math.min(3, Math.floor(s / hh * 3 + 0.3))]); } } }
      }), y: 168, px: 1.35, front: true });
      break;
    }
    case 'aqua': {
      L.push({ img: lay(512, 170, P => { // far aqueduct arches
        const C = ramp('#2a5a6a', 5, 0.45);
        for (let x = 0; x < 512; x++) for (let y = 30; y < 170; y++) {
          const ax = x % 64, inArch = y > 70 && Math.hypot(ax - 32, Math.max(0, 95 - y) * 1.2) < 22 && y < 170, top = y < 40;
          if (inArch) continue;
          let v = 0.45 + (top ? 0.25 : 0) + (ax < 6 ? 0.15 : ax > 58 ? -0.15 : 0) + (fbm(x / 8, y / 8, 9, 2) - 0.5) * 0.25 - (y - 30) / 300;
          if (y % 12 === 0) v -= 0.12;
          P.set(x, y, C[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x, y))))]);
        }
      }), y: 10, px: 0.2 });
      L.push({ img: lay(512, 224, P => { // pillars with waterfalls
        const C = ramp('#3a6a7a', 5, 0.6), Wt = ramp('#80e0f0', 4, 0.5);
        for (let i = 0; i < 4; i++) { const cx = i * 128 + 40;
          for (let y = 0; y < 224; y++) for (let x = -12; x <= 12; x++) { const v = 0.5 - x / 30 + (fbm((cx + x) / 6, y / 6, 4, 2) - 0.5) * 0.3 + (y % 24 < 2 ? -0.2 : 0); P.set(cx + x, y, C[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x, y))))]); }
          for (let y = 40; y < 224; y++) for (let x = 14; x < 22; x++) { const v = vnoise(x / 2, y / 6, i) * 0.6 + 0.3; P.set(cx + x, y, Wt[Math.min(3, Math.floor(v * 4 + bayer(x, y)))]); }
        }
      }), y: 0, px: 0.5, falls: true });
      break;
    }
    case 'dune': {
      L.push({ img: lay(512, 90, P => ridge(P, 70, 40, 90, 2, ramp('#d8907a', 5, 0.35))), y: 120, px: 0.1 });
      L.push({ img: lay(512, 150, P => { // glass spires
        const C = ramp('#70c0d8', 5, 0.7);
        for (let i = 0; i < 9; i++) { const cx = i * 57 + R() * 20, hh = 60 + R() * 80, w = 8 + R() * 10;
          for (let y = 0; y < hh; y++) { const ww = w * (y / hh); for (let x = -ww; x <= ww; x++) { const v = 0.4 + (x < 0 ? 0.4 : -0.1) + (Math.abs(x - ww * 0.3) < 1 ? 0.3 : 0); P.set(Math.floor(cx + x + 512) % 512, Math.floor(150 - hh + y), C[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x | 0, y))))]); } } }
        ridge(P, 140, 25, 50, 8, ramp('#e0a060', 5, 0.5));
      }), y: 74, px: 0.4 });
      break;
    }
    case 'gear': {
      L.push({ img: lay(512, 224, P => { // girders + pipes
        const C = ramp('#5a3a2a', 5, 0.5), Pi = ramp('#a07040', 5, 0.6);
        for (let x = 0; x < 512; x++) for (let y = 0; y < 224; y++) {
          const gx = x % 96, gy = y % 80;
          if (gx < 6 || gy < 5 || (Math.abs(gx - gy * 1.2) < 3 && gy > 5)) { const v = 0.5 + (gx < 2 || gy < 2 ? 0.3 : 0) + (fbm(x / 7, y / 7, 2, 2) - 0.5) * 0.3; P.set(x, y, C[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x, y))))]); }
          const py = (y + 30) % 112; if (py < 8) { const v = 0.85 - py * 0.1; P.set(x, y, Pi[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x, y))))]); }
        }
      }), y: 0, px: 0.3, gears: true });
      break;
    }
    case 'void': {
      L.push({ img: lay(512, 224, P => { // stars
        for (let i = 0; i < 160; i++) { const x = R() * 512 | 0, y = R() * 160 | 0, b = R(); P.set(x, y, b > 0.9 ? [255, 255, 255] : b > 0.6 ? [180, 160, 255] : [110, 80, 170]); }
      }), y: 0, px: 0.05, eclipse: true });
      L.push({ img: lay(512, 170, P => { // citadel spires silhouette
        const C = ramp('#2a1a4a', 5, 0.4);
        for (let i = 0; i < 12; i++) { const cx = i * 44 + R() * 20, hh = 50 + R() * 100, w = 6 + R() * 10;
          for (let y = 0; y < 170; y++) { const top = 170 - hh; if (y < top - w * 2) continue; const ww = y < top ? w * (1 - (top - y) / (w * 2)) : w; for (let x = -ww; x <= ww; x++) { const v = 0.35 + (x < 0 ? 0.2 : -0.1) + (y % 16 === 0 ? -0.15 : 0) + ((x | 0) === 0 && y % 20 < 6 && y > top ? 0.6 : 0); P.set(Math.floor(cx + x + 512) % 512, y, C[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x | 0, y))))]); } } }
      }), y: 54, px: 0.25 });
      L.push({ img: lay(512, 120, P => { // floating rubble
        const C = ramp('#5a4a7a', 5, 0.6);
        for (let i = 0; i < 10; i++) { const cx = R() * 512, cy = R() * 90 + 15, r = 4 + R() * 8;
          for (let y = -r; y <= r * 1.6; y++) for (let x = -r; x <= r; x++) { const d = y < 0 ? Math.hypot(x, y) : Math.abs(x) + y * 0.8; if (d > r) continue; const v = 0.5 - (x + y) / r * 0.3; P.set(Math.floor(cx + x + 512) % 512, Math.floor(cy + y), C[Math.max(0, Math.min(4, Math.floor(v * 5 + bayer(x | 0, y | 0))))]); } }
      }), y: 30, px: 0.55 });
      break;
    }
  }
  return L;
}

// Big rotating background gear (drawn with affine each frame)
export function buildGear(r, teeth, base) {
  const s = Math.ceil(r * 2 + 12), c = s / 2;
  const P = [{ t: 'y', p: [c, c, 0], r, hz: 3, m: 0 }];
  for (let k = 0; k < teeth; k++) { const a = k / teeth * Math.PI * 2; P.push({ t: 'b', p: [c + Math.cos(a) * (r + 3), c + Math.sin(a) * (r + 3), 0], s: [4, 3, 3], rot: a, r: 0.8, m: 0 }); }
  P.push({ t: 'y', p: [c, c, 0], r: r * 0.3, hz: 6, m: 1, sub: true });
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push({ t: 'y', p: [c + Math.cos(a) * r * 0.64, c + Math.sin(a) * r * 0.64, 0], r: r * 0.17, hz: 6, m: 1, sub: true }); }
  P.push({ t: 'y', p: [c, c, 1], r: r * 0.16, hz: 4, m: 1 });
  return model(P, s, s, [{ ramp: ramp(base, 5, 0.6) }, { ramp: ramp('#201014', 2) }], { ambient: 0.1 });
}
