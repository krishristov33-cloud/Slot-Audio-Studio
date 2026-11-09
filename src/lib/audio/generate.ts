import { mixSeed, Rng } from "./rng";
import { framesFor, makeStereo, panGains, peakOf, scaleStereo, SR, type Stereo } from "./dsp";
import { mixInto, renderNote, resampleLinear, type Algorithm } from "./algorithms";
import { applyChain, limitTo, type Effect } from "./fx";
import { valueAt, type AutomationLane } from "./automation";
import { arrangeParts, type ClipPart } from "./timeline";
import { chordTones, progressionById } from "./chords";
import { themeById, type Theme } from "./themes";
import type { ScaleName } from "./scales";
import type { Family } from "./sfx";
import type { CueKind } from "./catalogue";

export interface SoundParams {
  scale: ScaleName;
  root: number;
  bpm: number;
  duration: number;
  mood: number;
  energy: number;
  brightness: number;
  weirdness: number;
  tickRate: number;
  pitchCurve: number;
  tiers: number;
  density: number;
  finish: number;
  transient: number;
  body: number;
  tail: number;
  sub: number;
  progression: string;
  algorithm: Algorithm;
  variation: number;
}

export interface Layer {
  id: string;
  name: string;
  mode: "stack" | "resample";
  algorithm: Algorithm;
  gain: number;
  mute: boolean;
  solo: boolean;
  effects: Effect[];
  automation: AutomationLane[];
}

export interface Sound {
  id: string;
  name: string;
  pack: string;
  kind: CueKind;
  family: Family;
  blurb: string;
  implemented: boolean;
  params: SoundParams;
  locks: string[];
  layers: Layer[];
  parts: ClipPart[];
  master: Effect[];
  peaks: number[];
  generated: boolean;
}

export interface Rendered {
  /** Dry take, before clip cuts and fades. */
  source: Stereo;
  stereo: Stereo;
  peaks: number[];
  loop: boolean;
  note?: string;
}

export function controlGroup(sound: Pick<Sound, "family" | "kind">): "countup" | "impact" | "music" | "tone" {
  if (sound.family === "countup" || sound.family === "countup-finish") return "countup";
  if (sound.family === "music") return "music";
  if (sound.family === "impact" || sound.family === "lock" || sound.family === "whoosh" || sound.family === "riser") return "impact";
  return "tone";
}

export function peaksOf(stereo: Stereo, columns = 72): number[] {
  const out: number[] = [];
  const length = stereo.l.length;
  if (!length) return Array.from({ length: columns }, () => 0);
  for (let column = 0; column < columns; column++) {
    const start = Math.floor((column * length) / columns);
    const end = Math.max(start + 1, Math.floor(((column + 1) * length) / columns));
    let peak = 0;
    const step = Math.max(1, Math.floor((end - start) / 8));
    for (let i = start; i < end && i < length; i += step) {
      peak = Math.max(peak, Math.abs(stereo.l[i]), Math.abs(stereo.r[i]));
    }
    out.push(peak);
  }
  return out;
}

function downmix(stereo: Stereo): Float32Array {
  const mono = new Float32Array(stereo.l.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (stereo.l[i] + stereo.r[i]) * 0.5;
  return mono;
}

function toStereo(mono: Float32Array, sr: number, pan = 0): Stereo {
  const stereo = makeStereo(mono.length, sr);
  const [left, right] = panGains(pan);
  for (let i = 0; i < mono.length; i++) {
    stereo.l[i] = mono[i] * left;
    stereo.r[i] = mono[i] * right;
  }
  return stereo;
}

function applyGainLane(stereo: Stereo, lanes: AutomationLane[], fallback: number): void {
  const lane = lanes.find((item) => item.param === "gain");
  if (!lane || !lane.points.length) {
    if (fallback !== 1) scaleStereo(stereo, fallback);
    return;
  }
  for (let i = 0; i < stereo.l.length; i++) {
    const gain = valueAt(lane.points, i / stereo.sr, fallback);
    stereo.l[i] *= gain;
    stereo.r[i] *= gain;
  }
}

function paintFamily(mono: Float32Array, sound: Sound, theme: Theme, algorithm: Algorithm, seconds: number, sr: number, rng: Rng): void {
  const params = sound.params;
  const mood = params.mood;
  const bright = Math.min(1.4, params.brightness * (0.7 + theme.brightness * 0.6));
  const weird = Math.min(1, params.weirdness * 0.5 + theme.weirdness * 0.5);
  const energy = Math.min(1, params.energy * 0.5 + theme.energy * 0.5);
  const group = controlGroup(sound);
  const note = (midi: number, at: number, dur: number, gain: number, panSwing = 0) => {
    const clip = renderNote(algorithm, { midi, seconds: dur, brightness: bright, weirdness: weird, energy, sr, rng });
    mixInto(mono, Math.round(at * sr), clip, gain * (0.75 + mood * 0.35));
    void panSwing;
  };

  if (!sound.implemented || sound.family === "import" || sound.family === "unimplemented") return;

  if (group === "countup") {
    const tiers = Math.max(1, Math.round(params.tiers));
    const rate = Math.max(4, params.tickRate);
    let time = 0.02;
    let step = 0;
    while (time < seconds - 0.05 && step < 800) {
      const u = time / seconds;
      const tier = Math.min(tiers - 1, Math.floor(u * tiers));
      const pitch = params.root + 12 + u * params.pitchCurve + tier * 2;
      note(pitch, time, 0.07, 0.34 + tier * 0.05, step % 2 ? 0.2 : -0.2);
      if (step % Math.max(1, Math.round(4 - params.density * 3)) === 0) {
        note(pitch + 7, time + 0.01, 0.12, 0.16 * params.density);
      }
      time += 1 / (rate * (1 + u * 0.8));
      step += 1;
    }
    const finish = ["modal", "subtractive", "additive", "fm"][Math.max(0, Math.min(3, Math.round(params.finish)))] as Algorithm;
    const sting = renderNote(params.finish > 2 ? finish : algorithm, {
      midi: params.root + 12 + params.pitchCurve,
      seconds: Math.min(0.8, seconds * 0.45),
      brightness: bright,
      weirdness: weird,
      energy,
      sr,
      rng,
    });
    mixInto(mono, Math.round(Math.max(0.05, seconds - 0.35) * sr), sting, 0.55);
    return;
  }

  if (group === "impact") {
    const noise = renderNote("noise", { midi: params.root + 12, seconds: 0.08 + params.transient * 0.12, brightness: bright, weirdness: weird, energy, sr, rng });
    mixInto(mono, 0, noise, 0.45 * params.transient);
    const body = renderNote(algorithm, { midi: params.root - 12, seconds: 0.18 + params.body * 0.25, brightness: bright * 0.7, weirdness: weird, energy, sr, rng });
    mixInto(mono, Math.round(0.005 * sr), body, 0.7 * params.body);
    const tail = renderNote("noise", { midi: params.root, seconds: 0.2 + params.tail * 0.45, brightness: bright * 0.5, weirdness: weird, energy: energy * 0.5, sr, rng });
    mixInto(mono, Math.round(0.03 * sr), tail, 0.28 * params.tail);
    const sub = renderNote("subtractive", { midi: Math.max(36, params.root - 24), seconds: 0.25 + params.sub * 0.3, brightness: 0.25, weirdness: 0.05, energy, sr, rng });
    mixInto(mono, 0, sub, 0.55 * params.sub);
    return;
  }

  if (group === "music") {
    const beat = 60 / Math.max(70, params.bpm);
    const beats = Math.max(4, Math.round(seconds / beat));
    const progression = progressionById(params.progression);
    for (let beatIndex = 0; beatIndex < beats; beatIndex++) {
      const degree = progression.degrees[Math.floor(beatIndex / 4) % progression.degrees.length];
      const tones = chordTones(params.root, params.scale, degree);
      const at = beatIndex * beat;
      if (beatIndex % 4 === 0) {
        note(tones[0] - 12, at, beat * 3.2, 0.42);
        tones.forEach((tone, index) => note(tone, at, beat * 3.5, 0.16, (index - 1) * 0.3));
      }
      if (beatIndex % 2 === 0) {
        const melody = tones[beatIndex % tones.length] + 12;
        note(melody, at, beat * 1.4, 0.28);
      }
      if (energy > 0.35 && beatIndex % 2 === 0) {
        const hat = renderNote("noise", { midi: 90, seconds: 0.05, brightness: 1, weirdness: 0.2, energy: 0.4, sr, rng });
        mixInto(mono, Math.round((at + beat * 0.5) * sr), hat, 0.12 * energy);
      }
    }
    return;
  }

  const figure = sound.family === "descend" ? [0, -2, -5] : sound.family === "confirm" || sound.family === "fanfare" || sound.family === "award" ? [0, 4, 7] : [0];
  figure.forEach((step, index) => {
    note(params.root + 12 + step, 0.01 + index * 0.09, 0.16 + mood * 0.2, 0.5 - index * 0.05);
  });
  if (sound.kind === "loop") {
    const pulse = Math.max(2, Math.round(seconds * Math.min(8, params.tickRate / 2)));
    for (let i = 0; i < pulse; i++) note(params.root + 12 + (i % 2 ? 2 : 0), (i / pulse) * seconds, 0.06, 0.22);
  }
}

function loopCrossfade(stereo: Stereo): void {
  const n = Math.min(Math.round(0.012 * stereo.sr), Math.floor(stereo.l.length / 8));
  if (n < 4) return;
  for (let i = 0; i < n; i++) {
    const weight = i / n;
    const end = stereo.l.length - n + i;
    const left = stereo.l[i] * weight + stereo.l[end] * (1 - weight);
    const right = stereo.r[i] * weight + stereo.r[end] * (1 - weight);
    stereo.l[end] = stereo.l[end] * (1 - weight) + stereo.l[i] * weight;
    stereo.r[end] = stereo.r[end] * (1 - weight) + stereo.r[i] * weight;
    stereo.l[i] = left;
    stereo.r[i] = right;
  }
}

export function renderSound(sound: Sound, theme: Theme = themeById("grim-hamster"), opts?: { maxSeconds?: number }): Rendered {
  if (!sound.implemented || sound.family === "unimplemented" || sound.family === "import") {
    const seconds = Math.min(sound.params.duration || 0.4, opts?.maxSeconds ?? 8);
    const stereo = makeStereo(framesFor(seconds), SR);
    return { source: stereo, stereo, peaks: peaksOf(stereo), loop: false, note: sound.blurb };
  }
  const seconds = Math.max(0.12, Math.min(sound.params.duration || 0.8, opts?.maxSeconds ?? 16, 16));
  const sr = SR;
  const frames = framesFor(seconds, sr);
  const rng = new Rng(mixSeed(sound.params.root * 17 + 1, sound.params.variation, theme.name.length * 13, hashId(sound.id)));
  const mix = makeStereo(frames, sr);
  const solo = sound.layers.some((layer) => layer.solo);
  let previous = false;
  for (const layer of sound.layers) {
    if (layer.mute || (solo && !layer.solo)) continue;
    let mono: Float32Array;
    if (layer.mode === "resample" && previous) {
      const ratio = 2 ** ((sound.params.weirdness * 7 - 2) / 12);
      mono = resampleLinear(downmix(mix), ratio);
    } else {
      mono = new Float32Array(frames);
      paintFamily(mono, sound, theme, layer.algorithm, seconds, sr, rng);
    }
    const stereo = toStereo(mono, sr, 0);
    applyChain(stereo, layer.effects);
    applyGainLane(stereo, layer.automation, layer.gain);
    for (let i = 0; i < frames; i++) {
      mix.l[i] += stereo.l[i];
      mix.r[i] += stereo.r[i];
    }
    previous = peakOf(mix) > 1e-5;
  }
  applyChain(mix, sound.master);
  if (sound.kind === "loop") loopCrossfade(mix);
  limitTo(mix, 0.89);
  const arranged = sound.parts.length ? arrangeParts(mix, sound.parts, Math.max(seconds, ...sound.parts.map((part) => part.start + part.duration))) : mix;
  if (arranged !== mix) limitTo(arranged, 0.89);
  return { source: mix, stereo: arranged, peaks: peaksOf(arranged), loop: sound.kind === "loop" };
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function renderMany(sounds: Sound[], theme: Theme, ids?: string[], maxSeconds = 0.35): { id: string; rendered: Rendered }[] {
  const chosen = ids?.length ? sounds.filter((sound) => ids.includes(sound.id)) : sounds;
  return chosen.map((sound) => ({ id: sound.id, rendered: renderSound(sound, theme, { maxSeconds }) }));
}
