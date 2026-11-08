/**
 * Count-up arrangements adapted from sources/approval-demos-v4/render.py.
 * A continuous accelerating coin/bell roll, B held FM tiers, C harmonic swells.
 * These are one-shot sequences. The skip buffer is the award moved to the start,
 * not a seek into the later tail.
 */
import { hashString, mixSeed, Rng } from "./rng";
import {
  addMono,
  addStereo,
  clamp,
  copyStereo,
  fadeEdges,
  filterStereo,
  framesFor,
  makeStereo,
  panGains,
  protectMonoLow,
  scaleStereo,
  SR,
  type Stereo,
} from "./dsp";
import { renderVoice, type VoiceName } from "./voices";
import { renderSpace } from "./space";

export type CountPreset = "A" | "B" | "C";

export interface CountupSettings {
  preset: CountPreset;
  seed: number;
  variation: number;
  /** Active ticking time before the award, seconds. */
  activeSeconds: number;
  rateStart: number;
  rateEnd: number;
  brightness: number;
  decay: number;
  body: number;
  space: number;
  transpose: number;
  award: boolean;
  /** When false, only the award sting is needed and the tick loop is skipped. */
  ticks?: boolean;
}

export interface CountupBuffers {
  stems: Record<string, Stereo>;
  stingStems: Record<string, Stereo>;
  activeSeconds: number;
  totalSeconds: number;
  stingSeconds: number;
  recipe: Record<string, unknown>;
}

const STEM_NAMES = ["dry-counter", "body", "support", "space", "award"] as const;

interface Hit {
  stem: "dry-counter" | "support" | "award";
  t: number;
  note: number;
  dur: number;
  voice: VoiceName;
  amp: number;
  pan: number;
}

interface BodyHit {
  t: number;
  mode: number;
  amp: number;
  award: boolean;
}

function emptyStems(frames: number, sr: number): Record<string, Stereo> {
  return Object.fromEntries(STEM_NAMES.map((name) => [name, makeStereo(frames, sr)]));
}

export function renderCountup(settings: CountupSettings, sr = SR): CountupBuffers {
  const preset = settings.preset;
  const active = clamp(settings.activeSeconds, 0.25, 24);
  const rateStart = clamp(settings.rateStart, 4, 36);
  const rateEnd = clamp(settings.rateEnd, 4, 36);
  const brightness = clamp(settings.brightness, 0.25, 1.6);
  const decay = clamp(settings.decay, 0.35, 2.4);
  const bodyAmt = clamp(settings.body, 0, 2);
  const spaceAmt = clamp(settings.space, 0, 2);
  const transpose = Math.round(clamp(settings.transpose, -24, 24));
  const tail = 3.35;
  const total = active + tail;
  const frames = framesFor(total, sr);
  const rng = new Rng(mixSeed(settings.seed, settings.variation, hashString(`count-${preset}`), 572104));
  const hits: Hit[] = [];
  const bodies: BodyHit[] = [];
  const ticks = settings.ticks !== false;

  const push = (
    stem: Hit["stem"],
    t: number,
    note: number,
    dur: number,
    voice: VoiceName,
    amp: number,
    pan: number,
  ) => {
    hits.push({ stem, t, note: note + transpose, dur, voice, amp, pan });
  };

  if (preset === "A") {
    if (ticks) {
    let pos = 0.08;
    let i = 0;
    const span = Math.max(0.2, active - 0.16);
    while (pos < active - 0.04 && i < 2500) {
      const u = clamp((pos - 0.08) / span, 0, 1);
      const rate = rateStart + (rateEnd - rateStart) * u;
      const notes = [79, 81, 86, 83, 88, 81];
      push("dry-counter", pos, notes[i % 6], 0.14, "coin", 0.36 + 0.12 * u, i % 2 ? -0.3 : 0.3);
      if (i % 3 === 0) push("dry-counter", pos + 0.014, 86, 0.085, "rattle", 0.075, 0.18);
      if (i % 4 === 0) {
        const bells = [74, 77, 81, 86, 81, 83];
        push("support", pos, bells[Math.floor(i / 4) % 6], 0.42, "bell", 0.17, -0.18);
      }
      pos += 1 / Math.max(4, rate);
      i++;
    }
    for (let t = 0.08; t < active - 0.02; t += 0.52) bodies.push({ t, mode: 0, amp: 0.28 * bodyAmt, award: false });
    }
    if (settings.award) {
      const base = active + 0.12;
      for (const [dt, note] of [
        [0, 81],
        [0.2, 86],
        [0.4, 90],
        [0.65, 93],
      ] as [number, number][]) {
        push("award", base + dt, note, 0.9, "bell", 0.38, (note - 86) / 24);
      }
      push("award", base + 0.65, 38, 0.4, "impact", 0.58, 0);
      bodies.push({ t: base + 0.65, mode: 0, amp: 0.8 * bodyAmt, award: true });
      bodies.push({ t: base + 0.708, mode: 0, amp: 0.23 * bodyAmt, award: true });
    }
  } else if (preset === "B") {
    if (ticks) {
    const mid = rateStart + (rateEnd - rateStart) * 0.46;
    const windows: [number, number, number, number[]][] = [
      [0.06, active * 0.32, rateStart, [62, 69, 74]],
      [active * 0.34, active * 0.64, mid, [65, 72, 77]],
      [active * 0.66, active - 0.04, rateEnd, [69, 76, 81]],
    ];
    windows.forEach(([lo, hi, rate, notes], tier) => {
      let pos = lo;
      let i = 0;
      while (pos < hi && i < 1200) {
        push("dry-counter", pos, notes[i % 3], 0.13, "fm", 0.4 + tier * 0.035, i % 2 ? -0.1 : 0.1);
        if (i % 4 === 0) push("dry-counter", pos + 0.009, notes[0] - 12, 0.08, "fm", 0.1, 0);
        pos += 1 / Math.max(4, rate);
        i++;
      }
      if (tier > 0) {
        push("support", lo - 0.05, notes[notes.length - 1], 0.3, "fm", 0.42, 0.12);
        push("support", lo - 0.02, notes[notes.length - 1] + 7, 0.27, "bell", 0.15, -0.12);
        bodies.push({ t: Math.max(0.02, lo - 0.04), mode: 1, amp: 0.39 * bodyAmt, award: false });
      }
      const step = [0.66, 0.5, 0.4][tier];
      for (let t = lo; t < hi; t += step) bodies.push({ t, mode: 1, amp: 0.27 * bodyAmt, award: false });
    });
    }
    if (settings.award) {
      const base = active + 0.06;
      push("award", base, 38, 0.4, "impact", 0.65, 0);
      for (const [dt, note, amp] of [
        [0, 74, 0.5],
        [0.07, 81, 0.25],
        [0.19, 86, 0.27],
      ] as [number, number, number][]) {
        push("award", base + dt, note, 0.6, "fm", amp, 0);
      }
      push("award", base + 0.19, 90, 0.9, "bell", 0.2, 0.12);
      bodies.push({ t: base, mode: 1, amp: 0.8 * bodyAmt, award: true });
      bodies.push({ t: base + 0.058, mode: 1, amp: 0.23 * bodyAmt, award: true });
    }
  } else {
    if (ticks) {
    let pos = 0.08;
    let i = 0;
    const span = Math.max(0.2, active - 0.16);
    while (pos < active - 0.03 && i < 2500) {
      const u = clamp((pos - 0.08) / span, 0, 1);
      const rate = rateStart + (rateEnd - rateStart) * u;
      const notes = [77, 81, 86, 83];
      push("dry-counter", pos, notes[i % 4], 0.16, "coin", 0.38 + 0.09 * u, i % 2 ? -0.22 : 0.22);
      if (i % 2 === 0) {
        const bells = [74, 77, 81];
        push("dry-counter", pos + 0.012, bells[i % 3], 0.22, "bell", 0.11, 0.12);
      }
      pos += 1 / Math.max(4, rate);
      i++;
    }
    const chords = [
      [50, 57, 62, 65],
      [58, 62, 65, 69],
      [62, 67, 71, 76],
      [65, 69, 74, 81],
    ];
    chords.forEach((chord, index) => {
      const t = (active - 0.2) * (index / 4);
      chord.forEach((note, j) => {
        push("support", t, note, Math.min(2.9, active * 0.34), "warm", 0.055 + t * 0.004, -0.5 + j / 3);
      });
    });
    for (let t = 0.08; t < active - 0.02; t += 0.58) bodies.push({ t, mode: 2, amp: 0.3 * bodyAmt, award: false });
    }
    if (settings.award) {
      const base = active + 0.1;
      push("award", base, 38, 0.45, "impact", 0.6, 0);
      [62, 66, 69, 76, 86].forEach((note, j) => {
        push("award", base + j * 0.025, note, 1.45, "bell", j < 4 ? 0.18 : 0.3, -0.4 + j * 0.2);
      });
      bodies.push({ t: base, mode: 2, amp: 0.8 * bodyAmt, award: true });
      bodies.push({ t: base + 0.058, mode: 2, amp: 0.23 * bodyAmt, award: true });
    }
  }

  const stems = emptyStems(frames, sr);
  const voiceOpts = { sr, brightness, decay, body: Math.max(0.15, bodyAmt), rng };
  for (const hit of hits) {
    const voice = renderVoice(hit.voice, { ...voiceOpts, note: hit.note, dur: hit.dur * decay });
    const [gl, gr] = panGains(hit.pan);
    addMono(stems[hit.stem], Math.round(hit.t * sr), voice, gl * hit.amp, gr * hit.amp, false);
  }
  for (const hit of bodies) {
    if (hit.amp <= 0) continue;
    const voice = renderVoice("body", {
      ...voiceOpts,
      note: hit.mode,
      dur: hit.award ? 0.38 : 0.3,
      transpose,
      body: 1,
    });
    const g = hit.amp / Math.SQRT2;
    const target = hit.award ? stems.award : stems.body;
    addMono(target, Math.round(hit.t * sr), voice, g, g, false);
  }

  saturate(stems["dry-counter"], 2);
  scaleStereo(stems.award, 0.42);

  const send = copyStereo(stems["dry-counter"]);
  addStereo(send, stems.support, 1);
  scaleStereo(send, 0.67);
  const rt = [0.78, 0.65, 1.05][preset === "A" ? 0 : preset === "B" ? 1 : 2];
  const room = renderSpace(send, spaceAmt, rt, { brightness });
  const awardRoom = renderSpace(stems.award, spaceAmt, rt, { award: true, brightness });
  addStereo(room, awardRoom, 1);
  if (preset === "C") {
    const grow = Math.max(0.4, active * 0.8);
    for (let i = 0; i < room.l.length; i++) {
      const g = Math.min(i / sr / grow, 1) * 0.8 + 0.2;
      room.l[i] *= g;
      room.r[i] *= g;
    }
  }
  stems.space = room;

  for (const name of STEM_NAMES) {
    filterStereo(stems[name], "highpass", 32, 2);
    protectMonoLow(stems[name], 300);
    fadeEdges(stems[name], Math.round(0.008 * sr), Math.round(0.55 * sr));
  }

  const stingSeconds = 2.55;
  const stingFrames = framesFor(stingSeconds, sr);
  const stingStems = emptyStems(stingFrames, sr);
  if (settings.award) {
    const awardHits = hits.filter((hit) => hit.stem === "award");
    const first = awardHits.length ? Math.min(...awardHits.map((hit) => hit.t)) : active;
    const shift = first - 0.03;
    const stingRng = new Rng(mixSeed(settings.seed, settings.variation, hashString(`sting-${preset}`), 99));
    for (const hit of awardHits) {
      const voice = renderVoice(hit.voice, {
        sr,
        brightness,
        decay,
        body: Math.max(0.15, bodyAmt),
        rng: stingRng,
        note: hit.note,
        dur: hit.dur * decay,
      });
      const [gl, gr] = panGains(hit.pan);
      addMono(stingStems.award, Math.round((hit.t - shift) * sr), voice, gl * hit.amp, gr * hit.amp, false);
    }
    for (const hit of bodies.filter((item) => item.award)) {
      const voice = renderVoice("body", {
        sr,
        brightness,
        decay,
        body: 1,
        rng: stingRng,
        note: hit.mode,
        dur: 0.38,
        transpose,
      });
      const g = hit.amp / Math.SQRT2;
      addMono(stingStems.body, Math.round((hit.t - shift) * sr), voice, g, g, false);
    }
    scaleStereo(stingStems.award, 0.42);
    const stingRoom = renderSpace(stingStems.award, spaceAmt, rt, { award: true, brightness });
    stingStems.space = stingRoom;
    for (const name of STEM_NAMES) {
      filterStereo(stingStems[name], "highpass", 32, 2);
      protectMonoLow(stingStems[name], 300);
      fadeEdges(stingStems[name], Math.round(0.004 * sr), Math.round(0.42 * sr));
    }
  }

  return {
    stems,
    stingStems,
    activeSeconds: active,
    totalSeconds: total,
    stingSeconds,
    recipe: {
      source: "approval-demos-v4/render.py",
      preset,
      seed: settings.seed,
      variation: settings.variation,
      activeSeconds: active,
      totalSeconds: total,
      rateStart,
      rateEnd,
      brightness,
      decay,
      body: bodyAmt,
      space: spaceAmt,
      transpose,
      award: settings.award,
      spatial:
        "27/49/81 ms reflections, diffuse taps, wet HP390/LP3900, side HP300, body dry and centered",
      kind: "sequence",
      loop: false,
    },
  };
}

function saturate(src: Stereo, drive: number): void {
  for (let i = 0; i < src.l.length; i++) {
    src.l[i] = Math.tanh(src.l[i] * drive) / drive;
    src.r[i] = Math.tanh(src.r[i] * drive) / drive;
  }
}
