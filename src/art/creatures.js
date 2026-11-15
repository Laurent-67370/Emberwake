// Enemies and bosses, modelled from primitives and rendered to sprites.
// Each builder returns { name: [frames...] } facing right.
import { model, ramp, flipH, silhouette } from '../gfx.js';

const m = (c, o = {}) => ({ ramp: ramp(c, o.n || 5, o.spread || 0.62), ...o });
const EYE = m('#fff0a0', { emit: true, n: 3 }), DARK = { ramp: [[20, 12, 28], [36, 24, 48]] };
const S = Math.sin, C = Math.cos, TAU = Math.PI * 2;
const range = n => Array.from({ length: n }, (_, i) => i);

const ENEMY = {
  mossling() { // a walking mushroom-boulder of moss
    const M = [m('#5f9a3a'), m('#7a5a3a'), EYE, m('#d86a4a'), m('#f0e0c0', { n: 4 })];
    return { walk: range(4).map(i => { const a = i / 4 * TAU; return model([
      { t: 'c', a: [8, 15, -2], b: [8 + S(a) * 3, 19, -2], r: 2, m: 1 }, { t: 'c', a: [15, 15, 2], b: [15 - S(a) * 3, 19, 2], r: 2, m: 1 },
      { t: 'e', p: [12, 12 + Math.abs(S(a)), 0], r: [8, 6, 6], m: 0, k: 2 },
      { t: 'e', p: [12, 7 + Math.abs(S(a)), 0], r: [9, 4, 7], m: 3, k: 1 }, { t: 's', p: [8, 5, 4], r: 1.4, m: 4 }, { t: 's', p: [15, 6, 5], r: 1.1, m: 4 },
      { t: 's', p: [17, 12, 5], r: 1.2, m: 2 }, { t: 's', p: [13, 12, 6], r: 1.2, m: 2 }], 24, 22, M); }) };
  },
  sporebat() {
    const M = [m('#7a4a9a'), m('#b07ad0'), EYE, m('#40205a')];
    return { fly: range(4).map(i => { const f = C(i / 4 * TAU) * 0.9; return model([
      { t: 'c', a: [12, 9, -2], b: [2, 9 - f * 7, -3], r: 2.2, r2: 3.5, m: 1 }, { t: 'c', a: [12, 9, 2], b: [22, 9 - f * 7, 3], r: 2.2, r2: 3.5, m: 1 },
      { t: 's', p: [12, 10, 0], r: 5, m: 0 }, { t: 'c', a: [10, 6, 0], b: [8, 2, 0], r: 1.3, r2: 0.5, m: 0 }, { t: 'c', a: [14, 6, 0], b: [16, 2, 0], r: 1.3, r2: 0.5, m: 0 },
      { t: 's', p: [14, 10, 4], r: 1.3, m: 2 }, { t: 's', p: [10, 10, 4], r: 1.3, m: 2 }, { t: 'c', a: [12, 15, 0], b: [12, 18, 0], r: 1, m: 3 }], 24, 22, M); }) };
  },
  bramble() {
    const M = [m('#4a7a2a'), m('#8a3a3a'), m('#e8d090'), m('#2a4a1a')];
    const f = open => { const P = [{ t: 'c', a: [12, 23, 0], b: [12, 14, 0], r: 2, r2: 3, m: 3 }, { t: 'e', p: [12, 11, 0], r: [7, 7 - open, 6], m: 0, k: 1.5 }];
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; P.push({ t: 'c', a: [12 + C(a) * 6, 11 + S(a) * 6, 0], b: [12 + C(a) * 10, 11 + S(a) * 10, 0], r: 1.2, r2: 0.2, m: 2 }); }
      P.push({ t: 'e', p: [17, 11, 3], r: [3, 1 + open * 1.5, 2], m: 1 }); return model(P, 24, 24, M); };
    return { idle: [f(0), f(0.5)], shoot: [f(2)] };
  },
  jelly() {
    const M = [m('#60d0e0'), m('#a0f0ff'), EYE, m('#3080a0')];
    return { swim: range(4).map(i => { const a = i / 4 * TAU; const P = [{ t: 'e', p: [10, 8 + S(a) * 0.6, 0], r: [8 - S(a), 6 + S(a) * 0.6, 7], m: 0 }, { t: 'e', p: [10, 7, 3], r: [4, 3, 3], m: 1 }];
      for (let k = 0; k < 4; k++) P.push({ t: 'c', a: [4 + k * 4, 12, 0], b: [4 + k * 4 + S(a + k) * 2, 21, 0], r: 1, r2: 0.5, m: 3 });
      P.push({ t: 's', p: [13, 9, 6], r: 1, m: 2 }); return model(P, 20, 24, M); }) };
  },
  crab() {
    const M = [m('#c05030'), m('#e0a070'), m('#8a9aa8', { spec: 1 }), EYE];
    return { walk: range(4).map(i => { const a = i / 4 * TAU; const P = [];
      for (let k = 0; k < 3; k++) { P.push({ t: 'c', a: [9 + k * 4, 12, -3], b: [6 + k * 4 + S(a + k) * 2, 19, -4], r: 1, m: 0 }); P.push({ t: 'c', a: [9 + k * 4, 12, 3], b: [8 + k * 4 - S(a + k) * 2, 19, 4], r: 1, m: 0 }); }
      P.push({ t: 'e', p: [13, 11, 0], r: [9, 5, 6], m: 0, k: 1 }, { t: 'c', a: [16, 6, 2], b: [17, 3, 2], r: 0.8, m: 1 }, { t: 's', p: [17, 3, 2], r: 1.3, m: 3 },
        { t: 'c', a: [19, 12, 4], b: [23, 10, 4], r: 2, m: 0 }, { t: 'e', p: [25, 10, 4], r: [2.5, 7, 4], m: 2 });
      return model(P, 28, 21, M); }) };
  },
  drip() {
    const M = [m('#80e070'), m('#c0ffa0'), EYE];
    return { hang: [0, 1].map(i => model([{ t: 'e', p: [8, 6 + i, 0], r: [6, 5 + i, 5], m: 0 }, { t: 'c', a: [8, 8, 0], b: [8, 13 + i, 0], r: 4, r2: 1, m: 0, k: 2 }, { t: 's', p: [6, 5, 4], r: 1.5, m: 1 }, { t: 's', p: [10, 7, 4], r: 1, m: 2 }], 16, 16, M)),
      fall: [model([{ t: 'e', p: [8, 9, 0], r: [5, 6, 5], m: 0 }, { t: 'c', a: [8, 8, 0], b: [8, 2, 0], r: 3.5, r2: 1, m: 0, k: 2 }, { t: 's', p: [10, 9, 4], r: 1, m: 2 }], 16, 16, M)] };
  },
  skink() {
    const M = [m('#d08a40'), m('#f0d090'), EYE, m('#6a3a2a')];
    return { run: range(4).map(i => { const a = i / 4 * TAU; return model([
      { t: 'c', a: [6, 9, 0], b: [0, 6 + S(a) * 2, 0], r: 2, r2: 0.5, m: 0 },
      { t: 'c', a: [10, 11, -2], b: [8 + S(a) * 3, 15, -2], r: 1, m: 3 }, { t: 'c', a: [18, 11, 2], b: [20 - S(a) * 3, 15, 2], r: 1, m: 3 },
      { t: 'e', p: [14, 9, 0], r: [8, 3.5, 4], m: 0, k: 1 }, { t: 'e', p: [23, 8, 0], r: [4, 3, 3], m: 0, k: 1 }, { t: 'e', p: [14, 11, 2], r: [6, 1.5, 2], m: 1 },
      { t: 's', p: [24, 7, 3], r: 1, m: 2 }], 28, 17, M); }) };
  },
  wasp() {
    const M = [m('#80d0e8', { spec: 1.2 }), m('#f0e8a0'), EYE, m('#e8faff', { n: 3 })];
    return { fly: range(2).map(i => model([
      { t: 'e', p: [8, 4 + i * 2, -2], r: [6, 2, 1], m: 3 }, { t: 'e', p: [8, 4 + i * 2, 2], r: [6, 2, 1], m: 3 },
      { t: 'e', p: [6, 11, 0], r: [5, 4, 4], m: 0 }, { t: 'c', a: [3, 13, 0], b: [0, 16, 0], r: 1.5, r2: 0.3, m: 1 },
      { t: 's', p: [13, 9, 0], r: 3.5, m: 1 }, { t: 's', p: [17, 9, 0], r: 3, m: 0 }, { t: 's', p: [19, 8, 2], r: 1.2, m: 2 }], 22, 20, M)) };
  },
  wraith() {
    const M = [m('#c8a070'), m('#5a3a3a'), EYE, m('#f0e0c0')];
    return { float: range(3).map(i => { const a = i / 3 * TAU; return model([
      { t: 'c', a: [11, 6, 0], b: [10 + S(a) * 2, 26, -1], r: 4, r2: 7, m: 0, k: 2 }, { t: 's', p: [12, 7, 0], r: 5, m: 0 },
      { t: 'e', p: [14, 8, 3], r: [3, 3, 2], m: 1 }, { t: 's', p: [15, 8, 4.5], r: 0.9, m: 2 }, { t: 's', p: [13, 8, 4.5], r: 0.9, m: 2 },
      { t: 'c', a: [15, 13, 3], b: [20, 16 + S(a) * 2, 3], r: 1.2, m: 3 }], 22, 28, M); }) };
  },
  sentry() {
    const M = [m('#9a7a50', { spec: .8 }), m('#4a3a3a'), m('#ff5030', { emit: true, n: 3 }), m('#c0a060', { spec: 1 })];
    return { aim: range(8).map(i => { const a = i / 8 * TAU; return model([
      { t: 'b', p: [12, 21, 0], s: [9, 3, 6], r: 1, m: 1 }, { t: 's', p: [12, 15, 0], r: 7, m: 0 },
      { t: 'c', a: [12, 15, 0], b: [12 + C(a) * 11, 15 + S(a) * 11, 0], r: 2.2, r2: 1.8, m: 3 },
      { t: 's', p: [12 + C(a) * 3, 15 + S(a) * 3, 5], r: 1.8, m: 2 }], 24, 24, M); }) };
  },
  hopper() {
    const M = [m('#6a8a9a', { spec: 1 }), m('#c0c8d0'), m('#60ff80', { emit: true, n: 3 }), m('#3a4a5a')];
    return { hop: [0, 1, 2].map(i => { const sq = [1, 0.7, 1.25][i]; return model([
      { t: 'c', a: [7, 14 * sq + 4, 0], b: [5, 21, 0], r: 1, m: 1 }, { t: 'c', a: [13, 14 * sq + 4, 0], b: [15, 21, 0], r: 1, m: 1 },
      { t: 'b', p: [10, 10 * sq + 4, 0], s: [7, 6 * sq, 5], r: 2, m: 0 }, { t: 'e', p: [13, 10 * sq + 3, 5], r: [3, 2, 1], m: 2 }, { t: 'c', a: [6, 5 * sq + 2, 0], b: [4, 1, 0], r: 0.7, m: 3 }], 20, 23, M); }) };
  },
  knight() {
    const M = [m('#5a4a7a', { spec: 1 }), m('#2a2040'), m('#ff6ab0', { emit: true, n: 3 }), m('#c0c0e0', { spec: 1.3 }), m('#8a2a5a')];
    const f = (ph, lunge) => model([
      { t: 'c', a: [11, 20, -2], b: [9 + S(ph) * 3, 31, -2], r: 2, m: 1 }, { t: 'c', a: [13, 20, 2], b: [15 - S(ph) * 3, 31, 2], r: 2, m: 1 },
      { t: 'c', a: [10, 10, -3], b: [5, 26, -4], r: 3, r2: 6, m: 4 },
      { t: 'e', p: [12, 15, 0], r: [5, 6, 4], m: 0, k: 1 }, { t: 's', p: [13, 7, 0], r: 4.3, m: 0 }, { t: 'b', p: [15, 7, 3.5], s: [2.5, 0.6, 1], m: 2 },
      { t: 'c', a: [13, 3, 0], b: [10, -1, 0], r: 1.2, r2: 0.3, m: 3 },
      { t: 'e', p: [17, 17, 4], r: [2, 7, 4], m: 3 },
      { t: 'c', a: [14, 14, 4], b: [14 + lunge * 9 + 2, 13 - (1 - lunge) * 9, 4], r: 1, r2: 0.6, m: 3 }], 26, 32, M);
    return { walk: range(4).map(i => f(i / 4 * TAU, 0)), lunge: [f(0, 1)] };
  },
  eye() {
    const M = [m('#f0e0f0'), m('#8a3aa0'), DARK, m('#c0a0ff', { spec: 1 })];
    return { look: range(4).map(i => { const a = i / 4 * TAU; return model([
      { t: 't', p: [12, 12, -1], R: 9, r: 1.5, m: 3 }, { t: 's', p: [12, 12, 0], r: 7, m: 0 }, { t: 's', p: [12 + C(a) * 1.5, 12 + S(a) * 1.5, 5], r: 3.5, m: 1 }, { t: 's', p: [12 + C(a) * 2, 12 + S(a) * 2, 7.6], r: 1.6, m: 2 }], 24, 24, M); }) };
  },
  hound() {
    const M = [m('#3a2a5a'), m('#7a5ab0'), m('#ff5ab0', { emit: true, n: 3 }), m('#e0d0f0')];
    return { run: range(4).map(i => { const a = i / 4 * TAU; return model([
      { t: 'c', a: [9, 10, 0], b: [1, 6 + S(a) * 2, 0], r: 1.5, r2: 2.5, m: 1 },
      { t: 'c', a: [10, 12, -2], b: [7 + S(a) * 5, 19, -2], r: 1.4, m: 0 }, { t: 'c', a: [22, 12, 2], b: [24 - S(a) * 5, 19, 2], r: 1.4, m: 0 },
      { t: 'e', p: [16, 10, 0], r: [9, 4.5, 4.5], m: 0, k: 2 }, { t: 'e', p: [26, 8, 0], r: [5, 3.5, 3.5], m: 0, k: 1.5 },
      { t: 'c', a: [25, 5, 0], b: [23, 1, 0], r: 1.3, r2: 0.3, m: 1 }, { t: 's', p: [28, 7, 3], r: 1, m: 2 }, { t: 'c', a: [28, 10, 2], b: [31, 10, 2], r: 0.6, m: 3 }], 32, 20, M); }) };
  },
};
ENEMY.roller = null; // uses the world gear-blade sprite

const BOSS = {
  thornback() {
    const M = [m('#5a3a2a'), m('#3a6a2a', { spec: .6 }), m('#e0d0a0'), EYE, m('#2a1a1a'), m('#8a5a3a')];
    const f = (ph, head, crouch, legs = 1) => {
      const P = [];
      for (let k = 0; k < 2; k++) { const s = S(ph + k * Math.PI) * legs; P.push({ t: 'c', a: [24 + k * 22, 34 + crouch, -6], b: [22 + k * 22 + s * 6, 53, -7], r: 3.5, r2: 3, m: 0 }); }
      P.push({ t: 'e', p: [36, 32 + crouch, 0], r: [24, 13, 13], m: 5, k: 2 });
      P.push({ t: 'e', p: [33, 25 + crouch, 0], r: [24, 12, 13], m: 1, k: 1 });
      for (let k = 0; k < 6; k++) P.push({ t: 'c', a: [16 + k * 7, 18 + crouch - (k % 2) * 2, 2], b: [12 + k * 7, 6 + crouch + (k % 2) * 3 - (k > 1 && k < 4 ? 4 : 0), 2], r: 2.4, r2: 0.3, m: 2 });
      P.push({ t: 'e', p: [60, 36 + crouch + head * 4, 0], r: [11, 9, 9], m: 5, k: 3 });
      P.push({ t: 'c', a: [66, 42 + crouch + head * 4, 6], b: [72, 30 + crouch + head * 6, 7], r: 2.2, r2: 0.4, m: 2 });
      P.push({ t: 's', p: [64, 33 + crouch + head * 4, 8], r: 2, m: 3 });
      for (let k = 0; k < 2; k++) { const s = S(ph + k * Math.PI + 1.5) * legs; P.push({ t: 'c', a: [26 + k * 22, 36 + crouch, 7], b: [24 + k * 22 + s * 6, 54, 8], r: 3.8, r2: 3.2, m: 0 }); }
      return model(P, 76, 58, M, { rim: [255, 200, 120] });
    };
    return { walk: range(4).map(i => f(i / 4 * TAU, 0, 0)), charge: [0, 1].map(i => f(i * Math.PI, 1, 3)), stun: [f(0, 1.2, 5, 0)], jump: [f(1, -0.5, -2, 0.4)] };
  },
  vesper() {
    const M = [m('#2a6a8a', { spec: 1 }), m('#a0e0d0'), EYE, m('#e04060'), m('#f0f0e0'), m('#1a3a5a')];
    const head = open => model([
      { t: 'e', p: [18, 18, 0], r: [16, 11, 10], m: 0, k: 2 }, { t: 'e', p: [30, 22 + open * 2, 0], r: [12, 4, 7], m: 1, k: 1 },
      { t: 'e', p: [32, 18, 0], r: [11, 6, 8], m: 0 }, { t: 'e', p: [30, 20 + open * 3, 3], r: [9, 1 + open * 3, 4], m: 3 },
      { t: 'c', a: [36, 15, 5], b: [38, 23 + open * 2, 5], r: 0.8, r2: 0.2, m: 4 }, { t: 'c', a: [32, 15, 6], b: [33, 22 + open * 2, 6], r: 0.8, r2: 0.2, m: 4 },
      { t: 's', p: [26, 13, 8], r: 2.4, m: 2 },
      { t: 'c', a: [10, 8, 0], b: [2, 0, 0], r: 3, r2: 0.6, m: 1 }, { t: 'c', a: [14, 6, 0], b: [10, -2, 0], r: 2.5, r2: 0.5, m: 1 }], 48, 36, M, { rim: [160, 255, 230] });
    return { head: [head(0), head(1)], seg: [model([{ t: 's', p: [10, 10, 0], r: 8, m: 0 }, { t: 'e', p: [10, 13, 3], r: [6, 3, 4], m: 1 }, { t: 'c', a: [10, 3, 0], b: [6, -2, 0], r: 2, r2: 0.4, m: 5 }], 20, 20, M)],
      tail: [model([{ t: 'c', a: [4, 10, 0], b: [18, 10, 0], r: 5, r2: 1, m: 0 }, { t: 'e', p: [18, 10, 0], r: [3, 8, 1], m: 1 }], 24, 20, M)] };
  },
  colossus() {
    const M = [m('#d8b080', { spec: .5 }), m('#80d8f0', { spec: 1.5 }), m('#ff6040', { emit: true, n: 3 }), m('#6a4a3a'), m('#fff0b0', { emit: true, n: 3 })];
    const head = (glow) => model([
      { t: 'b', p: [32, 34, -4], s: [26, 22, 10], r: 8, m: 3 },
      { t: 'e', p: [32, 32, 0], r: [20, 24, 14], m: 0, k: 3 }, { t: 'c', a: [32, 8, 4], b: [32, 0, 2], r: 6, r2: 1, m: 1 },
      { t: 'c', a: [12, 14, 0], b: [2, 2, 0], r: 4, r2: 1, m: 1 }, { t: 'c', a: [52, 14, 0], b: [62, 2, 0], r: 4, r2: 1, m: 1 },
      { t: 'e', p: [24, 30, 11], r: [5, 3, 2], m: glow ? 2 : 3 }, { t: 'e', p: [40, 30, 11], r: [5, 3, 2], m: glow ? 2 : 3 },
      { t: 'e', p: [32, 44, 11], r: [6, 2 + glow * 2, 2], m: glow ? 4 : 3 }, { t: 'c', a: [32, 33, 13], b: [32, 39, 13], r: 1.6, m: 0 }], 64, 64, M, { rim: [255, 220, 160] });
    const hand = (fist) => model(fist ? [
      { t: 'e', p: [18, 16, 0], r: [13, 11, 9], m: 0 }, ...range(4).map(k => ({ t: 's', p: [10 + k * 5, 24, 6], r: 3.2, m: 0, k: 1 })), { t: 'e', p: [18, 14, 6], r: [7, 5, 3], m: 1 }]
      : [{ t: 'e', p: [18, 12, 0], r: [13, 8, 7], m: 0 }, ...range(4).map(k => ({ t: 'c', a: [8 + k * 6, 16, 2], b: [6 + k * 7, 29, 3], r: 2.6, r2: 2, m: 0, k: 1 })), { t: 'e', p: [18, 10, 5], r: [7, 4, 3], m: 1 }],
    36, 32, M, { rim: [255, 220, 160] });
    return { head: [head(0), head(1)], hand: [hand(0), hand(1)] };
  },
  horologe() {
    const M = [m('#b08a40', { spec: 1 }), m('#f0e6c8'), m('#3a2a20'), m('#ff4040', { emit: true, n: 3 }), m('#ffd070', { emit: true, n: 3 })];
    const P = [{ t: 'y', p: [48, 48, -2], r: 44, hz: 5, m: 0 }, { t: 'y', p: [48, 48, 2], r: 38, hz: 2, m: 1 }, { t: 't', p: [48, 48, 3], R: 39, r: 2.5, m: 0 }];
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P.push({ t: k % 3 ? 's' : 'b', p: [48 + C(a) * 32, 48 + S(a) * 32, 4.5], r: 2, s: [1.6, 4, 1], rot: a + Math.PI / 2, m: 2 }); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; P.push({ t: 'b', p: [48 + C(a) * 46, 48 + S(a) * 46, -2], s: [3.5, 2.5, 4], rot: a, r: 0.8, m: 0 }); }
    const face = model(P, 96, 96, M, { rim: [255, 200, 120] });
    const core = [0, 1].map(o => model([{ t: 's', p: [10, 10, 0], r: 6 + o, m: o ? 4 : 3 }, { t: 't', p: [10, 10, 2], R: 7, r: 1.5, m: 0 }], 20, 20, M));
    const hand = (len, w) => model([{ t: 'b', p: [len / 2 + 2, 6, 0], s: [len / 2, w, 2], r: 1, m: 2 }, { t: 'c', a: [len - 6, 6, 1], b: [len + 2, 6, 1], r: w + 2, r2: 0.5, m: 0 }, { t: 's', p: [4, 6, 2], r: 4, m: 0 }], len + 6, 12, M);
    return { face: [face], core, hour: [hand(52, 2.6)], minute: [hand(70, 1.8)] };
  },
  eclipse() {
    const M = [m('#2a1a40', { spec: 1.2 }), m('#ffd070', { spec: 1.5 }), m('#ff5ab0', { emit: true, n: 3 }), m('#8a6ad0', { spec: 1 }), m('#6a1a3a'), m('#fff0d0', { emit: true, n: 3 })];
    const king = (arm, cape) => model([
      { t: 'c', a: [22, 20, -5], b: [10 - cape * 6, 54, -7], r: 6, r2: 14, m: 4, k: 2 },
      { t: 'c', a: [17, 34, -2], b: [15, 52, -2], r: 3, m: 0 }, { t: 'c', a: [25, 34, 2], b: [27, 52, 2], r: 3, m: 0 },
      { t: 'e', p: [21, 27, 0], r: [9, 11, 7], m: 0, k: 2 }, { t: 'e', p: [21, 25, 4], r: [6, 6, 3], m: 3 },
      { t: 's', p: [22, 12, 0], r: 6.5, m: 0 }, { t: 'b', p: [25, 12, 5.6], s: [4, 0.8, 1], m: 2 },
      ...range(5).map(k => ({ t: 'c', a: [16 + k * 3, 7, 0], b: [14 + k * 4, -3 + Math.abs(k - 2), 0], r: 1.2, r2: 0.3, m: 1 })),
      { t: 'c', a: [28, 20, 5], b: [33 + arm * 6, 26 - arm * 14, 6], r: 2.6, m: 3 },
      { t: 'c', a: [33 + arm * 6, 26 - arm * 14, 7], b: [38 + arm * 2, 50 - arm * 46, 7], r: 1.6, r2: 0.8, m: 5 },
    ], 48, 58, M, { rim: [255, 110, 180] });
    const fist = model([{ t: 'e', p: [16, 16, 0], r: [12, 10, 9], m: 0 }, ...range(4).map(k => ({ t: 's', p: [9 + k * 5, 22, 6], r: 3, m: 3, k: 1 })), { t: 's', p: [16, 12, 7], r: 3, m: 2 }], 32, 32, M, { rim: [255, 110, 180] });
    const orbM = [m('#120818'), m('#fff0c0', { emit: true })];
    const sun = model([{ t: 's', p: [48, 48, 0], r: 40, m: 0 }, { t: 't', p: [48, 48, 0], R: 41, r: 2.5, m: 1 }], 96, 96, orbM, { outline: false, ambient: 0.4 });
    return { king: [king(0, 0), king(0.5, 0.3), king(1, 0.6)], fist: [fist], sun: [sun] };
  },
};

export function buildCreatures() {
  const out = { enemy: {}, boss: {} };
  const pack = (src) => { const R = src, L = {}, Wt = {}; for (const k in R) { L[k] = R[k].map(flipH); Wt[k] = R[k].map(f => silhouette(f, [255, 255, 255])).concat(L[k].map(f => silhouette(f, [255, 255, 255]))); } return { R, L, W: Wt }; };
  for (const k in ENEMY) if (ENEMY[k]) out.enemy[k] = pack(ENEMY[k]());
  for (const k in BOSS) out.boss[k] = pack(BOSS[k]());
  return out;
}
