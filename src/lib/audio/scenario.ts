import type { CueKind, Priority } from "./catalogue";
import { VoiceBus, type BusKind } from "./director";

export type ScenarioId = "spin-win" | "below-stake" | "turbo" | "bonus" | "big-win" | "skip-count";

export type ScenarioAction = "play" | "loop" | "stop" | "duck" | "unduck" | "skip";

export interface ScenarioStep {
  at: number;
  action: ScenarioAction;
  cueId?: string;
  /** Music-bus gain after the duck. */
  duck?: number;
}

export interface ScenarioScript {
  id: ScenarioId;
  title: string;
  note: string;
  steps: ScenarioStep[];
}

export function celebrationLevel(multiplier: number): "neutral" | "ordinary" | "big" {
  if (!(multiplier > 1)) return "neutral";
  if (multiplier >= 15) return "big";
  return "ordinary";
}

export function buildScenario(
  id: ScenarioId,
  options: { multiplier: number; countSeconds: number; countCueId: string },
): ScenarioScript {
  const level = celebrationLevel(options.multiplier);
  const count = options.countCueId;
  if (id === "below-stake") {
    return {
      id,
      title: "Below-stake notice",
      note: "This path stays neutral even if you typed a large win. It is the ordinary payment notice, not a celebration.",
      steps: [
        { at: 0, action: "loop", cueId: "music.base" },
        { at: 0.08, action: "play", cueId: "reels.start" },
        { at: 0.22, action: "loop", cueId: "reels.motion" },
        { at: 1.25, action: "stop", cueId: "reels.motion" },
        { at: 1.28, action: "play", cueId: "reels.stop" },
        { at: 1.4, action: "play", cueId: "symbol.land" },
        { at: 1.52, action: "play", cueId: "symbol.land" },
        { at: 1.64, action: "play", cueId: "symbol.ordinary" },
        { at: 1.78, action: "play", cueId: "session.payment" },
      ],
    };
  }
  if (id === "turbo") {
    const celebrate = level !== "neutral";
    return {
      id,
      title: "Turbo spin",
      note: celebrate
        ? "Short motion loop, then a modest count. The turbo loop is stopped before the brake."
        : "Turbo spin with a neutral payment because the win is not above stake.",
      steps: [
        { at: 0, action: "loop", cueId: "music.base" },
        { at: 0.05, action: "play", cueId: "reels.turboStart" },
        { at: 0.12, action: "loop", cueId: "reels.turboMotion" },
        { at: 0.58, action: "stop", cueId: "reels.turboMotion" },
        { at: 0.6, action: "play", cueId: "reels.turboStop" },
        { at: 0.72, action: "play", cueId: "symbol.land" },
        ...(celebrate
          ? [
              { at: 0.84, action: "duck" as const, duck: 0.4 },
              { at: 0.9, action: "play" as const, cueId: count },
              { at: 0.9 + options.countSeconds + 0.2, action: "unduck" as const },
            ]
          : [{ at: 0.86, action: "play" as const, cueId: "session.payment" }]),
      ],
    };
  }
  if (id === "bonus") {
    return {
      id,
      title: "Bonus transition",
      note: "Anticipation, scatter, one trigger fanfare, then the bonus bed. Free-spins awarded waits until the fanfare lock releases, so the two stabs do not pile up.",
      steps: [
        { at: 0, action: "loop", cueId: "music.base" },
        { at: 0.1, action: "play", cueId: "reels.start" },
        { at: 0.22, action: "loop", cueId: "reels.motion" },
        { at: 1.05, action: "stop", cueId: "reels.motion" },
        { at: 1.08, action: "play", cueId: "reels.stop" },
        { at: 1.2, action: "play", cueId: "feature.anticipation" },
        { at: 1.35, action: "play", cueId: "feature.scatter" },
        { at: 2.35, action: "duck", duck: 0.28 },
        { at: 2.4, action: "play", cueId: "feature.trigger" },
        { at: 3.55, action: "play", cueId: "feature.transition" },
        { at: 3.7, action: "stop", cueId: "music.base" },
        { at: 3.75, action: "loop", cueId: "music.bonus" },
        { at: 4.85, action: "play", cueId: "fs.awarded" },
        { at: 7.2, action: "unduck" },
      ],
    };
  }
  if (id === "big-win") {
    if (level !== "big") {
      const ordinary = buildScenario("spin-win", options);
      return {
        ...ordinary,
        id,
        title: "Big win held back",
        note: `Multiplier ${options.multiplier.toFixed(2)} is under 15× stake, so the big-win fanfare stays out. Playing an ordinary spin instead.`,
      };
    }
    return {
      id,
      title: "Big win",
      note: "One intro fanfare, a sustain loop, then a later escalation once the lock allows it. The count sits underneath. Music is ducked, not stacked with a second intro.",
      steps: [
        { at: 0, action: "loop", cueId: "music.base" },
        { at: 0.15, action: "duck", duck: 0.18 },
        { at: 0.2, action: "play", cueId: "bigwin.intro" },
        { at: 0.35, action: "play", cueId: count },
        { at: 2.7, action: "loop", cueId: "bigwin.sustain" },
        { at: 2.85, action: "play", cueId: "bigwin.escalation" },
        { at: 5.4, action: "stop", cueId: "bigwin.sustain" },
        { at: 5.5, action: "play", cueId: "bigwin.outro" },
        { at: 8.2, action: "unduck" },
      ],
    };
  }
  if (id === "skip-count") {
    if (level === "neutral") {
      return buildScenario("below-stake", options);
    }
    return {
      id,
      title: "Skip the count",
      note: "The count starts, then skip cuts it and plays the award sting immediately.",
      steps: [
        { at: 0, action: "loop", cueId: "music.base" },
        { at: 0.1, action: "duck", duck: 0.35 },
        { at: 0.16, action: "play", cueId: count },
        { at: 0.85, action: "skip" },
        { at: 3.3, action: "unduck" },
      ],
    };
  }
  if (level === "neutral") {
    const neutral = buildScenario("below-stake", options);
    return {
      ...neutral,
      id: "spin-win",
      title: "Spin, win at or below stake",
      note: "Win is not above stake, so this stays on the payment notice. No count-up and no fanfare.",
    };
  }
  return {
    id: "spin-win",
    title: "Spin, stop, win, count",
    note: "Base bed stays up. Reel motion is a loop and is stopped before the brake. The count ducks the bed and does not use a fanfare.",
    steps: [
      { at: 0, action: "loop", cueId: "music.base" },
      { at: 0.08, action: "play", cueId: "reels.start" },
      { at: 0.22, action: "loop", cueId: "reels.motion" },
      { at: 1.35, action: "stop", cueId: "reels.motion" },
      { at: 1.38, action: "play", cueId: "reels.stop" },
      { at: 1.5, action: "play", cueId: "symbol.land" },
      { at: 1.64, action: "play", cueId: "symbol.land" },
      { at: 1.78, action: "play", cueId: "symbol.land" },
      { at: 1.95, action: "play", cueId: "symbol.win" },
      { at: 2.05, action: "duck", duck: 0.34 },
      { at: 2.12, action: "play", cueId: count },
      { at: 2.12 + options.countSeconds + 0.25, action: "unduck" },
    ],
  };
}

export interface CueMeta {
  priority: Priority;
  duration: number;
  kind: CueKind;
}

export interface PlannedPlay {
  at: number;
  cueId: string;
  loop: boolean;
  accepted: boolean;
  reason?: string;
  stopped: string[];
}

function busKind(cueId: string, kind: CueKind): BusKind {
  if (cueId.startsWith("music.")) return "music";
  if (cueId.startsWith("countup.") && cueId !== "countup.finish" && cueId !== "countup.skip") return "count";
  if (kind === "loop") return "loop";
  return "oneshot";
}

export function simulateScenario(steps: ScenarioStep[], meta: Map<string, CueMeta>): PlannedPlay[] {
  const bus = new VoiceBus();
  const played: PlannedPlay[] = [];
  for (const step of steps) {
    if ((step.action === "play" || step.action === "loop") && step.cueId) {
      const info = meta.get(step.cueId);
      const decision = bus.start({
        id: step.cueId,
        at: step.at,
        kind: busKind(step.cueId, info?.kind ?? "oneshot"),
        priority: info?.priority ?? "ui",
        duration: info?.duration ?? 1,
      });
      played.push({
        at: step.at,
        cueId: step.cueId,
        loop: step.action === "loop",
        accepted: decision.ok,
        reason: decision.reason,
        stopped: decision.stopped,
      });
    } else if (step.action === "stop" && step.cueId) {
      bus.stop(step.cueId);
    } else if (step.action === "skip") {
      bus.stop("countup.classic");
      bus.stop("countup.tiers");
      bus.stop("countup.harmonic");
    }
  }
  return played;
}
