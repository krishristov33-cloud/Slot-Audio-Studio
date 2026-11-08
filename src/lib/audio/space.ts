/**
 * Spatial design from approval-demos-v4: 27/49/81 ms early reflections,
 * diffuse taps from 41 ms, quiet 167/281 ms echoes, wet HP 390 / LP 3900.
 * Music loops use the circular multi-tap from listening-test-v1 instead of a reset fade.
 */
import { type Stereo, copyStereo, filterInPlace, makeStereo } from "./dsp";

export function renderSpace(
  src: Stereo,
  amount: number,
  rt: number,
  opts?: { award?: boolean; brightness?: number },
): Stereo {
  const n = src.l.length;
  const sr = src.sr;
  const wet = makeStereo(n, sr);
  if (amount <= 0.0001 || n < 8) return wet;
  const left = Float32Array.from(src.l);
  const right = Float32Array.from(src.r);
  const brightness = opts?.brightness ?? 1;
  const lowpass = Math.min(sr * 0.45, 3900 * (0.7 + 0.3 * brightness));
  filterInPlace(left, "highpass", 390, sr, 2);
  filterInPlace(right, "highpass", 390, sr, 2);
  filterInPlace(left, "lowpass", lowpass, sr, 2);
  filterInPlace(right, "lowpass", lowpass, sr, 2);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (left[i] + right[i]) * 0.5;
  const rtUse = Math.max(0.2, rt) * (opts?.award ? 1.45 : 1);
  const reflections: [number, number][] = [
    [0.027, 0.16],
    [0.049, 0.12],
    [0.081, 0.09],
  ];
  for (const [sec, gain] of reflections) {
    const k = Math.round(sec * sr);
    const g = gain * amount;
    if (k >= n || k < 1) continue;
    for (let i = k; i < n; i++) {
      wet.l[i] += right[i - k] * g;
      wet.r[i] += left[i - k] * g;
    }
  }
  for (let j = 0; j < 64; j++) {
    for (let c = 0; c < 2; c++) {
      const sec = 0.041 + j * 0.0237 + (c ? 0.0049 : 0) + 0.003 * Math.sin(j * 2.1 + c);
      const k = Math.round(sec * sr);
      if (k >= n || k < 1) continue;
      const amp = 0.065 * Math.exp((-sec * 6.91) / rtUse) * amount;
      if (amp < 0.00002) continue;
      const out = c === 0 ? wet.l : wet.r;
      for (let i = k; i < n; i++) out[i] += mono[i - k] * amp;
    }
  }
  const echoes: [number, number][] = [
    [0.167, 0.045],
    [0.281, 0.025],
  ];
  for (const [sec, gain] of echoes) {
    const k = Math.round(sec * sr);
    const g = gain * amount;
    if (k >= n || k < 1) continue;
    for (let i = k; i < n; i++) {
      wet.l[i] += right[i - k] * g;
      wet.r[i] += left[i - k] * g;
    }
  }
  return wet;
}

export interface CircularTap {
  sec: number;
  gain: number;
  swap: boolean;
}

/** Circular delays so a loop's tail is the same signal as the start. No endpoint fade. */
export function circularDelays(src: Stereo, amount: number, taps: CircularTap[]): Stereo {
  if (amount <= 0.0001) return copyStereo(src);
  const n = src.l.length;
  const sr = src.sr;
  const y = copyStereo(src);
  for (const tap of taps) {
    const k = Math.round(tap.sec * sr) % n;
    if (k === 0) continue;
    const g = tap.gain * amount;
    for (let i = 0; i < n; i++) {
      const j = (i - k + n) % n;
      if (tap.swap) {
        y.l[i] += src.r[j] * g;
        y.r[i] += src.l[j] * g;
      } else {
        y.l[i] += src.l[j] * g;
        y.r[i] += src.r[j] * g;
      }
    }
  }
  return y;
}

export function musicDelays(beatSeconds: number): CircularTap[] {
  return [
    { sec: 0.071, gain: 0.14, swap: true },
    { sec: 0.113, gain: 0.11, swap: false },
    { sec: 0.187, gain: 0.075, swap: true },
    { sec: beatSeconds * 0.75, gain: 0.16, swap: true },
    { sec: beatSeconds * 1.5, gain: 0.07, swap: false },
  ];
}
