import { framesFor, makeStereo, SR, type Stereo } from "./dsp";

export interface ClipPart {
  id: string;
  /** Timeline start, seconds. */
  start: number;
  /** Audible length, seconds. */
  duration: number;
  /** Read offset into the source buffer, seconds. */
  offset: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
}

export function fullPart(duration: number, loop = false): ClipPart {
  return {
    id: "part-1",
    start: 0,
    duration: Math.max(0.05, duration),
    offset: 0,
    fadeIn: loop ? 0 : 0.004,
    fadeOut: loop ? 0 : 0.02,
    gain: 1,
  };
}

/**
 * Split one part at an absolute timeline time.
 * The cut keeps source offsets so each side still reads the same audio.
 */
export function splitParts(parts: ClipPart[], partId: string, time: number): ClipPart[] {
  const next: ClipPart[] = [];
  for (const part of parts) {
    const local = time - part.start;
    if (part.id !== partId || local <= 0.01 || local >= part.duration - 0.01) {
      next.push(part);
      continue;
    }
    next.push({ ...part, duration: local, fadeOut: 0 });
    next.push({
      ...part,
      id: `${part.id}-b-${Math.round(time * 1000)}`,
      start: part.start + local,
      offset: part.offset + local,
      duration: part.duration - local,
      fadeIn: 0,
    });
  }
  return next;
}

export function movePart(parts: ClipPart[], partId: string, start: number): ClipPart[] {
  return parts.map((part) => (part.id === partId ? { ...part, start: Math.max(0, start) } : part));
}

export function deletePart(parts: ClipPart[], partId: string): ClipPart[] {
  const next = parts.filter((part) => part.id !== partId);
  return next.length ? next : parts;
}

export function duplicatePart(parts: ClipPart[], partId: string): ClipPart[] {
  const part = parts.find((item) => item.id === partId);
  if (!part) return parts;
  const copy: ClipPart = {
    ...part,
    id: `${part.id}-copy-${Math.round(part.start * 1000)}`,
    start: part.start + part.duration + 0.02,
  };
  return [...parts, copy];
}

export function setFades(parts: ClipPart[], partId: string, fadeIn: number, fadeOut: number): ClipPart[] {
  return parts.map((part) =>
    part.id === partId
      ? {
          ...part,
          fadeIn: Math.max(0, Math.min(fadeIn, part.duration * 0.5)),
          fadeOut: Math.max(0, Math.min(fadeOut, part.duration * 0.5)),
        }
      : part,
  );
}

function fadeGain(part: ClipPart, local: number): number {
  let gain = part.gain;
  if (part.fadeIn > 0 && local < part.fadeIn) gain *= local / part.fadeIn;
  const tail = part.duration - local;
  if (part.fadeOut > 0 && tail < part.fadeOut) gain *= Math.max(0, tail / part.fadeOut);
  return gain;
}

/** Arrange source audio through non-destructive parts. */
export function arrangeParts(source: Stereo, parts: ClipPart[], seconds?: number): Stereo {
  const end = seconds ?? Math.max(0.05, ...parts.map((part) => part.start + part.duration), source.l.length / source.sr);
  const out = makeStereo(framesFor(end, source.sr), source.sr);
  for (const part of parts) {
    const start = Math.round(part.start * source.sr);
    const offset = Math.round(part.offset * source.sr);
    const length = Math.round(part.duration * source.sr);
    for (let i = 0; i < length; i++) {
      const dest = start + i;
      const srcIndex = offset + i;
      if (dest < 0 || dest >= out.l.length || srcIndex < 0 || srcIndex >= source.l.length) continue;
      const gain = fadeGain(part, i / source.sr);
      out.l[dest] += source.l[srcIndex] * gain;
      out.r[dest] += source.r[srcIndex] * gain;
    }
  }
  return out;
}

export function timelineEnd(parts: ClipPart[], fallback = 0.5): number {
  if (!parts.length) return fallback;
  return Math.max(fallback, ...parts.map((part) => part.start + part.duration));
}

export { SR };
