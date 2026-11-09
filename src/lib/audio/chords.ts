import { Rng } from "./rng";
import type { ScaleName } from "./scales";
import { SCALES } from "./scales";

export interface Progression {
  id: string;
  name: string;
  /** Scale-step roots. Negative steps walk downward. */
  degrees: number[];
}

export const PROGRESSIONS: Progression[] = [
  { id: "pop", name: "I–V–vi–IV", degrees: [0, 4, 5, 3] },
  { id: "fifties", name: "I–vi–IV–V", degrees: [0, 5, 3, 4] },
  { id: "andalusian", name: "i–VII–VI–V", degrees: [0, -1, -2, -3] },
  { id: "pachelbel", name: "I–V–vi–iii", degrees: [0, 4, 5, 2] },
  { id: "epic", name: "i–VI–III–VII", degrees: [0, 5, 2, 6] },
  { id: "jazz", name: "ii–V–I–vi", degrees: [1, 4, 0, 5] },
  { id: "blues", name: "I–IV–I–V", degrees: [0, 3, 0, 4] },
  { id: "grim", name: "i–VI–iv–V", degrees: [0, 5, 3, 4] },
  { id: "hover", name: "i–iv–v–i", degrees: [0, 3, 4, 0] },
  { id: "lift", name: "I–ii–IV–V", degrees: [0, 1, 3, 4] },
];

export function progressionById(id: string): Progression {
  return PROGRESSIONS.find((item) => item.id === id) ?? PROGRESSIONS[0];
}

export function randomProgression(rng: Rng): Progression {
  return PROGRESSIONS[Math.floor(rng.next() * PROGRESSIONS.length)];
}

export function degreeMidi(root: number, scale: ScaleName, degree: number, octave = 0): number {
  const steps = SCALES[scale];
  const length = steps.length;
  const index = ((degree % length) + length) % length;
  const wrap = Math.floor(degree / length);
  return root + steps[index] + (wrap + octave) * 12;
}

/** Stacked thirds inside the scale, so the progression follows the chosen mode. */
export function chordTones(root: number, scale: ScaleName, degree: number): number[] {
  return [0, 2, 4].map((step) => degreeMidi(root, scale, degree + step, 0));
}
