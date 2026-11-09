import { Rng } from "./rng";
import { midiHz, SR } from "./dsp";

export type Algorithm =
  | "subtractive"
  | "fm"
  | "additive"
  | "wavetable"
  | "karplus"
  | "granular"
  | "noise"
  | "modal"
  | "resample";

export const ALGORITHMS: Algorithm[] = [
  "subtractive",
  "fm",
  "additive",
  "wavetable",
  "karplus",
  "granular",
  "noise",
  "modal",
  "resample",
];

export interface NoteOpts {
  midi: number;
  seconds: number;
  brightness: number;
  weirdness: number;
  energy: number;
  sr?: number;
  rng: Rng;
}

function envelope(length: number, attack: number, decay: number): (i: number) => number {
  return (i: number) => {
    const t = i / length;
    const a = Math.min(1, t / Math.max(0.001, attack));
    const d = Math.exp(-t / Math.max(0.02, decay));
    return a * d;
  };
}

function saw(phase: number, partials: number): number {
  let y = 0;
  for (let k = 1; k <= partials; k++) y += Math.sin(phase * k) / k;
  return y * 0.6;
}

function square(phase: number): number {
  let y = 0;
  for (let k = 1; k <= 7; k += 2) y += Math.sin(phase * k) / k;
  return y * 0.7;
}

function onePoleLow(input: Float32Array, cutoff: number, sr: number): void {
  const a = Math.exp((-2 * Math.PI * Math.min(cutoff, sr * 0.45)) / sr);
  let y = 0;
  for (let i = 0; i < input.length; i++) {
    y = (1 - a) * input[i] + a * y;
    input[i] = y;
  }
}

export function renderNote(algorithm: Algorithm, opts: NoteOpts): Float32Array {
  const sr = opts.sr ?? SR;
  const seconds = Math.max(0.02, opts.seconds);
  const length = Math.max(8, Math.round(seconds * sr));
  const out = new Float32Array(length);
  const freq = Math.max(30, midiHz(opts.midi));
  const bright = 0.25 + opts.brightness * 1.1;
  const weird = opts.weirdness;
  const env = envelope(length, 0.004, 0.18 + (1 - opts.energy) * 0.25);

  if (algorithm === "subtractive") {
    const partials = 3 + Math.round(bright * 8);
    let phase = 0;
    const step = (2 * Math.PI * freq) / sr;
    for (let i = 0; i < length; i++) {
      phase += step;
      out[i] = saw(phase, partials) * env(i);
    }
    onePoleLow(out, 400 + bright * 3200, sr);
    return out;
  }

  if (algorithm === "fm") {
    const index = 0.6 + weird * 4 + bright;
    const ratio = 1 + Math.round(weird * 3) * 0.5;
    let carrier = 0;
    let mod = 0;
    const cStep = (2 * Math.PI * freq) / sr;
    const mStep = cStep * ratio;
    for (let i = 0; i < length; i++) {
      mod += mStep;
      const modAmount = index * Math.exp(-i / sr / (0.08 + weird * 0.1));
      carrier += cStep + Math.sin(mod) * modAmount * cStep;
      out[i] = Math.sin(carrier) * env(i) * 0.8;
    }
    return out;
  }

  if (algorithm === "additive") {
    const count = 4 + Math.round(bright * 8);
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      let y = 0;
      for (let k = 1; k <= count; k++) {
        const detune = 1 + weird * 0.015 * (k % 2 === 0 ? 1 : -1);
        y += Math.sin(2 * Math.PI * freq * k * detune * t) / k;
      }
      out[i] = y * env(i) * 0.45;
    }
    return out;
  }

  if (algorithm === "wavetable") {
    let phase = 0;
    const step = (2 * Math.PI * freq) / sr;
    for (let i = 0; i < length; i++) {
      phase += step;
      const morph = (i / length) * (0.4 + weird) + opts.energy * 0.2;
      const sine = Math.sin(phase);
      const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
      const sq = square(phase);
      const sw = saw(phase, 6);
      const shapes = [sine, tri, sq, sw];
      const pos = morph * (shapes.length - 1);
      const a = Math.floor(pos) % shapes.length;
      const b = (a + 1) % shapes.length;
      const f = pos - Math.floor(pos);
      out[i] = (shapes[a] * (1 - f) + shapes[b] * f) * env(i) * 0.7;
    }
    onePoleLow(out, 500 + bright * 4000, sr);
    return out;
  }

  if (algorithm === "karplus") {
    const period = Math.max(8, Math.min(length - 1, Math.round(sr / freq)));
    const delay = new Float32Array(period);
    for (let i = 0; i < period; i++) delay[i] = opts.rng.next() * 2 - 1;
    let index = 0;
    const feedback = 0.86 + opts.energy * 0.1 - weird * 0.05;
    for (let i = 0; i < length; i++) {
      const current = delay[index];
      const next = delay[(index + 1) % period];
      delay[index] = (current + next) * 0.5 * feedback;
      out[i] = current * 0.8;
      index = (index + 1) % period;
    }
    return out;
  }

  if (algorithm === "granular") {
    const grain = Math.max(80, Math.round(sr * (0.012 + (1 - opts.energy) * 0.03)));
    const hop = Math.max(40, Math.round(grain * (0.35 + weird * 0.4)));
    for (let start = 0; start < length; start += hop) {
      const detune = 1 + (opts.rng.next() * 2 - 1) * weird * 0.08;
      for (let i = 0; i < grain && start + i < length; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grain);
        out[start + i] += Math.sin((2 * Math.PI * freq * detune * (start + i)) / sr) * w * 0.35;
      }
    }
    return out;
  }

  if (algorithm === "noise") {
    const center = Math.min(sr * 0.4, freq * (2 + bright * 6));
    for (let i = 0; i < length; i++) out[i] = opts.rng.gaussian() * env(i);
    onePoleLow(out, center, sr);
    const high = new Float32Array(out);
    onePoleLow(high, Math.max(80, center * 0.45), sr);
    for (let i = 0; i < length; i++) out[i] = (out[i] - high[i]) * 1.4;
    return out;
  }

  if (algorithm === "modal") {
    const ratios = [1, 2.01 + weird * 0.2, 2.76, 3.9, 5.2, 6.8];
    const decays = [0.35, 0.18, 0.1, 0.06, 0.04, 0.025];
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      let y = 0;
      for (let k = 0; k < ratios.length; k++) {
        y += Math.sin(2 * Math.PI * freq * ratios[k] * t) * Math.exp(-t / decays[k]) * (1 / (k + 1));
      }
      out[i] = y * 0.45;
    }
    return out;
  }

  const base = renderNote("subtractive", { ...opts, seconds });
  const ratio = 2 ** (((weird - 0.2) * 12) / 12);
  return resampleLinear(base, ratio);
}

export function resampleLinear(input: Float32Array, ratio: number): Float32Array {
  const speed = Math.max(0.25, Math.min(4, ratio));
  const out = new Float32Array(input.length);
  for (let i = 0; i < out.length; i++) {
    const position = i * speed;
    const index = Math.floor(position);
    if (index >= input.length - 1) break;
    const frac = position - index;
    out[i] = input[index] * (1 - frac) + input[index + 1] * frac;
  }
  return out;
}

export function mixInto(dest: Float32Array, start: number, clip: Float32Array, gain: number): void {
  for (let i = 0; i < clip.length; i++) {
    const index = start + i;
    if (index >= 0 && index < dest.length) dest[index] += clip[i] * gain;
  }
}
