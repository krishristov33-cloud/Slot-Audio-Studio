import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "./catalogue";
import { VoiceBus } from "./director";
import { defaultProject, parseProject } from "./project";
import { mixdown, synthesize } from "./render";
import { analyze, bandEnergy, earlyRms, seamJump } from "./qc";
import { Rng } from "./rng";
import { buildScenario, celebrationLevel, simulateScenario, type CueMeta } from "./scenario";
import { countOnsets, peakOf, rmsOf, zeroCrossings } from "./dsp";
import { renderVoice } from "./voices";
import { encodeWavPcm16, readWavInfo } from "./wav";
import { zipFiles } from "./zip";
import type { Cue } from "./project";

const REQUIRED = [
  "ui.confirm",
  "ui.back",
  "ui.menu",
  "ui.toggle",
  "ui.disabled",
  "ui.error",
  "session.loading",
  "session.title",
  "session.lobby",
  "session.help",
  "reels.start",
  "reels.motion",
  "reels.stop",
  "reels.turboMotion",
  "symbol.land",
  "symbol.win",
  "countup.classic",
  "countup.tiers",
  "countup.harmonic",
  "countup.finish",
  "countup.skip",
  "bigwin.intro",
  "bigwin.sustain",
  "feature.anticipation",
  "feature.scatter",
  "feature.trigger",
  "fs.awarded",
  "fs.retrigger",
  "fs.final",
  "fs.summary",
  "fs.return",
  "respin.hold",
  "pick.reveal",
  "cascade.fall",
  "wild.expand",
  "transform.mystery",
  "mult.increase",
  "col.deposit",
  "mod.nudge",
  "wheel.ticks",
  "jackpot.tease",
  "jackpot.award",
  "trail.unlock",
  "gamble.win",
  "gamble.loss",
  "theme.character",
  "theme.import",
  "music.base",
  "music.bonus",
  "music.high",
  "music.bigwin",
  "music.summary",
];

function cueOf(id: string, edit?: (cue: Cue) => void): { cue: Cue; identity: ReturnType<typeof defaultProject>["identity"] } {
  const project = defaultProject();
  const cue = structuredClone(project.cues.find((item) => item.id === id));
  if (!cue) throw new Error(id);
  edit?.(cue);
  return { cue, identity: project.identity };
}

function metaMap(): Map<string, CueMeta> {
  const map = new Map<string, CueMeta>();
  for (const cue of defaultProject().cues) {
    map.set(cue.id, { priority: cue.priority, kind: cue.kind, duration: cue.flavor.seconds || cue.params.duration || 1 });
  }
  return map;
}

describe("catalogue and project", () => {
  it("covers the approved event families and marks voice as unavailable", () => {
    const ids = new Set(CATALOGUE.map((cue) => cue.id));
    for (const id of REQUIRED) expect(ids.has(id), id).toBe(true);
    const voice = CATALOGUE.find((cue) => cue.id === "theme.character");
    expect(voice?.implemented).toBe(false);
    const kinds = new Set(CATALOGUE.map((cue) => cue.kind));
    expect(kinds).toEqual(new Set(["oneshot", "loop", "sequence"]));
  });

  it("round-trips project JSON and recovers from a broken file", () => {
    const project = defaultProject();
    project.name = "Night cabinet";
    project.identity.seed = 99;
    project.cues[0].name = "Yes";
    project.cues[0].enabled = false;
    const parsed = parseProject(JSON.stringify(project));
    expect(parsed.warning).toBeUndefined();
    expect(parsed.project.name).toBe("Night cabinet");
    expect(parsed.project.identity.seed).toBe(99);
    expect(parsed.project.cues.find((cue) => cue.id === "ui.confirm")?.name).toBe("Yes");
    expect(parsed.project.cues.find((cue) => cue.id === "ui.confirm")?.enabled).toBe(false);
    expect(parsed.project.cues.length).toBe(project.cues.length);
    const broken = parseProject("{not json");
    expect(broken.warning).toMatch(/could not be read/i);
    expect(broken.project.cues.length).toBeGreaterThan(10);
  });
});

describe("synthesis", () => {
  it("is deterministic and keeps samples finite under the ceiling", () => {
    const { cue, identity } = cueOf("ui.confirm");
    const a = synthesize(identity, cue);
    const b = synthesize(identity, cue);
    const mixA = mixdown(a, {}, 1);
    const mixB = mixdown(b, {}, 1);
    expect(mixA && mixB).toBeTruthy();
    if (!mixA || !mixB) return;
    expect(mixA.mix.l.length).toBe(mixB.mix.l.length);
    for (let i = 0; i < mixA.mix.l.length; i += 32) {
      expect(mixA.mix.l[i]).toBe(mixB.mix.l[i]);
      expect(mixA.mix.r[i]).toBe(mixB.mix.r[i]);
    }
    const qc = analyze(mixA.mix);
    expect(qc.nonfinite).toBe(0);
    expect(qc.clipped).toBe(0);
    expect(qc.peak).toBeLessThanOrEqual(0.9);
    expect(qc.peak).toBeGreaterThan(0.05);
    expect(qc.rms).toBeGreaterThan(0.005);
  });

  it("changes the waveform when timbre, rate, duration, pitch and gain change", () => {
    const low = cueOf("countup.classic", (cue) => {
      cue.params.duration = 1.2;
      cue.params.body = 0.05;
      cue.params.space = 0.2;
    });
    const high = cueOf("countup.classic", (cue) => {
      cue.params.duration = 1.2;
      cue.params.body = 1.8;
      cue.params.space = 0.2;
    });
    const lowBody = synthesize(low.identity, low.cue).stems.body;
    const highBody = synthesize(high.identity, high.cue).stems.body;
    expect(bandEnergy(highBody, 65, 240)).toBeGreaterThan(bandEnergy(lowBody, 65, 240) * 4);

    const dark = cueOf("ui.confirm", (cue) => {
      cue.params.brightness = 0.3;
    });
    const bright = cueOf("ui.confirm", (cue) => {
      cue.params.brightness = 1.5;
    });
    const darkMix = mixdown(synthesize(dark.identity, dark.cue), {}, 1)!;
    const brightMix = mixdown(synthesize(bright.identity, bright.cue), {}, 1)!;
    const share = (mix: typeof darkMix) => bandEnergy(mix.mix, 2000, 8000) / (rmsOf(mix.mix) ** 2 + 1e-9);
    expect(share(brightMix)).toBeGreaterThan(share(darkMix) * 1.15);

    const slow = cueOf("countup.classic", (cue) => {
      cue.params.duration = 1.4;
      cue.params.rateStart = 6;
      cue.params.rateEnd = 7;
      cue.params.space = 0;
      cue.params.body = 0;
    });
    const fast = cueOf("countup.classic", (cue) => {
      cue.params.duration = 1.4;
      cue.params.rateStart = 24;
      cue.params.rateEnd = 28;
      cue.params.space = 0;
      cue.params.body = 0;
    });
    const slowDry = synthesize(slow.identity, slow.cue).stems["dry-counter"];
    const fastDry = synthesize(fast.identity, fast.cue).stems["dry-counter"];
    const onsets = (stem: typeof slowDry) => countOnsets(stem.l, peakOf(stem) * 0.28);
    expect(onsets(fastDry)).toBeGreaterThan(onsets(slowDry) + 4);

    const tiny = cueOf("countup.classic", (cue) => {
      cue.params.duration = 0.35;
    });
    const longer = cueOf("countup.classic", (cue) => {
      cue.params.duration = 2.4;
    });
    const tinyBuf = synthesize(tiny.identity, tiny.cue);
    const longBuf = synthesize(longer.identity, longer.cue);
    expect(longBuf.seconds).toBeGreaterThan(tinyBuf.seconds + 1);
    expect(tinyBuf.loop).toBe(false);

    const lowNote = renderVoice("bell", { note: 60, dur: 0.4, rng: new Rng(3), brightness: 1, decay: 1, body: 0.2 });
    const highNote = renderVoice("bell", { note: 72, dur: 0.4, rng: new Rng(3), brightness: 1, decay: 1, body: 0.2 });
    expect(zeroCrossings(highNote)).toBeGreaterThan(zeroCrossings(lowNote) * 1.6);

    const shortDecay = renderVoice("coin", { note: 76, dur: 0.35, rng: new Rng(8), decay: 0.4, brightness: 1, body: 1 });
    const longDecay = renderVoice("coin", { note: 76, dur: 0.35, rng: new Rng(8), decay: 2, brightness: 1, body: 1 });
    const tail = (samples: Float32Array) => {
      let acc = 0;
      for (let i = Math.floor(samples.length * 0.5); i < samples.length; i++) acc += samples[i] * samples[i];
      return acc;
    };
    expect(tail(longDecay)).toBeGreaterThan(tail(shortDecay) * 1.4);

    const quiet = mixdown(synthesize(dark.identity, dark.cue), {}, 0.4)!;
    const loud = mixdown(synthesize(dark.identity, dark.cue), {}, 1)!;
    expect(rmsOf(loud.mix)).toBeGreaterThan(rmsOf(quiet.mix) * 2);
  });

  it("keeps count-up body centered, fades out, and supports tiny, long and skip renders", () => {
    const { cue, identity } = cueOf("countup.tiers", (item) => {
      item.params.duration = 1.1;
      item.params.body = 1.4;
    });
    const rendered = synthesize(identity, cue);
    const mixed = mixdown(rendered, cue.params.layers, 1)!;
    const qc = analyze(mixed.mix);
    expect(qc.nonfinite).toBe(0);
    expect(qc.clipped).toBe(0);
    expect(qc.peak).toBeLessThanOrEqual(0.9);
    expect(Math.abs(mixed.mix.l[mixed.mix.l.length - 1])).toBeLessThan(1e-3);
    expect(Math.abs(mixed.mix.r[0])).toBeLessThan(1e-3);
    const body = analyze(rendered.stems.body);
    expect(body.correlation).toBeGreaterThan(0.98);
    expect(Math.abs(body.monoFoldDb)).toBeLessThan(0.2);
    expect(rendered.stingStems).toBeTruthy();
    const sting = mixdown({ ...rendered, stems: rendered.stingStems ?? {}, stingStems: undefined }, {}, 1)!;
    expect(sting.seconds).toBeLessThan(rendered.seconds);
    expect(earlyRms(sting.mix, 0.06)).toBeGreaterThan(earlyRms(mixed.mix, 0.04) * 3);
    const skipCue = cueOf("countup.skip");
    const skip = mixdown(synthesize(skipCue.identity, skipCue.cue), {}, 1)!;
    expect(skip.seconds).toBeLessThan(3);
    expect(earlyRms(skip.mix, 0.08)).toBeGreaterThan(0.01);
  });

  it("renders distinct seamless music variants from one seed", () => {
    const base = cueOf("music.base", (cue) => {
      cue.params.bars = 2;
    });
    const again = cueOf("music.base", (cue) => {
      cue.params.bars = 2;
    });
    const otherSeed = cueOf("music.base", (cue) => {
      cue.params.bars = 2;
    });
    otherSeed.identity.seed = 9001;
    const bonus = cueOf("music.bonus", (cue) => {
      cue.params.bars = 2;
    });
    const a = synthesize(base.identity, base.cue);
    const b = synthesize(again.identity, again.cue);
    const c = synthesize(otherSeed.identity, otherSeed.cue);
    const d = synthesize(bonus.identity, bonus.cue);
    expect(a.loop).toBe(true);
    expect(a.stems.melody.l[10]).toBe(b.stems.melody.l[10]);
    expect(a.stems.bass.l[1000]).not.toBe(c.stems.bass.l[1000]);
    const mixA = mixdown(a, {}, 1)!;
    const mixD = mixdown(d, {}, 1)!;
    let diff = 0;
    const n = Math.min(mixA.mix.l.length, mixD.mix.l.length);
    for (let i = 0; i < n; i += 50) diff += Math.abs(mixA.mix.l[i] - mixD.mix.l[i]);
    expect(diff).toBeGreaterThan(1);
    expect(rmsOf(d.stems.percussion)).toBeGreaterThan(rmsOf(a.stems.percussion) * 1.05);
    expect(Math.abs(a.recipe.bpm as number - (d.recipe.bpm as number))).toBeGreaterThan(2);
    const seam = seamJump(mixA.mix);
    expect(seam.boundary).toBeLessThanOrEqual(seam.maxAdjacent * 1.05 + 1e-4);
    const qc = analyze(mixA.mix);
    expect(qc.nonfinite).toBe(0);
    expect(qc.clipped).toBe(0);
    expect(qc.peak).toBeLessThanOrEqual(0.9);
  });

  it("separates jackpot tease from the award and keeps a motion loop periodic", () => {
    const tease = cueOf("jackpot.tease");
    const award = cueOf("jackpot.award");
    const teaseMix = mixdown(synthesize(tease.identity, tease.cue), {}, 1)!;
    const awardMix = mixdown(synthesize(award.identity, award.cue), {}, 1)!;
    expect(teaseMix.loop).toBe(true);
    expect(awardMix.loop).toBe(false);
    expect(rmsOf(awardMix.mix)).not.toBeCloseTo(rmsOf(teaseMix.mix), 2);
    const motion = cueOf("reels.motion");
    const loop = mixdown(synthesize(motion.identity, motion.cue), {}, 1)!;
    const seam = seamJump(loop.mix);
    expect(loop.loop).toBe(true);
    expect(seam.boundary).toBeLessThanOrEqual(seam.maxAdjacent * 1.05 + 1e-4);
  });

  it("writes a real PCM WAV and a zip container", () => {
    const { cue, identity } = cueOf("symbol.land");
    const mixed = mixdown(synthesize(identity, cue), {}, 1)!;
    const wav = encodeWavPcm16(mixed.mix);
    const info = readWavInfo(wav);
    expect(info.audioFormat).toBe(1);
    expect(info.channels).toBe(2);
    expect(info.sampleRate).toBe(44100);
    expect(info.bits).toBe(16);
    expect(info.seconds).toBeCloseTo(mixed.seconds, 2);
    const zip = zipFiles({ "symbol-land.wav": wav, "manifest.json": new TextEncoder().encode("{\"ok\":true}") });
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });

  it("solo and mute change the printed mix", () => {
    const { cue, identity } = cueOf("countup.classic", (item) => {
      item.params.duration = 0.8;
    });
    const buffer = synthesize(identity, cue);
    const all = mixdown(buffer, {}, 1)!;
    const noBody = mixdown(buffer, { body: { mute: true, solo: false, gain: 1 } }, 1)!;
    expect(bandEnergy(all.mix, 65, 220)).toBeGreaterThan(bandEnergy(noBody.mix, 65, 220));
    const solo = mixdown(buffer, { "dry-counter": { mute: false, solo: true, gain: 1 } }, 1)!;
    expect(rmsOf(solo.mix)).not.toBeCloseTo(rmsOf(all.mix), 2);
  });
});

describe("mix policy", () => {
  it("blocks stacked fanfares, stops cleanly, and refuses below-stake celebration", () => {
    expect(celebrationLevel(0.4)).toBe("neutral");
    expect(celebrationLevel(4)).toBe("ordinary");
    expect(celebrationLevel(20)).toBe("big");
    const meta = metaMap();
    const neutral = simulateScenario(buildScenario("spin-win", { multiplier: 0.8, countSeconds: 2, countCueId: "countup.classic" }).steps, meta);
    expect(neutral.some((event) => event.cueId.startsWith("countup") && event.accepted)).toBe(false);
    expect(neutral.some((event) => event.cueId === "session.payment" && event.accepted)).toBe(true);
    const win = simulateScenario(buildScenario("spin-win", { multiplier: 6, countSeconds: 2, countCueId: "countup.classic" }).steps, meta);
    expect(win.some((event) => event.cueId === "countup.classic" && event.accepted)).toBe(true);
    expect(win.some((event) => event.cueId === "bigwin.intro")).toBe(false);
    const bonus = simulateScenario(buildScenario("bonus", { multiplier: 8, countSeconds: 2, countCueId: "countup.classic" }).steps, meta);
    const fanfares = bonus.filter((event) => event.cueId === "feature.trigger" || event.cueId === "fs.awarded");
    expect(fanfares.every((event) => event.accepted)).toBe(true);
    const held = buildScenario("big-win", { multiplier: 3, countSeconds: 2, countCueId: "countup.classic" });
    expect(held.note).toMatch(/under 15/);
    expect(held.steps.some((step) => step.cueId === "bigwin.intro")).toBe(false);
    const bus = new VoiceBus();
    expect(bus.start({ id: "a", at: 0, kind: "oneshot", priority: "fanfare", duration: 1.2 }).ok).toBe(true);
    expect(bus.start({ id: "b", at: 0.2, kind: "oneshot", priority: "fanfare", duration: 1.2 }).ok).toBe(false);
    expect(bus.start({ id: "c", at: 2.5, kind: "oneshot", priority: "fanfare", duration: 1 }).ok).toBe(true);
    bus.start({ id: "music.base", at: 0, kind: "music", priority: "ambience", duration: 8 });
    bus.start({ id: "reels.motion", at: 0, kind: "loop", priority: "motion", duration: 2 });
    bus.stopAll();
    expect(bus.activeIds()).toEqual([]);
  });
});

describe("artifacts", () => {
  it("writes representative wavs and a qc summary", () => {
    mkdirSync("artifacts", { recursive: true });
    const identity = defaultProject().identity;
    const count = cueOf("countup.classic", (cue) => {
      cue.params.duration = 2.2;
    });
    const countBuf = synthesize(identity, count.cue);
    const countMix = mixdown(countBuf, {}, 1)!;
    const sting = mixdown({ ...countBuf, stems: countBuf.stingStems ?? {}, stingStems: undefined, loop: false }, {}, 1)!;
    const music = cueOf("music.base", (cue) => {
      cue.params.bars = 2;
    });
    const bonus = cueOf("music.bonus", (cue) => {
      cue.params.bars = 2;
    });
    const musicMix = mixdown(synthesize(identity, music.cue), {}, 1)!;
    const bonusMix = mixdown(synthesize(identity, bonus.cue), {}, 1)!;
    const confirm = mixdown(synthesize(identity, cueOf("ui.confirm").cue), {}, 1)!;
    writeFileSync("artifacts/countup-a-short.wav", encodeWavPcm16(countMix.mix));
    writeFileSync("artifacts/countup-a-skip.wav", encodeWavPcm16(sting.mix));
    writeFileSync("artifacts/music-base-2bar.wav", encodeWavPcm16(musicMix.mix));
    writeFileSync("artifacts/music-bonus-2bar.wav", encodeWavPcm16(bonusMix.mix));
    writeFileSync("artifacts/ui-confirm.wav", encodeWavPcm16(confirm.mix));
    const summary = {
      audiblyAuditioned: false,
      sampleRate: 44100,
      format: "stereo PCM16",
      ceiling: 0.89,
      countup: analyze(countMix.mix),
      skip: { seconds: sting.seconds, earlyRms: earlyRms(sting.mix, 0.08), ...analyze(sting.mix) },
      base: { seconds: musicMix.seconds, bpm: music.cue.params.bars, seam: seamJump(musicMix.mix), ...analyze(musicMix.mix) },
      bonus: { seconds: bonusMix.seconds, seam: seamJump(bonusMix.mix), percussionRms: rmsOf(synthesize(identity, bonus.cue).stems.percussion), ...analyze(bonusMix.mix) },
      confirm: analyze(confirm.mix),
      note: "Numeric QC only. Not a listening approval. Reference WAVs in sources/ were not bit-matched.",
    };
    writeFileSync("artifacts/qc-summary.json", JSON.stringify(summary, null, 2));
    expect(summary.countup.clipped).toBe(0);
    expect(summary.base.seam.boundary).toBeLessThanOrEqual(summary.base.seam.maxAdjacent * 1.05 + 1e-4);
  });
});
