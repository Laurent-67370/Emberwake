// The soundtrack: twelve pieces written as chord progressions + melody lines.
// Accompaniment (bass, arpeggios, pads, drums) is generated from the chords by
// pattern, like a tracker composer working against a tight sample budget.
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7],
  dim: [0, 3, 6], aug: [0, 4, 8], add9: [0, 4, 7, 14], m9: [0, 3, 7, 14] };
function parseNote(s) { // "C#5" -> midi
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) throw new Error('bad note ' + s);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function parseChord(s) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(s);
  const root = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, tones: QUAL[m[3]] || QUAL[''] };
}

// def: { bpm, loop, swing, vol, chords:'Dm Bb F C', parts:[...] }
export function song(def) {
  const bars = def.chords.trim().split(/\s+/);
  const steps = bars.length * 16;
  const chordAt = [];
  bars.forEach((b, i) => { const hs = b.split('/'); for (let s = 0; s < 16; s++) chordAt[i * 16 + s] = parseChord(hs[Math.min(hs.length - 1, Math.floor(s / (16 / hs.length)))]); });
  const ev = [];
  for (const p of def.parts) {
    const vel = p.vel ?? 0.25;
    if (p.mel) {
      let s = 0;
      for (const tok of p.mel.trim().split(/\s+/)) {
        const [n, d] = tok.split(':'); const len = +(d || 1);
        if (n !== 'r' && s < steps) ev.push({ step: s, kind: 'n', inst: p.inst, midi: parseNote(n) + 12 * (p.oct || 0), len: len * (p.legato ?? 1), vel: vel * (p.accent && s % 4 === 0 ? 1.15 : 1) });
        s += len;
      }
    } else if (p.gen === 'bass') { // pattern chars: R root, 5 fifth, 8 octave, 3 third, '.' rest, '-' hold
      const pat = p.pat || 'R.......R.......';
      for (let s = 0; s < steps; s++) {
        const c = pat[s % pat.length]; if (c === '.' || c === '-') continue;
        let len = 1; while (pat[(s + len) % pat.length] === '-' && len < 16) len++;
        const ch = chordAt[s]; const base = 12 * ((p.octave ?? 2) + 1) + ch.root;
        const iv = c === 'R' ? 0 : c === '5' ? 7 : c === '8' ? 12 : c === '3' ? ch.tones[1] : c === '7' ? (ch.tones[3] ?? 10) : 0;
        ev.push({ step: s, kind: 'n', inst: p.inst, midi: base + iv, len, vel });
      }
    } else if (p.gen === 'arp') { // digits index chord tones (wrapping up octaves), '.' rest
      const pat = p.pat || '0123';
      for (let s = 0; s < steps; s++) {
        const c = pat[s % pat.length]; if (c === '.') continue;
        const ch = chordAt[s], k = +c, t = ch.tones;
        const midi = 12 * ((p.octave ?? 4) + 1) + ch.root + t[k % t.length] + 12 * Math.floor(k / t.length);
        ev.push({ step: s, kind: 'n', inst: p.inst, midi, len: p.len || 1, vel: vel * (s % 4 === 0 ? 1.1 : 0.9) });
      }
    } else if (p.gen === 'pad') { // sustained chord each time the chord changes (or every `every` steps)
      const every = p.every || 16;
      for (let s = 0; s < steps; s += every) {
        const ch = chordAt[s]; let len = every;
        while (s + len < steps && len < 32 && chordAt[s + len] === ch && false) len++;
        ch.tones.slice(0, p.voices || 3).forEach((iv, i) => ev.push({ step: s, kind: 'n', inst: p.inst, midi: 12 * ((p.octave ?? 4) + 1) + ch.root + iv, len, vel: vel * (i ? 0.8 : 1) }));
      }
    } else if (p.drums) { // one or more lanes, each a per-bar pattern string
      for (const lane of [].concat(p.drums)) {
        for (let s = 0; s < steps; s++) {
          const c = lane[s % lane.length]; if (c === '.' || c === '-') continue;
          ev.push({ step: s, kind: 'd', inst: c, vel: vel * (s % 16 === 0 ? 1.2 : 1) });
        }
      }
      if (p.fill) for (let s = steps - 16; s < steps; s++) { const c = p.fill[s % 16]; if (c !== '.') ev.push({ step: s, kind: 'd', inst: c, vel }); }
    }
  }
  const byStep = [];
  for (const e of ev) (byStep[e.step] ||= []).push(e);
  return { name: def.name, bpm: def.bpm, loop: def.loop !== false, swing: def.swing || 0, vol: def.vol || 1, steps, byStep };
}

export const SONGS = {};
const S = (k, d) => SONGS[k] = song({ name: k, ...d });

S('title', { bpm: 80, chords: 'Dm Bb F C Dm Bb Gm A', parts: [
  { inst: 'choir', vel: .22, mel: 'A4:4 D5:4 E5:4 F5:4 G5:6 F5:2 D5:8 C5:4 F5:4 A5:6 G5:2 G5:8 E5:4 C5:4 D5:4 F5:4 A5:4 D6:4 C6:6 Bb5:2 A5:4 F5:4 G5:4 Bb5:4 A5:4 G5:4 A5:12 r:4' },
  { inst: 'flute', vel: .09, oct: 1, mel: 'r:64 D5:4 F5:4 A5:4 D6:4 C6:6 Bb5:2 A5:4 F5:4 G5:4 Bb5:4 A5:4 G5:4 A5:12 r:4' },
  { inst: 'harp', gen: 'arp', vel: .1, octave: 4, pat: '0124210201242102' },
  { inst: 'strings', gen: 'pad', vel: .07, octave: 3 },
  { inst: 'bass', gen: 'bass', vel: .3, pat: 'R-------5-------' },
  { drums: 'T...............', vel: .5 },
] });

S('map', { bpm: 120, chords: 'F C Dm Bb F C Bb C', parts: [
  { inst: 'lead', vel: .16, mel: 'C5:2 F5:2 A5:4 G5:2 F5:2 C5:4 E5:2 G5:2 C6:4 Bb5:2 A5:2 G5:4 F5:2 A5:2 D6:4 C6:2 A5:2 F5:4 D5:4 F5:2 Bb5:6 A5:2 G5:2 A5:6 C6:2 F6:4 E6:2 C6:2 G5:6 A5:2 Bb5:4 A5:2 G5:2 F5:2 G5:2 A5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:8 G5:4 r:4' },
  { inst: 'flute', vel: .08, oct: -1, mel: 'r:64 A5:6 C6:2 F6:4 E6:2 C6:2 G5:6 A5:2 Bb5:4 A5:2 G5:2 F5:2 G5:2 A5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:8 G5:4 r:4' },
  { inst: 'strings', gen: 'pad', vel: .06, octave: 3 },
  { inst: 'pluck', gen: 'arp', vel: .07, octave: 4, pat: '0.1.2.1.0.1.2.1.' },
  { inst: 'bass', gen: 'bass', vel: .3, pat: 'R.....R.5.....8.' },
  { drums: ['k.......k.k.....', '....s.......s...', 'h.h.h.h.h.h.h.hh'], vel: .45, fill: '....s.s.s.ss.sss' },
] });

S('realm1', { bpm: 132, swing: .18, chords: 'G Em C D G Em Am7 D', parts: [
  { inst: 'flute', vel: .2, mel: 'D5:2 G5:2 B5:2 A5:2 G5:4 D5:4 E5:2 G5:2 B5:2 A5:2 G5:2 E5:2 B4:4 C5:2 E5:2 G5:2 E5:2 C6:4 B5:2 A5:2 A5:6 B5:2 A5:2 F#5:2 D5:4 G5:2 A5:2 B5:4 D6:4 B5:2 G5:2 E5:4 G5:2 B5:2 E6:6 D6:2 C6:2 B5:2 A5:2 G5:2 E5:4 G5:2 A5:2 F#5:4 G5:2 A5:2 D5:8' },
  { inst: 'harp', gen: 'arp', vel: .1, octave: 3, pat: '0213021302130213' },
  { inst: 'marimba', vel: .08, oct: 0, mel: 'r:96 G5:2 A5:2 B5:4 D6:4 B5:2 G5:2 E5:4 G5:2 B5:2 E6:6 D6:2' },
  { inst: 'bass', gen: 'bass', vel: .32, pat: 'R...5...R.R.5...' },
  { inst: 'pad', gen: 'pad', vel: .05, octave: 4 },
  { drums: ['k.....k...k.....', '....s.......s..s', '..h...h...h...h.'], vel: .4 },
] });

S('realm2', { bpm: 96, chords: 'Am F C G Am F Dm E', parts: [
  { inst: 'bell', vel: .12, mel: 'E5:4 A5:4 B5:2 C6:2 B5:4 A5:4 F5:4 E5:4 C5:4 G5:4 E5:2 G5:2 C6:6 B5:2 B5:8 G5:4 D5:4 E5:2 A5:2 C6:4 E6:4 D6:2 C6:2 C6:4 A5:4 F5:4 A5:4 D6:4 C6:2 B5:2 A5:4 F5:4 G#5:8 E5:8' },
  { inst: 'flute', vel: .13, oct: -1, mel: 'r:64 E5:2 A5:2 C6:4 E6:4 D6:2 C6:2 C6:4 A5:4 F5:4 A5:4 D6:4 C6:2 B5:2 A5:4 F5:4 G#5:8 E5:8' },
  { inst: 'pad', gen: 'pad', vel: .08, octave: 3 },
  { inst: 'marimba', gen: 'arp', vel: .06, octave: 4, pat: '0.2.1.2.0.2.1.2.' },
  { inst: 'bass', gen: 'bass', vel: .3, pat: 'R-----R-5-----5-' },
  { drums: ['k.........k.....', '........s.......', 'h...h...h...h.h.'], vel: .3 },
] });

S('realm3', { bpm: 112, chords: 'E F E Dm E F G F', parts: [
  { inst: 'organ', vel: .12, mel: 'E5:3 F5:1 G#5:4 F5:2 E5:2 B4:4 C5:2 F5:2 A5:4 G#5:2 F5:2 E5:4 B5:3 A5:1 G#5:4 F5:2 G#5:2 E5:4 D5:4 F5:2 A5:2 D6:6 C6:2 B5:4 G#5:2 E5:2 F5:2 G#5:2 B5:4 C6:4 A5:2 F5:2 C6:2 D6:2 C6:4 B5:2 D6:2 B5:2 G5:2 F5:2 E5:2 D5:4 E5:12 r:4' },
  { inst: 'pluck', gen: 'arp', vel: .08, octave: 3, pat: '0.0.1.0.2.0.1.0.' },
  { inst: 'strings', gen: 'pad', vel: .06, octave: 3 },
  { inst: 'bass', gen: 'bass', vel: .32, pat: 'R..R..R.R..R..5.' },
  { drums: ['k..k..k.k..k....', '....t.....t..T.T', '..h...h...h...h.'], vel: .42 },
] });

S('realm4', { bpm: 144, chords: 'Cm Cm Ab Bb Cm Cm Fm G', parts: [
  { inst: 'brass', vel: .14, mel: 'C5:2 r:1 C5:1 Eb5:2 G5:2 C6:2 r:2 Bb5:2 G5:2 Ab5:2 G5:2 F5:2 Eb5:2 D5:4 Eb5:2 F5:2 Eb5:2 r:1 Eb5:1 Ab5:2 C6:2 Eb6:4 D6:2 C6:2 D6:6 Bb5:2 F5:4 D5:4 C5:2 r:1 C5:1 G5:2 C6:2 Eb6:2 r:2 D6:2 C6:2 Bb5:2 C6:2 G5:2 Eb5:2 C5:8 F5:2 Ab5:2 C6:2 F6:2 Eb6:2 D6:2 C6:4 B5:8 D6:4 G5:4' },
  { inst: 'pluck', gen: 'arp', vel: .07, octave: 4, pat: '0120012001200120' },
  { inst: 'slap', gen: 'bass', vel: .3, octave: 2, pat: 'R.R8R.R8R.R8R.58' },
  { inst: 'strings', gen: 'pad', vel: .05, octave: 3 },
  { drums: ['k.....k.k.....k.', '....s.......s...', 'hhhhhhhhhhhhhhhh'], vel: .38, fill: 's.s.s.ssk.k.ssss' },
] });

S('realm5', { bpm: 88, chords: 'Bm G Em F# Bm G C F#', parts: [
  { inst: 'choir', vel: .2, mel: 'B4:4 D5:4 F#5:8 G5:4 F#5:4 E5:4 D5:4 E5:4 G5:4 B5:6 A5:2 A#5:8 F#5:8 B5:4 D6:4 F#6:6 E6:2 D6:4 B5:4 G5:8 C6:4 B5:4 G5:4 E5:4 F#5:12 r:4' },
  { inst: 'organ', gen: 'pad', vel: .07, octave: 3 },
  { inst: 'bell', vel: .07, mel: 'B5:16 G5:16 E5:16 F#5:16 B5:16 G5:16 C6:16 F#5:16' },
  { inst: 'harp', gen: 'arp', vel: .06, octave: 3, pat: '0.1.2.3.4.3.2.1.' },
  { inst: 'bass', gen: 'bass', vel: .3, pat: 'R-------R---5---' },
  { drums: ['T.......t.......', '................'], vel: .45 },
] });

S('boss', { bpm: 160, chords: 'Dm Dm Bb C Dm Dm Eb C', parts: [
  { inst: 'brass', vel: .15, mel: 'D5:2 D5:2 A5:2 D5:2 G5:2 F5:2 E5:2 C5:2 D5:2 D5:2 A5:2 D5:2 C6:4 A5:4 Bb5:4 A5:2 G5:2 F5:4 D5:4 E5:4 G5:4 C6:4 E5:4 D6:4 A5:2 F5:2 D6:2 E6:2 F6:4 E6:2 D6:2 C6:2 A5:2 D6:8 Eb6:4 D6:2 Bb5:2 G5:4 Eb5:4 E5:4 G5:4 C6:4 E6:4' },
  { inst: 'strings', gen: 'arp', vel: .06, octave: 4, pat: '0101010101010101' },
  { inst: 'slap', gen: 'bass', vel: .32, octave: 2, pat: 'R.RRR.RR8.RRR.58' },
  { drums: ['k.k...k.k.k...k.', '....s.......s...', 'h.h.h.h.h.h.h.h.'], vel: .45, fill: 'ssssk.ssk.ssssss' },
] });

S('final', { bpm: 168, chords: 'Em C D B Em C Am B', parts: [
  { inst: 'choir', vel: .16, mel: 'E5:4 G5:4 B5:4 E6:4 C6:4 B5:4 G5:4 E5:4 F#5:4 A5:4 D6:6 C6:2 B5:8 D#6:8 E6:2 D6:2 B5:2 G5:2 E6:2 D6:2 B5:2 G5:2 G6:4 E6:4 C6:4 G5:4 A5:2 C6:2 E6:2 A6:2 G6:4 E6:4 F#6:4 D#6:4 B5:8' },
  { inst: 'brass', vel: .1, oct: -1, mel: 'E5:8 B4:8 C5:8 G4:8 D5:8 A4:8 B4:8 D#5:8 E5:8 B4:8 C5:8 G4:8 A4:8 E5:8 B4:16' },
  { inst: 'organ', gen: 'arp', vel: .05, octave: 4, pat: '0120012001200120' },
  { inst: 'slap', gen: 'bass', vel: .32, octave: 2, pat: 'RRR.RRR.RRR.R5R8' },
  { drums: ['k.k.k.k.k.k.k.k.', '....s.......s.s.', 'h.h.h.h.h.h.h.h.', 'c...............'], vel: .42 },
] });

S('victory', { bpm: 132, loop: false, chords: 'C F/G C', parts: [
  { inst: 'brass', vel: .17, mel: 'G4:2 C5:2 E5:2 G5:2 C6:4 G5:2 C6:2 A5:4 C6:4 B5:2 D6:2 G5:4 C6:16' },
  { inst: 'lead', vel: .08, mel: 'E5:2 G5:2 C6:2 E6:2 E6:4 E6:2 E6:2 F6:4 F6:4 G6:2 G6:2 D6:4 E6:16' },
  { inst: 'strings', gen: 'pad', vel: .08, octave: 4, every: 8 },
  { inst: 'bass', gen: 'bass', vel: .3, pat: 'R...R...R...R...' },
  { drums: ['k.s.k.s.k.s.ssss', 'c...............'], vel: .45 },
] });

S('ending', { bpm: 76, chords: 'D A Bm G D A G A', parts: [
  { inst: 'flute', vel: .2, mel: 'A4:4 D5:4 E5:4 F#5:4 E5:6 D5:2 C#5:8 B4:4 D5:4 F#5:6 E5:2 D5:8 B4:4 G4:4 A5:4 F#5:4 D5:4 A5:4 A5:6 G5:2 F#5:4 E5:4 D5:4 G5:4 B5:4 D6:4 C#6:12 r:4' },
  { inst: 'harp', gen: 'arp', vel: .1, octave: 4, pat: '0124210201242102' },
  { inst: 'strings', gen: 'pad', vel: .07, octave: 3 },
  { inst: 'bell', vel: .05, mel: 'D6:32 r:32 A5:32 r:32' },
  { inst: 'bass', gen: 'bass', vel: .28, pat: 'R-------5-------' },
] });

S('gameover', { bpm: 70, loop: false, chords: 'Am E/Am', parts: [
  { inst: 'choir', vel: .18, mel: 'E5:4 C5:4 A4:8 B4:4 G#4:4 A4:8' },
  { inst: 'strings', gen: 'pad', vel: .08, octave: 3, every: 8 },
  { inst: 'bass', gen: 'bass', vel: .25, pat: 'R-------R-------' },
] });

S('shrine', { bpm: 70, chords: 'Fmaj7 Em7 Dm7 Cmaj7', parts: [
  { inst: 'bell', vel: .08, mel: 'A5:8 G5:8 E5:8 D5:8 F5:8 E5:8 C5:8 B4:8' },
  { inst: 'harp', gen: 'arp', vel: .08, octave: 4, pat: '0123321001233210' },
  { inst: 'pad', gen: 'pad', vel: .07, octave: 3, voices: 4 },
] });
