import type { Priority } from "./catalogue";

export type BusKind = "loop" | "music" | "oneshot" | "count";

export interface BusStart {
  id: string;
  at: number;
  kind: BusKind;
  priority: Priority;
  duration: number;
}

/** Mix policy shared by the scenario player. Fanfares do not stack. Music and counts replace their own kind. */
export class VoiceBus {
  private active = new Map<string, BusKind>();
  private fanfareUntil = -Infinity;

  start(event: BusStart): { ok: boolean; reason?: string; stopped: string[] } {
    const stopped: string[] = [];
    if (event.priority === "fanfare") {
      if (event.at < this.fanfareUntil - 0.03) {
        return { ok: false, reason: "A fanfare is already playing", stopped };
      }
      this.fanfareUntil = event.at + Math.max(event.duration, 2.2);
    }
    if (event.kind === "music" || event.kind === "count") this.clearKind(event.kind, stopped);
    this.active.set(event.id, event.kind);
    return { ok: true, stopped };
  }

  stop(id: string): void {
    this.active.delete(id);
  }

  stopAll(): void {
    this.active.clear();
    this.fanfareUntil = -Infinity;
  }

  activeIds(): string[] {
    return [...this.active.keys()];
  }

  private clearKind(kind: BusKind, stopped: string[]): void {
    for (const [id, current] of this.active) {
      if (current === kind) {
        stopped.push(id);
        this.active.delete(id);
      }
    }
  }
}
