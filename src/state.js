// Shared game state and save data (localStorage, wrapped so it never throws).
export const G = {
  assets: null,
  scene: null,
  frame: 0,
  save: null,
  debug: { god: false, showHit: false },
  stats: { lagFrames: 0 },
};

const KEY = 'sunkeeper-save-v1';
export function newSave() {
  return { cleared: [], abilities: { double: false, dash: false, wall: false, shot: false }, maxHp: 5, embers: 0, motes: {}, hearts: {}, deaths: 0, time: 0, beaten: false };
}
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.abilities) return s; } catch (e) { /* storage unavailable */ }
  return null;
}
export function writeSave() { try { localStorage.setItem(KEY, JSON.stringify(G.save)); } catch (e) { /* ignore */ } }
export function eraseSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
export const moteCount = () => Object.values(G.save.motes).reduce((a, l) => a + l.length, 0);
