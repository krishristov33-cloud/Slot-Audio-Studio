import { makeStereo, peakOf, scaleStereo, SR, type Stereo } from "./dsp";

export type EffectType =
  | "eq"
  | "distortion"
  | "compressor"
  | "reverb"
  | "delay"
  | "pitch"
  | "resonator"
  | "clipper"
  | "limiter";

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export const EFFECT_TYPES: EffectType[] = [
  "eq",
  "distortion",
  "compressor",
  "reverb",
  "delay",
  "pitch",
  "resonator",
  "clipper",
  "limiter",
];

export function defaultEffect(type: EffectType, id: string): Effect {
  const params: Record<EffectType, Record<string, number>> = {
    eq: { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0, b7: 0, b8: 0, b9: 0 },
    distortion: { drive: 0.4 },
    compressor: { threshold: 0.4, ratio: 3, attack: 0.01, release: 0.12 },
    reverb: { mix: 0.25, decay: 0.45 },
    delay: { time: 0.18, feedback: 0.28, mix: 0.25 },
    pitch: { semitones: 0 },
    resonator: { freq: 440, feedback: 0.35 },
    clipper: { ceiling: 0.7 },
    limiter: { ceiling: 0.89 },
  };
  return { id, type, enabled: true, params: { ...params[type] } };
}

const EQ_FREQS = [40, 80, 160, 320, 640, 1250, 2500, 4000, 6000, 10000];

function peaking(freq: number, gainDb: number, sr: number) {
  const a = 10 ** (gainDb / 40);
  const w0 = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * 0.9);
  const b0 = 1 + alpha * a;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * a;
  const a0 = 1 + alpha / a;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / a;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function process(filter: { b0: number; b1: number; b2: number; a1: number; a2: number }, input: Float32Array): void {
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = filter.b0 * x + z1;
    z1 = filter.b1 * x - filter.a1 * y + z2;
    z2 = filter.b2 * x - filter.a2 * y;
    input[i] = y;
  }
}

function eachChannel(stereo: Stereo, fn: (channel: Float32Array) => void): void {
  fn(stereo.l);
  fn(stereo.r);
}

function resampleChannel(input: Float32Array, ratio: number): Float32Array {
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

export function applyEffect(stereo: Stereo, effect: Effect): void {
  if (!effect.enabled) return;
  const sr = stereo.sr || SR;
  const p = effect.params;
  if (effect.type === "eq") {
    for (let band = 0; band < 10; band++) {
      const gain = p[`b${band}`] ?? 0;
      if (Math.abs(gain) < 0.05) continue;
      const filter = peaking(EQ_FREQS[band], gain, sr);
      eachChannel(stereo, (channel) => process(filter, channel));
    }
    return;
  }
  if (effect.type === "distortion") {
    const drive = 1 + (p.drive ?? 0.4) * 12;
    eachChannel(stereo, (channel) => {
      for (let i = 0; i < channel.length; i++) channel[i] = Math.tanh(channel[i] * drive) / Math.tanh(drive);
    });
    return;
  }
  if (effect.type === "compressor") {
    const threshold = Math.max(0.05, p.threshold ?? 0.4);
    const ratio = Math.max(1, p.ratio ?? 3);
    const attack = Math.exp(-1 / (sr * Math.max(0.001, p.attack ?? 0.01)));
    const release = Math.exp(-1 / (sr * Math.max(0.01, p.release ?? 0.12)));
    eachChannel(stereo, (channel) => {
      let env = 0;
      for (let i = 0; i < channel.length; i++) {
        const abs = Math.abs(channel[i]);
        env = abs > env ? attack * env + (1 - attack) * abs : release * env + (1 - release) * abs;
        const over = env / threshold;
        const gain = over > 1 ? over ** (1 / ratio - 1) : 1;
        channel[i] *= gain;
      }
    });
    return;
  }
  if (effect.type === "reverb") {
    const mix = Math.max(0, Math.min(1, p.mix ?? 0.25));
    const decay = 0.2 + (p.decay ?? 0.45) * 0.75;
    const taps = [0.017, 0.029, 0.041, 0.053, 0.067, 0.083];
    const wet = makeStereo(stereo.l.length, sr);
    for (const tap of taps) {
      const delay = Math.round(tap * sr);
      const gain = decay ** (tap / 0.08) * 0.3;
      for (let i = delay; i < stereo.l.length; i++) {
        wet.l[i] += stereo.r[i - delay] * gain;
        wet.r[i] += stereo.l[i - delay] * gain;
      }
    }
    for (let i = 0; i < stereo.l.length; i++) {
      stereo.l[i] = stereo.l[i] * (1 - mix) + wet.l[i] * mix;
      stereo.r[i] = stereo.r[i] * (1 - mix) + wet.r[i] * mix;
    }
    return;
  }
  if (effect.type === "delay") {
    const delay = Math.max(1, Math.round((p.time ?? 0.18) * sr));
    const feedback = Math.max(0, Math.min(0.85, p.feedback ?? 0.28));
    const mix = Math.max(0, Math.min(1, p.mix ?? 0.25));
    const wetL = new Float32Array(stereo.l.length);
    const wetR = new Float32Array(stereo.r.length);
    for (let i = delay; i < stereo.l.length; i++) {
      wetL[i] = stereo.l[i - delay] + wetL[i - delay] * feedback;
      wetR[i] = stereo.r[i - delay] + wetR[i - delay] * feedback;
    }
    for (let i = 0; i < stereo.l.length; i++) {
      stereo.l[i] = stereo.l[i] * (1 - mix) + wetL[i] * mix;
      stereo.r[i] = stereo.r[i] * (1 - mix) + wetR[i] * mix;
    }
    return;
  }
  if (effect.type === "pitch") {
    const ratio = 2 ** ((p.semitones ?? 0) / 12);
    stereo.l = resampleChannel(stereo.l, ratio);
    stereo.r = resampleChannel(stereo.r, ratio);
    return;
  }
  if (effect.type === "resonator") {
    const freq = Math.max(40, p.freq ?? 440);
    const feedback = Math.max(0, Math.min(0.9, p.feedback ?? 0.35));
    const delay = Math.max(2, Math.round(sr / freq));
    eachChannel(stereo, (channel) => {
      for (let i = delay; i < channel.length; i++) channel[i] += channel[i - delay] * feedback;
    });
    return;
  }
  if (effect.type === "clipper") {
    const ceiling = Math.max(0.05, p.ceiling ?? 0.7);
    eachChannel(stereo, (channel) => {
      for (let i = 0; i < channel.length; i++) {
        const x = channel[i];
        channel[i] = Math.max(-ceiling, Math.min(ceiling, x));
      }
    });
    return;
  }
  const ceiling = Math.max(0.05, p.ceiling ?? 0.89);
  const peak = peakOf(stereo);
  if (peak > ceiling) scaleStereo(stereo, ceiling / peak);
}

export function applyChain(stereo: Stereo, effects: Effect[]): void {
  for (const effect of effects) applyEffect(stereo, effect);
}

/** Safety trim used after every render. */
export function limitTo(stereo: Stereo, ceiling = 0.89): number {
  const peak = peakOf(stereo);
  if (peak > ceiling) scaleStereo(stereo, ceiling / peak);
  return peakOf(stereo);
}
