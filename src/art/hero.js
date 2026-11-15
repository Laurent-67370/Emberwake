// Ione, the bell-keeper. Modelled from primitives, posed per frame, rendered
// with the SDF modeller. Sprite frames are 32x32, feet at y=31, facing right.
import { model, ramp, flipH, silhouette } from '../gfx.js';

const M = {
  skin: 0, hair: 1, cloak: 2, cloakIn: 3, scarf: 4, boot: 5, steel: 6, gold: 7, eye: 8, glow: 9, tunic: 10,
};
export const heroMats = [
  { ramp: ramp('#e7ad84', 5) },
  { ramp: ramp('#4a2d4f', 5) },
  { ramp: ramp('#2a6a8c', 6) },
  { ramp: ramp('#173a54', 4) },
  { ramp: ramp('#f0a23a', 5) },
  { ramp: ramp('#5b3a2c', 4) },
  { ramp: ramp('#b9c8dc', 6), spec: 1.2 },
  { ramp: ramp('#e2b23e', 5), spec: 0.8 },
  { ramp: [[20, 12, 28], [28, 20, 44]] },
  { ramp: ramp('#ffe08a', 4), emit: true },
  { ramp: ramp('#e7e0d0', 5) },
];

const rad = d => d * Math.PI / 180;
function limb(ox, oy, z, a1, l1, a2, l2) {
  // angles in degrees, 0 = down, positive = forward (+x)
  const kx = ox + Math.sin(rad(a1)) * l1, ky = oy + Math.cos(rad(a1)) * l1;
  const fx = kx + Math.sin(rad(a1 + a2)) * l2, fy = ky + Math.cos(rad(a1 + a2)) * l2;
  return { o: [ox, oy, z], k: [kx, ky, z], f: [fx, fy, z] };
}

// pose: { bob, lean, legF:[hip,knee], legB:[hip,knee], armF:[sh,el], armB:[sh,el],
//         sword:angle|null (deg, 0 = pointing forward/right), swordLen, cape (flow back),
//         squash (y scale), glow }
export function heroPrims(p) {
  const P = [];
  const bob = p.bob || 0, lean = p.lean || 0;
  const hipX = 16, hipY = 21.5 + bob;
  const shX = 16 + lean * 0.8, shY = 13.5 + bob;
  const cape = p.cape ?? 0.3;
  // back leg & arm first (far side, z<0)
  const lb = limb(hipX - 0.5, hipY, -2, p.legB[0], 4.8, p.legB[1], 4.6);
  P.push({ t: 'c', a: lb.o, b: lb.k, r: 1.9, m: M.tunic });
  P.push({ t: 'c', a: lb.k, b: lb.f, r: 1.7, r2: 1.9, m: M.boot });
  P.push({ t: 'e', p: [lb.f[0] + 1.2, lb.f[1] + 0.2, -2], r: [2.3, 1.3, 1.6], m: M.boot });
  const ab = limb(shX - 0.5, shY + 0.5, -3, p.armB[0], 3.8, p.armB[1], 3.6);
  P.push({ t: 'c', a: ab.o, b: ab.k, r: 1.5, m: M.cloakIn });
  P.push({ t: 'c', a: ab.k, b: ab.f, r: 1.3, m: M.skin });
  // cloak: a flared cone behind the body that streams back with speed
  P.push({ t: 'c', a: [shX - 0.5, shY - 0.5, -1.5], b: [hipX - 3.5 - cape * 7, hipY + 2.5 - cape * 3, -2.2], r: 3.2, r2: 5.2, m: M.cloak, k: 1.2 });
  P.push({ t: 'c', a: [shX - 2, shY + 2, -2.6], b: [hipX - 5 - cape * 9, hipY + 1 - cape * 5, -2.8], r: 2, r2: 3.6, m: M.cloakIn, k: 1.5 });
  // torso & tunic
  P.push({ t: 'e', p: [16 + lean * 0.5, 17.5 + bob, 0], r: [3.6, 4.8, 3.2], m: M.tunic, k: 1.5 });
  P.push({ t: 'b', p: [16 + lean * 0.3, 20 + bob, 0.3], s: [3.7, 0.9, 3.3], r: 0.5, m: M.boot });   // belt
  P.push({ t: 's', p: [12.6, 21.2 + bob, -2.8], r: 1.8, m: M.glow });                              // bell-lantern
  P.push({ t: 's', p: [12.6, 19.3 + bob, -2.8], r: 0.9, m: M.gold });
  // front leg
  const lf = limb(hipX + 0.5, hipY, 2, p.legF[0], 4.8, p.legF[1], 4.6);
  P.push({ t: 'c', a: lf.o, b: lf.k, r: 1.9, m: M.tunic });
  P.push({ t: 'c', a: lf.k, b: lf.f, r: 1.7, r2: 1.9, m: M.boot });
  P.push({ t: 'e', p: [lf.f[0] + 1.2, lf.f[1] + 0.2, 2], r: [2.3, 1.3, 1.6], m: M.boot });
  // head, hood, face
  const hx = 16.5 + lean, hy = 8.5 + bob;
  P.push({ t: 's', p: [hx, hy, 0.4], r: 4.1, m: M.skin });
  P.push({ t: 's', p: [hx - 1.2, hy - 0.9, -0.6], r: 4.3, m: M.hair, k: 0.6 });
  P.push({ t: 'c', a: [hx - 1.5, hy - 2.5, -0.5], b: [hx - 4.5 - cape * 3, hy + 0.5, -1.5], r: 2.2, r2: 1.2, m: M.hair, k: 1 });
  P.push({ t: 's', p: [hx + 2.1, hy + 0.3, 3.2], r: 0.85, m: M.eye });
  // scarf with a tail streaming behind
  P.push({ t: 't', p: [16 + lean * 0.8, 12.6 + bob, 0], R: 2.6, r: 1.4, m: M.scarf });
  P.push({ t: 'c', a: [14.5 + lean, 12.6 + bob, -2], b: [10 - cape * 5, 13.5 + bob - cape * 2 + Math.sin((p.flap || 0)) * 1.2, -2.5], r: 1.4, r2: 0.9, m: M.scarf });
  // front arm + sword
  const af = limb(shX + 0.5, shY + 0.5, 3, p.armF[0], 3.8, p.armF[1], 3.6);
  P.push({ t: 'c', a: af.o, b: af.k, r: 1.6, m: M.cloak });
  P.push({ t: 'c', a: af.k, b: af.f, r: 1.35, m: M.skin });
  if (p.sword !== null && p.sword !== undefined) {
    const a = rad(p.sword), len = p.swordLen || 11;
    const dx = Math.cos(a), dy = Math.sin(a);
    const hx2 = af.f[0], hy2 = af.f[1];
    P.push({ t: 'c', a: [hx2 - dx * 2, hy2 - dy * 2, 3.5], b: [hx2 + dx * 1.2, hy2 + dy * 1.2, 3.5], r: 0.9, m: M.boot });
    P.push({ t: 'b', p: [hx2 + dx * 1.4, hy2 + dy * 1.4, 3.5], s: [0.8, 2.6, 0.9], rot: a, r: 0.3, m: M.gold });
    P.push({ t: 'c', a: [hx2 + dx * 2, hy2 + dy * 2, 3.6], b: [hx2 + dx * len, hy2 + dy * len, 3.6], r: 1.25, r2: 0.55, m: M.steel });
  }
  return P;
}

// Pose library ----------------------------------------------------------------
const idle = i => ({ bob: Math.sin(i / 4 * Math.PI * 2) * 0.5, lean: 0, legF: [8, 0], legB: [-6, 4], armF: [10, -50], armB: [-8, -20], sword: -70, swordLen: 10, cape: 0.15, flap: i });
const run = i => {
  const ph = i / 8 * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
  return { bob: -Math.abs(c) * 1.2 + 0.6, lean: 1.6, legF: [s * 38, Math.max(0, -c) * 60 + 6], legB: [-s * 38, Math.max(0, c) * 60 + 6],
    armF: [-s * 30 + 30, -70], armB: [s * 35 - 5, -30], sword: -35 - s * 10, swordLen: 10, cape: 0.7, flap: ph * 2 };
};
const P = {
  jump: { bob: -1, lean: 0.8, legF: [35, 55], legB: [-10, 25], armF: [60, -70], armB: [-40, -40], sword: -60, cape: 0.2, flap: 1 },
  fall: { bob: 0, lean: 0.4, legF: [20, 20], legB: [-20, 30], armF: [100, -40], armB: [-80, -20], sword: -20, cape: 1.0, flap: 2 },
  land: { bob: 2.5, lean: 1, legF: [40, 70], legB: [-25, 60], armF: [30, -40], armB: [-20, -20], sword: -10, cape: 0.4 },
  wall: { bob: 0, lean: -0.5, legF: [30, 40], legB: [10, 50], armF: [150, -30], armB: [120, -20], sword: 100, cape: -0.2 },
  dash: { bob: 1.5, lean: 3.5, legF: [55, 30], legB: [-45, 40], armF: [-30, -20], armB: [-70, -10], sword: 170, swordLen: 9, cape: 1.4, flap: 3 },
  hurt: { bob: 0, lean: -2, legF: [-10, 30], legB: [-30, 20], armF: [-60, -30], armB: [-90, -10], sword: -120, cape: 0, flap: 4 },
  charge: { bob: 1, lean: -0.5, legF: [25, 20], legB: [-25, 15], armF: [80, -10], armB: [60, -20], sword: -90, swordLen: 10, cape: 0.2 },
  shoot: { bob: 0.5, lean: 1, legF: [25, 20], legB: [-25, 15], armF: [90, 0], armB: [-40, -30], sword: 0, swordLen: 11, cape: 0.3 },
};
// Slashes: three-hit combo, air slash, downward thrust, upward slash
const slash = (from, to, n, base) => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1);
  return { ...base, sword: from + (to - from) * t, armF: [base.armF0 + (base.armF1 - base.armF0) * t, -15], swordLen: 13 };
});
const S1 = { bob: 1, lean: 1.5, legF: [30, 20], legB: [-25, 15], armB: [-30, -30], cape: 0.4, armF0: 160, armF1: 40 };
const S2 = { bob: 1, lean: 2, legF: [35, 25], legB: [-30, 20], armB: [-50, -30], cape: 0.5, armF0: 30, armF1: 150 };
const S3 = { bob: 2, lean: 2.6, legF: [45, 35], legB: [-35, 30], armB: [-60, -20], cape: 0.8, armF0: 175, armF1: 70 };

export function buildHero() {
  const frames = {};
  const add = (name, poses) => { frames[name] = poses.map(p => model(heroPrims(p), 32, 32, heroMats, { rim: [255, 214, 140] })); };
  add('idle', [0, 1, 2, 3].map(idle));
  add('run', [0, 1, 2, 3, 4, 5, 6, 7].map(run));
  for (const k of Object.keys(P)) add(k, [P[k]]);
  add('slash1', slash(-120, 40, 4, S1));
  add('slash2', slash(60, -100, 4, S2));
  add('slash3', slash(-150, 60, 5, S3));
  add('air', slash(-140, 90, 4, { ...S1, legF: [40, 50], legB: [-10, 40], bob: -1 }));
  add('down', [{ ...P.jump, sword: 90, swordLen: 14, armF: [20, -10], legF: [30, 70], legB: [-20, 70] }]);
  add('up', slash(30, -90, 4, { ...S2, armF0: 120, armF1: 170 }));
  const out = { R: frames, L: {}, W: {} };
  for (const k in frames) { out.L[k] = frames[k].map(flipH); out.W[k] = frames[k].map(f => silhouette(f, [255, 255, 255])); }
  for (const k in frames) out.W[k] = out.W[k].concat(out.W[k].map(flipH)); // R then L
  return out;
}
