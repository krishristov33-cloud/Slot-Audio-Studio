import { CATALOGUE, type CueDefinition, type CueKind, type Priority } from "./catalogue";
import type { CountPreset } from "./countup";
import type { MusicVariant } from "./music";
import type { ScaleName } from "./scales";
import type { Flavor } from "./sfx";
import { clamp } from "./dsp";

export const PROJECT_VERSION = 1;
export const STORAGE_KEY = "grim-hamster.slot-audio-studio.v1";

export type ThemeId = "hollow-orchard" | "classic-cabinet" | "neon-tiers" | "warm-award";

export interface LayerState {
  mute: boolean;
  solo: boolean;
  gain: number;
}

export interface CueParams {
  transpose: number;
  decay: number;
  brightness: number;
  body: number;
  space: number;
  rate: number;
  gain: number;
  duration: number;
  bars: number;
  preset: CountPreset;
  rateStart: number;
  rateEnd: number;
  award: boolean;
  tempoScale: number;
  variation: number;
  layers: Record<string, LayerState>;
}

export interface Cue {
  id: string;
  name: string;
  pack: string;
  kind: CueKind;
  priority: Priority;
  implemented: boolean;
  custom: boolean;
  enabled: boolean;
  flavor: Flavor;
  preset?: CountPreset;
  music?: MusicVariant;
  blurb: string;
  params: CueParams;
}

export interface Identity {
  theme: ThemeId;
  bpm: number;
  rootMidi: number;
  scale: ScaleName;
  intensity: number;
  seed: number;
}

export interface Project {
  version: 1;
  name: string;
  identity: Identity;
  masterGain: number;
  cues: Cue[];
}

export const THEMES: Record<
  ThemeId,
  { label: string; note: string; bpm: number; rootMidi: number; scale: ScaleName; intensity: number }
> = {
  "hollow-orchard": {
    label: "Hollow Orchard",
    note: "Playful-dark hybrid. Dorian color, wood and rubber, the listening-test starting point.",
    bpm: 112,
    rootMidi: 62,
    scale: "dorian",
    intensity: 0.55,
  },
  "classic-cabinet": {
    label: "Classic cabinet",
    note: "Minor key, a bit quicker, more coin and body in the count-up.",
    bpm: 118,
    rootMidi: 60,
    scale: "minor",
    intensity: 0.62,
  },
  "neon-tiers": {
    label: "Neon tiers",
    note: "Faster minor bed. FM ticks sit forward and the room stays shorter.",
    bpm: 128,
    rootMidi: 57,
    scale: "minor",
    intensity: 0.74,
  },
  "warm-award": {
    label: "Warm award",
    note: "Slower major color for harmonic awards and summary beds.",
    bpm: 100,
    rootMidi: 55,
    scale: "major",
    intensity: 0.48,
  },
};

export function defaultParams(def?: Partial<CueDefinition>): CueParams {
  return {
    transpose: 0,
    decay: 1,
    brightness: 1,
    body: 1,
    space: def?.id === "countup.skip" ? 0.55 : 1,
    rate: 1,
    gain: 1,
    duration: def?.duration ?? 0,
    bars: def?.bars ?? 8,
    preset: def?.preset ?? "A",
    rateStart: def?.rateStart ?? 15,
    rateEnd: def?.rateEnd ?? 27,
    award: def?.award !== false,
    tempoScale: 1,
    variation: 0,
    layers: {},
  };
}

export function cueFromDefinition(def: CueDefinition, custom = false): Cue {
  return {
    id: def.id,
    name: def.name,
    pack: def.pack,
    kind: def.kind,
    priority: def.priority,
    implemented: def.implemented,
    custom,
    enabled: true,
    flavor: structuredClone(def.flavor),
    preset: def.preset,
    music: def.music,
    blurb: def.blurb,
    params: defaultParams(def),
  };
}

export function defaultProject(): Project {
  return {
    version: 1,
    name: "Hollow Orchard",
    identity: {
      theme: "hollow-orchard",
      bpm: THEMES["hollow-orchard"].bpm,
      rootMidi: THEMES["hollow-orchard"].rootMidi,
      scale: THEMES["hollow-orchard"].scale,
      intensity: THEMES["hollow-orchard"].intensity,
      seed: 41219,
    },
    masterGain: 0.8,
    cues: CATALOGUE.map((def) => cueFromDefinition(def)),
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function sanitizeLayers(value: unknown): Record<string, LayerState> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, LayerState> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const layer = raw as Partial<LayerState>;
    out[key.slice(0, 40)] = {
      mute: Boolean(layer.mute),
      solo: Boolean(layer.solo),
      gain: num(layer.gain, 1, 0, 2),
    };
  }
  return out;
}

export function sanitizeParams(value: unknown, fallback?: CueParams): CueParams {
  const base = fallback ?? defaultParams();
  const raw = value && typeof value === "object" ? (value as Partial<CueParams>) : {};
  const preset: CountPreset = raw.preset === "B" || raw.preset === "C" ? raw.preset : base.preset;
  return {
    transpose: Math.round(num(raw.transpose, base.transpose, -24, 24)),
    decay: num(raw.decay, base.decay, 0.35, 2.4),
    brightness: num(raw.brightness, base.brightness, 0.25, 1.6),
    body: num(raw.body, base.body, 0, 2),
    space: num(raw.space, base.space, 0, 2),
    rate: num(raw.rate, base.rate, 0.25, 3),
    gain: num(raw.gain, base.gain, 0, 2),
    duration: num(raw.duration, base.duration, 0, 24),
    bars: Math.round(num(raw.bars, base.bars, 2, 8)),
    preset,
    rateStart: num(raw.rateStart, base.rateStart, 4, 36),
    rateEnd: num(raw.rateEnd, base.rateEnd, 4, 36),
    award: typeof raw.award === "boolean" ? raw.award : base.award,
    tempoScale: num(raw.tempoScale, base.tempoScale, 0.75, 1.35),
    variation: Math.round(num(raw.variation, base.variation, 0, 9999)),
    layers: sanitizeLayers(raw.layers ?? base.layers),
  };
}

function isScale(value: unknown): value is ScaleName {
  return value === "minor" || value === "dorian" || value === "major" || value === "mixolydian";
}

function isTheme(value: unknown): value is ThemeId {
  return value === "hollow-orchard" || value === "classic-cabinet" || value === "neon-tiers" || value === "warm-award";
}

function sanitizeIdentity(value: unknown): Identity {
  const base = defaultProject().identity;
  const raw = value && typeof value === "object" ? (value as Partial<Identity>) : {};
  return {
    theme: isTheme(raw.theme) ? raw.theme : base.theme,
    bpm: num(raw.bpm, base.bpm, 70, 180),
    rootMidi: Math.round(num(raw.rootMidi, base.rootMidi, 48, 72)),
    scale: isScale(raw.scale) ? raw.scale : base.scale,
    intensity: num(raw.intensity, base.intensity, 0, 1),
    seed: Math.round(num(raw.seed, base.seed, 1, 2147483646)) >>> 0,
  };
}

function sanitizeFlavor(value: unknown, fallback: Flavor): Flavor {
  if (!value || typeof value !== "object") return structuredClone(fallback);
  const raw = value as Partial<Flavor>;
  return {
    ...fallback,
    ...raw,
    family: fallback.family,
    steps: Array.isArray(raw.steps) ? raw.steps.map((n) => num(n, 0, -36, 36)).slice(0, 8) : fallback.steps,
    seconds: num(raw.seconds, fallback.seconds, 0.05, 8),
    semitone: num(raw.semitone, fallback.semitone, -36, 36),
    space: num(raw.space, fallback.space, 0, 2),
    body: num(raw.body, fallback.body, 0, 2),
    rate: num(raw.rate, fallback.rate, 0.5, 28),
    amp: num(raw.amp, fallback.amp, 0, 1.5),
    pan: num(raw.pan, fallback.pan, -1, 1),
    snap: Boolean(raw.snap ?? fallback.snap),
    voice: raw.voice ?? fallback.voice,
  };
}

function mergeBuiltin(saved: Partial<Cue> | undefined, def: CueDefinition): Cue {
  const base = cueFromDefinition(def);
  if (!saved) return base;
  return {
    ...base,
    name: typeof saved.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 80) : base.name,
    enabled: saved.enabled !== false,
    params: sanitizeParams(saved.params, base.params),
  };
}

export function sanitizeProject(value: unknown): { project: Project; warning?: string } {
  const fresh = defaultProject();
  if (!value || typeof value !== "object") {
    return { project: fresh, warning: "That file was not a studio project. A new project was loaded." };
  }
  const raw = value as Partial<Project>;
  const warnings: string[] = [];
  if (raw.version !== 1) warnings.push("The project version was missing or new. Recognized fields were kept.");
  const byId = new Map<string, Partial<Cue>>();
  if (Array.isArray(raw.cues)) {
    for (const cue of raw.cues) {
      if (cue && typeof cue === "object" && typeof (cue as Cue).id === "string") byId.set((cue as Cue).id, cue as Partial<Cue>);
    }
  } else {
    warnings.push("The cue list was missing. Catalogue defaults were restored.");
  }
  const cues = CATALOGUE.map((def) => mergeBuiltin(byId.get(def.id), def));
  for (const [id, saved] of byId) {
    if (!id.startsWith("custom.") || !saved.flavor || saved.flavor.family === "unimplemented") continue;
    const familyOk = saved.flavor.family !== "music" && saved.flavor.family !== "countup";
    if (!familyOk) continue;
    const template = CATALOGUE.find((def) => def.flavor.family === saved.flavor?.family) ?? CATALOGUE[0];
    const cue = cueFromDefinition(template, true);
    cue.id = id.slice(0, 80);
    cue.name = typeof saved.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 80) : "Custom cue";
    cue.pack = typeof saved.pack === "string" && saved.pack.trim() ? saved.pack.trim().slice(0, 40) : "Custom";
    cue.enabled = saved.enabled !== false;
    cue.blurb = typeof saved.blurb === "string" ? saved.blurb.slice(0, 240) : cue.blurb;
    cue.flavor = sanitizeFlavor(saved.flavor, cue.flavor);
    cue.kind = saved.kind === "loop" || saved.kind === "sequence" ? saved.kind : cue.kind;
    cue.priority = saved.priority ?? cue.priority;
    cue.params = sanitizeParams(saved.params, cue.params);
    cues.push(cue);
  }
  return {
    project: {
      version: 1,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : fresh.name,
      identity: sanitizeIdentity(raw.identity),
      masterGain: num(raw.masterGain, 0.8, 0, 1),
      cues,
    },
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}

export function parseProject(raw: string): { project: Project; warning?: string } {
  try {
    return sanitizeProject(JSON.parse(raw));
  } catch {
    return {
      project: defaultProject(),
      warning: "The project file could not be read. A new project was loaded instead.",
    };
  }
}

export function loadStoredProject(storage: Pick<Storage, "getItem"> | null): { project: Project; warning?: string } {
  if (!storage) return { project: defaultProject() };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { project: defaultProject() };
    return parseProject(raw);
  } catch {
    return {
      project: defaultProject(),
      warning: "The saved project in this browser could not be read. A new project was loaded.",
    };
  }
}

export function saveStoredProject(storage: Pick<Storage, "setItem">, project: Project): string | null {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(project));
    return null;
  } catch {
    return "The browser could not store the project. Export a JSON file to keep it.";
  }
}
