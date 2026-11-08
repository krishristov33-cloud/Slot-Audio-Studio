import { filterInPlace, peakOf, rmsOf, type Stereo } from "./dsp";

export interface Analysis {
  peak: number;
  rms: number;
  dc: [number, number];
  clipped: number;
  nonfinite: number;
  correlation: number;
  monoFoldDb: number;
  lastPeak: number;
}

export function analyze(src: Stereo): Analysis {
  const n = src.l.length;
  let sumL = 0;
  let sumR = 0;
  let nonfinite = 0;
  let clipped = 0;
  let sumLR = 0;
  let sumLL = 0;
  let sumRR = 0;
  let sumMid = 0;
  let sumAll = 0;
  for (let i = 0; i < n; i++) {
    const l = src.l[i];
    const r = src.r[i];
    if (!Number.isFinite(l)) nonfinite++;
    if (!Number.isFinite(r)) nonfinite++;
    if (Math.abs(l) >= 0.999) clipped++;
    if (Math.abs(r) >= 0.999) clipped++;
    sumL += l;
    sumR += r;
  }
  const meanL = sumL / n;
  const meanR = sumR / n;
  for (let i = 0; i < n; i++) {
    const l = src.l[i] - meanL;
    const r = src.r[i] - meanR;
    sumLR += l * r;
    sumLL += l * l;
    sumRR += r * r;
    const mid = (src.l[i] + src.r[i]) * 0.5;
    sumMid += mid * mid;
    sumAll += src.l[i] * src.l[i] + src.r[i] * src.r[i];
  }
  const correlation = sumLL > 0 && sumRR > 0 ? sumLR / Math.sqrt(sumLL * sumRR) : 1;
  const monoFoldDb = 10 * Math.log10((sumMid / n + 1e-18) / (sumAll / (n * 2) + 1e-18));
  const tail = Math.min(n, Math.round(0.02 * src.sr));
  let lastPeak = 0;
  for (let i = n - tail; i < n; i++) {
    lastPeak = Math.max(lastPeak, Math.abs(src.l[i]), Math.abs(src.r[i]));
  }
  return {
    peak: peakOf(src),
    rms: rmsOf(src),
    dc: [meanL, meanR],
    clipped,
    nonfinite,
    correlation,
    monoFoldDb,
    lastPeak,
  };
}

export function bandEnergy(src: Stereo, lowHz: number, highHz: number): number {
  const left = Float32Array.from(src.l);
  const right = Float32Array.from(src.r);
  filterInPlace(left, "highpass", lowHz, src.sr, 2);
  filterInPlace(right, "highpass", lowHz, src.sr, 2);
  filterInPlace(left, "lowpass", highHz, src.sr, 2);
  filterInPlace(right, "lowpass", highHz, src.sr, 2);
  let acc = 0;
  for (let i = 0; i < left.length; i++) acc += left[i] * left[i] + right[i] * right[i];
  return acc / (left.length * 2);
}

export function seamJump(src: Stereo): { boundary: number; maxAdjacent: number } {
  const n = src.l.length;
  let maxAdjacent = 0;
  for (const channel of [src.l, src.r]) {
    for (let i = 1; i < n; i++) {
      const jump = Math.abs(channel[i] - channel[i - 1]);
      if (jump > maxAdjacent) maxAdjacent = jump;
    }
  }
  const boundary = Math.max(Math.abs(src.l[0] - src.l[n - 1]), Math.abs(src.r[0] - src.r[n - 1]));
  return { boundary, maxAdjacent };
}

export function earlyRms(src: Stereo, seconds: number): number {
  const n = Math.min(src.l.length, Math.max(1, Math.round(seconds * src.sr)));
  let acc = 0;
  for (let i = 0; i < n; i++) acc += src.l[i] * src.l[i] + src.r[i] * src.r[i];
  return Math.sqrt(acc / (n * 2));
}
