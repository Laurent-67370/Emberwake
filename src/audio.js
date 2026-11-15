// Sound: an 8-voice-minded synth modelled on the SNES S-SMP/DSP — wavetable
// "samples", ADSR envelopes, pitch modulation, and the DSP's famous echo
// (feedback delay through a FIR-ish low-pass). A step sequencer plays songs
// written as chord progressions + melody lines (see music.js).
let AC = null, master, musicBus, sfxBus, echoIn, noiseBuf;
const waves = {};
export const state = { muted: false, song: null, musicVol: 0.55, sfxVol: 0.8 };

export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  AC = new C();
  master = AC.createGain(); master.gain.value = state.muted ? 0 : 0.9; master.connect(AC.destination);
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(master);
  musicBus = AC.createGain(); musicBus.gain.value = state.musicVol; musicBus.connect(comp);
  sfxBus = AC.createGain(); sfxBus.gain.value = state.sfxVol; sfxBus.connect(comp);
  // echo unit: delay -> lowpass -> feedback, wet back into the mix
  echoIn = AC.createGain(); echoIn.gain.value = 0.35;
  const dl = AC.createDelay(1); dl.delayTime.value = 0.24;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const fb = AC.createGain(); fb.gain.value = 0.42;
  echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
  // 32 kHz-ish character: soft lowpass on the master like the SNES output filter
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const wt = (harm) => { const re = new Float32Array(harm.length + 1), im = new Float32Array(harm.length + 1); harm.forEach((h, i) => im[i + 1] = h); return AC.createPeriodicWave(re, im); };
  waves.pulse = wt([1, 0, .33, 0, .2, 0, .14, 0, .11, 0, .09]);
  waves.pulse25 = wt([1, .7, .33, 0, .2, .23, .14, 0, .11, .1]);
  waves.flute = wt([1, .25, .08, .03]);
  waves.strings = wt([1, .5, .33, .25, .2, .16, .14, .12, .11, .1, .09, .08]);
  waves.brass = wt([1, .8, .6, .45, .35, .25, .18, .12, .08]);
  waves.choir = wt([1, .1, .4, .05, .25, .02, .1]);
  waves.organ = wt([1, .5, 0, .25, 0, .12, 0, .06]);
  waves.bass = wt([1, .45, .15, .08, .04]);
  waves.harp = wt([1, .3, .2, .1, .05, .02]);
}
export function setMuted(m) { state.muted = m; if (master) master.gain.value = m ? 0 : 0.9; }
export const now = () => AC ? AC.currentTime : 0;
export const ready = () => !!AC;

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- instruments
const INST = {
  lead:    { w: 'pulse25', a: .01, d: .15, s: .55, r: .12, vib: 5.5, vibd: 6, cut: 3800, echo: .5 },
  flute:   { w: 'flute', a: .04, d: .2, s: .75, r: .15, vib: 5, vibd: 9, breath: .05, echo: .7 },
  strings: { w: 'strings', a: .25, d: .3, s: .8, r: .5, det: 7, cut: 2400, echo: .6 },
  pad:     { w: 'choir', a: .5, d: .4, s: .8, r: .8, det: 5, cut: 1800, echo: .8 },
  choir:   { w: 'choir', a: .2, d: .3, s: .85, r: .5, vib: 4.5, vibd: 6, det: 4, cut: 2600, echo: .9 },
  brass:   { w: 'brass', a: .04, d: .2, s: .7, r: .15, fenv: 3, cut: 1400, det: 4, echo: .4 },
  bass:    { w: 'bass', a: .005, d: .25, s: .55, r: .08, cut: 1200, echo: .05 },
  slap:    { w: 'pulse', a: .003, d: .12, s: .3, r: .05, cut: 1800, echo: .05 },
  harp:    { w: 'harp', a: .003, d: .6, s: 0, r: .4, echo: .8 },
  pluck:   { w: 'pulse', a: .002, d: .18, s: 0, r: .1, cut: 3000, echo: .6 },
  bell:    { fm: 3.5, fmi: 2.2, a: .002, d: 1.2, s: 0, r: 1, echo: .9 },
  marimba: { fm: 4, fmi: 1.2, a: .002, d: .35, s: 0, r: .2, echo: .5 },
  organ:   { w: 'organ', a: .02, d: .1, s: .9, r: .1, det: 3, echo: .6 },
};

function voice(instName, midi, t, dur, vel, bus) {
  const I = INST[instName]; if (!I) return;
  const f = mtof(midi);
  const g = AC.createGain(); g.gain.value = 0;
  let out = g;
  if (I.cut) { const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = I.cut; lp.Q.value = 0.7; g.connect(lp); out = lp;
    if (I.fenv) { lp.frequency.setValueAtTime(I.cut * 0.4, t); lp.frequency.linearRampToValueAtTime(I.cut * I.fenv, t + I.a + 0.05); lp.frequency.exponentialRampToValueAtTime(I.cut, t + I.a + I.d); } }
  out.connect(bus);
  if (I.echo) { const e = AC.createGain(); e.gain.value = I.echo; out.connect(e); e.connect(echoIn); }
  const oscs = [];
  if (I.fm) {
    const car = AC.createOscillator(), mod = AC.createOscillator(), mg = AC.createGain();
    car.frequency.value = f; mod.frequency.value = f * I.fm; mg.gain.setValueAtTime(f * I.fmi, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + I.d);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); oscs.push(car, mod);
  } else {
    const n = I.det ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const o = AC.createOscillator(); o.setPeriodicWave(waves[I.w]); o.frequency.value = f; if (I.det) o.detune.value = (i ? 1 : -1) * I.det;
      if (I.vib) { const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = I.vib; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(I.vibd, t + 0.35); lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + I.r + 0.1); }
      const og = AC.createGain(); og.gain.value = 1 / n; o.connect(og); og.connect(g); oscs.push(o);
    }
  }
  if (I.breath) { const nz = AC.createBufferSource(); nz.buffer = noiseBuf; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3; const ng = AC.createGain(); ng.gain.value = I.breath; nz.connect(bp); bp.connect(ng); ng.connect(g); nz.start(t, Math.random()); nz.stop(t + dur + I.r); }
  const pk = vel, sus = pk * I.s;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + I.a);
  g.gain.setTargetAtTime(sus, t + I.a, I.d / 3);
  const end = t + Math.max(dur, I.a + 0.01);
  g.gain.setValueAtTime(I.s === 0 ? pk * Math.exp(-(dur - I.a) * 3 / I.d) : sus, end);
  g.gain.setTargetAtTime(0, end, I.r / 3);
  for (const o of oscs) { o.start(t); o.stop(end + I.r + 0.05); }
}

function drum(kind, t, vel, bus) {
  const g = AC.createGain(); g.connect(bus);
  if (kind === 'k') {
    const o = AC.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vel * 1.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); o.start(t); o.stop(t + 0.32);
  } else if (kind === 's' || kind === 'c' || kind === 'h' || kind === 'o') {
    const n = AC.createBufferSource(); n.buffer = noiseBuf;
    const f = AC.createBiquadFilter();
    const len = { s: 0.18, c: 1.0, h: 0.04, o: 0.25 }[kind];
    f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : kind === 'c' ? 5000 : 7000; f.Q.value = kind === 's' ? 0.8 : 0.5;
    n.connect(f); f.connect(g);
    g.gain.setValueAtTime(vel * (kind === 'h' ? .35 : kind === 'c' ? .4 : .8), t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.start(t, Math.random() * 0.5); n.stop(t + len + 0.02);
    if (kind === 's') { const o = AC.createOscillator(), og = AC.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); og.gain.setValueAtTime(vel * .5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(og); og.connect(bus); o.start(t); o.stop(t + 0.12); }
    if (kind === 'c') { const e = AC.createGain(); e.gain.value = .5; g.connect(e); e.connect(echoIn); }
  } else if (kind === 't' || kind === 'T') {
    const o = AC.createOscillator(); const b = kind === 't' ? 160 : 100; o.frequency.setValueAtTime(b, t); o.frequency.exponentialRampToValueAtTime(b * 0.55, t + 0.2);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); o.start(t); o.stop(t + 0.4);
    const e = AC.createGain(); e.gain.value = .4; g.connect(e); e.connect(echoIn);
  }
}

// ---------------------------------------------------------------- sequencer
// A compiled song is { bpm, steps, loop, events:[{step, kind:'n'|'d', inst, midi, len, vel}] }
let seq = null, timer = null;
export function playSong(song, { restart = false } = {}) {
  if (!AC) { state.pending = song; return; }
  if (!song) { stopSong(); return; }
  if (seq && seq.song === song && !restart) return;
  stopSong(0.15);
  const spb = 60 / song.bpm / 4;
  seq = { song, spb, t0: AC.currentTime + 0.12, next: 0, bus: AC.createGain() };
  seq.bus.gain.value = song.vol || 1; seq.bus.connect(musicBus);
  state.song = song;
  timer = setInterval(tick, 25); tick();
}
export function stopSong(fade = 0.4) {
  if (timer) clearInterval(timer); timer = null;
  if (seq) { const b = seq.bus; b.gain.setTargetAtTime(0, AC.currentTime, fade / 3); setTimeout(() => b.disconnect(), fade * 1000 + 600); }
  seq = null; state.song = null;
}
export function musicDuck(v) { if (musicBus) musicBus.gain.setTargetAtTime(state.musicVol * v, AC.currentTime, 0.1); }
function tick() {
  if (!seq) return;
  const { song, spb } = seq;
  const horizon = AC.currentTime + 0.2;
  while (true) {
    const loopN = Math.floor(seq.next / song.steps);
    if (!song.loop && loopN > 0) { const s = seq; setTimeout(() => { if (seq === s) stopSong(0.1); }, 3000); clearInterval(timer); timer = null; return; }
    const step = seq.next % song.steps;
    const t = seq.t0 + seq.next * spb;
    if (t > horizon) break;
    const swing = song.swing && (step & 1) ? spb * song.swing : 0;
    for (const e of song.byStep[step] || []) {
      if (e.kind === 'd') drum(e.inst, t + swing, e.vel, seq.bus);
      else voice(e.inst, e.midi, t + swing, e.len * spb * 0.95, e.vel, seq.bus);
    }
    seq.next++;
  }
}

// ---------------------------------------------------------------- sound effects
export function sfx(name, pan = 0) {
  if (!AC || state.muted) return;
  const t = AC.currentTime;
  const out = AC.createStereoPanner ? AC.createStereoPanner() : AC.createGain();
  if (out.pan) out.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(sfxBus);
  const tone = (type, f0, f1, dur, vol = .3, at = 0, wave) => {
    const o = AC.createOscillator(), g = AC.createGain();
    if (wave) o.setPeriodicWave(waves[wave]); else o.type = type;
    o.frequency.setValueAtTime(f0, t + at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
    g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
    o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + 0.02);
    return g;
  };
  const noise = (f, q, dur, vol = .3, at = 0, type = 'bandpass', f1) => {
    const n = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    n.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t + at); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + at + dur); fl.Q.value = q;
    g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
    n.connect(fl); fl.connect(g); g.connect(out); n.start(t + at, Math.random()); n.stop(t + at + dur + 0.02);
    return g;
  };
  const echo = (g, v = .4) => { const e = AC.createGain(); e.gain.value = v; g.connect(e); e.connect(echoIn); };
  switch (name) {
    case 'jump': tone('square', 260, 520, .12, .12); break;
    case 'djump': tone('square', 380, 900, .14, .12); noise(3000, 1, .12, .1); break;
    case 'land': noise(400, 1, .06, .12, 0, 'lowpass'); break;
    case 'slash': noise(2500, 2, .1, .25, 0, 'bandpass', 6000); break;
    case 'slash3': noise(1800, 2, .16, .3, 0, 'bandpass', 7000); tone('sawtooth', 300, 120, .1, .06); break;
    case 'hit': tone('square', 180, 60, .12, .25); noise(1200, 1, .1, .3); break;
    case 'clang': echo(tone('triangle', 1400, 1350, .25, .2)); tone('square', 2100, 2000, .08, .08); break;
    case 'kill': noise(800, .7, .35, .35, 0, 'lowpass', 120); tone('square', 400, 50, .25, .15); break;
    case 'hurt': tone('sawtooth', 500, 120, .3, .25); noise(900, 1, .2, .2); break;
    case 'ember': echo(tone('sine', 1320, 0, .12, .18), .5); tone('sine', 1980, 0, .14, .12, .05); break;
    case 'mote': [0, .07, .14, .21, .28].forEach((d, i) => echo(tone('sine', [784, 988, 1175, 1568, 1976][i], 0, .3, .15, d), .6)); break;
    case 'heart': [0, .1, .2].forEach((d, i) => tone('triangle', [523, 659, 1046][i], 0, .25, .2, d)); break;
    case 'dash': noise(600, .8, .25, .3, 0, 'bandpass', 3500); tone('sawtooth', 120, 60, .2, .07); break;
    case 'charge': tone('sine', 200, 900, .6, .12); break;
    case 'charged': echo(tone('sine', 1200, 0, .2, .15)); break;
    case 'shoot': tone('square', 900, 200, .15, .16); noise(4000, 1, .08, .1); break;
    case 'bigshot': echo(tone('sawtooth', 600, 80, .4, .2)); noise(2000, .5, .35, .25, 0, 'lowpass', 200); break;
    case 'break': noise(500, .6, .3, .4, 0, 'lowpass', 100); tone('square', 120, 40, .2, .12); break;
    case 'bell': echo(tone('sine', 880, 0, 1.2, .2), .7); echo(tone('sine', 880 * 2.76, 0, .8, .06), .7); echo(tone('sine', 880 * 5.4, 0, .4, .03)); break;
    case 'door': noise(200, .5, .8, .3, 0, 'lowpass', 60); tone('sawtooth', 60, 40, .8, .1); break;
    case 'menu': tone('square', 880, 0, .05, .1); break;
    case 'select': tone('square', 660, 0, .06, .12); tone('square', 1320, 0, .1, .12, .06); break;
    case 'pause': tone('square', 1046, 0, .06, .12); tone('square', 784, 0, .06, .12, .07); break;
    case 'roar': noise(300, 2, 1.2, .5, 0, 'bandpass', 90); tone('sawtooth', 90, 45, 1.1, .2); tone('sawtooth', 95, 47, 1.1, .15); break;
    case 'boom': noise(1200, .5, .9, .6, 0, 'lowpass', 40); tone('sine', 120, 30, .6, .5); break;
    case 'bosshit': tone('square', 240, 80, .15, .25); noise(2500, 1.5, .12, .25); break;
    case 'splash': noise(1200, .7, .4, .3, 0, 'bandpass', 300); break;
    case 'shot_e': tone('square', 600, 300, .1, .08); break;
    case 'laser': tone('sawtooth', 1800, 300, .35, .1); break;
    case 'quake': noise(80, .5, 1, .5, 0, 'lowpass'); break;
    case 'glide': noise(800, .3, .5, .15, 0, 'bandpass', 1600); break;
    case 'step': noise(300, 1, .03, .05, 0, 'lowpass'); break;
    case 'checkpoint': [0, .1, .2, .3].forEach((d, i) => echo(tone('triangle', [523, 784, 1046, 1568][i], 0, .5, .15, d), .6)); break;
    case 'power': [0, .12, .24, .36, .48, .6].forEach((d, i) => echo(tone('square', [392, 523, 659, 784, 1046, 1318][i], 0, .3, .1, d), .7)); break;
  }
}
