// The overworld of Cindral as a 1024x1024 Mode 7 plane: a twilight sea with
// five islands, golden sea-roads between them, painted with noise + dithering.
import { fbm, vnoise, bayer, ramp, hex } from '../gfx.js';
import { REALMS } from '../realms.js';

export function buildMapTexture() {
  const N = 1024, data = new Uint32Array(N * N);
  const sea = ramp('#1a3a6a', 6, 0.5), foam = hex('#cfe8ff');
  const isl = REALMS.map(r => ({ x: r.node[0], y: r.node[1], rad: 120, g: ramp(r.top, 5, 0.55), d: ramp(r.ground, 5, 0.5) }));
  const roads = [];
  for (let i = 0; i < REALMS.length - 1; i++) roads.push([REALMS[i].node, REALMS[i + 1].node]);
  const pack = c => 0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = 0, li = 0;
    const warp = (fbm(x / 70, y / 70, 11, 4) - 0.5) * 0.9;
    for (let i = 0; i < isl.length; i++) {
      const I = isl[i]; const dx = x - I.x, dy = y - I.y;
      if (Math.abs(dx) > 240 || Math.abs(dy) > 240) continue;
      const d = Math.hypot(dx, dy) / I.rad + warp;
      const h = 1 - d; if (h > best) { best = h; li = i; }
    }
    let col;
    if (best > 0.12) {
      const I = isl[li], h = best;
      const tex = fbm(x / 18, y / 18, 40 + li, 3);
      const v = h * 1.6 + (tex - 0.5) * 0.6;
      col = h < 0.18 ? hex('#e8d8a0') : (v > 0.9 ? I.d : I.g)[Math.max(0, Math.min(4, Math.floor((0.35 + tex * 0.6) * 5 + bayer(x, y))))];
      if (li === 3 && (x % 24 < 2 || y % 24 < 2) && h > 0.3) col = I.d[1];
    } else {
      const n = fbm(x / 40, y / 40, 3, 4), w = Math.sin((x + y) * 0.08 + n * 9);
      let v = 0.45 + (n - 0.5) * 0.5 + (best > 0.05 ? 0.25 : 0);
      col = sea[Math.max(0, Math.min(5, Math.floor(v * 6 + bayer(x, y))))];
      if (w > 0.93 && n > 0.45) col = sea[5];
      if (best > 0.1) col = foam;
    }
    // golden sea roads
    for (const [a, b] of roads) {
      const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L2));
      const px = a[0] + vx * t, py = a[1] + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < 2.2 && Math.floor(t * Math.sqrt(L2) / 8) % 2 === 0) col = d < 1.2 ? hex('#ffe9a0') : hex('#c08a30');
    }
    data[y * N + x] = pack(col);
  }
  return { size: N, data };
}
