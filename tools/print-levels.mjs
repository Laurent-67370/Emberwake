import { buildStage } from '../src/levelgen.js';
import { REALMS } from '../src/realms.js';
for (const r of REALMS) { const s = buildStage(r); console.log(`== ${r.name} ${s.w}x${s.h} motes=${s.motes} movers=${s.movers.length}`);
  const step = 120; for (let x0 = 0; x0 < s.w; x0 += step) { for (const row of s.grid) console.log(row.slice(x0, x0 + step)); console.log(); } }
