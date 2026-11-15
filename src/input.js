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
const kb = {}, touch = {}, native = {}, latch = {};
// Android shell (android/): physical controller buttons arrive here from Kotlin.
window.__nativeKey = (b, down) => { if (b in held) { if (down && !native[b]) latch[b] = true; native[b] = !!down; } };
window.__nativePause = () => { native.start = true; setTimeout(() => native.start = false, 80); };
export function rumble(ms) { try { if (window.SunkeeperNative) window.SunkeeperNative.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no haptics */ } }
let pad = {};
export const bot = {}; // filled by the play-testing bot

addEventListener('keydown', e => { const b = KEYS[e.code]; if (b) { if (!kb[b]) latch[b] = true; kb[b] = true; e.preventDefault(); } });
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
    const down = !!(kb[b] || pad[b] || touch[b] || bot[b] || native[b]);
    const now = down || !!latch[b];
    latch[b] = false;
    pressed[b] = now && !held[b];
    released[b] = !now && held[b];
    held[b] = now;
  }
  if (Object.values(pad).some(Boolean)) lastDevice = 'pad';
}
export function clearPressed() { for (const b of BTN) pressed[b] = false; }

// ------------------------------------------------------------ touch overlay
// A D-pad on the left and four face buttons on the right. One document-level
// listener rebuilds the whole state from *every* finger on each touch event
// (e.touches), so two simultaneous presses register on the same frame and a
// finger sliding between buttons never leaves a key stuck. A thumb resting
// between two face buttons presses both, as on a real pad.
export function setupTouch() {
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!coarse) return;
  document.body.classList.add('touch');
  const css = document.createElement('style');
  css.textContent = `
  .tp{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:none}
  .tp div{position:absolute;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.28);
    color:rgba(255,255,255,.75);font:700 15px system-ui;display:flex;align-items:center;justify-content:center}
  .tp div.on{background:rgba(255,220,140,.45);border-color:rgba(255,230,170,.8)}
  #tpL{left:max(14px,env(safe-area-inset-left));width:150px;height:150px}
  #tpL div{width:52px;height:52px;border-radius:12px}
  #tpR{right:max(14px,env(safe-area-inset-right));width:180px;height:156px}
  #tpR div{width:66px;height:66px}
  #tpS{position:fixed;top:max(10px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right));z-index:5;
    padding:8px 18px;border-radius:14px;background:rgba(255,255,255,.12);color:#fff;font:600 12px system-ui;pointer-events:none}
  #tpS.on{background:rgba(255,220,140,.45)}
  html.touch, body.touch{touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  body.touch #help{display:none}`;
  document.head.appendChild(css);
  document.documentElement.classList.add('touch');
  const mk = (id, items) => {
    const box = document.createElement('div'); box.className = 'tp'; box.id = id;
    for (const [b, label, x, y] of items) { const d = document.createElement('div'); d.dataset.b = b; d.textContent = label; d.style.left = x + 'px'; d.style.top = y + 'px'; box.appendChild(d); }
    document.body.appendChild(box); return box;
  };
  const L = mk('tpL', [['up', '▲', 49, 0], ['left', '◀', 0, 49], ['right', '▶', 98, 49], ['down', '▼', 49, 98]]);
  const R = mk('tpR', [['attack', 'X', 0, 48], ['jump', 'A', 57, 90], ['dash', 'B', 114, 48], ['shoot', 'Y', 57, 0]]);
  const S = document.createElement('div'); S.id = 'tpS'; S.textContent = 'START'; document.body.appendChild(S);
  const els = [...document.querySelectorAll('.tp div'), S];

  // geometry is cached and refreshed on resize/rotation (no layout reads per event)
  let geo = null;
  const measure = () => {
    const l = L.getBoundingClientRect(), s = S.getBoundingClientRect();
    geo = {
      dpad: { x: l.left + l.width / 2, y: l.top + l.height / 2 },
      split: innerWidth / 2,
      btns: [...R.children].map(d => { const r = d.getBoundingClientRect(); return { b: d.dataset.b, x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }),
      start: { x0: s.left - 12, x1: s.right + 12, y0: s.top - 12, y1: s.bottom + 12 },
    };
  };
  addEventListener('resize', () => setTimeout(measure, 50));
  addEventListener('orientationchange', () => setTimeout(measure, 200));
  measure();

  const dpad = (x, y, out) => {
    const dx = x - geo.dpad.x, dy = y - geo.dpad.y;
    const r = Math.hypot(dx, dy); if (r < 12 || r > 125) return;
    const a = Math.atan2(dy, dx), oct = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; // 8 directions
    if (oct === 7 || oct === 0 || oct === 1) out.right = true;
    if (oct >= 3 && oct <= 5) out.left = true;
    if (oct >= 5 && oct <= 7) out.up = true;
    if (oct >= 1 && oct <= 3) out.down = true;
  };
  const face = (x, y, out) => {
    let best = null, bd = 1e9;
    const d = geo.btns.map(B => { const v = Math.hypot(x - B.x, y - B.y); if (v < bd) { bd = v; best = B; } return v; });
    if (!best || bd > best.r * 1.9) return;
    out[best.b] = true;
    // thumb between two buttons: press the neighbour too
    geo.btns.forEach((B, i) => { if (B !== best && d[i] < B.r * 1.25 && d[i] - bd < B.r * 0.55) out[B.b] = true; });
  };
  let prev = {};
  const handle = e => {
    if (e.cancelable) e.preventDefault();
    initAudioHook && initAudioHook();
    const out = {};
    for (const t of e.touches) {
      const x = t.clientX, y = t.clientY, st = geo.start;
      if (x >= st.x0 && x <= st.x1 && y >= st.y0 && y <= st.y1) out.start = true;
      else if (x < geo.split) dpad(x, y, out);
      else face(x, y, out);
    }
    for (const k of BTN) {
      const on = !!out[k];
      if (on && !prev[k]) { latch[k] = true; buzz = true; }
      touch[k] = on;
    }
    if (buzz) { buzz = false; tick(); }
    prev = out;
    for (const el of els) el.classList.toggle('on', el === S ? !!out.start : !!out[el.dataset.b]);
  };
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.addEventListener(ev, handle, { passive: false, capture: true });
  // contextmenu / long-press selection would otherwise steal a held button
  document.addEventListener('contextmenu', e => e.preventDefault());
}
let buzz = false, initAudioHook = null;
export function onFirstTouch(fn) { initAudioHook = fn; }
function tick() { try { if (window.SunkeeperNative) window.SunkeeperNative.vibrate(8); else if (navigator.vibrate) navigator.vibrate(6); } catch (e) { /* no haptics */ } }
