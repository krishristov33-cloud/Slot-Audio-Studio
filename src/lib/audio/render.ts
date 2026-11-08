import type { Cue, CueParams, Identity, LayerState } from "./project";
import { renderCountup, type CountPreset } from "./countup";
import { renderMusic } from "./music";
import { renderSfx } from "./sfx";
import {
  addStereo,
  copyStereo,
  makeStereo,
  peakOf,
  repairNonFinite,
  rmsOf,
  scaleStereo,
  SR,
  type Stereo,
} from "./dsp";
import type { CueKind } from "./catalogue";

export interface SynthBuffer {
  cueId: string;
  kind: CueKind;
  implemented: boolean;
  unavailable: boolean;
  message?: string;
  seconds: number;
  sampleRate: number;
  stems: Record<string, Stereo>;
  stingStems?: Record<string, Stereo>;
  loop: boolean;
  recipe: Record<string, unknown>;
}

export interface Mixdown {
  mix: Stereo;
  sting?: Stereo;
  printed: Record<string, Stereo>;
  stingPrinted?: Record<string, Stereo>;
  peak: number;
  prePeak: number;
  rms: number;
  clipped: number;
  nonfinite: number;
  safetyGain: number;
  seconds: number;
  loop: boolean;
}

const CEILING = 0.89;

function countSettings(identity: Identity, params: CueParams, preset: CountPreset, ticks: boolean) {
  return {
    preset,
    seed: identity.seed,
    variation: params.variation,
    activeSeconds: params.duration > 0 ? params.duration : 4.5,
    rateStart: params.rateStart,
    rateEnd: params.rateEnd,
    brightness: params.brightness,
    decay: params.decay,
    body: params.body,
    space: params.space,
    transpose: params.transpose,
    award: params.award,
    ticks,
  };
}

export function synthesize(identity: Identity, cue: Cue): SynthBuffer {
  if (!cue.implemented || cue.flavor.family === "unimplemented") {
    return {
      cueId: cue.id,
      kind: cue.kind,
      implemented: false,
      unavailable: true,
      message: cue.blurb,
      seconds: 0,
      sampleRate: SR,
      stems: {},
      loop: false,
      recipe: { implemented: false, id: cue.id },
    };
  }
  if (cue.flavor.family === "import") {
    return {
      cueId: cue.id,
      kind: cue.kind,
      implemented: true,
      unavailable: false,
      message: cue.blurb,
      seconds: 0,
      sampleRate: SR,
      stems: {},
      loop: false,
      recipe: { implemented: true, synthesis: false, id: cue.id },
    };
  }
  if (cue.flavor.family === "countup" || cue.flavor.family === "countup-finish") {
    const preset = cue.preset ?? paramsPreset(cue.params);
    const rendered = renderCountup(
      countSettings(identity, cue.params, preset, cue.flavor.family === "countup"),
    );
    if (cue.flavor.family === "countup-finish") {
      return {
        cueId: cue.id,
        kind: "oneshot",
        implemented: true,
        unavailable: false,
        seconds: rendered.stingSeconds,
        sampleRate: SR,
        stems: rendered.stingStems,
        loop: false,
        recipe: { ...rendered.recipe, render: "award-sting" },
      };
    }
    return {
      cueId: cue.id,
      kind: "sequence",
      implemented: true,
      unavailable: false,
      seconds: rendered.totalSeconds,
      sampleRate: SR,
      stems: rendered.stems,
      stingStems: rendered.stingStems,
      loop: false,
      recipe: rendered.recipe,
    };
  }
  if (cue.flavor.family === "music" && cue.music) {
    const rendered = renderMusic({
      variant: cue.music,
      bpm: identity.bpm,
      rootMidi: identity.rootMidi,
      scale: identity.scale,
      seed: identity.seed,
      variation: paramsVariation(cue.params),
      bars: cue.params.bars,
      intensity: identity.intensity,
      brightness: cue.params.brightness,
      decay: cue.params.decay,
      body: cue.params.body,
      space: cue.params.space,
      tempoScale: cue.params.tempoScale,
    });
    return {
      cueId: cue.id,
      kind: "loop",
      implemented: true,
      unavailable: false,
      seconds: rendered.seconds,
      sampleRate: SR,
      stems: rendered.stems,
      loop: true,
      recipe: rendered.recipe,
    };
  }
  const rendered = renderSfx({
    id: cue.id,
    flavor: cue.flavor,
    rootMidi: identity.rootMidi,
    scale: identity.scale,
    seed: identity.seed,
    variation: cue.params.variation,
    intensity: identity.intensity,
    transpose: cue.params.transpose,
    decay: cue.params.decay,
    brightness: cue.params.brightness,
    body: cue.params.body,
    space: cue.params.space,
    rate: cue.params.rate,
    duration: cue.params.duration,
  });
  return {
    cueId: cue.id,
    kind: rendered.loop ? "loop" : cue.kind,
    implemented: true,
    unavailable: false,
    seconds: rendered.seconds,
    sampleRate: SR,
    stems: rendered.stems,
    loop: rendered.loop,
    recipe: rendered.recipe,
  };
}

function paramsPreset(params: CueParams): CountPreset {
  return params.preset;
}

function paramsVariation(params: CueParams): number {
  return params.variation;
}

function audibleGain(name: string, layers: Record<string, LayerState>, anySolo: boolean): number | null {
  const layer = layers[name] ?? { mute: false, solo: false, gain: 1 };
  if (anySolo) return layer.solo ? layer.gain : null;
  if (layer.mute) return null;
  return layer.gain;
}

function mixStems(
  stems: Record<string, Stereo>,
  layers: Record<string, LayerState>,
  cueGain: number,
): { mix: Stereo; printed: Record<string, Stereo>; prePeak: number; safetyGain: number; nonfinite: number; clipped: number } | null {
  const names = Object.keys(stems);
  if (!names.length) return null;
  const anySolo = Object.values(layers).some((layer) => layer.solo);
  const frameCount = stems[names[0]].l.length;
  const sr = stems[names[0]].sr;
  const mix = makeStereo(frameCount, sr);
  const printed: Record<string, Stereo> = {};
  for (const name of names) {
    const gain = audibleGain(name, layers, anySolo);
    if (gain === null || gain === 0) continue;
    const copy = copyStereo(stems[name]);
    scaleStereo(copy, gain * cueGain);
    printed[name] = copy;
    addStereo(mix, copy, 1);
  }
  let nonfinite = repairNonFinite(mix);
  for (const stem of Object.values(printed)) nonfinite += repairNonFinite(stem);
  const prePeak = peakOf(mix);
  let clipped = 0;
  if (prePeak > 0.999) {
    for (let i = 0; i < mix.l.length; i++) {
      if (Math.abs(mix.l[i]) >= 0.999) clipped++;
      if (Math.abs(mix.r[i]) >= 0.999) clipped++;
    }
  }
  const safetyGain = prePeak > CEILING ? CEILING / prePeak : 1;
  if (safetyGain !== 1) {
    scaleStereo(mix, safetyGain);
    for (const stem of Object.values(printed)) scaleStereo(stem, safetyGain);
  }
  return { mix, printed, prePeak, safetyGain, nonfinite, clipped };
}

export function mixdown(buffer: SynthBuffer, layers: Record<string, LayerState>, cueGain = 1): Mixdown | null {
  const main = mixStems(buffer.stems, layers, cueGain);
  if (!main) return null;
  let sting: Stereo | undefined;
  let stingPrinted: Record<string, Stereo> | undefined;
  if (buffer.stingStems) {
    const mixed = mixStems(buffer.stingStems, layers, cueGain);
    if (mixed) {
      sting = mixed.mix;
      stingPrinted = mixed.printed;
    }
  }
  return {
    mix: main.mix,
    sting,
    printed: main.printed,
    stingPrinted,
    peak: peakOf(main.mix),
    prePeak: main.prePeak,
    rms: rmsOf(main.mix),
    clipped: main.clipped,
    nonfinite: main.nonfinite,
    safetyGain: main.safetyGain,
    seconds: main.mix.l.length / main.mix.sr,
    loop: buffer.loop,
  };
}

export function synthKey(identity: Identity, cue: Cue): string {
  const { transpose, decay, brightness, body, space, rate, duration, bars, preset, rateStart, rateEnd, award, tempoScale, variation } = cue.params;
  return JSON.stringify({
    id: cue.id,
    identity,
    timbre: { transpose, decay, brightness, body, space, rate, duration, bars, preset, rateStart, rateEnd, award, tempoScale, variation },
    flavor: cue.flavor,
    preset: cue.preset,
    music: cue.music,
    implemented: cue.implemented,
  });
}
