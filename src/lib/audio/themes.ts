import type { ScaleName } from "./scales";
import type { Algorithm } from "./algorithms";

export interface Theme {
  id: string;
  name: string;
  note: string;
  scale: ScaleName;
  root: number;
  bpm: number;
  mood: number;
  energy: number;
  brightness: number;
  weirdness: number;
  algorithms: Algorithm[];
}

export const THEMES: Theme[] = [
  { id: "classic-casino", name: "Classic casino", note: "Warm major bells and rounded coins.", scale: "major", root: 60, bpm: 112, mood: 0.72, energy: 0.48, brightness: 0.62, weirdness: 0.12, algorithms: ["modal", "additive", "subtractive"] },
  { id: "vegas-neon", name: "Vegas neon", note: "Bright FM and fast wavetable edges.", scale: "mixolydian", root: 67, bpm: 126, mood: 0.8, energy: 0.78, brightness: 0.9, weirdness: 0.35, algorithms: ["fm", "wavetable", "subtractive"] },
  { id: "egyptian", name: "Egyptian", note: "Phrygian modal bells and dry plucks.", scale: "phrygian", root: 60, bpm: 100, mood: 0.42, energy: 0.5, brightness: 0.55, weirdness: 0.28, algorithms: ["modal", "karplus", "additive"] },
  { id: "oriental", name: "Asian court", note: "Pentatonic plucked strings and small bells.", scale: "pentatonic", root: 62, bpm: 96, mood: 0.58, energy: 0.4, brightness: 0.66, weirdness: 0.22, algorithms: ["karplus", "modal", "additive"] },
  { id: "celtic", name: "Irish / Celtic", note: "Dorian harp plucks and airy fifths.", scale: "dorian", root: 62, bpm: 108, mood: 0.66, energy: 0.52, brightness: 0.58, weirdness: 0.18, algorithms: ["karplus", "additive", "modal"] },
  { id: "pirate", name: "Pirate", note: "Minor hull knocks and rough strings.", scale: "minor", root: 55, bpm: 104, mood: 0.34, energy: 0.6, brightness: 0.4, weirdness: 0.3, algorithms: ["karplus", "noise", "subtractive"] },
  { id: "horror", name: "Horror / Halloween", note: "Harmonic-minor dissonance and grains.", scale: "harmonic-minor", root: 58, bpm: 84, mood: 0.12, energy: 0.46, brightness: 0.28, weirdness: 0.72, algorithms: ["granular", "modal", "fm"] },
  { id: "cyber", name: "Sci-fi / cyber", note: "FM keys, wavetables, short noise bursts.", scale: "minor", root: 57, bpm: 128, mood: 0.48, energy: 0.74, brightness: 0.84, weirdness: 0.55, algorithms: ["fm", "wavetable", "noise"] },
  { id: "candy", name: "Candy / sweet", note: "Major additive sparkle.", scale: "major", root: 72, bpm: 120, mood: 0.9, energy: 0.62, brightness: 0.88, weirdness: 0.2, algorithms: ["additive", "modal", "wavetable"] },
  { id: "norse", name: "Norse / Viking", note: "Low minor horns and struck metal.", scale: "minor", root: 50, bpm: 92, mood: 0.3, energy: 0.7, brightness: 0.36, weirdness: 0.24, algorithms: ["subtractive", "modal", "noise"] },
  { id: "western", name: "Western", note: "Mixolydian twang and dry rooms.", scale: "mixolydian", root: 64, bpm: 100, mood: 0.5, energy: 0.42, brightness: 0.48, weirdness: 0.16, algorithms: ["karplus", "subtractive", "noise"] },
  { id: "underwater", name: "Underwater", note: "Slow dorian bubbles and grains.", scale: "dorian", root: 58, bpm: 80, mood: 0.46, energy: 0.28, brightness: 0.34, weirdness: 0.48, algorithms: ["granular", "fm", "modal"] },
  { id: "fruit-retro", name: "Fruit retro", note: "Square-ish major cabinet tones.", scale: "major", root: 69, bpm: 118, mood: 0.74, energy: 0.58, brightness: 0.7, weirdness: 0.1, algorithms: ["wavetable", "subtractive", "additive"] },
  { id: "grim-hamster", name: "Grim Hamster", note: "Dark dorian wood, rubber and centered body.", scale: "dorian", root: 62, bpm: 112, mood: 0.28, energy: 0.5, brightness: 0.46, weirdness: 0.26, algorithms: ["modal", "karplus", "subtractive"] },
];

export function themeById(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[THEMES.length - 1];
}
