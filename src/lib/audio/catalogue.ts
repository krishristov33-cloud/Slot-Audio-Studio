import type { Family, Flavor } from "./sfx";
import type { CountPreset } from "./countup";
import type { MusicVariant } from "./music";

export type CueKind = "oneshot" | "loop" | "sequence";
export type Priority = "ambience" | "motion" | "ui" | "win" | "fanfare";

export interface CueDefinition {
  id: string;
  name: string;
  pack: string;
  kind: CueKind;
  priority: Priority;
  implemented: boolean;
  flavor: Flavor;
  preset?: CountPreset;
  music?: MusicVariant;
  blurb: string;
  /** Default active seconds for count-up, or 0 to use the flavor length. */
  duration: number;
  bars: number;
  rateStart: number;
  rateEnd: number;
  award: boolean;
}

interface Row {
  id: string;
  name: string;
  pack: string;
  kind: CueKind;
  priority: Priority;
  family: Family;
  voice?: Flavor["voice"];
  semi?: number;
  seconds?: number;
  space?: number;
  body?: number;
  rate?: number;
  steps?: number[];
  amp?: number;
  snap?: boolean;
  pan?: number;
  blurb: string;
  implemented?: boolean;
  preset?: CountPreset;
  music?: MusicVariant;
  duration?: number;
  bars?: number;
  rateStart?: number;
  rateEnd?: number;
  award?: boolean;
}

function row(input: Row): CueDefinition {
  const family = input.family;
  return {
    id: input.id,
    name: input.name,
    pack: input.pack,
    kind: input.kind,
    priority: input.priority,
    implemented: input.implemented !== false,
    preset: input.preset,
    music: input.music,
    blurb: input.blurb,
    duration: input.duration ?? 0,
    bars: input.bars ?? (input.music === "bigwin" || input.music === "summary" ? 4 : 8),
    rateStart: input.rateStart ?? (input.preset === "B" ? 12 : input.preset === "C" ? 17 : 15),
    rateEnd: input.rateEnd ?? (input.preset === "B" ? 25 : input.preset === "C" ? 24 : 27),
    award: input.award !== false,
    flavor: {
      family,
      voice: input.voice ?? "coin",
      semitone: input.semi ?? 12,
      seconds: input.seconds ?? 0.4,
      space: input.space ?? 0.35,
      body: input.body ?? 0.6,
      rate: input.rate ?? 6,
      steps: input.steps ?? [],
      amp: input.amp ?? 0.55,
      snap: input.snap ?? false,
      pan: input.pan ?? 0,
    },
  };
}

const ROWS: Row[] = [
  { id: "ui.confirm", name: "Confirm", pack: "Interface", kind: "oneshot", priority: "ui", family: "confirm", voice: "wood", semi: 0, seconds: 0.42, steps: [0, 7], snap: true, blurb: "Two wood resonators a fifth apart. One-shot." },
  { id: "ui.back", name: "Back", pack: "Interface", kind: "oneshot", priority: "ui", family: "descend", voice: "wood", semi: 12, seconds: 0.4, steps: [0, -2, -5], snap: true, space: 0.15, blurb: "Three short wood ticks walking down. One-shot." },
  { id: "ui.menu", name: "Menu", pack: "Interface", kind: "oneshot", priority: "ui", family: "tick", voice: "coin", semi: 12, seconds: 0.28, space: 0.2, blurb: "Softened coin tick. One-shot." },
  { id: "ui.toggle", name: "Toggle", pack: "Interface", kind: "oneshot", priority: "ui", family: "tick", voice: "fm", semi: 7, seconds: 0.22, space: 0.1, body: 0.4, blurb: "Short FM key click. One-shot." },
  { id: "ui.disabled", name: "Disabled", pack: "Interface", kind: "oneshot", priority: "ui", family: "neutral", voice: "wood", semi: -5, seconds: 0.24, space: 0, body: 0, blurb: "Dry dull tap. No bloom, no win." },
  { id: "ui.error", name: "Error", pack: "Interface", kind: "oneshot", priority: "ui", family: "error", voice: "fm", semi: 0, seconds: 0.5, space: 0.15, blurb: "Tritone FM pair. Explicitly not a celebration." },

  { id: "session.loading", name: "Loading bed", pack: "Session", kind: "loop", priority: "ambience", family: "motion", voice: "fm", semi: 0, seconds: 2, rate: 2, space: 0.2, body: 0.3, amp: 0.28, blurb: "Quiet two-second loop: soft pulse and air. Not a music bed." },
  { id: "session.title", name: "Title sting", pack: "Session", kind: "sequence", priority: "win", family: "fanfare", voice: "wood", semi: 0, seconds: 1.3, steps: [0, 3, 7, 12], snap: true, space: 0.55, body: 0.45, blurb: "Modest four-note wood figure. Sequence, not a loop." },
  { id: "session.lobby", name: "Lobby bed", pack: "Session", kind: "loop", priority: "ambience", family: "tension", voice: "pad", semi: 0, seconds: 2.4, rate: 2, space: 0.25, amp: 0.22, snap: true, blurb: "Low tension loop for a lobby. Does not resolve." },
  { id: "session.help", name: "Help", pack: "Session", kind: "oneshot", priority: "ui", family: "tick", voice: "wood", semi: 7, seconds: 0.26, blurb: "Small wood tap for help prompts." },
  { id: "session.notice", name: "Notice", pack: "Session", kind: "oneshot", priority: "ui", family: "neutral", voice: "wood", semi: 0, seconds: 0.26, space: 0, blurb: "Neutral system notice. No award." },
  { id: "session.payment", name: "Payment notice", pack: "Session", kind: "oneshot", priority: "ui", family: "neutral", voice: "coin", semi: -5, seconds: 0.3, space: 0, body: 0.15, blurb: "Ordinary balance or below-stake notice. Stays flat on purpose." },

  { id: "reels.start", name: "Reels start", pack: "Reels", kind: "oneshot", priority: "motion", family: "impact", voice: "impact", semi: -12, seconds: 0.45, body: 1, space: 0.25, blurb: "Centered start thump plus a short gust." },
  { id: "reels.motion", name: "Reel motion", pack: "Reels", kind: "loop", priority: "motion", family: "motion", voice: "fm", semi: 12, seconds: 1.2, rate: 11, body: 0.55, space: 0.15, blurb: "Seamless spin loop: ticks, a light body pulse, and air." },
  { id: "reels.stop", name: "Reels stop", pack: "Reels", kind: "oneshot", priority: "motion", family: "impact", voice: "impact", semi: -7, seconds: 0.4, body: 1.1, blurb: "Brake impact. One-shot." },
  { id: "reels.turboStart", name: "Turbo start", pack: "Reels", kind: "oneshot", priority: "motion", family: "impact", voice: "fm", semi: 0, seconds: 0.28, body: 0.7, space: 0.1, blurb: "Shorter, brighter start for turbo." },
  { id: "reels.turboMotion", name: "Turbo motion", pack: "Reels", kind: "loop", priority: "motion", family: "motion", voice: "fm", semi: 14, seconds: 0.7, rate: 16, body: 0.4, space: 0.08, blurb: "Faster seamless turbo loop." },
  { id: "reels.turboStop", name: "Turbo stop", pack: "Reels", kind: "oneshot", priority: "motion", family: "impact", voice: "impact", semi: 0, seconds: 0.26, body: 0.85, space: 0.08, blurb: "Tight turbo stop." },

  { id: "symbol.land", name: "Symbol land", pack: "Symbols", kind: "oneshot", priority: "ui", family: "land", voice: "coin", semi: 12, seconds: 0.28, body: 0.8, pan: 0.15, blurb: "Coin tick plus a small centered body." },
  { id: "symbol.win", name: "Ordinary win", pack: "Symbols", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 7, seconds: 0.55, space: 0.45, snap: true, blurb: "Modest bell. Not a fanfare and not a count-up." },
  { id: "symbol.highlight", name: "Symbol highlight", pack: "Symbols", kind: "oneshot", priority: "ui", family: "highlight", voice: "bell", semi: 12, seconds: 0.4, space: 0.3, amp: 0.4, snap: true, blurb: "Softer highlight bell." },
  { id: "symbol.ordinary", name: "Small line", pack: "Symbols", kind: "oneshot", priority: "ui", family: "tick", voice: "coin", semi: 0, seconds: 0.22, space: 0.05, body: 0.2, blurb: "Tiny coin for a low line hit. Does not celebrate." },

  { id: "countup.classic", name: "Count-up A · classic", pack: "Count-up", kind: "sequence", priority: "win", family: "countup", preset: "A", seconds: 8, duration: 4.5, rateStart: 15, rateEnd: 27, blurb: "Accelerating coin and bell roll, centered body, then a punctuated award. Sequence." },
  { id: "countup.tiers", name: "Count-up B · tiers", pack: "Count-up", kind: "sequence", priority: "win", family: "countup", preset: "B", seconds: 8, duration: 4.5, rateStart: 12, rateEnd: 25, blurb: "Three held FM plateaus with lift accents and a tighter total." },
  { id: "countup.harmonic", name: "Count-up C · harmonic", pack: "Count-up", kind: "sequence", priority: "win", family: "countup", preset: "C", seconds: 8, duration: 4.5, rateStart: 17, rateEnd: 24, blurb: "Coin/bell count over warm swells and one weighted final chord." },
  { id: "countup.finish", name: "Count finish", pack: "Count-up", kind: "oneshot", priority: "win", family: "countup-finish", preset: "A", seconds: 2.5, duration: 2, space: 1, blurb: "Award chord alone, with a short room tail. One-shot." },
  { id: "countup.skip", name: "Skip to total", pack: "Count-up", kind: "oneshot", priority: "win", family: "countup-finish", preset: "A", seconds: 2.2, duration: 1.6, space: 0.45, body: 1.1, blurb: "Same award family, drier and immediate. Playback can also cut a running count into this." },

  { id: "bigwin.intro", name: "Big win intro", pack: "Big win", kind: "sequence", priority: "fanfare", family: "fanfare", voice: "bell", semi: 0, seconds: 1.6, steps: [0, 7, 12, 16], snap: true, space: 0.7, body: 1, blurb: "Fanfare sequence. Blocks another fanfare until it releases." },
  { id: "bigwin.sustain", name: "Big win sustain", pack: "Big win", kind: "loop", priority: "ambience", family: "tension", voice: "bell", semi: 0, seconds: 2, rate: 4, amp: 0.4, snap: true, blurb: "Stationary sustain loop. Not a second fanfare." },
  { id: "bigwin.escalation", name: "Big win escalation", pack: "Big win", kind: "sequence", priority: "fanfare", family: "fanfare", voice: "coin", semi: 12, seconds: 1.2, steps: [0, 4, 7, 12, 19], snap: true, space: 0.6, body: 0.8, blurb: "Brighter follow-on fanfare. Will wait if another fanfare is still locked." },
  { id: "bigwin.outro", name: "Big win outro", pack: "Big win", kind: "oneshot", priority: "fanfare", family: "award", voice: "bell", semi: 0, seconds: 1.8, steps: [0, 4, 7, 12], snap: true, space: 0.85, body: 1.1, blurb: "Resolving award chord with centered weight." },

  { id: "feature.anticipation", name: "Anticipation", pack: "Features", kind: "oneshot", priority: "win", family: "riser", voice: "coin", semi: 0, seconds: 1.6, rate: 7, space: 0.4, snap: true, blurb: "Accelerating ticks and a rising gust. One-shot, not an infinite riser." },
  { id: "feature.scatter", name: "Scatter", pack: "Features", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 12, seconds: 0.7, space: 0.6, snap: true, blurb: "Bright scatter bell." },
  { id: "feature.trigger", name: "Feature trigger", pack: "Features", kind: "sequence", priority: "fanfare", family: "fanfare", voice: "wood", semi: 0, seconds: 1.4, steps: [0, 7, 12, 15], snap: true, space: 0.65, body: 0.9, blurb: "Feature stab. Fanfare priority." },
  { id: "feature.transition", name: "Transition", pack: "Features", kind: "oneshot", priority: "motion", family: "whoosh", voice: "gust", semi: 0, seconds: 0.7, space: 0.2, blurb: "Whoosh into the next state." },

  { id: "fs.awarded", name: "Free spins awarded", pack: "Free spins", kind: "sequence", priority: "fanfare", family: "fanfare", voice: "bell", semi: 0, seconds: 1.8, steps: [0, 4, 7, 12, 16], snap: true, space: 0.75, body: 1, blurb: "Award fanfare. Does not stack on another fanfare." },
  { id: "fs.retrigger", name: "Free spins retrigger", pack: "Free spins", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 7, seconds: 0.7, steps: [0, 7], snap: true, space: 0.45, blurb: "Shorter retrigger bell. Win priority, so it can sit near a fanfare." },
  { id: "fs.final", name: "Free spins final", pack: "Free spins", kind: "oneshot", priority: "win", family: "award", voice: "bell", semi: 0, seconds: 1.5, steps: [0, 3, 7, 12], snap: true, space: 0.6, body: 0.8, blurb: "Closing chord for the feature. Not the jackpot award." },
  { id: "fs.summary", name: "Free spins summary", pack: "Free spins", kind: "loop", priority: "ambience", family: "tension", voice: "pad", semi: -5, seconds: 2.8, amp: 0.28, snap: true, blurb: "Sparse summary loop under a results screen." },
  { id: "fs.return", name: "Return to base", pack: "Free spins", kind: "oneshot", priority: "motion", family: "descend", voice: "wood", semi: 12, seconds: 0.55, steps: [7, 3, 0, -5], snap: true, blurb: "Descending figure back to the base game." },

  { id: "respin.hold", name: "Respin hold", pack: "Respins", kind: "oneshot", priority: "ui", family: "lock", voice: "wood", semi: 0, seconds: 0.32, body: 0.9, blurb: "Lock click with a short body." },
  { id: "respin.reset", name: "Respin reset", pack: "Respins", kind: "oneshot", priority: "ui", family: "descend", voice: "fm", semi: 5, seconds: 0.36, steps: [0, -3, -7], blurb: "Reset ticks downward." },
  { id: "respin.fill", name: "Respin fill", pack: "Respins", kind: "oneshot", priority: "ui", family: "land", voice: "coin", semi: 7, seconds: 0.26, blurb: "Cell fill, same landing recipe in a higher register." },
  { id: "respin.complete", name: "Respin complete", pack: "Respins", kind: "oneshot", priority: "win", family: "award", voice: "bell", semi: 0, seconds: 1.1, steps: [0, 7, 12], snap: true, space: 0.5, body: 0.7, blurb: "Short completion award." },

  { id: "pick.reveal", name: "Pick reveal", pack: "Pick", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 5, seconds: 0.55, space: 0.4, snap: true, blurb: "Reveal bell." },
  { id: "pick.collect", name: "Pick collect", pack: "Pick", kind: "oneshot", priority: "ui", family: "collect", voice: "coin", semi: 12, seconds: 0.3, body: 0.7, blurb: "Collected coin with a little body." },

  { id: "cascade.remove", name: "Cascade remove", pack: "Cascades", kind: "oneshot", priority: "motion", family: "whoosh", voice: "gust", semi: 7, seconds: 0.4, blurb: "Short removal whoosh." },
  { id: "cascade.fall", name: "Cascade fall", pack: "Cascades", kind: "sequence", priority: "motion", family: "descend", voice: "coin", semi: 12, seconds: 0.5, steps: [7, 3, 0, -5], snap: true, blurb: "Falling coin steps. Sequence." },
  { id: "cascade.refill", name: "Cascade refill", pack: "Cascades", kind: "oneshot", priority: "ui", family: "land", voice: "coin", semi: 10, seconds: 0.24, blurb: "Refill landing." },
  { id: "cascade.finish", name: "Cascade finish", pack: "Cascades", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 0, seconds: 0.6, snap: true, space: 0.45, blurb: "End-of-cascade bell. Not a big-win fanfare." },

  { id: "wild.appear", name: "Wild appear", pack: "Wilds", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 12, seconds: 0.6, space: 0.5, snap: true, blurb: "Wild appearance bell." },
  { id: "wild.expand", name: "Wild expand", pack: "Wilds", kind: "oneshot", priority: "motion", family: "riser", voice: "fm", semi: 0, seconds: 0.7, rate: 8, blurb: "Short expansion riser." },
  { id: "wild.sticky", name: "Wild sticky", pack: "Wilds", kind: "oneshot", priority: "ui", family: "lock", voice: "wood", semi: 5, seconds: 0.3, body: 0.8, blurb: "Sticky lock." },
  { id: "wild.move", name: "Wild move", pack: "Wilds", kind: "oneshot", priority: "motion", family: "whoosh", voice: "gust", semi: 3, seconds: 0.45, blurb: "Slide whoosh." },
  { id: "wild.multiplier", name: "Wild multiplier", pack: "Wilds", kind: "oneshot", priority: "win", family: "collect", voice: "coin", semi: 16, seconds: 0.28, blurb: "Bright multiplier tick on the collect recipe." },

  { id: "transform.change", name: "Transformation", pack: "Transformations", kind: "oneshot", priority: "motion", family: "whoosh", voice: "gust", semi: 0, seconds: 0.65, blurb: "Morph whoosh." },
  { id: "transform.mystery", name: "Mystery", pack: "Transformations", kind: "oneshot", priority: "win", family: "tension", voice: "fm", semi: -2, seconds: 0.9, amp: 0.4, blurb: "Unstable minor-second tone. One-shot, does not reveal the symbol by itself." },
  { id: "transform.upgrade", name: "Upgrade", pack: "Transformations", kind: "sequence", priority: "win", family: "fanfare", voice: "wood", semi: 0, seconds: 0.9, steps: [0, 7, 12], snap: true, space: 0.4, body: 0.6, blurb: "Small upgrade figure. Win priority, not a jackpot." },
  { id: "transform.grid", name: "Grid expansion", pack: "Transformations", kind: "oneshot", priority: "motion", family: "impact", voice: "impact", semi: -12, seconds: 0.55, body: 1.2, space: 0.3, blurb: "Low grid-expansion impact." },

  { id: "mult.appear", name: "Multiplier appear", pack: "Multipliers", kind: "oneshot", priority: "ui", family: "tick", voice: "fm", semi: 12, seconds: 0.22, blurb: "Multiplier token appears." },
  { id: "mult.increase", name: "Multiplier increase", pack: "Multipliers", kind: "oneshot", priority: "win", family: "tick", voice: "coin", semi: 16, seconds: 0.2, blurb: "Step up. Same tick recipe, higher register." },
  { id: "mult.combine", name: "Multiplier combine", pack: "Multipliers", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 7, seconds: 0.5, snap: true, space: 0.35, blurb: "Combine bell." },
  { id: "mult.apply", name: "Multiplier apply", pack: "Multipliers", kind: "oneshot", priority: "win", family: "impact", voice: "impact", semi: 0, seconds: 0.35, body: 0.9, blurb: "Apply hit." },
  { id: "mult.reset", name: "Multiplier reset", pack: "Multipliers", kind: "oneshot", priority: "ui", family: "descend", voice: "fm", semi: 12, seconds: 0.36, steps: [0, -5, -12], blurb: "Reset falling away." },

  { id: "col.pickup", name: "Collector pickup", pack: "Collector", kind: "oneshot", priority: "ui", family: "collect", voice: "coin", semi: 10, seconds: 0.24, blurb: "Pickup coin." },
  { id: "col.travel", name: "Collector travel", pack: "Collector", kind: "oneshot", priority: "motion", family: "whoosh", voice: "gust", semi: 5, seconds: 0.4, blurb: "Travel whoosh." },
  { id: "col.deposit", name: "Collector deposit", pack: "Collector", kind: "oneshot", priority: "ui", family: "land", voice: "coin", semi: 0, seconds: 0.26, body: 0.7, blurb: "Deposit landing." },
  { id: "col.threshold", name: "Collector threshold", pack: "Collector", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 7, seconds: 0.45, snap: true, blurb: "Threshold reached." },
  { id: "col.full", name: "Collector full", pack: "Collector", kind: "oneshot", priority: "win", family: "award", voice: "bell", semi: 0, seconds: 1, steps: [0, 7, 12], snap: true, space: 0.5, body: 0.8, blurb: "Meter full. Smaller than a jackpot award." },
  { id: "col.collect", name: "Collector collect", pack: "Collector", kind: "oneshot", priority: "win", family: "collect", voice: "coin", semi: 12, seconds: 0.4, body: 0.8, blurb: "Final collect coin." },

  { id: "mod.nudge", name: "Nudge", pack: "Reel modifiers", kind: "oneshot", priority: "motion", family: "whoosh", voice: "gust", semi: -2, seconds: 0.32, blurb: "Nudge whoosh." },
  { id: "mod.hold", name: "Hold reel", pack: "Reel modifiers", kind: "oneshot", priority: "ui", family: "lock", voice: "wood", semi: -2, seconds: 0.3, blurb: "Reel hold lock." },
  { id: "mod.replace", name: "Symbol replacement", pack: "Reel modifiers", kind: "oneshot", priority: "ui", family: "tick", voice: "fm", semi: 5, seconds: 0.22, blurb: "Replacement click." },
  { id: "mod.extrarow", name: "Extra row", pack: "Reel modifiers", kind: "oneshot", priority: "motion", family: "impact", voice: "impact", semi: -5, seconds: 0.4, body: 1, blurb: "Extra-row impact." },
  { id: "mod.giant", name: "Giant symbol", pack: "Reel modifiers", kind: "oneshot", priority: "win", family: "impact", voice: "impact", semi: -12, seconds: 0.6, body: 1.3, space: 0.35, blurb: "Heavier giant-symbol impact. Still not a jackpot." },

  { id: "wheel.start", name: "Wheel start", pack: "Wheel", kind: "oneshot", priority: "motion", family: "riser", voice: "coin", semi: 0, seconds: 0.6, rate: 6, blurb: "Wheel spin-up." },
  { id: "wheel.ticks", name: "Wheel ticks", pack: "Wheel", kind: "loop", priority: "motion", family: "motion", voice: "coin", semi: 17, seconds: 1, rate: 8, body: 0.35, space: 0.12, blurb: "Steady tick loop. Scenario playback stops it when the wheel stops." },
  { id: "wheel.stop", name: "Wheel stop", pack: "Wheel", kind: "oneshot", priority: "motion", family: "impact", voice: "impact", semi: 0, seconds: 0.35, body: 1, blurb: "Wheel stopper." },
  { id: "wheel.award", name: "Wheel award", pack: "Wheel", kind: "oneshot", priority: "win", family: "award", voice: "bell", semi: 0, seconds: 1.2, steps: [0, 7, 12], snap: true, space: 0.55, body: 0.75, blurb: "Wheel prize. Distinct from the jackpot award, which is heavier and lower." },

  { id: "jackpot.tease", name: "Jackpot tease", pack: "Jackpot", kind: "loop", priority: "win", family: "tension", voice: "fm", semi: -5, seconds: 2.2, amp: 0.48, blurb: "Tension loop only. No award chord. This is not the jackpot pay." },
  { id: "jackpot.award", name: "Jackpot award", pack: "Jackpot", kind: "sequence", priority: "fanfare", family: "award", voice: "bell", semi: -12, seconds: 2.4, steps: [-12, 0, 4, 7, 12, 19], snap: true, space: 0.9, body: 1.45, amp: 0.7, blurb: "Actual jackpot award: low impact, stacked bells, heavy centered body. Different recipe weight from the tease and from a wheel prize." },

  { id: "trail.unlock", name: "Trail unlock", pack: "Trail", kind: "oneshot", priority: "win", family: "highlight", voice: "bell", semi: 3, seconds: 0.55, snap: true, space: 0.4, blurb: "Map node unlock." },
  { id: "trail.level", name: "Trail level", pack: "Trail", kind: "sequence", priority: "win", family: "fanfare", voice: "wood", semi: 0, seconds: 1.1, steps: [0, 5, 10, 12], snap: true, space: 0.45, body: 0.55, blurb: "Level-up figure." },

  { id: "gamble.win", name: "Gamble win", pack: "Gamble", kind: "oneshot", priority: "win", family: "award", voice: "bell", semi: 0, seconds: 0.9, steps: [0, 4, 7], snap: true, space: 0.4, body: 0.55, blurb: "Actual gamble win. Short chord, not a jackpot." },
  { id: "gamble.loss", name: "Gamble loss", pack: "Gamble", kind: "oneshot", priority: "ui", family: "descend", voice: "fm", semi: 0, seconds: 0.5, steps: [0, -6, -12], space: 0.05, blurb: "Actual gamble loss. Descending and dry." },

  { id: "theme.character", name: "Character line", pack: "Theme", kind: "oneshot", priority: "win", family: "unimplemented", implemented: false, seconds: 0, blurb: "Not implemented. Semantic voice and performed character lines are not synthesized, and this control will not pretend they are." },
  { id: "theme.placeholder", name: "Placeholder stinger", pack: "Theme", kind: "sequence", priority: "win", family: "fanfare", voice: "wood", semi: 0, seconds: 1.1, steps: [0, 7, 10], snap: true, space: 0.4, body: 0.4, blurb: "Synthesized placeholder motif for a theme slot. Not a character performance." },
  { id: "theme.import", name: "Imported reference", pack: "Theme", kind: "oneshot", priority: "ambience", family: "import", seconds: 0, blurb: "Play a file from this device for the current session. It is not synthesized and is not written into the saved project." },

  { id: "music.base", name: "Base game bed", pack: "Music", kind: "loop", priority: "ambience", family: "music", music: "base", bars: 8, blurb: "Seamless base loop. Wood, rubber, centered bass, pad, restrained drums, air." },
  { id: "music.bonus", name: "Bonus bed", pack: "Music", kind: "loop", priority: "ambience", family: "music", music: "bonus", bars: 8, blurb: "Same seed and key, faster tempo, different chords, denser drums and upper answers." },
  { id: "music.high", name: "High intensity bed", pack: "Music", kind: "loop", priority: "ambience", family: "music", music: "high", bars: 8, blurb: "Hotter base harmony with octave answers, more kicks and faster hats." },
  { id: "music.bigwin", name: "Big win bed", pack: "Music", kind: "loop", priority: "ambience", family: "music", music: "bigwin", bars: 4, blurb: "Ceremonial four-bar loop: bells, heavier body, fewer hats. Loop, not the one-shot fanfare." },
  { id: "music.summary", name: "Summary bed", pack: "Music", kind: "loop", priority: "ambience", family: "music", music: "summary", bars: 4, blurb: "Sparse slower loop for a results screen. Half the melody, one kick per bar." },
];

export const CATALOGUE: CueDefinition[] = ROWS.map(row);

export const PACKS = [...new Set(CATALOGUE.map((cue) => cue.pack))];

export function definitionById(id: string): CueDefinition | undefined {
  return CATALOGUE.find((cue) => cue.id === id);
}
