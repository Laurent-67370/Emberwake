// "PPU" — a small model of the Super Nintendo picture unit on top of canvas 2D.
// 256x224 back buffer, per-scanline post effects (HDMA-style offsets), colour
// math (add / subtract / half blending), master brightness, mosaic, windows,
// and a Mode 7 affine/perspective plane renderer.

export const W = 256, H = 224;

const screen = document.getElementById('screen');
const sctx = screen.getContext('2d', { alpha: false });
sctx.imageSmoothingEnabled = false;

export const back = makeCanvas(W, H);
export const ctx = back.getContext('2d');
ctx.imageSmoothingEnabled = false;

const m7 = makeCanvas(W, H);
const m7ctx = m7.getContext('2d');
const m7img = m7ctx.createImageData(W, H);
const m7buf = new Uint32Array(m7img.data.buffer);

const mos = makeCanvas(W, H);
const mosctx = mos.getContext('2d');
mosctx.imageSmoothingEnabled = false;

export function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && !window.__noOffscreen
    ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c;
}

// --- integer scaling of the output -------------------------------------------
function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / W, (innerHeight - 24) / H)));
  screen.style.width = W * s + 'px';
  screen.style.height = H * s + 'px';
}
addEventListener('resize', fit); fit();

// --- per-frame registers ------------------------------------------------------
export const regs = {
  brightness: 15,          // INIDISP 0..15
  mosaic: 0,               // 0..15 block size-1
  lineOffset: null,        // function(y) -> horizontal pixel offset (HDMA scroll)
  lineOffsetFrom: 0,       // only apply below this line (e.g. water surface)
  tint: null,              // [r,g,b,a] fixed-colour add over everything (color math)
  iris: null,              // {x,y,r} circular window transition
};

export function resetRegs() {
  regs.brightness = 15; regs.mosaic = 0; regs.lineOffset = null; regs.lineOffsetFrom = 0;
  regs.tint = null; regs.iris = null;
}

// Present back buffer to the screen applying scanline + global effects.
export function present() {
  let src = back;
  if (regs.mosaic > 0) {
    const b = regs.mosaic + 1, w = Math.ceil(W / b), h = Math.ceil(H / b);
    mosctx.clearRect(0, 0, W, H);
    mosctx.drawImage(back, 0, 0, W, H, 0, 0, w, h);
    mosctx.drawImage(mos, 0, 0, w, h, 0, 0, w * b, h * b);
    src = mos;
  }
  if (regs.lineOffset) {
    const from = regs.lineOffsetFrom | 0;
    if (from > 0) sctx.drawImage(src, 0, 0, W, from, 0, 0, W, from);
    for (let y = from; y < H; y++) {
      const o = Math.round(regs.lineOffset(y));
      sctx.drawImage(src, 0, y, W, 1, o, y, W, 1);
      if (o > 0) sctx.drawImage(src, W - o, y, o, 1, 0, y, o, 1);
      else if (o < 0) sctx.drawImage(src, 0, y, -o, 1, W + o, y, -o, 1);
    }
  } else {
    sctx.drawImage(src, 0, 0);
  }
  if (regs.tint) {
    const [r, g, b, a] = regs.tint;
    sctx.globalCompositeOperation = 'lighter';
    sctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    sctx.fillRect(0, 0, W, H);
    sctx.globalCompositeOperation = 'source-over';
  }
  if (regs.iris) {
    const { x, y, r } = regs.iris;
    sctx.fillStyle = '#000';
    sctx.beginPath();
    sctx.rect(0, 0, W, H);
    sctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2, true);
    sctx.fill('evenodd');
  }
  if (regs.brightness < 15) {
    sctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, regs.brightness) / 15})`;
    sctx.fillRect(0, 0, W, H);
  }
}

// --- HDMA-style vertical gradient (one colour per scanline band) -------------
export function gradient(y0, y1, stops, step = 2) {
  // stops: array of [t, r, g, b]; quantised to 15-bit colour like CGRAM
  for (let y = y0; y < y1; y += step) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const a = stops[i], b = stops[i + 1];
    const k = Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const r = q5(a[1] + (b[1] - a[1]) * k), g = q5(a[2] + (b[2] - a[2]) * k), bl = q5(a[3] + (b[3] - a[3]) * k);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.fillRect(0, y, W, step);
  }
}
export const q5 = v => (Math.max(0, Math.min(255, v)) >> 3) << 3; // 5 bits per channel

// --- Mode 7 -------------------------------------------------------------------
// tex: {size, data:Uint32Array(size*size)} ; wraps.  cam: {x,y,angle,height,horizon,fov}
// fog: [r,g,b] distance fade colour.  Draws into the back buffer below cam.horizon.
export function mode7(tex, cam, fog, opts = {}) {
  const { size, data } = tex, mask = size - 1;
  const hz = cam.horizon | 0;
  const cos = Math.cos(cam.angle), sin = Math.sin(cam.angle);
  const fov = cam.fov || 1.0;
  const fr = fog[0], fg = fog[1], fb = fog[2];
  const wrap = opts.wrap !== false;
  const fill = opts.fill || 0;
  m7buf.fill(0, 0, W * H);
  for (let y = hz + 1; y < H; y++) {
    const dy = y - hz;
    const z = (cam.height * 128) / dy;            // distance along view axis
    const scale = (z * fov) / 128;
    // left edge of the scanline in world space
    const lx = cam.x + cos * z - sin * (-W / 2) * scale;
    const ly = cam.y + sin * z + cos * (-W / 2) * scale;
    const stepx = -sin * scale, stepy = cos * scale;
    let fogk = Math.min(1, z / (opts.fogDist || 900));
    fogk = fogk * fogk;
    const ik = 1 - fogk;
    const fogR = fr * fogk, fogG = fg * fogk, fogB = fb * fogk;
    let wx = lx, wy = ly, o = y * W;
    for (let x = 0; x < W; x++, wx += stepx, wy += stepy) {
      let c;
      const tx = wx | 0, ty = wy | 0;
      if (wrap) c = data[(ty & mask) * size + (tx & mask)];
      else c = (tx < 0 || ty < 0 || tx >= size || ty >= size) ? fill : data[ty * size + tx];
      const r = (c & 255) * ik + fogR, g = ((c >> 8) & 255) * ik + fogG, b = ((c >> 16) & 255) * ik + fogB;
      m7buf[o + x] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  m7ctx.putImageData(m7img, 0, 0, 0, hz + 1, W, H - hz - 1);
  ctx.drawImage(m7, 0, hz + 1, W, H - hz - 1, 0, hz + 1, W, H - hz - 1);
}

// Project a world point through the same Mode 7 camera -> screen {x,y,scale} or null.
export function mode7Project(cam, px, py) {
  const dx = px - cam.x, dy = py - cam.y;
  const cos = Math.cos(cam.angle), sin = Math.sin(cam.angle);
  const z = dx * cos + dy * sin;          // forward
  const s = -dx * sin + dy * cos;         // sideways
  if (z < 8) return null;
  const fov = cam.fov || 1.0;
  const scale = (z * fov) / 128;
  const sx = W / 2 + s / scale;
  const sy = cam.horizon + (cam.height * 128) / z;
  return { x: sx, y: sy, scale: 1 / scale };
}

// Rotated / scaled bitmap (Mode 7 used as a single big rotating sprite, e.g. bosses)
export function affine(img, cx, cy, angle, sx, sy = sx) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(angle);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}
