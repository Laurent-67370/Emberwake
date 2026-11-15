// DOM-free helpers shared by the game and the Node tools.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
export const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
