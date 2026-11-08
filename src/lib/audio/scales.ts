export type ScaleName = "minor" | "dorian" | "major" | "mixolydian";

export const SCALES: Record<ScaleName, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const SCALE_LABEL: Record<ScaleName, string> = {
  minor: "Natural minor",
  dorian: "Dorian",
  major: "Major",
  mixolydian: "Mixolydian",
};
