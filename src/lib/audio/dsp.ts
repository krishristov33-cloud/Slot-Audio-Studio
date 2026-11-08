export const SR = 44100;

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
  sr: number;
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function db(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, 1e-12));
}

export function midiHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export function makeStereo(frames: number, sr = SR): Stereo {
  return { l: new Float32Array(Math.max(1, frames)), r: new Float32Array(Math.max(1, frames)), sr };
}

export function framesFor(seconds: number, sr = SR): number {
  return Math.max(1, Math.round(seconds * sr));
}

export function copyStereo(src: Stereo): Stereo {
  return { l: Float32Array.from(src.l), r: Float32Array.from(src.r), sr: src.sr };
}

export function silenceLike(src: Stereo): Stereo {
  return makeStereo(src.l.length, src.sr);
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook biquad, bilinear, Butterworth Q for low/high pass. */
export function designBiquad(
  kind: "lowpass" | "highpass" | "bandpass",
  freq: number,
  sr: number,
  q = Math.SQRT1_2,
): Biquad {
  const f = Math.min(Math.max(freq, 5), sr * 0.47);
  const w0 = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (kind === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (kind === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

export function applyBiquad(filter: Biquad, input: Float32Array, output?: Float32Array): Float32Array {
  const y = output ?? new Float32Array(input.length);
  let z1 = 0;
  let z2 = 0;
  const { b0, b1, b2, a1, a2 } = filter;
  for (let i = 0; i < input.length; i++) {
    const xi = input[i];
    const yi = b0 * xi + z1;
    z1 = b1 * xi - a1 * yi + z2;
    z2 = b2 * xi - a2 * yi;
    y[i] = yi;
  }
  return y;
}

function onePole(input: Float32Array, kind: "lowpass" | "highpass", freq: number, sr: number): void {
  const a = Math.exp((-2 * Math.PI * Math.min(freq, sr * 0.45)) / sr);
  if (kind === "lowpass") {
    let y = 0;
    for (let i = 0; i < input.length; i++) {
      y = (1 - a) * input[i] + a * y;
      input[i] = y;
    }
    return;
  }
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < input.length; i++) {
    const y = a * (prevY + input[i] - prevX);
    prevX = input[i];
    prevY = y;
    input[i] = y;
  }
}

export function filterInPlace(
  input: Float32Array,
  kind: "lowpass" | "highpass",
  freq: number,
  sr: number,
  order = 2,
): void {
  if (order >= 2) applyBiquad(designBiquad(kind, freq, sr), input, input);
  if (order === 1 || order === 3) onePole(input, kind, freq, sr);
  if (order >= 4) applyBiquad(designBiquad(kind, freq, sr), input, input);
}

export function filterStereo(src: Stereo, kind: "lowpass" | "highpass", freq: number, order = 2): void {
  filterInPlace(src.l, kind, freq, src.sr, order);
  filterInPlace(src.r, kind, freq, src.sr, order);
}

/** Constant-power pan. -1 left, 0 center, +1 right. Matches the Python gain law. */
export function panGains(pan: number): [number, number] {
  const p = clamp(pan, -1, 1);
  const angle = ((p + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

export function addMono(
  dest: Stereo,
  start: number,
  src: Float32Array,
  gainL: number,
  gainR: number,
  circular = false,
): void {
  const n = dest.l.length;
  const m = src.length;
  if (!circular) {
    const from = Math.max(0, start);
    const to = Math.min(n, start + m);
    for (let i = from; i < to; i++) {
      const sample = src[i - start];
      dest.l[i] += sample * gainL;
      dest.r[i] += sample * gainR;
    }
    return;
  }
  if (n === 0) return;
  for (let i = 0; i < m; i++) {
    const idx = ((start + i) % n + n) % n;
    const sample = src[i];
    dest.l[idx] += sample * gainL;
    dest.r[idx] += sample * gainR;
  }
}

export function addStereo(dest: Stereo, src: Stereo, gain = 1): void {
  const n = Math.min(dest.l.length, src.l.length);
  for (let i = 0; i < n; i++) {
    dest.l[i] += src.l[i] * gain;
    dest.r[i] += src.r[i] * gain;
  }
}

export function scaleStereo(src: Stereo, gain: number): void {
  for (let i = 0; i < src.l.length; i++) {
    src.l[i] *= gain;
    src.r[i] *= gain;
  }
}

export function peakOf(src: Stereo): number {
  let peak = 0;
  for (let i = 0; i < src.l.length; i++) {
    const a = Math.abs(src.l[i]);
    const b = Math.abs(src.r[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  return peak;
}

export function rmsOf(src: Stereo): number {
  let acc = 0;
  const n = src.l.length * 2;
  if (n === 0) return 0;
  for (let i = 0; i < src.l.length; i++) acc += src.l[i] * src.l[i] + src.r[i] * src.r[i];
  return Math.sqrt(acc / n);
}

export function repairNonFinite(src: Stereo): number {
  let count = 0;
  for (let i = 0; i < src.l.length; i++) {
    if (!Number.isFinite(src.l[i])) {
      src.l[i] = 0;
      count++;
    }
    if (!Number.isFinite(src.r[i])) {
      src.r[i] = 0;
      count++;
    }
  }
  return count;
}

export function removeDc(src: Stereo): void {
  let meanL = 0;
  let meanR = 0;
  const n = src.l.length;
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    meanL += src.l[i];
    meanR += src.r[i];
  }
  meanL /= n;
  meanR /= n;
  for (let i = 0; i < n; i++) {
    src.l[i] -= meanL;
    src.r[i] -= meanR;
  }
}

export function fadeEdges(src: Stereo, fadeInSamples: number, fadeOutSamples: number): void {
  const n = src.l.length;
  const inn = Math.min(n, Math.max(0, fadeInSamples));
  for (let i = 0; i < inn; i++) {
    const g = inn <= 1 ? 1 : i / inn;
    src.l[i] *= g;
    src.r[i] *= g;
  }
  const out = Math.min(n, Math.max(0, fadeOutSamples));
  const start = n - out;
  for (let i = 0; i < out; i++) {
    const g = out <= 1 ? 0 : 1 - i / out;
    src.l[start + i] *= g;
    src.r[start + i] *= g;
  }
}

export function countOnsets(channel: Float32Array, threshold: number): number {
  let count = 0;
  let armed = true;
  const release = threshold * 0.35;
  for (let i = 0; i < channel.length; i++) {
    const a = Math.abs(channel[i]);
    if (armed && a >= threshold) {
      count++;
      armed = false;
    } else if (!armed && a < release) {
      armed = true;
    }
  }
  return count;
}

export function zeroCrossings(channel: Float32Array): number {
  let count = 0;
  for (let i = 1; i < channel.length; i++) {
    if ((channel[i - 1] <= 0 && channel[i] > 0) || (channel[i - 1] >= 0 && channel[i] < 0)) count++;
  }
  return count;
}

/** High-pass the side channel so low energy stays centered. */
export function protectMonoLow(src: Stereo, hpHz = 300): void {
  const n = src.l.length;
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mid[i] = (src.l[i] + src.r[i]) * 0.5;
    side[i] = (src.l[i] - src.r[i]) * 0.5;
  }
  filterInPlace(side, "highpass", hpHz, src.sr, 3);
  for (let i = 0; i < n; i++) {
    src.l[i] = mid[i] + side[i];
    src.r[i] = mid[i] - side[i];
  }
}

export function brightHz(hz: number, brightness: number, sr: number): number {
  const scaled = hz * (0.45 + 0.55 * brightness);
  return Math.min(sr * 0.46, Math.max(40, scaled));
}

export function noiseBuffer(length: number, rng: { gaussian: () => number }): Float32Array {
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = rng.gaussian();
  return x;
}

export function snapMidi(midi: number, root: number, scale: number[]): number {
  const rounded = Math.round(midi);
  let best = rounded;
  let dist = 99;
  for (let delta = -6; delta <= 6; delta++) {
    const candidate = rounded + delta;
    const pc = (((candidate - root) % 12) + 12) % 12;
    if (scale.includes(pc) && Math.abs(delta) < dist) {
      dist = Math.abs(delta);
      best = candidate;
    }
  }
  return best;
}

export const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

export function midiToName(midi: number): string {
  const n = Math.round(midi);
  const octave = Math.floor(n / 12) - 1;
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function nameToMidi(name: string, octave: number): number {
  const index = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
  const pc = index < 0 ? 0 : index;
  return (octave + 1) * 12 + pc;
}
