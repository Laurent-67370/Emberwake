import { open, sleep } from './harness.mjs';
const out = process.argv[2] || '.';
const { page, errors, close } = await open();
const shot = async n => { await page.locator('#screen').screenshot({ path: `${out}/${n}.png` }); };
await sleep(800); await shot('01-title');
await page.keyboard.press('Enter'); await sleep(400); await page.keyboard.press('Enter'); await sleep(1500); await shot('02-story');
for (let r = 0; r < 5; r++) { await page.evaluate(r => window.__game.start(r), r); await sleep(1500); await shot(`1${r}-stage`); }
for (let r = 0; r < 5; r++) { await page.evaluate(r => window.__game.start(r, 'boss'), r); await sleep(2500); await shot(`2${r}-boss`); }
await page.evaluate(() => window.__game.map()); await sleep(1500); await shot('30-map');
console.log('errors', errors.length); await close();
