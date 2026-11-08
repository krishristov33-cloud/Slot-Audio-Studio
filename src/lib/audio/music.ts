/**
 * Parameterized beds developed from sources/listening-test-v1/render.py
 * (Hollow Orchard: wood resonators, rubber replies, centered bass, pad, kick/rim/hat, air).
 * Base / bonus / high / big-win / summary share a seed and key but change tempo,
 * percussion density, register and harmony. Loops are periodic: note tails and
 * delays wrap. There is no endpoint fade. This is composed synthesis, not a generative model.
 */
import { hashString, mixSeed, Rng } from "./rng";
import {
  addMono,
  clamp,
  filterInPlace,
  framesFor,
  makeStereo,
  noiseBuffer,
  panGains,
  removeDc,
  snapMidi,
  SR,
  type Stereo,
} from "./dsp";
import { renderVoice, type VoiceName } from "./voices";
import { circularDelays, musicDelays } from "./space";
import type { ScaleName } from "./scales";
import { SCALES } from "./scales";

export type MusicVariant = "base" | "bonus" | "high" | "bigwin" | "summary";

export const MUSIC_TEMPO: Record<MusicVariant, number> = {
  base: 1,
  bonus: 1.08,
  high: 1.14,
  bigwin: 0.94,
  summary: 0.88,
};

interface BarHarm {
  bass: number;
  tones: number[];
}

const ORCHARD: BarHarm[] = [
  { bass: 0, tones: [0, 3, 7, 14] },
  { bass: 0, tones: [0, 3, 7, 14] },
  { bass: -4, tones: [-4, 0, 3, 7] },
  { bass: -4, tones: [-4, 0, 3, 7] },
  { bass: 5, tones: [5, 9, 12, 14] },
  { bass: 5, tones: [5, 9, 12, 14] },
  { bass: -5, tones: [-5, -2, 2, 7] },
  { bass: 0, tones: [0, 3, 9, 14] },
];

const BONUS: BarHarm[] = [
  { bass: 0, tones: [0, 3, 7, 14] },
  { bass: -2, tones: [-2, 2, 5, 10] },
  { bass: -4, tones: [-4, 0, 3, 7] },
  { bass: 3, tones: [3, 7, 10, 14] },
  { bass: 5, tones: [5, 9, 12, 16] },
  { bass: 7, tones: [7, 10, 14, 17] },
  { bass: -4, tones: [-4, 0, 5, 7] },
  { bass: 0, tones: [0, 3, 7, 14] },
];

const BIGWIN: BarHarm[] = [
  { bass: 0, tones: [0, 4, 7, 12] },
  { bass: 5, tones: [5, 9, 12, 16] },
  { bass: 7, tones: [7, 11, 14, 19] },
  { bass: 0, tones: [0, 4, 7, 14] },
];

const SUMMARY: BarHarm[] = [
  { bass: 0, tones: [0, 3, 7, 14] },
  { bass: -4, tones: [-4, 0, 3, 7] },
  { bass: 5, tones: [5, 9, 12, 14] },
  { bass: 0, tones: [0, 3, 7, 12] },
];

const PLANS: Record<MusicVariant, BarHarm[]> = {
  base: ORCHARD,
  bonus: BONUS,
  high: ORCHARD,
  bigwin: BIGWIN,
  summary: SUMMARY,
};

type Cell = [number, number, number];

const CALLS: Cell[][] = [
  [
    [0, 0, 0.85],
    [0.75, 3, 0.63],
    [1.5, 7, 0.74],
    [2.75, 2, 0.55],
    [3.25, 0, 0.68],
  ],
  [
    [0, 0, 0.8],
    [0.75, 3, 0.6],
    [1.75, 7, 0.7],
    [2.75, 5, 0.6],
  ],
  [
    [0, 0, 0.8],
    [0.75, 3, 0.6],
    [1.5, 9, 0.58],
    [2.75, 7, 0.65],
  ],
  [
    [0, 2, 0.7],
    [0.75, 5, 0.6],
    [1.5, 7, 0.7],
    [2.75, -2, 0.65],
  ],
  [
    [0, 7, 0.62],
    [1, 3, 0.7],
    [2.25, 0, 0.66],
    [3.5, 2, 0.5],
  ],
];

const REPLIES: Cell[][] = [
  [
    [0.5, -2, 0.65],
    [1.25, -5, 0.57],
    [2.5, 2, 0.72],
    [3.5, 0, 0.5],
  ],
  [
    [0.5, 3, 0.64],
    [1.25, 2, 0.5],
    [2.5, -2, 0.7],
    [3.25, -5, 0.5],
  ],
  [
    [0.5, 5, 0.63],
    [1.25, 2, 0.5],
    [2.5, 0, 0.7],
  ],
  [
    [0.25, 3, 0.65],
    [1, 2, 0.5],
    [2, 0, 0.8],
  ],
];

export interface MusicSettings {
  variant: MusicVariant;
  bpm: number;
  rootMidi: number;
  scale: ScaleName;
  seed: number;
  variation: number;
  bars: number;
  intensity: number;
  brightness: number;
  decay: number;
  body: number;
  space: number;
  tempoScale: number;
}

export interface MusicBuffers {
  stems: Record<string, Stereo>;
  seconds: number;
  bpm: number;
  bars: number;
  recipe: Record<string, unknown>;
}

function repeatPlan(plan: BarHarm[], bars: number): BarHarm[] {
  const out: BarHarm[] = [];
  for (let i = 0; i < bars; i++) out.push(plan[i % plan.length]);
  return out;
}

export function renderMusic(settings: MusicSettings, sr = SR): MusicBuffers {
  const variant = settings.variant;
  const bpm = clamp(settings.bpm * MUSIC_TEMPO[variant] * clamp(settings.tempoScale, 0.75, 1.35), 70, 180);
  const defaultBars = variant === "bigwin" || variant === "summary" ? 4 : 8;
  const bars = clamp(Math.round(settings.bars || defaultBars), 2, 8);
  const beat = 60 / bpm;
  const seconds = bars * 4 * beat;
  const n = framesFor(seconds, sr);
  const scale = SCALES[settings.scale];
  const root = Math.round(settings.rootMidi);
  const rng = new Rng(mixSeed(settings.seed, settings.variation, hashString(variant), 41219));
  const intensity = clamp(settings.intensity, 0, 1);
  const brightness = clamp(settings.brightness, 0.25, 1.6);
  const decay = clamp(settings.decay, 0.4, 2.2);
  const bodyAmt = clamp(settings.body, 0, 2);
  const spaceAmt = clamp(settings.space, 0, 2);
  const level = 0.72 + intensity * 0.45;
  const names = ["melody", "reply", "bass", "harmony", "percussion", "texture"] as const;
  const stems: Record<string, Stereo> = {};
  for (const name of names) stems[name] = makeStereo(n, sr);

  const place = (
    dest: Stereo,
    beatStart: number,
    note: number,
    dur: number,
    voice: VoiceName,
    amp: number,
    pan: number,
    snap: boolean,
    human: boolean,
  ) => {
    const timing = human ? rng.range(-0.003, 0.003) : 0;
    const vel = human ? rng.range(0.94, 1.05) : 1;
    const midi = snap ? snapMidi(note, root, scale) : note;
    const rendered = renderVoice(voice, {
      note: midi,
      dur,
      sr,
      brightness,
      decay: voice === "bass" ? 1 : decay,
      body: voice === "bass" ? bodyAmt : 1,
      rng,
      transpose: 0,
    });
    const [gl, gr] = panGains(pan);
    const start = Math.round((beatStart * beat + timing) * sr);
    addMono(dest, start, rendered, gl * amp * vel, gr * amp * vel, true);
  };

  const plan = repeatPlan(PLANS[variant], bars);
  const melodyRoot = root + 12;
  for (let bar = 0; bar < bars; bar++) {
    const origin = bar * 4;
    const call = CALLS[Math.floor(rng.next() * CALLS.length)];
    const reply = REPLIES[Math.floor(rng.next() * REPLIES.length)];
    const harm = plan[bar];
    const melodyVoice: VoiceName = variant === "bigwin" ? "bell" : "wood";
    const replyVoice: VoiceName = variant === "bigwin" ? "coin" : "rubber";
    if (variant !== "summary" || bar % 2 === 0) {
      for (const [off, semi, vel] of call) {
        place(stems.melody, origin + off, melodyRoot + semi + (variant === "high" ? 12 : 0), 0.75, melodyVoice, vel * 0.24 * level, variant === "bigwin" ? -0.12 : -0.3, true, true);
      }
    }
    if (variant !== "summary") {
      for (const [off, semi, vel] of reply) {
        place(stems.reply, origin + off, melodyRoot + semi - 12, 0.7, replyVoice, vel * 0.24 * level, 0.32, true, true);
      }
    }
    if (variant === "bonus" || variant === "high") {
      const answers: [number, number][] = [
        [0.5, 12],
        [1.75, bar < bars / 2 ? 15 : 9],
        [3, bar % 2 === 0 ? 14 : 12],
      ];
      answers.forEach(([off, semi], j) => {
        place(stems.reply, origin + off, melodyRoot + semi, 0.48, "wood", 0.075 * level, j % 2 ? 0.45 : -0.45, true, true);
      });
    }
    const bassMidi = root - 24 + harm.bass;
    if (variant === "summary") {
      place(stems.bass, origin, bassMidi, 1.5, "bass", 0.34 * (0.85 + bodyAmt * 0.2), 0, false, true);
    } else {
      place(stems.bass, origin, bassMidi, 0.68, "bass", 0.32 * (0.85 + bodyAmt * 0.15), 0, false, true);
      place(stems.bass, origin + 1.75, bassMidi, 0.27, "bass", 0.23, 0, false, true);
      place(stems.bass, origin + 2.5, bassMidi, 0.47, "bass", 0.28, 0, false, true);
      if (bar % 2 === 1) {
        place(stems.bass, origin + 3.5, bassMidi + (bar === bars - 1 ? 12 : 7), 0.22, "bass", 0.18, 0, false, true);
      }
    }
    if (bodyAmt > 0.02 && (variant === "bigwin" || variant === "high" || bar % 2 === 0)) {
      const mode = variant === "bigwin" ? 0 : variant === "bonus" ? 1 : 2;
      const thump = renderVoice("body", {
        note: mode,
        dur: 0.32,
        sr,
        brightness,
        decay: 1,
        body: 1,
        rng,
        transpose: 0,
      });
      const g = (variant === "bigwin" ? 0.42 : 0.18) * bodyAmt / Math.SQRT2;
      addMono(stems.bass, Math.round(origin * beat * sr), thump, g, g, true);
    }
    harm.tones.forEach((semi, j) => {
      place(
        stems.harmony,
        origin,
        root + semi,
        beat * 4 + 0.45,
        "pad",
        (variant === "summary" ? 0.34 : 0.26) * (0.75 + intensity * 0.35),
        -0.65 + j * 0.43,
        true,
        true,
      );
    });
    const kicks =
      variant === "bonus" || variant === "high" ? [0, 1.5, 2.75] : variant === "summary" ? [0] : variant === "bigwin" ? [0, 2] : [0, 2.5];
    for (const off of kicks) {
      place(stems.percussion, origin + off, 36, 0.35, "kick", (variant === "high" ? 0.52 : 0.42) * (0.75 + intensity * 0.4), 0, false, false);
    }
    if (variant !== "summary") {
      for (const off of [1, 3]) place(stems.percussion, origin + off, 70, 0.13, "rim", 0.18, 0.08, false, false);
    }
    if (variant !== "summary" && variant !== "bigwin") {
      const step = variant === "high" ? 0.25 : variant === "bonus" ? 0.5 : 1;
      const count = Math.round(4 / step);
      for (let j = 0; j < count; j++) {
        const off = j * step + (variant === "base" ? 0.25 : 0);
        if (off >= 3.95) continue;
        place(
          stems.percussion,
          origin + off,
          90,
          0.08,
          "hat",
          (j % 2 ? 0.16 : 0.26) * (0.45 + intensity * 0.7),
          j % 2 ? -0.38 : 0.38,
          false,
          false,
        );
      }
    }
    if ((variant === "bonus" || variant === "high") && bar % 4 === 3) {
      for (const off of [3.25, 3.5, 3.75]) place(stems.percussion, origin + off, 72, 0.1, "rim", 0.07, -0.25, false, false);
    }
  }

  const dust = noiseBuffer(n * 3, rng);
  filterInPlace(dust, "highpass", 1400, sr, 2);
  filterInPlace(dust, "lowpass", 5400, sr, 2);
  const air = dust.subarray(n * 2);
  const cycles = 4;
  const airGain = 0.02 * (0.6 + intensity * 0.5);
  for (let i = 0; i < n; i++) {
    const shaped = air[i] * airGain * (0.65 + 0.35 * Math.sin((2 * Math.PI * i * cycles) / n));
    stems.texture.l[i] = shaped;
    stems.texture.r[(i + 617) % n] += shaped;
  }

  const taps = musicDelays(beat);
  stems.melody = circularDelays(stems.melody, 0.8 * spaceAmt, taps);
  stems.reply = circularDelays(stems.reply, 0.8 * spaceAmt, taps);
  stems.harmony = circularDelays(stems.harmony, 0.55 * spaceAmt, taps);
  stems.percussion = circularDelays(stems.percussion, 0.12 * spaceAmt, taps);
  for (const name of names) removeDc(stems[name]);

  return {
    stems,
    seconds,
    bpm,
    bars,
    recipe: {
      source: "listening-test-v1/render.py",
      title: "Hollow Orchard family",
      variant,
      bpm,
      bars,
      seconds,
      meter: "4/4",
      rootMidi: root,
      scale: settings.scale,
      seed: settings.seed,
      variation: settings.variation,
      intensity,
      instruments:
        variant === "bigwin"
          ? "bell melody, coin replies, centered bass and body, ceremonial kicks"
          : "wood mallets, rubber replies, centered bass, pad, kick/rim/hat, band-limited air",
      loop: "Circular note tails and circular multi-tap delays. No endpoint fade.",
      chords: plan,
      kind: "loop",
    },
  };
}
