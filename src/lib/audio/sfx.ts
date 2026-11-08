/**
 * Shared slot-event recipes. Each cue maps onto one of these families with its own
 * register, pace and layer balance. They are reusable designs, not bespoke recordings.
 */
import { hashString, mixSeed, Rng } from "./rng";
import {
  addMono,
  clamp,
  fadeEdges,
  filterInPlace,
  framesFor,
  makeStereo,
  noiseBuffer,
  panGains,
  protectMonoLow,
  removeDc,
  snapMidi,
  SR,
  type Stereo,
} from "./dsp";
import { SCALES, type ScaleName } from "./scales";
import { renderVoice, type VoiceName } from "./voices";
import { renderSpace } from "./space";

export type Family =
  | "tick"
  | "confirm"
  | "error"
  | "neutral"
  | "impact"
  | "land"
  | "highlight"
  | "motion"
  | "riser"
  | "whoosh"
  | "fanfare"
  | "tension"
  | "descend"
  | "collect"
  | "lock"
  | "award"
  | "countup"
  | "countup-finish"
  | "music"
  | "import"
  | "unimplemented";

export interface Flavor {
  family: Family;
  voice: VoiceName;
  /** Semitone offset from the project root before snapping. */
  semitone: number;
  seconds: number;
  space: number;
  body: number;
  rate: number;
  /** Additional semitone steps for figures. */
  steps: number[];
  amp: number;
  snap: boolean;
  /** 0 keeps the event narrow. */
  pan: number;
}

export interface SfxRequest {
  id: string;
  flavor: Flavor;
  rootMidi: number;
  scale: ScaleName;
  seed: number;
  variation: number;
  intensity: number;
  transpose: number;
  decay: number;
  brightness: number;
  body: number;
  space: number;
  rate: number;
  duration: number;
}

export interface SfxBuffers {
  stems: Record<string, Stereo>;
  seconds: number;
  loop: boolean;
  recipe: Record<string, unknown>;
}

function pitchOf(req: SfxRequest, semi: number): number {
  const midi = req.rootMidi + semi + req.transpose;
  if (!req.flavor.snap) return midi;
  return snapMidi(midi, req.rootMidi, SCALES[req.scale]);
}

function put(
  dest: Stereo,
  sr: number,
  startSec: number,
  voice: VoiceName,
  note: number,
  dur: number,
  amp: number,
  pan: number,
  req: SfxRequest,
  rng: Rng,
  circular: boolean,
) {
  const rendered = renderVoice(voice, {
    note,
    dur,
    sr,
    brightness: req.brightness,
    decay: req.decay,
    body: req.body,
    rng,
    transpose: 0,
  });
  const [gl, gr] = panGains(pan);
  addMono(dest, Math.round(startSec * sr), rendered, gl * amp, gr * amp, circular);
}

export function renderSfx(req: SfxRequest, sr = SR): SfxBuffers {
  const flavor = req.flavor;
  const seconds = clamp(req.duration > 0 ? req.duration : flavor.seconds, 0.12, 8);
  const loop = flavor.family === "motion" || flavor.family === "tension";
  const frames = framesFor(seconds, sr);
  const rng = new Rng(mixSeed(req.seed, req.variation, hashString(req.id), 88));
  const stems: Record<string, Stereo> = {
    transient: makeStereo(frames, sr),
    body: makeStereo(frames, sr),
    tone: makeStereo(frames, sr),
    air: makeStereo(frames, sr),
  };
  const brightness = clamp(req.brightness, 0.25, 1.6);
  const bodyScale = clamp(req.body, 0, 2) * flavor.body;
  const spaceScale = clamp(req.space, 0, 2) * flavor.space;
  const rate = clamp(flavor.rate * clamp(req.rate, 0.25, 3), 1, 28);
  const amp = flavor.amp * (0.75 + clamp(req.intensity, 0, 1) * 0.4);
  const family = flavor.family;

  if (family === "tick" || family === "neutral") {
    const note = pitchOf(req, flavor.semitone);
    put(stems.transient, sr, 0.01, flavor.voice, note, family === "neutral" ? 0.12 : 0.16, amp, flavor.pan, req, rng, false);
    if (family !== "neutral" && bodyScale > 0.2) {
      put(stems.body, sr, 0.012, "body", 1, 0.16, 0.18 * bodyScale, 0, req, rng, false);
    }
  } else if (family === "confirm") {
    const steps = flavor.steps.length ? flavor.steps : [0, 7];
    steps.forEach((step, i) => {
      put(stems.tone, sr, 0.012 + i * 0.09, "wood", pitchOf(req, flavor.semitone + step), 0.22, amp * (i === steps.length - 1 ? 1 : 0.8), i % 2 ? 0.2 : -0.15, req, rng, false);
    });
  } else if (family === "error") {
    put(stems.tone, sr, 0.01, "fm", req.rootMidi + flavor.semitone + req.transpose, 0.22, amp, -0.2, req, rng, false);
    put(stems.tone, sr, 0.07, "fm", req.rootMidi + flavor.semitone + 6 + req.transpose, 0.28, amp * 0.9, 0.2, req, rng, false);
    put(stems.transient, sr, 0.01, "rattle", pitchOf(req, flavor.semitone), 0.12, amp * 0.25, 0, req, rng, false);
  } else if (family === "impact" || family === "lock") {
    put(stems.body, sr, 0.008, "impact", pitchOf(req, flavor.semitone), 0.32, amp * (0.7 + bodyScale), 0, req, rng, false);
    put(stems.transient, sr, 0.006, family === "lock" ? "wood" : "fm", pitchOf(req, flavor.semitone + 12), 0.1, amp * 0.45, 0, req, rng, false);
    if (family === "impact") put(stems.air, sr, 0.0, "gust", pitchOf(req, flavor.semitone), 0.28, amp * 0.35, 0, req, rng, false);
  } else if (family === "land") {
    put(stems.transient, sr, 0.008, "coin", pitchOf(req, flavor.semitone), 0.12, amp, flavor.pan, req, rng, false);
    put(stems.body, sr, 0.006, "body", 2, 0.18, 0.22 * (0.4 + bodyScale), 0, req, rng, false);
  } else if (family === "highlight" || family === "collect") {
    put(stems.tone, sr, 0.01, family === "collect" ? "coin" : "bell", pitchOf(req, flavor.semitone), family === "collect" ? 0.18 : 0.42, amp, flavor.pan, req, rng, false);
    if (family === "collect") put(stems.body, sr, 0.012, "body", 0, 0.16, 0.16 * bodyScale, 0, req, rng, false);
  } else if (family === "descend") {
    const steps = flavor.steps.length ? flavor.steps : [0, -2, -5];
    steps.forEach((step, i) => {
      put(stems.tone, sr, 0.01 + i * 0.07, flavor.voice, pitchOf(req, flavor.semitone + step), 0.16, amp * (1 - i * 0.08), 0, req, rng, false);
    });
  } else if (family === "whoosh") {
    put(stems.air, sr, 0.0, "gust", pitchOf(req, flavor.semitone), seconds * 0.9, amp, flavor.pan, req, rng, false);
    put(stems.transient, sr, seconds * 0.15, "fm", pitchOf(req, flavor.semitone + 7), 0.12, amp * 0.35, 0, req, rng, false);
  } else if (family === "riser") {
    const count = Math.max(4, Math.round(8 * rate * seconds));
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1);
      const t = 0.02 + (seconds * 0.82) * u * u;
      put(stems.transient, sr, t, "coin", pitchOf(req, flavor.semitone + Math.round(u * 12)), 0.09, amp * (0.35 + u * 0.6), u * 0.3 - 0.15, req, rng, false);
    }
    put(stems.air, sr, 0.0, "gust", pitchOf(req, flavor.semitone), seconds * 0.95, amp * 0.55, 0, req, rng, false);
  } else if (family === "fanfare" || family === "award") {
    const steps = flavor.steps.length ? flavor.steps : [0, 4, 7, 12];
    steps.forEach((step, i) => {
      const voice: VoiceName = family === "award" || i === steps.length - 1 ? "bell" : flavor.voice;
      put(
        stems.tone,
        sr,
        0.02 + i * (family === "fanfare" ? 0.11 : 0.045),
        voice,
        pitchOf(req, flavor.semitone + step),
        family === "fanfare" ? 0.7 : 0.9,
        amp * (0.55 + i * 0.1),
        (i - steps.length / 2) * 0.12,
        req,
        rng,
        false,
      );
    });
    put(stems.body, sr, 0.015, "impact", pitchOf(req, flavor.semitone - 12), 0.4, amp * (0.45 + bodyScale), 0, req, rng, false);
    put(stems.body, sr, 0.02, "body", family === "award" ? 0 : 2, 0.36, 0.34 * bodyScale, 0, req, rng, false);
  } else if (family === "motion") {
    const ticks = Math.max(2, Math.round(rate * seconds));
    for (let i = 0; i < ticks; i++) {
      const t = (i / ticks) * seconds;
      put(stems.transient, sr, t, flavor.voice, pitchOf(req, flavor.semitone + (i % 2 ? 2 : 0)), 0.07, amp * (i % 2 ? 0.45 : 0.7), i % 2 ? 0.25 : -0.2, req, rng, true);
    }
    const pulses = Math.max(1, Math.round(seconds * Math.min(rate, 4)));
    for (let i = 0; i < pulses; i++) {
      put(stems.body, sr, (i / pulses) * seconds, "body", 1, 0.18, 0.16 * bodyScale, 0, req, rng, true);
    }
    const dust = noiseBuffer(frames, rng);
    filterInPlace(dust, "highpass", 900, sr, 2);
    filterInPlace(dust, "lowpass", 4800, sr, 2);
    const cycles = Math.max(1, Math.round(seconds * 2));
    for (let i = 0; i < frames; i++) {
      const g = 0.05 * amp * (0.7 + 0.3 * Math.sin((2 * Math.PI * i * cycles) / frames));
      stems.air.l[i] += dust[i] * g;
      stems.air.r[i] += dust[(i + 300) % frames] * g;
    }
  } else if (family === "tension") {
    const cycles = Math.max(2, Math.round(seconds * 3));
    const f1 = pitchOf(req, flavor.semitone);
    const f2 = f1 + 1;
    const hz1 = 440 * 2 ** ((f1 - 69) / 12);
    const hz2 = 440 * 2 ** ((f2 - 69) / 12);
    for (let i = 0; i < frames; i++) {
      const t = i / sr;
      const pulse = 0.55 + 0.45 * Math.sin((2 * Math.PI * i * cycles) / frames);
      const s = (Math.sin(2 * Math.PI * hz1 * t) * 0.5 + Math.sin(2 * Math.PI * hz2 * t) * 0.35) * pulse * amp * 0.35;
      stems.tone.l[i] += s;
      stems.tone.r[i] += s;
    }
    const dust = noiseBuffer(frames, rng);
    filterInPlace(dust, "highpass", 1200, sr, 2);
    filterInPlace(dust, "lowpass", 3600, sr, 2);
    for (let i = 0; i < frames; i++) {
      const g = 0.04 * amp;
      stems.air.l[i] += dust[i] * g;
      stems.air.r[(i + 500) % frames] += dust[i] * g * 0.8;
    }
  }

  const present: Record<string, Stereo> = {};
  for (const [name, buffer] of Object.entries(stems)) {
    let energy = 0;
    for (let i = 0; i < buffer.l.length; i += 16) energy += Math.abs(buffer.l[i]) + Math.abs(buffer.r[i]);
    if (energy < 1e-6) continue;
    if (!loop) {
      const send = spaceScale > 0.01 && (name === "tone" || name === "transient") ? renderSpace(buffer, spaceScale, 0.55, { brightness }) : null;
      if (send) {
        for (let i = 0; i < buffer.l.length; i++) {
          buffer.l[i] += send.l[i];
          buffer.r[i] += send.r[i];
        }
      }
      protectMonoLow(buffer, 280);
      fadeEdges(buffer, Math.round(0.003 * sr), Math.round(0.05 * sr));
    } else {
      removeDc(buffer);
    }
    present[name] = buffer;
  }

  return {
    stems: present,
    seconds,
    loop,
    recipe: {
      family,
      id: req.id,
      seconds,
      loop,
      voice: flavor.voice,
      semitone: flavor.semitone,
      steps: flavor.steps,
      rate,
      brightness,
      body: bodyScale,
      space: spaceScale,
      snap: flavor.snap,
      seed: req.seed,
      variation: req.variation,
      note: "Reusable synthesis recipe. Not a bespoke recorded asset.",
    },
  };
}
