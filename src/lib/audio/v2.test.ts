import { describe, expect, it } from "vitest";
import { addPoint, deletePoint, movePoint, valueAt, type AutoPoint } from "./automation";
import { arrangeParts, fullPart, splitParts, type ClipPart } from "./timeline";
import { applyEffect, defaultEffect, limitTo } from "./fx";
import { makeStereo, peakOf, rmsOf, SR } from "./dsp";
import { renderMany, renderSound, type Sound } from "./generate";
import { defaultProject, parseProject } from "./model";
import { THEMES } from "./themes";

function point(partial: Partial<AutoPoint> & Pick<AutoPoint, "t" | "v">): AutoPoint {
  return { id: partial.id ?? `p${partial.t}`, curve: "linear", hx: 0.2, hy: 0, ...partial };
}

describe("automation curves", () => {
  const ends = [point({ t: 0, v: 0, curve: "linear" }), point({ t: 1, v: 1 })];

  it("interpolates linear, smoothstep, step and bezier differently", () => {
    expect(valueAt(ends, 0.25)).toBeCloseTo(0.25, 5);
    const smooth = [point({ t: 0, v: 0, curve: "smooth" }), point({ t: 1, v: 1 })];
    expect(valueAt(smooth, 0.25)).toBeCloseTo(0.15625, 4);
    const stepped = [point({ t: 0, v: 0.2, curve: "step" }), point({ t: 1, v: 0.9 })];
    expect(valueAt(stepped, 0.6)).toBeCloseTo(0.2, 5);
    const bowed = [point({ t: 0, v: 0, curve: "bezier", hx: 0.15, hy: 0.8 }), point({ t: 1, v: 1, hx: 0.2, hy: 0 })];
    const mid = valueAt(bowed, 0.5);
    expect(mid).toBeGreaterThan(0.55);
    expect(mid).toBeLessThan(1.4);
  });

  it("adds, moves and deletes points", () => {
    const added = addPoint(ends, point({ id: "m", t: 0.4, v: 0.2 }));
    expect(added).toHaveLength(3);
    expect(movePoint(added, "m", 0.6, 0.7).find((item) => item.id === "m")?.v).toBe(0.7);
    expect(deletePoint(added, "m")).toHaveLength(2);
  });
});

describe("clip split and fades", () => {
  it("splits a part without losing the source read position", () => {
    const parts = [fullPart(2, true)];
    const next = splitParts(parts, parts[0].id, 0.5);
    expect(next).toHaveLength(2);
    expect(next[0].duration).toBeCloseTo(0.5);
    expect(next[0].fadeOut).toBe(0);
    expect(next[1].start).toBeCloseTo(0.5);
    expect(next[1].offset).toBeCloseTo(0.5);
    expect(next[1].duration).toBeCloseTo(1.5);
    expect(next[1].fadeIn).toBe(0);
  });

  it("fades the arranged audio in and out", () => {
    const source = makeStereo(SR, SR);
    source.l.fill(0.5);
    source.r.fill(0.5);
    const part: ClipPart = { id: "a", start: 0, duration: 1, offset: 0, fadeIn: 0.1, fadeOut: 0.1, gain: 1 };
    const arranged = arrangeParts(source, [part], 1);
    expect(Math.abs(arranged.l[0])).toBeLessThan(0.02);
    expect(Math.abs(arranged.l[Math.floor(SR / 2)])).toBeGreaterThan(0.4);
    expect(Math.abs(arranged.l[SR - 1])).toBeLessThan(0.02);
  });
});

describe("effects", () => {
  it("distortion changes the wave and the limiter holds the ceiling", () => {
    const tone = makeStereo(1000, SR);
    for (let i = 0; i < tone.l.length; i++) {
      const sample = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.4;
      tone.l[i] = sample;
      tone.r[i] = sample;
    }
    const dry = tone.l[20];
    const driven = makeStereo(tone.l.length, SR);
    driven.l.set(tone.l);
    driven.r.set(tone.r);
    applyEffect(driven, defaultEffect("distortion", "d"));
    expect(driven.l[20]).not.toBeCloseTo(dry, 3);
    const hot = makeStereo(500, SR);
    hot.l.fill(2);
    hot.r.fill(-2);
    const peak = limitTo(hot, 0.89);
    expect(peak).toBeLessThanOrEqual(0.891);
    expect(peakOf(hot)).toBeLessThanOrEqual(0.891);
    expect(rmsOf(driven)).toBeGreaterThan(0);
  });
});

describe("theme engine", () => {
  it("renders every catalogue sound for ten themes without blowing up", () => {
    const project = defaultProject();
    const themes = THEMES.slice(0, 10);
    expect(project.sounds.length).toBeGreaterThan(40);
    for (const theme of themes) {
      const batch = renderMany(project.sounds, theme, undefined, 0.22);
      expect(batch).toHaveLength(project.sounds.length);
      for (const item of batch) {
        expect(item.rendered.stereo.l.length).toBeGreaterThan(100);
        expect(item.rendered.peaks.length).toBeGreaterThan(8);
        for (let i = 0; i < item.rendered.stereo.l.length; i += 32) {
          expect(Number.isFinite(item.rendered.stereo.l[i])).toBe(true);
          expect(Math.abs(item.rendered.stereo.l[i])).toBeLessThanOrEqual(0.9);
        }
      }
    }
  }, 120_000);

  it("is deterministic and themes change the timbre", () => {
    const sound = defaultProject().sounds.find((item) => item.id === "ui.confirm");
    expect(sound).toBeTruthy();
    if (!sound) return;
    const a = renderSound(sound, THEMES[0], { maxSeconds: 0.4 });
    const b = renderSound(sound, THEMES[0], { maxSeconds: 0.4 });
    const c = renderSound(sound, THEMES[7], { maxSeconds: 0.4 });
    expect(a.stereo.l[800]).toBe(b.stereo.l[800]);
    let delta = 0;
    const length = Math.min(a.stereo.l.length, c.stereo.l.length);
    for (let i = 0; i < length; i += 8) delta += Math.abs(a.stereo.l[i] - c.stereo.l[i]);
    expect(delta).toBeGreaterThan(0.05);
  });

  it("a brightness lane changes the rendered layer", () => {
    const sound = structuredClone(defaultProject().sounds.find((item) => item.id === "symbol.land")) as Sound;
    sound.params.duration = 0.4;
    const flat = renderSound(sound, THEMES[0], { maxSeconds: 0.4 });
    sound.layers[0].automation = [{
      id: "brightness",
      param: "brightness",
      points: [
        { id: "a", t: 0, v: 0.05, curve: "linear", hx: 0.1, hy: 0 },
        { id: "b", t: 0.4, v: 1, curve: "linear", hx: 0.1, hy: 0 },
      ],
    }];
    const swept = renderSound(sound, THEMES[0], { maxSeconds: 0.4 });
    let delta = 0;
    for (let i = 0; i < flat.stereo.l.length; i += 6) delta += Math.abs(flat.stereo.l[i] - swept.stereo.l[i]);
    expect(delta).toBeGreaterThan(0.05);
  });

  it("round-trips a project and recovers from garbage", () => {
    const project = defaultProject();
    project.name = "Night floor";
    project.sounds[0].name = "Yes";
    const parsed = parseProject(JSON.stringify(project));
    expect(parsed.project.name).toBe("Night floor");
    expect(parsed.project.sounds[0].name).toBe("Yes");
    expect(parsed.project.sounds.length).toBe(project.sounds.length);
    const broken = parseProject("{nope");
    expect(broken.warning).toMatch(/could not be read/i);
    expect(broken.project.sounds.length).toBeGreaterThan(10);
  });
});
