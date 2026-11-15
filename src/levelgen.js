// Stage builder. Each realm is assembled from hand-designed segment types
// (runs, pits, platform chains, set pieces, secrets), tuned per realm and
// seeded so every stage is identical between plays. Every segment is
// built inside the jump envelope of the abilities the player has at that
// point, so stages are completable by construction (tools/check-levels.mjs
// verifies it).
//
// Tile legend:  # ground   = one-way ledge   ^ spikes   B breakable   X false wall
//   ~ water   F crumbling ledge   S spring   C bell shrine (checkpoint)   E exit gate
//   o ember   * sun mote (secret)   H heart vessel   1/2/3 enemy of the realm's three types
//   M horizontal mover (spawned)  N vertical mover (spawned)
import { rng } from './util.js';

export const ROWS = 15;

export function buildStage(realm) {
  const R = rng(realm.seed), ri = realm.id;
  const can = { double: ri >= 1, dash: ri >= 2, wall: ri >= 3, shot: ri >= 4 };
  const maxGap = can.double ? (can.dash ? 7 : 6) : 4;
  const W = realm.len + 140;
  const g = Array.from({ length: ROWS }, () => Array(W).fill('.'));
  const movers = [];
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < ROWS) g[y][x] = c; };
  const get = (x, y) => (x >= 0 && x < W && y >= 0 && y < ROWS) ? g[y][x] : '#';
  let x = 0, h = 11, motes = 0, hearts = 0, sinceCP = 0, sinceSecret = 0;
  const pick = a => a[Math.floor(R() * a.length)];
  const ground = (cx, hh) => { for (let y = hh; y < ROWS; y++) set(cx, y, '#'); };
  const ceil = (cx) => {
    if (!realm.ceiling) return;
    const t = 1 + Math.floor((Math.sin(cx * 0.21 + realm.seed) * 0.5 + 0.5) * 2.2);
    for (let y = 0; y < t && y < h - 6; y++) set(cx, y, '#');
  };
  const flat = (n, opts = {}) => {
    for (let i = 0; i < n; i++, x++) { ground(x, h); ceil(x); if (opts.embers && i % 2 === 0 && i > 0 && i < n - 1) set(x, h - 2, 'o'); }
  };
  const enemy = (cx, type) => { if (get(cx, h - 1) === '.') set(cx, h - 1, type); };

  const segs = {
    run() { const n = 6 + Math.floor(R() * 6); const s = x; flat(n, { embers: R() < 0.5 }); if (R() < 0.55 + ri * 0.08) enemy(s + (n >> 1), '1'); },
    step() {
      const d = pick([-2, -1, 1, 2, 2]);
      h = Math.max(7, Math.min(12, h + d));
      flat(3 + Math.floor(R() * 4));
    },
    gap() {
      const w = 2 + Math.floor(R() * (maxGap - 1));
      const top = h;
      for (let i = 0; i < w; i++, x++) { ceil(x); if (ri === 2 || ri === 4) set(x, ROWS - 1, '^'); }
      const dh = pick([0, 0, -1, 1]); h = Math.max(7, Math.min(12, h + dh));
      for (let i = 1; i < w; i++) set(x - w + i, Math.min(top, h) - 3 - (i === (w >> 1) ? 1 : 0), 'o');
      if (R() < 0.4 + ri * 0.08) set(x - (w >> 1) - 1, Math.min(top, h) - 5, '2');
      flat(3);
    },
    spikes() {
      flat(2); const w = 2 + Math.floor(R() * (can.double ? 3 : 2));
      for (let i = 0; i < w; i++, x++) { ground(x, h); ceil(x); set(x, h - 1, '^'); }
      flat(3);
    },
    ledges() {
      const n = 3 + Math.floor(R() * 2), s = x;
      const lw = 3, gap = can.double ? 3 : 2;
      x += 1;
      for (let k = 0; k < n; k++) {
        const ly = h - 2 - Math.floor(R() * 2);
        for (let i = 0; i < lw; i++) set(x + i, ly, ri === 2 && k % 2 ? 'F' : '=');
        if (R() < 0.5) set(x + 1, ly - 1, 'o');
        x += lw + gap;
      }
      for (let cx = s; cx < x; cx++) { ceil(cx); if (ri === 2 || ri === 4) set(cx, ROWS - 1, '^'); }
      if (R() < 0.5 + ri * 0.1) set(s + ((x - s) >> 1), h - 6, '2');
      flat(3);
    },
    mover() {
      if (ri < 1) return segs.ledges();
      const w = 10 + Math.floor(R() * 4), s = x;
      for (let i = 0; i < w; i++, x++) { ceil(x); if (ri !== 1) set(x, ROWS - 1, '^'); }
      movers.push({ x: s + 1, y: h - 1, w: 3, axis: 'x', range: (w - 5) * 16, speed: 0.6 + ri * 0.08 });
      set(s + (w >> 1), h - 4, 'o'); set(s + (w >> 1) + 1, h - 4, 'o');
      flat(3);
    },
    arena() {
      const n = 12 + Math.floor(R() * 4), s = x;
      flat(n, { embers: true });
      enemy(s + 3, '1'); enemy(s + n - 3, R() < 0.5 ? '3' : '1');
      if (R() < 0.6) set(s + (n >> 1), h - 5, '2');
      if (ri >= 2) enemy(s + (n >> 1), '3');
    },
    pool() { // water basin you swim through
      h = Math.min(h, 11); const w = 8 + Math.floor(R() * 5), s = x, floor = ROWS - 1;
      for (let i = 0; i < w; i++, x++) { ceil(x); for (let y = floor; y < ROWS; y++) set(x, y, '#'); for (let y = h; y < floor; y++) set(x, y, '~'); }
      for (let i = 2; i < w - 2; i += 3) set(s + i, floor - 1, 'o');
      set(s + (w >> 1), h + 1, '1');
      flat(3);
    },
    springs() {
      flat(2); set(x, h - 1, 'S'); flat(2);
      const up = 5; h = Math.max(4, h - up); flat(4, { embers: true });
    },
    chimney() { // needs wall-jumps: low pillar on the left, high cliff on the right
      if (!can.wall) return segs.step();
      if (h < 10) { h = 10; flat(2); }
      flat(3);
      const top = h - 7;
      for (let y = Math.max(0, top - 1); y <= h - 3; y++) set(x, y, '#');
      ground(x, h); x++;
      flat(3);
      for (let y = top + 2; y < h - 1; y += 2) set(x - 2, y, 'o');
      h = top; flat(4);
    },
    dashgap() {
      if (!can.dash) return segs.gap();
      const w = 8; for (let i = 0; i < w; i++, x++) { ceil(x); set(x, ROWS - 1, '^'); }
      for (let i = 1; i < w; i += 2) set(x - w + i, h - 2, 'o');
      flat(3);
    },
    // ---- secrets
    breakroom() { // a cracked wall in a hill hides a mote (or a heart)
      flat(2);
      const s = x, top = h - 3;
      for (let i = 0; i < 7; i++, x++) { ground(x, top); ceil(x); }
      for (let y = h - 2; y < h; y++) for (let i = 1; i < 6; i++) set(s + i, y, '.');
      set(s, h - 1, 'B'); set(s, h - 2, 'B');
      set(s + 6, h - 1, 'B'); set(s + 6, h - 2, 'B');
      set(s + 3, h - 1, reward()); set(s + 2, h - 1, 'o'); set(s + 4, h - 1, 'o');
      flat(2);
    },
    falsewall() {
      flat(2);
      const s = x, top = h - 3;
      for (let i = 0; i < 6; i++, x++) { ground(x, top); ceil(x); }
      for (let y = top; y < h; y++) set(s, y, 'X');
      for (let y = h - 2; y < h; y++) for (let i = 1; i < 5; i++) set(s + i, y, 'X');
      set(s + 2, h - 1, reward());
      // the way in is the false wall on the left; a tiny gap on top hints at it
      set(s + 1, top, 'X');
      flat(3);
    },
    skyledge() { // a high ledge reached by a hidden stair of ledges
      flat(2);
      const s = x, jh = can.double ? 4 : 3, steps = Math.min(can.double ? 2 : 3, Math.floor((h - 3) / jh));
      if (steps < 1) { x = s; return segs.breakroom(); }
      let ly = h;
      for (let k = 0; k < steps; k++) { ly -= jh; for (let i = 0; i < 3; i++) set(s + k * 3 + i, ly, '='); }
      set(s + steps * 3 - 2, ly - 1, reward());
      flat(steps * 3 + 2);
    },
  };
  function reward() {
    sinceSecret = 0;
    if (hearts < 1 && (ri === 0 || ri === 2 || ri === 4) && motes >= 1) { hearts++; return 'H'; }
    motes++; return '*';
  }

  // --- assemble -------------------------------------------------------------
  const plan = {
    0: ['run', 'step', 'gap', 'run', 'ledges', 'spikes', 'arena', 'step', 'gap'],
    1: ['run', 'pool', 'mover', 'gap', 'arena', 'step', 'pool', 'ledges', 'spikes'],
    2: ['run', 'gap', 'ledges', 'dashgap', 'arena', 'step', 'spikes', 'mover', 'gap'],
    3: ['run', 'springs', 'chimney', 'mover', 'arena', 'step', 'gap', 'dashgap', 'ledges', 'step'],
    4: ['run', 'chimney', 'dashgap', 'arena', 'mover', 'ledges', 'gap', 'spikes', 'step', 'arena'],
  }[ri];
  const secrets = ['breakroom', 'falsewall', 'skyledge'];
  // opening: safe flat ground with the start point
  flat(8); const start = { x: 3, y: h - 1 };
  let si = 0;
  while (x < realm.len) {
    const before = x;
    if (sinceCP > 55) { flat(2); set(x, h - 1, 'C'); flat(3); sinceCP = 0; }
    if (sinceSecret > 42 && si < 3) { segs[secrets[si++]](); }
    else segs[pick(plan)]();
    sinceCP += x - before; sinceSecret += x - before;
  }
  while (si < 3) { segs[secrets[si++]](); flat(3); }
  flat(6); set(x - 3, h - 1, 'E'); const exit = { x: x - 3, y: h - 1 };
  flat(10);
  set(start.x, start.y, 'P');
  return { w: x, h: ROWS, grid: g.map(r => r.slice(0, x).join('')), movers, start, exit, motes };
}

// Boss arenas: one screen each, hand-laid.
export const ARENAS = {
  thornback: [
    '################',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..===....===..#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#P.............#',
    '################',
    '################'],
  vesper: [
    '################',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#....======....#',
    '#..............#',
    '#P===......===.#',
    '#~~~~~~~~~~~~~~#',
    '#~~~~~~~~~~~~~~#',
    '#~~~~~~~~~~~~~~#',
    '################',
    '################'],
  colossus: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..===......===..',
    '................',
    '................',
    '.P..............',
    '################',
    '################'],
  horologe: [
    '################',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#===........===#',
    '#..............#',
    '#..............#',
    '#....======....#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#P.............#',
    '################',
    '################'],
  eclipse: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...===....===...',
    '................',
    '................',
    '......====......',
    '................',
    '.P..............',
    '################',
    '################'],
};
