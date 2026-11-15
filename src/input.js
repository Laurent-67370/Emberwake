// Input: keyboard, gamepad and on-screen touch pad, merged into one SNES-style
// joypad state. `held`, `pressed` (this frame) and `released` per button.
const BTN = ['up', 'down', 'left', 'right', 'jump', 'attack', 'dash', 'shoot', 'start', 'select'];
export const held = {}, pressed = {}, released = {};
for (const b of BTN) held[b] = pressed[b] = released[b] = false;

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyZ: 'jump', Space: 'jump', KeyK: 'jump', KeyX: 'attack', KeyJ: 'attack', KeyC: 'dash', KeyL: 'dash', ShiftLeft: 'dash',
  KeyV: 'shoot', KeyI: 'shoot', Enter: 'start', Escape: 'start', KeyP: 'start', Backspace: 'select',
};
const kb = {}, touch = {}, native = {};
// Android shell (android/): physical controller buttons arrive here from Kotlin.
window.__nativeKey = (b, down) => { if (b in held) native[b] = !!down; };
window.__nativePause = () => { native.start = true; setTimeout(() => native.start = false, 80); };
export function rumble(ms) { try { if (window.SunkeeperNative) window.SunkeeperNative.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no haptics */ } }
let pad = {};
export const bot = {}; // filled by the play-testing bot

addEventListener('keydown', e => { const b = KEYS[e.code]; if (b) { kb[b] = true; e.preventDefault(); } });
addEventListener('keyup', e => { const b = KEYS[e.code]; if (b) { kb[b] = false; e.preventDefault(); } });
addEventListener('blur', () => { for (const k in kb) kb[k] = false; });

function readPad() {
  pad = {};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) {
    if (!g) continue;
    const b = i => g.buttons[i] && g.buttons[i].pressed;
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    pad.left ||= b(14) || ax < -0.4; pad.right ||= b(15) || ax > 0.4;
    pad.up ||= b(12) || ay < -0.5; pad.down ||= b(13) || ay > 0.5;
    pad.jump ||= b(0); pad.attack ||= b(2); pad.dash ||= b(1) || b(5) || b(7); pad.shoot ||= b(3) || b(4) || b(6);
    pad.start ||= b(9); pad.select ||= b(8);
  }
}

export let lastDevice = 'keys';
export function poll() {
  readPad();
  for (const b of BTN) {
    const now = !!(kb[b] || pad[b] || touch[b] || bot[b] || native[b]);
    pressed[b] = now && !held[b];
    released[b] = !now && held[b];
    held[b] = now;
  }
  if (Object.values(pad).some(Boolean)) lastDevice = 'pad';
}
export function clearPressed() { for (const b of BTN) pressed[b] = false; }

// ------------------------------------------------------------ touch overlay
// A D-pad on the left and four face buttons on the right, drawn in HTML so it
// stays crisp at any phone resolution. Multi-touch aware.
export function setupTouch() {
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!coarse) return;
  document.body.classList.add('touch');
  const css = document.createElement('style');
  css.textContent = `
  .tp{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));z-index:5;touch-action:none;user-select:none;-webkit-user-select:none}
  .tp div{position:absolute;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.28);
    color:rgba(255,255,255,.75);font:700 15px system-ui;display:flex;align-items:center;justify-content:center}
  .tp div.on{background:rgba(255,220,140,.4)}
  #tpL{left:max(14px,env(safe-area-inset-left));width:150px;height:150px}
  #tpL div{width:52px;height:52px;border-radius:12px}
  #tpR{right:max(14px,env(safe-area-inset-right));width:170px;height:150px}
  #tpR div{width:62px;height:62px}
  #tpS{position:fixed;top:max(10px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right));z-index:5;
    padding:6px 16px;border-radius:14px;background:rgba(255,255,255,.12);color:#fff;font:600 12px system-ui;touch-action:none}
  body.touch #help{display:none}`;
  document.head.appendChild(css);
  const mk = (id, items) => {
    const box = document.createElement('div'); box.className = 'tp'; box.id = id;
    for (const [b, label, x, y] of items) { const d = document.createElement('div'); d.dataset.b = b; d.textContent = label; d.style.left = x + 'px'; d.style.top = y + 'px'; box.appendChild(d); }
    document.body.appendChild(box); return box;
  };
  const L = mk('tpL', [['up', '▲', 49, 0], ['left', '◀', 0, 49], ['right', '▶', 98, 49], ['down', '▼', 49, 98]]);
  const R = mk('tpR', [['attack', 'X', 0, 50], ['jump', 'A', 54, 88], ['dash', 'B', 108, 50], ['shoot', 'Y', 54, 0]]);
  const S = document.createElement('div'); S.id = 'tpS'; S.textContent = 'START'; document.body.appendChild(S);
  const active = new Map();
  const update = () => {
    for (const k in touch) touch[k] = false;
    for (const b of active.values()) for (const x of b) touch[x] = true;
    for (const d of document.querySelectorAll('.tp div')) d.classList.toggle('on', !!touch[d.dataset.b]);
  };
  const hitL = (t) => { // D-pad by direction from centre, allows diagonals
    const r = L.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = t.clientX - cx, dy = t.clientY - cy, out = [];
    if (Math.hypot(dx, dy) < 14) return out;
    if (dx < -18) out.push('left'); if (dx > 18) out.push('right'); if (dy < -22) out.push('up'); if (dy > 22) out.push('down');
    return out;
  };
  const hitR = (t) => {
    let best = null, bd = 1e9;
    for (const d of R.children) { const r = d.getBoundingClientRect(); const dd = Math.hypot(t.clientX - (r.left + r.width / 2), t.clientY - (r.top + r.height / 2)); if (dd < bd) { bd = dd; best = d.dataset.b; } }
    return bd < 60 ? [best] : [];
  };
  const handler = (zone, fn) => {
    const h = e => { e.preventDefault(); for (const t of e.changedTouches) { if (e.type === 'touchend' || e.type === 'touchcancel') active.delete(t.identifier); else active.set(t.identifier, fn(t)); } update(); };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) zone.addEventListener(ev, h, { passive: false });
  };
  handler(L, hitL); handler(R, hitR); handler(S, () => ['start']);
}
