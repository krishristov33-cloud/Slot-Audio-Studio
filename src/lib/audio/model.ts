import { CATALOGUE, type CueKind } from "./catalogue";
import type { Family } from "./sfx";
import { SCALE_NAMES, type ScaleName } from "./scales";
import { PROGRESSIONS, randomProgression } from "./chords";
import { ALGORITHMS, type Algorithm } from "./algorithms";
import { Rng } from "./rng";
import { fullPart } from "./timeline";
import type { Sound, SoundParams, Layer } from "./generate";
import { THEMES, themeById, type Theme } from "./themes";

export const STORAGE_KEY = "grim-hamster.slot-audio-studio.v2";

export interface Project {
  version: 2;
  name: string;
  themeId: string;
  masterGain: number;
  sounds: Sound[];
}

export function defaultParams(partial?: Partial<SoundParams>): SoundParams {
  return {
    scale: "dorian",
    root: 62,
    bpm: 112,
    duration: 1.2,
    mood: 0.45,
    energy: 0.55,
    brightness: 0.6,
    weirdness: 0.25,
    tickRate: 14,
    pitchCurve: 7,
    tiers: 3,
    density: 0.65,
    finish: 1,
    transient: 0.8,
    body: 0.85,
    tail: 0.45,
    sub: 0.55,
    progression: "grim",
    algorithm: "modal",
    variation: 0,
    ...partial,
  };
}

export function makeLayer(index: number, algorithm: Algorithm): Layer {
  return {
    id: `layer-${index + 1}`,
    name: `Layer ${index + 1}`,
    mode: index === 0 ? "stack" : "resample",
    algorithm,
    gain: index === 0 ? 1 : 0.65,
    mute: false,
    solo: false,
    effects: [],
    automation: [],
  };
}

export function soundFromCatalogue(id: string): Sound | null {
  const def = CATALOGUE.find((item) => item.id === id);
  if (!def) return null;
  const family = def.flavor.family;
  const duration = family === "music" ? 6 : def.duration || def.flavor.seconds || (def.kind === "loop" ? 2 : 0.7);
  const params = defaultParams({
    duration: Math.max(0.2, Math.min(12, duration)),
    tickRate: def.flavor.rate || def.rateStart || 12,
    pitchCurve: family === "countup" ? 8 : 5,
    tiers: def.preset === "B" ? 3 : 1,
    body: def.flavor.body,
    progression: def.music === "bonus" ? "epic" : def.music === "bigwin" ? "lift" : "grim",
    algorithm: family === "music" ? "karplus" : family === "impact" ? "noise" : "modal",
  });
  return {
    id: def.id,
    name: def.name,
    pack: def.pack,
    kind: def.kind,
    family,
    blurb: def.blurb,
    implemented: def.implemented && family !== "import",
    params,
    locks: [],
    layers: [makeLayer(0, params.algorithm)],
    parts: [fullPart(params.duration, def.kind === "loop")],
    master: [],
    peaks: [],
    generated: false,
  };
}

export function defaultProject(): Project {
  return {
    version: 2,
    name: "Slot Audio Studio",
    themeId: "grim-hamster",
    masterGain: 0.8,
    sounds: CATALOGUE.map((item) => soundFromCatalogue(item.id)!),
  };
}

export function applyTheme(sound: Sound, theme: Theme): Sound {
  const next = structuredClone(sound);
  if (!next.locks.includes("scale")) next.params.scale = theme.scale;
  if (!next.locks.includes("root")) next.params.root = theme.root;
  if (!next.locks.includes("bpm")) next.params.bpm = theme.bpm;
  if (!next.locks.includes("mood")) next.params.mood = theme.mood;
  if (!next.locks.includes("energy")) next.params.energy = theme.energy;
  if (!next.locks.includes("brightness")) next.params.brightness = theme.brightness;
  if (!next.locks.includes("weirdness")) next.params.weirdness = theme.weirdness;
  if (!next.locks.includes("algorithm")) {
    next.params.algorithm = theme.algorithms[0];
    if (next.layers[0]) next.layers[0].algorithm = theme.algorithms[0];
  }
  return next;
}

export function randomizeSound(sound: Sound, theme: Theme, seed: number): Sound {
  const rng = new Rng((seed ^ sound.params.variation ^ theme.root) >>> 0 || 1);
  const next = applyTheme(sound, theme);
  const roll = (key: keyof SoundParams, value: SoundParams[keyof SoundParams]) => {
    if (!next.locks.includes(key)) (next.params[key] as SoundParams[keyof SoundParams]) = value;
  };
  roll("scale", SCALE_NAMES[Math.floor(rng.next() * SCALE_NAMES.length)]);
  roll("mood", rng.next());
  roll("energy", rng.next());
  roll("brightness", 0.2 + rng.next() * 0.9);
  roll("weirdness", rng.next());
  roll("tickRate", 6 + rng.next() * 20);
  roll("pitchCurve", rng.next() * 14);
  roll("density", rng.next());
  roll("transient", 0.3 + rng.next() * 0.7);
  roll("body", 0.3 + rng.next() * 0.8);
  roll("tail", rng.next());
  roll("sub", rng.next());
  roll("algorithm", ALGORITHMS[Math.floor(rng.next() * ALGORITHMS.length)]);
  if (!next.locks.includes("progression")) next.params.progression = randomProgression(rng).id;
  next.params.variation += 1;
  if (next.layers[0] && !next.locks.includes("algorithm")) next.layers[0].algorithm = next.params.algorithm;
  return next;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isScale(value: unknown): value is ScaleName {
  return typeof value === "string" && (SCALE_NAMES as string[]).includes(value);
}

export function sanitizeProject(value: unknown): { project: Project; warning?: string } {
  const fresh = defaultProject();
  if (!value || typeof value !== "object") return { project: fresh, warning: "That file was not a project. A new one was loaded." };
  const raw = value as Partial<Project>;
  const byId = new Map<string, Partial<Sound>>();
  if (Array.isArray(raw.sounds)) {
    for (const sound of raw.sounds) {
      if (sound && typeof sound === "object" && typeof (sound as Sound).id === "string") byId.set((sound as Sound).id, sound as Partial<Sound>);
    }
  }
  const sounds = fresh.sounds.map((sound) => mergeSound(sound, byId.get(sound.id)));
  for (const [id, saved] of byId) {
    if (!id.startsWith("custom.") || !saved.name) continue;
    const base = soundFromCatalogue("ui.confirm")!;
    base.id = id.slice(0, 80);
    base.name = String(saved.name).slice(0, 80);
    base.pack = typeof saved.pack === "string" ? saved.pack.slice(0, 40) : "Custom";
    sounds.push(mergeSound(base, saved));
  }
  let warning: string | undefined;
  if (raw.version !== 2) warning = "Older project fields were adapted into the editor.";
  return {
    project: {
      version: 2,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : fresh.name,
      themeId: THEMES.some((theme) => theme.id === raw.themeId) ? (raw.themeId as string) : fresh.themeId,
      masterGain: num(raw.masterGain, 0.8, 0, 1),
      sounds,
    },
    warning,
  };
}

function mergeSound(base: Sound, saved?: Partial<Sound>): Sound {
  if (!saved) return base;
  const params = { ...base.params, ...(saved.params ?? {}) };
  params.duration = num(params.duration, base.params.duration, 0.12, 16);
  params.root = Math.round(num(params.root, base.params.root, 36, 84));
  params.bpm = num(params.bpm, base.params.bpm, 70, 180);
  params.mood = num(params.mood, base.params.mood, 0, 1);
  params.energy = num(params.energy, base.params.energy, 0, 1);
  params.brightness = num(params.brightness, base.params.brightness, 0.15, 1.5);
  params.weirdness = num(params.weirdness, base.params.weirdness, 0, 1);
  params.tickRate = num(params.tickRate, base.params.tickRate, 4, 32);
  params.pitchCurve = num(params.pitchCurve, base.params.pitchCurve, 0, 24);
  params.tiers = Math.round(num(params.tiers, base.params.tiers, 1, 4));
  params.density = num(params.density, base.params.density, 0, 1);
  params.finish = num(params.finish, base.params.finish, 0, 3);
  params.transient = num(params.transient, 0.8, 0, 1.5);
  params.body = num(params.body, 0.8, 0, 1.5);
  params.tail = num(params.tail, 0.4, 0, 1.5);
  params.sub = num(params.sub, 0.5, 0, 1.5);
  params.variation = Math.round(num(params.variation, 0, 0, 9999));
  if (!isScale(params.scale)) params.scale = base.params.scale;
  if (!PROGRESSIONS.some((item) => item.id === params.progression)) params.progression = base.params.progression;
  if (!ALGORITHMS.includes(params.algorithm)) params.algorithm = base.params.algorithm;
  const layers = Array.isArray(saved.layers) && saved.layers.length ? saved.layers.slice(0, 4).map((layer, index) => ({ ...makeLayer(index, params.algorithm), ...layer, id: layer.id || `layer-${index + 1}` })) : base.layers;
  const parts = Array.isArray(saved.parts) && saved.parts.length ? saved.parts.slice(0, 16) : [fullPart(params.duration, base.kind === "loop")];
  return {
    ...base,
    name: typeof saved.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 80) : base.name,
    pack: typeof saved.pack === "string" ? saved.pack.slice(0, 40) : base.pack,
    params,
    locks: Array.isArray(saved.locks) ? saved.locks.map(String).slice(0, 24) : [],
    layers,
    parts,
    master: Array.isArray(saved.master) ? saved.master.slice(0, 8) : [],
    peaks: Array.isArray(saved.peaks) ? saved.peaks.filter((n) => typeof n === "number").slice(0, 96) : [],
    generated: Boolean(saved.generated),
  };
}

export function parseProject(raw: string): { project: Project; warning?: string } {
  try {
    return sanitizeProject(JSON.parse(raw));
  } catch {
    return { project: defaultProject(), warning: "The project file could not be read. A new project was loaded." };
  }
}

export function loadStoredProject(storage: Pick<Storage, "getItem"> | null): { project: Project; warning?: string } {
  if (!storage) return { project: defaultProject() };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { project: defaultProject() };
    return parseProject(raw);
  } catch {
    return { project: defaultProject(), warning: "The saved project could not be read. A new one was loaded." };
  }
}

export function saveStoredProject(storage: Pick<Storage, "setItem">, project: Project): string | null {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(project));
    return null;
  } catch {
    return "The browser could not store the project. Download the JSON to keep it.";
  }
}

export function moveSound(sounds: Sound[], from: number, to: number): Sound[] {
  const next = sounds.slice();
  const [item] = next.splice(from, 1);
  if (!item) return sounds;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export { themeById };
export type { CueKind, Family };
