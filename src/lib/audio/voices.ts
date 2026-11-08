/**
 * Instrument design adapted from the original Grim Hamster / Kris synthesis sources:
 * sources/approval-demos-v4/render.py (coin, bell, FM, rattle, warm, impact, mono body)
 * sources/listening-test-v1/render.py (wood, rubber, bass, pad, kick, rim, hat)
 * Defaults at brightness=1, decay=1, body=1 follow those formulas. This is not a sample player.
 */
import { Rng } from "./rng";
import { brightHz, filterInPlace, framesFor, midiHz, noiseBuffer, SR } from "./dsp";

export type VoiceName =
  | "coin"
  | "bell"
  | "fm"
  | "rattle"
  | "warm"
  | "impact"
  | "body"
  | "wood"
  | "rubber"
  | "bass"
  | "pad"
  | "kick"
  | "rim"
  | "hat"
  | "gust";

export interface VoiceOpts {
  note: number;
  dur: number;
  sr?: number;
  brightness?: number;
  decay?: number;
  body?: number;
  rng: Rng;
  /** Extra semitones. Body modes use this to shift the fixed 76/86/98 Hz centers. */
  transpose?: number;
}

function percussiveFinish(x: Float32Array, sr: number): void {
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] *= 1 - Math.exp(-t / 0.0011);
  }
  const z = Math.min(n, 441);
  const denom = Math.max(1, z - 1);
  for (let i = 0; i < z; i++) x[n - z + i] *= 1 - i / denom;
  for (let i = 0; i < n; i++) x[i] = Math.tanh(x[i] * 1.1) * 0.85;
}

function taper(x: Float32Array, seconds: number, sr: number): void {
  const z = Math.min(x.length, Math.max(2, Math.round(seconds * sr)));
  const denom = Math.max(1, z - 1);
  for (let i = 0; i < z; i++) x[x.length - z + i] *= 1 - i / denom;
}

export function renderVoice(kind: VoiceName, opts: VoiceOpts): Float32Array {
  const sr = opts.sr ?? SR;
  const brightness = opts.brightness ?? 1;
  const decay = Math.max(0.2, opts.decay ?? 1);
  const body = opts.body ?? 1;
  const transpose = opts.transpose ?? 0;
  const dur = Math.max(0.02, opts.dur);
  const n = framesFor(dur, sr);
  const note = opts.note + transpose;
  const f = midiHz(kind === "body" || kind === "kick" ? 69 : note);
  const br = 0.35 + 0.65 * brightness;
  const x = new Float32Array(n);

  if (kind === "coin") {
    const partials: [number, number, number, number][] = [
      [1, 0.6, 0.034, 0],
      [1.493, 0.28 * br, 0.018, 0.2],
      [2.071, 0.17 * br, 0.009, 0.4],
      [2.83, 0.07 * br, 0.007, 0],
    ];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [ratio, amp, tau, phase] of partials) {
        s += amp * Math.sin(2 * Math.PI * f * ratio * t + phase) * Math.exp(-t / (tau * decay));
      }
      s +=
        body *
        0.24 *
        Math.sin(2 * Math.PI * f * 0.251 * t + 0.65 * Math.exp(-t / (0.007 * decay))) *
        Math.exp(-t / (0.041 * decay));
      s += body * 0.12 * Math.sin(2 * Math.PI * 310 * 2 ** (transpose / 12) * t) * Math.exp(-t / (0.027 * decay));
      x[i] = s;
    }
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "lowpass", brightHz(4200, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) x[i] += nz[i] * 0.08 * Math.exp(-(i / sr) / (0.003 * decay));
    filterInPlace(x, "lowpass", brightHz(5100, brightness, sr), sr, 2);
    percussiveFinish(x, sr);
    return x;
  }

  if (kind === "bell") {
    const partials: [number, number, number][] = [
      [1, 0.8, 0.15],
      [2.005, 0.17 * br, 0.07],
      [3.91, 0.07 * br, 0.025],
    ];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [ratio, amp, tau] of partials) {
        s += amp * Math.sin(2 * Math.PI * f * ratio * t) * Math.exp(-t / (tau * decay));
      }
      s += body * 0.13 * Math.sin(2 * Math.PI * f * 0.5 * t) * Math.exp(-t / (0.12 * decay));
      x[i] = s;
    }
    filterInPlace(x, "lowpass", brightHz(5100, brightness, sr), sr, 2);
    percussiveFinish(x, sr);
    return x;
  }

  if (kind === "fm") {
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "lowpass", brightHz(2600, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s =
        Math.sin(2 * Math.PI * f * t + 2.1 * br * Math.exp(-t / (0.012 * decay)) * Math.sin(2 * Math.PI * f * 1.5 * t)) *
        Math.exp(-t / (0.026 * decay));
      s += 0.34 * Math.sin(2 * Math.PI * 230 * 2 ** (transpose / 12) * t) * Math.exp(-t / (0.012 * decay));
      s += nz[i] * 0.08 * Math.exp(-t / (0.0016 * decay));
      const low =
        Math.sin(
          2 * Math.PI * 285 * 2 ** (transpose / 12) * t +
            1.6 * Math.exp(-t / (0.009 * decay)) * Math.sin(2 * Math.PI * 141 * 2 ** (transpose / 12) * t),
        ) * Math.exp(-t / (0.036 * decay));
      x[i] = 0.82 * s + body * 0.3 * low;
    }
    filterInPlace(x, "lowpass", brightHz(5100, brightness, sr), sr, 2);
    percussiveFinish(x, sr);
    return x;
  }

  if (kind === "rattle") {
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "lowpass", brightHz(4600, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      x[i] = nz[i] * Math.exp(-t / (0.022 * decay)) * (0.6 + 0.4 * Math.cos(2 * Math.PI * 135 * t));
    }
    filterInPlace(x, "lowpass", brightHz(5100, brightness, sr), sr, 2);
    percussiveFinish(x, sr);
    return x;
  }

  if (kind === "warm") {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const k of [1, 2, 3, 4]) s += Math.sin(2 * Math.PI * f * k * t) / k ** 2;
      const env = Math.min(t / (0.2 * decay), 1) * Math.min(Math.max(dur - t, 0) / (0.35 * decay), 1);
      x[i] = s * 0.5 * env;
    }
    filterInPlace(x, "lowpass", brightHz(1800, brightness, sr), sr, 2);
    filterInPlace(x, "lowpass", brightHz(5100, brightness, sr), sr, 2);
    percussiveFinish(x, sr);
    return x;
  }

  if (kind === "impact") {
    const center = 105 * 2 ** (transpose / 12);
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "lowpass", brightHz(1800, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const phase = 2 * Math.PI * (center * t + 1.8 * (1 - Math.exp(-t / (0.014 * decay))));
      x[i] = Math.sin(phase) * Math.exp(-t / (0.065 * decay)) + body * 0.18 * nz[i] * Math.exp(-t / (0.009 * decay));
    }
    percussiveFinish(x, sr);
    return x;
  }

  if (kind === "body") {
    const mode = Math.max(0, Math.min(2, Math.round(opts.note)));
    const center = [86, 76, 98][mode] * 2 ** (transpose / 12);
    const tau = (0.052 + mode * 0.008) * decay;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const phase = 2 * Math.PI * center * t + 1 * (1 - Math.exp(-t / (0.012 * decay)));
      const s =
        (Math.sin(phase) + body * 0.48 * Math.sin(2 * phase + 0.2) + body * 0.23 * Math.sin(3 * phase)) *
        Math.exp(-t / tau);
      x[i] = Math.tanh(s * 1.65) * 0.75 * (1 - Math.exp(-t / 0.0015));
    }
    taper(x, 0.01, sr);
    return x;
  }

  if (kind === "wood") {
    const partials: [number, number, number][] = [
      [1, 1, 0.27],
      [2.013, 0.32 * br, 0.12],
      [3.96, 0.16 * br, 0.065],
      [6.17, 0.08 * br, 0.025],
    ];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [ratio, amp, tau] of partials) {
        s += amp * Math.sin(2 * Math.PI * f * ratio * t) * Math.exp(-t / (tau * decay));
      }
      x[i] = s;
    }
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "lowpass", brightHz(2400, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      x[i] = Math.tanh((x[i] + nz[i] * 0.16 * Math.exp(-t / (0.012 * decay))) * 1.25) * 0.7 * (1 - Math.exp(-t / 0.002));
    }
    taper(x, 0.012, sr);
    return x;
  }

  if (kind === "rubber") {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const phase = 2 * Math.PI * f * (t + 0.0007 * (1 - Math.exp(-t / 0.025)));
      let s = 0;
      for (const k of [1, 2, 3, 4, 5]) s += Math.sin(k * phase) / k ** 2;
      x[i] = s;
    }
    filterInPlace(x, "lowpass", brightHz(2100, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      x[i] *= Math.exp(-t / (0.19 * decay)) * (1 - Math.exp(-t / 0.004));
    }
    taper(x, 0.012, sr);
    return x;
  }

  if (kind === "bass") {
    const harm2 = 0.2 * (0.55 + 0.45 * body);
    const harm3 = 0.09 * (0.4 + 0.6 * body);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const s = (Math.sin(2 * Math.PI * f * t) + harm2 * Math.sin(2 * Math.PI * f * 2 * t) + harm3 * Math.sin(2 * Math.PI * f * 3 * t)) * 0.7;
      const attack = Math.min(t / 0.009, 1);
      const release = Math.min(Math.max(dur - t, 0) / 0.06, 1);
      x[i] = s * attack * release;
    }
    filterInPlace(x, "lowpass", brightHz(650, brightness, sr), sr, 2);
    taper(x, 0.012, sr);
    return x;
  }

  if (kind === "pad") {
    const partials: [number, number, number][] = [
      [1, 0.6, 0],
      [2.001, 0.11 * br, 0.4],
      [0.998, 0.22, 0.2],
    ];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [ratio, amp, phase] of partials) s += Math.sin(2 * Math.PI * f * ratio * t + phase) * amp;
      const env = Math.min(t / (0.25 * decay), 1) * Math.min(Math.max(dur - t, 0) / (0.45 * decay), 1);
      x[i] = s * env * 0.22;
    }
    filterInPlace(x, "lowpass", brightHz(1500, brightness, sr), sr, 2);
    taper(x, 0.012, sr);
    return x;
  }

  if (kind === "kick") {
    const center = 48 * 2 ** (transpose / 12);
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "lowpass", brightHz(2500, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const inst = center * t + 2 * (1 - Math.exp(-t / 0.024));
      x[i] = Math.sin(2 * Math.PI * inst) * Math.exp(-t / (0.085 * decay)) + nz[i] * 0.12 * Math.exp(-t / 0.005);
    }
    taper(x, 0.012, sr);
    return x;
  }

  if (kind === "rim") {
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "highpass", brightHz(1800, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      x[i] =
        (Math.sin(2 * Math.PI * 1760 * t) * 0.5 + Math.sin(2 * Math.PI * 940 * t) * 0.4) * Math.exp(-t / (0.016 * decay)) +
        nz[i] * 0.4 * Math.exp(-t / (0.028 * decay));
    }
    taper(x, 0.012, sr);
    return x;
  }

  if (kind === "hat") {
    const nz = noiseBuffer(n, opts.rng);
    filterInPlace(nz, "highpass", brightHz(6500, brightness, sr), sr, 2);
    for (let i = 0; i < n; i++) x[i] = nz[i] * Math.exp(-(i / sr) / (0.018 * decay)) * 0.38;
    taper(x, 0.012, sr);
    return x;
  }

  const nz = noiseBuffer(n, opts.rng);
  filterInPlace(nz, "highpass", brightHz(700, brightness, sr), sr, 2);
  filterInPlace(nz, "lowpass", brightHz(4200, brightness, sr), sr, 2);
  for (let i = 0; i < n; i++) {
    const u = n <= 1 ? 0 : i / (n - 1);
    x[i] = nz[i] * Math.sin(Math.PI * u) ** 1.35 * 0.55;
  }
  taper(x, 0.02, sr);
  return x;
}
