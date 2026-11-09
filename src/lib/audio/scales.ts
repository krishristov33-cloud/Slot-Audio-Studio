export type ScaleName =
  | "minor"
  | "dorian"
  | "major"
  | "mixolydian"
  | "pentatonic"
  | "phrygian"
  | "harmonic-minor"
  | "whole-tone"
  | "blues";

export const SCALES: Record<ScaleName, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11],
  "whole-tone": [0, 2, 4, 6, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export const SCALE_LABEL: Record<ScaleName, string> = {
  minor: "Natural minor",
  dorian: "Dorian",
  major: "Major",
  mixolydian: "Mixolydian",
  pentatonic: "Pentatonic",
  phrygian: "Phrygian",
  "harmonic-minor": "Harmonic minor",
  "whole-tone": "Whole tone",
  blues: "Blues",
};

export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];
