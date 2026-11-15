// Play-testing bot: runs every stage start to finish and fights every boss,
// reporting stuck points, damage taken, and frame cost. Usage:
//   node tools/playtest.mjs [stages|bosses|all] [turbo]
import { open, sleep } from './harness.mjs';
const what = process.argv[2] || 'all', turbo = +(process.argv[3] || 4);
const { page, errors, close } = await open();

await page.evaluate(() => {
  const g = window.__game, B = g.bot;
  const S = () => g.G.scene;
  window.__bot = { stuck: [], hurt: 0, lastX: 0, lastT: 0, t: 0, jumpHold: 0, mode: 'stage', atkT: 0 };
  window.__botTick = () => {
    const sc = S(); const W = window.__bot; if (!sc || !sc.player) { for (const k in B) B[k] = false; return; }
    const P = sc.player, st = sc.stage, T = 16; W.t++;
    for (const k in B) B[k] = false;
    if (sc.end) { if (W.t % 20 === 0) B.attack = true; return; }
    if (P.dead) return;
    const tile = (x, y) => st.tile(Math.floor(x / T), Math.floor(y / T));
    const solid = (x, y) => st.solidPx(x, y);
    const groundAt = (x, y0, depth) => { for (let d = 0; d < depth; d++) { const c = tile(x, y0 + d * T); if (c === '#' || c === 'B' || c === '=' || c === 'F') return d; } return -1; };
    if (W.mode === 'boss') {
      const b = sc.boss; if (!b) return;
      const shard = sc.items.find(i => i.kind === 'shard');
      if (shard) { const d = shard.x - P.cx; if (Math.abs(d) > 4) B[d > 0 ? 'right' : 'left'] = true; return; }
      if (b.dying) return;
      const hb = b.hurtboxes().find(h => h.weak) || b.hurtboxes()[0]; if (!hb) return;
      if (hb.y + hb.h < P.y && Math.abs(hb.x + hb.w / 2 - P.cx) < 30) { B.up = true; if (W.t % 6 === 0) B.attack = true; }
      const tx = hb.x + hb.w / 2, dx = tx - P.cx;
      if (Math.abs(dx) > 18) { B[dx > 0 ? 'right' : 'left'] = true; }
      if (hb.y + hb.h < P.y - 10 && P.onGround && W.t % 30 === 0) W.jumpHold = 14;
      if (W.jumpHold > 0) { B.jump = true; W.jumpHold--; }
      if (Math.abs(dx) < 40 && W.t % 6 === 0) B.attack = true;
      if (P.ab.shot) B.shoot = W.t % 50 < 44;
      if (!P.onGround && P.vy > 0 && hb.y > P.bottom && W.t % 8 === 0) { B.down = true; B.attack = true; }
      return;
    }
    // ---- platforming
    const dir = 1; B.right = true;
    const front = P.x + P.w + 4;
    const wallAhead = solid(front + 2, P.y + 4) || solid(front + 2, P.y + P.h - 4);
    const footY = P.bottom + 2;
    const gapAhead = P.onGround && groundAt(front + 6, P.bottom + 1, 3) < 0;
    const spikeAhead = tile(front + 8, P.bottom - 4) === '^' || tile(front + 20, P.bottom - 4) === '^';
    const enemyAhead = sc.enemies.some(e => e.cx > P.cx - 8 && e.cx - P.cx < 34 && Math.abs(e.cy - P.cy) < 26);
    if (enemyAhead) { if (W.atkT-- <= 0) { B.attack = true; W.atkT = 5; } }
    if (P.onGround && (wallAhead || gapAhead || spikeAhead)) W.jumpHold = 18;
    if (P.inWater && W.t % 14 === 0) W.jumpHold = 2;
    // springs: just walk; chimney: wall-jump
    if (!P.onGround && P.wall && P.vy > -1) { W.jumpHold = 0; if (W.t % 2 === 0) B.jump = true; B.right = P.wall < 0; B.left = P.wall > 0 && false; }
    // falling into a pit: double jump, then dash
    const below = groundAt(P.cx, P.bottom + 1, 6);
    if (!P.onGround && P.vy > 0.5 && below < 0 && !P.inWater) {
      if (P.airJumps > 0 && W.t % 3 === 0) { B.jump = true; W.jumpHold = 12; }
      else if (P.canDash && P.ab.dash) B.dash = true;
    }
    if (W.jumpHold > 0) { if (W.jumpHold < 18 || !W.prevJump) B.jump = true; W.jumpHold--; }
    W.prevJump = B.jump;
    // stuck detection: teleport ahead and remember where
    if (P.x > W.lastX + 24) { W.lastX = P.x; W.lastT = W.t; }
    if (W.t - W.lastT > 420) {
      W.stuck.push(Math.floor(P.cx / T) + ',' + Math.floor(P.cy / T));
      let tx = Math.floor(P.cx / T) + 3;
      for (; tx < st.w; tx++) { let ok = false; for (let ty = 1; ty < st.h; ty++) if (st.solid(tx, ty) && !st.solid(tx, ty - 1) && !st.solid(tx, ty - 2) && st.tile(tx, ty - 1) !== '^') { P.x = tx * T + 3; P.y = (ty - 2) * T + 10; P.vx = P.vy = 0; ok = true; break; } if (ok) break; }
      W.lastX = P.x; W.lastT = W.t;
    }
  };
});

const results = [];
async function runStage(ri) {
  await page.evaluate(([ri, t]) => { const g = window.__game; g.start(ri); g.G.debug.god = true; g.G.turbo = t; Object.assign(window.__bot, { stuck: [], lastX: 0, lastT: 0, t: 0, mode: 'stage' }); g.resetPerf(); }, [ri, turbo]);
  const t0 = Date.now();
  let r;
  while (Date.now() - t0 < 240000) {
    await sleep(500);
    r = await page.evaluate(() => { const g = window.__game, sc = g.G.scene; return { scene: sc.constructor.name, mode: sc.mode, x: sc.player ? Math.round(sc.player.cx / 16) : -1, w: sc.stage ? sc.stage.w : 0, stuck: window.__bot.stuck, embers: g.G.save.embers, motes: (g.G.save.motes[sc.ri] || []).length, frames: g.perf.fn, avg: g.perf.fsum / Math.max(1, g.perf.fn), worst: g.perf.fworst, enemies: sc.enemies ? sc.enemies.length : 0 }; });
    if (r.scene !== 'PlayScene' || r.mode === 'boss') break;
  }
  await page.evaluate(() => { window.__game.G.turbo = 0; });
  r.ms = Date.now() - t0; r.done = r.mode === 'boss' || r.scene !== 'PlayScene';
  console.log(`stage ${ri}: reached ${r.done ? 'EXIT' : 'col ' + r.x + '/' + r.w}  stuck=[${r.stuck.join(' ')}] embers=${r.embers} motes=${r.motes} frame avg ${r.avg.toFixed(2)}ms worst ${r.worst.toFixed(1)}ms (${r.frames} frames, ${r.ms}ms)`);
  results.push(r);
}
async function runBoss(ri) {
  await page.evaluate(([ri, t]) => { const g = window.__game; g.start(ri, 'boss'); g.G.debug.god = true; g.G.turbo = t; Object.assign(window.__bot, { t: 0, mode: 'boss' }); g.resetPerf(); }, [ri, turbo]);
  const t0 = Date.now(); let r;
  while (Date.now() - t0 < 150000) {
    await sleep(500);
    r = await page.evaluate(() => { const g = window.__game, sc = g.G.scene; return { scene: sc.constructor.name, hp: sc.boss ? sc.boss.hp : -1, max: sc.boss ? sc.boss.max : -1, name: sc.boss && sc.boss.name, end: !!sc.end, dead: sc.boss && sc.boss.dead, avg: g.perf.fsum / Math.max(1, g.perf.fn), worst: g.perf.fworst, frames: g.perf.fn }; });
    if (r.end || r.scene !== 'PlayScene') break;
  }
  await page.evaluate(() => { window.__game.G.turbo = 0; });
  console.log(`boss ${ri} ${r.name}: ${r.end || r.scene !== 'PlayScene' ? 'DEFEATED' : 'hp ' + r.hp + '/' + r.max} in ${(r.frames / 60).toFixed(0)}s game time; frame avg ${r.avg.toFixed(2)}ms worst ${r.worst.toFixed(1)}ms`);
}
if (what === 'all' || what === 'stages') for (let i = 0; i < 5; i++) await runStage(i);
const only = process.argv[4] ? process.argv[4].split(',').map(Number) : [0, 1, 2, 3, 4];
if (what === 'all' || what === 'bosses') for (const i of only) await runBoss(i);
console.log('page errors:', errors.length); errors.slice(0, 5).forEach(e => console.log(' ', e));
await close();
