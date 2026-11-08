import { clamp, type Stereo } from "./dsp";

interface Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

function audioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("This browser has no Web Audio context.");
  return new Ctx({ latencyHint: "interactive" });
}

/**
 * Playback only. Synthesis has already produced the buffers.
 * The context is created on the first user gesture and never started by itself.
 */
export class AuditionEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private playing = new Map<string, Playing>();
  private count: Playing | null = null;
  private sting: AudioBuffer | null = null;
  private timers: number[] = [];
  private onHide = () => {
    if (document.visibilityState === "hidden") this.stopAll();
  };

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onHide);
      window.addEventListener("pagehide", () => this.stopAll());
    }
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  unlock(): AudioContext {
    if (!this.ctx) {
      this.ctx = audioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
    return this.ctx;
  }

  setMaster(value: number): void {
    if (this.master) this.master.gain.value = clamp(value, 0, 1);
  }

  stopAll(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const item of this.playing.values()) {
      try {
        item.source.stop();
      } catch {
        /* already stopped */
      }
      item.source.disconnect();
      item.gain.disconnect();
    }
    this.playing.clear();
    this.count = null;
    this.sting = null;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(1, now);
    }
  }

  dispose(): void {
    this.stopAll();
    document.removeEventListener("visibilitychange", this.onHide);
    void this.ctx?.close();
    this.ctx = null;
  }

  private bufferFrom(stereo: Stereo): AudioBuffer {
    const ctx = this.ctx ?? this.unlock();
    const buffer = ctx.createBuffer(2, stereo.l.length, stereo.sr);
    buffer.getChannelData(0).set(stereo.l);
    buffer.getChannelData(1).set(stereo.r);
    return buffer;
  }

  startAt(
    id: string,
    stereo: Stereo,
    when: number,
    options: { loop?: boolean; bus?: "music" | "sfx"; stopAt?: number },
  ): void {
    const ctx = this.unlock();
    this.stopAt(id, when);
    const gain = ctx.createGain();
    gain.connect(options.bus === "music" ? this.musicGain! : this.sfxGain!);
    const source = ctx.createBufferSource();
    source.buffer = this.bufferFrom(stereo);
    source.loop = Boolean(options.loop);
    source.connect(gain);
    const item: Playing = { source, gain };
    this.playing.set(id, item);
    source.onended = () => {
      if (this.playing.get(id) === item) this.playing.delete(id);
      if (this.count === item) this.count = null;
    };
    source.start(when);
    if (options.stopAt !== undefined && options.stopAt > when) source.stop(options.stopAt);
  }

  stopAt(id: string, when: number): void {
    const item = this.playing.get(id);
    if (!item) return;
    try {
      item.source.stop(when);
    } catch {
      /* already stopped */
    }
  }

  playNow(id: string, stereo: Stereo, loop = false, bus: "music" | "sfx" = "sfx"): void {
    const ctx = this.unlock();
    this.startAt(id, stereo, ctx.currentTime + 0.02, { loop, bus });
  }

  playCount(id: string, full: Stereo, sting?: Stereo): void {
    const ctx = this.unlock();
    this.armCount(id, full, sting, ctx.currentTime + 0.02);
  }

  armCount(id: string, full: Stereo, sting: Stereo | undefined, when: number): void {
    this.unlock();
    this.sting = sting ? this.bufferFrom(sting) : null;
    this.startAt(id, full, when, { bus: "sfx" });
    this.count = this.playing.get(id) ?? null;
  }

  skipCount(): boolean {
    if (!this.ctx || !this.count || !this.sting || !this.sfxGain) return false;
    const now = this.ctx.currentTime;
    const fading = this.count;
    fading.gain.gain.cancelScheduledValues(now);
    fading.gain.gain.setValueAtTime(fading.gain.gain.value, now);
    fading.gain.gain.linearRampToValueAtTime(0, now + 0.012);
    try {
      fading.source.stop(now + 0.02);
    } catch {
      /* already stopped */
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.sting;
    const gain = this.ctx.createGain();
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now + 0.012);
    const item = { source, gain };
    this.playing.set("count-skip", item);
    source.onended = () => {
      if (this.playing.get("count-skip") === item) this.playing.delete("count-skip");
    };
    this.count = null;
    this.sting = null;
    return true;
  }

  skipAt(when: number): void {
    const ctx = this.unlock();
    const delay = Math.max(0, (when - ctx.currentTime) * 1000);
    const timer = window.setTimeout(() => this.skipCount(), delay);
    this.timers.push(timer);
  }

  playAudioBuffer(id: string, buffer: AudioBuffer): void {
    const ctx = this.unlock();
    this.stopAt(id, ctx.currentTime);
    const gain = ctx.createGain();
    gain.connect(this.sfxGain!);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const item = { source, gain };
    this.playing.set(id, item);
    source.onended = () => {
      if (this.playing.get(id) === item) this.playing.delete(id);
    };
    source.start();
  }

  duckAt(gainValue: number, when: number): void {
    this.musicGain?.gain.linearRampToValueAtTime(clamp(gainValue, 0, 1), when);
  }

  unduckAt(when: number): void {
    this.musicGain?.gain.linearRampToValueAtTime(1, when);
  }
}
