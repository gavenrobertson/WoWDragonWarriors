"use client";
// Arcade sound effects, synthesised with the Web Audio API (no audio files to load or license).
// One shared AudioContext, created on the first user gesture (browsers block audio before that).
// Muting is remembered per browser. Rapid repeats (reel ticks, peg hits) are rate-limited.

export type Sfx =
  | "click" | "tick" | "peg" | "chip" | "deal" | "flip" | "reveal" | "gem" | "bomb" | "spin" | "stop"
  | "win" | "bigwin" | "epic" | "legendary" | "lose" | "cashout" | "coin" | "launch" | "crash"
  | "whoosh" | "thud" | "key" | "error" | "count";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const last: Partial<Record<Sfx, number>> = {};
const listeners = new Set<(m: boolean) => void>();

try { muted = typeof localStorage !== "undefined" && localStorage.getItem("dw-sfx-muted") === "1"; } catch { /* storage blocked */ }

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem("dw-sfx-muted", m ? "1" : "0"); } catch { /* ignore */ }
  listeners.forEach((f) => f(m));
}
export function onMuteChange(f: (m: boolean) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

// ---------------------------------------------------------------- building blocks
function tone(c: AudioContext, o: { f: number; f2?: number; t?: number; dur: number; type?: OscillatorType; vol?: number; attack?: number }) {
  const t0 = c.currentTime + (o.t ?? 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  const v = o.vol ?? 0.5, a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t0); osc.stop(t0 + o.dur + 0.02);
}
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext, o: { t?: number; dur: number; vol?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number }) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + (o.t ?? 0);
  const src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  flt.type = o.type ?? "bandpass"; flt.Q.value = o.q ?? 1.2;
  flt.frequency.setValueAtTime(o.f ?? 2000, t0);
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  g.gain.setValueAtTime(o.vol ?? 0.4, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(flt).connect(g).connect(master!);
  src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.02);
}
const arp = (c: AudioContext, notes: number[], step: number, o: { type?: OscillatorType; vol?: number; dur?: number } = {}) =>
  notes.forEach((f, i) => tone(c, { f, t: i * step, dur: o.dur ?? 0.28, type: o.type ?? "triangle", vol: o.vol ?? 0.35 }));

// note frequencies
const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093, G4: 392, E4: 329.63, C4: 261.63 };

const MIN_GAP: Partial<Record<Sfx, number>> = { tick: 28, peg: 22, count: 40, key: 18, chip: 40, coin: 50, gem: 60 };

/** Play a sound effect. `pitch` nudges tonal sounds (e.g. rising gem pitch as a streak grows). */
export function play(name: Sfx, opts: { pitch?: number; vol?: number } = {}) {
  if (muted) return;
  const c = ac(); if (!c || !master) return;
  const now = performance.now(), gap = MIN_GAP[name];
  if (gap && now - (last[name] ?? 0) < gap) return;
  last[name] = now;
  const p = opts.pitch ?? 1, v = opts.vol ?? 1;
  switch (name) {
    case "click": tone(c, { f: 1400 * p, f2: 900 * p, dur: 0.05, type: "square", vol: 0.12 * v }); break;
    case "tick": noise(c, { dur: 0.03, f: 3200 * p, q: 6, vol: 0.35 * v }); break;
    case "peg": tone(c, { f: (900 + Math.random() * 500) * p, dur: 0.07, type: "sine", vol: 0.16 * v }); break;
    case "chip": tone(c, { f: 2200 * p, dur: 0.06, type: "sine", vol: 0.2 * v }); tone(c, { f: 3300 * p, t: 0.03, dur: 0.07, vol: 0.14 * v }); break;
    case "deal": noise(c, { dur: 0.12, f: 1800, f2: 5000, q: 0.8, vol: 0.32 * v }); break;
    case "flip": noise(c, { dur: 0.06, f: 2600, q: 2, vol: 0.3 * v }); tone(c, { f: 600 * p, t: 0.02, dur: 0.05, type: "triangle", vol: 0.12 * v }); break;
    case "reveal": tone(c, { f: N.E5 * p, dur: 0.12, type: "triangle", vol: 0.25 * v }); tone(c, { f: N.A5 * p, t: 0.05, dur: 0.16, type: "triangle", vol: 0.22 * v }); break;
    case "gem": arp(c, [N.C6 * p, N.E6 * p, N.G6 * p], 0.045, { type: "sine", vol: 0.22 * v, dur: 0.22 }); break;
    case "bomb":
      noise(c, { dur: 0.7, type: "lowpass", f: 1800, f2: 80, q: 0.7, vol: 0.9 * v });
      tone(c, { f: 120, f2: 40, dur: 0.6, type: "sine", vol: 0.6 * v }); break;
    case "spin": noise(c, { dur: 0.45, f: 400, f2: 2400, q: 1.5, vol: 0.22 * v }); break;
    case "stop": tone(c, { f: 180 * p, f2: 120 * p, dur: 0.09, type: "triangle", vol: 0.35 * v }); noise(c, { dur: 0.05, f: 1200, q: 2, vol: 0.2 * v }); break;
    case "win": arp(c, [N.C5, N.E5, N.G5, N.C6].map((f) => f * p), 0.07, { vol: 0.3 * v }); break;
    case "bigwin":
      arp(c, [N.C5, N.E5, N.G5, N.C6, N.E6].map((f) => f * p), 0.075, { vol: 0.32 * v, dur: 0.35 });
      arp(c, [N.G5, N.C6, N.E6, N.G6], 0.06, { type: "sine", vol: 0.12 * v, dur: 0.5 }); break;
    case "epic":
      [0, 0.32].forEach((t) => [N.C5, N.E5, N.G5].forEach((f) => tone(c, { f, t, dur: 0.3, type: "sawtooth", vol: 0.07 * v })));
      [N.C5, N.E5, N.G5, N.C6].forEach((f) => tone(c, { f, t: 0.64, dur: 0.9, type: "sawtooth", vol: 0.08 * v }));
      arp(c, [N.C6, N.E6, N.G6, N.C7], 0.05, { type: "sine", vol: 0.12 * v, dur: 0.6 }); break;
    case "legendary":
      [0, 0.25, 0.5].forEach((t, i) => [N.C5, N.E5, N.G5].forEach((f) => tone(c, { f: f * [1, 1.122, 1.335][i], t, dur: 0.24, type: "sawtooth", vol: 0.07 * v })));
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f) => tone(c, { f, t: 0.78, dur: 1.4, type: "sawtooth", vol: 0.07 * v }));
      for (let i = 0; i < 10; i++) tone(c, { f: N.C7 * (1 + Math.random() * 0.6), t: 0.8 + i * 0.07, dur: 0.18, type: "sine", vol: 0.06 * v });
      break;
    case "lose": [N.E4, N.C4, 196].forEach((f, i) => tone(c, { f: f * p, t: i * 0.09, dur: 0.22, type: "triangle", vol: 0.13 * v })); break;
    case "cashout": [0, 0.06, 0.12, 0.2].forEach((t, i) => tone(c, { f: [1800, 2400, 2000, 3000][i] * p, t, dur: 0.12, type: "sine", vol: 0.18 * v })); break;
    case "coin": tone(c, { f: 2600 * p, dur: 0.08, type: "sine", vol: 0.16 * v }); tone(c, { f: 3900 * p, t: 0.04, dur: 0.12, type: "sine", vol: 0.1 * v }); break;
    case "launch": tone(c, { f: 160, f2: 900, dur: 0.6, type: "sawtooth", vol: 0.08 * v }); noise(c, { dur: 0.6, f: 300, f2: 3000, q: 0.8, vol: 0.2 * v }); break;
    case "crash": noise(c, { dur: 0.9, type: "lowpass", f: 3000, f2: 60, q: 0.5, vol: 0.8 * v }); tone(c, { f: 400, f2: 60, dur: 0.7, type: "sawtooth", vol: 0.1 * v }); break;
    case "whoosh": noise(c, { dur: 0.3, f: 600, f2: 3000, q: 0.9, vol: 0.25 * v }); break;
    case "thud": tone(c, { f: 140 * p, f2: 60, dur: 0.18, type: "sine", vol: 0.5 * v }); break;
    case "key": noise(c, { dur: 0.02, f: 4000, q: 4, vol: 0.18 * v }); break;
    case "error": tone(c, { f: 180, dur: 0.16, type: "square", vol: 0.1 * v }); tone(c, { f: 150, t: 0.1, dur: 0.18, type: "square", vol: 0.1 * v }); break;
    case "count": tone(c, { f: 1800 * p, dur: 0.03, type: "sine", vol: 0.06 * v }); break;
  }
}

/** The tier a payout multiplier earns: drives the sound, banner and particles. */
export type WinTier = "none" | "win" | "big" | "epic" | "legendary";
export const tierFor = (mult: number): WinTier => (mult >= 50 ? "legendary" : mult >= 10 ? "epic" : mult >= 3 ? "big" : mult > 1 ? "win" : "none");
export const tierSound: Record<WinTier, Sfx | null> = { none: null, win: "win", big: "bigwin", epic: "epic", legendary: "legendary" };

/** Call from any user gesture so later sounds (after awaits) are allowed to play. */
export function unlockAudio() { if (!muted) ac(); }

/** Pitch for the nth success in a streak: one semitone higher each time, capped at an octave. */
export const ladder = (n: number) => Math.pow(2, Math.min(12, Math.max(0, n)) / 12);

/** Short vibrations on phones (ignored elsewhere, and never before the first tap). */
const BUZZ = { tick: 6, tap: 8, win: [24, 50, 36], fail: [26, 60, 26], big: [30, 40, 30, 40, 60] } as const;
export function buzz(kind: keyof typeof BUZZ) {
  if (muted || typeof navigator === "undefined" || !("vibrate" in navigator) || !ctx) return;
  try { navigator.vibrate(BUZZ[kind] as number | number[]); } catch { /* ignore */ }
}
