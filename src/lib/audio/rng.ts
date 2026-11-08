/** Deterministic PRNG for this engine. Not NumPy's PCG64, so reference WAVs are not bit-identical. */

export class Rng {
  private x: number;

  constructor(seed: number) {
    this.x = seed >>> 0;
    if (this.x === 0) this.x = 0x6d2b79f5;
  }

  next(): number {
    let x = this.x;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.x = x >>> 0;
    return this.x / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Box-Muller gaussian, deterministic given the uniform stream. */
  gaussian(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }
}

export function mixSeed(seed: number, ...parts: number[]): number {
  let x = seed >>> 0;
  if (x === 0) x = 0x6d2b79f5;
  for (const part of parts) {
    x = Math.imul(x ^ (part >>> 0), 0x9e3779b1) >>> 0;
  }
  return x === 0 ? 0x6d2b79f5 : x;
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
