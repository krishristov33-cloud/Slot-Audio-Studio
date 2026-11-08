"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { CueKind } from "@/lib/audio/catalogue";
import { db, type Stereo } from "@/lib/audio/dsp";
import type { LayerState } from "@/lib/audio/project";
import type { Mixdown } from "@/lib/audio/render";

const LAYER_LABEL: Record<string, string> = {
  "dry-counter": "Counter",
  body: "Body",
  support: "Support",
  space: "Space",
  award: "Award",
  melody: "Melody",
  reply: "Reply",
  bass: "Bass",
  harmony: "Harmony",
  percussion: "Percussion",
  texture: "Air",
  transient: "Transient",
  tone: "Tone",
  air: "Air",
};

export function kindLabel(kind: CueKind): string {
  if (kind === "oneshot") return "One-shot";
  if (kind === "loop") return "Loop";
  return "Sequence";
}

export function KindBadge({ kind }: { kind: CueKind }) {
  return <Badge variant={kind === "loop" ? "default" : "secondary"}>{kindLabel(kind)}</Badge>;
}

export function Field({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{display ?? value}</span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
        aria-label={label}
        aria-valuetext={display ?? String(value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Waveform({ stereo }: { stereo: Stereo | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 96;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#4a4034";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    if (!stereo) {
      ctx.fillStyle = "#d7cbb8";
      ctx.font = "13px sans-serif";
      ctx.fillText("Render a cue to see the waveform.", 12, height / 2 - 8);
      return;
    }
    const columns = Math.max(1, Math.floor(width));
    const step = stereo.l.length / columns;
    ctx.fillStyle = "#e6a45a";
    for (let x = 0; x < columns; x++) {
      const start = Math.floor(x * step);
      const end = Math.max(start + 1, Math.floor((x + 1) * step));
      let peak = 0;
      for (let i = start; i < end && i < stereo.l.length; i += Math.max(1, Math.floor((end - start) / 8))) {
        peak = Math.max(peak, Math.abs(stereo.l[i]), Math.abs(stereo.r[i]));
      }
      const h = Math.max(1, peak * (height * 0.46));
      ctx.fillRect(x, height / 2 - h, 1, h * 2);
    }
  }, [stereo]);
  return <canvas ref={ref} className="h-28 w-full rounded-md border border-border" role="img" aria-label="Waveform of the current mix" />;
}

export function Meters({ mix }: { mix: Mixdown | null }) {
  if (!mix) return <p className="text-sm text-muted-foreground">No render yet. Nothing plays until you press a button.</p>;
  const safety = mix.safetyGain < 0.999;
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        <span>Peak {db(mix.peak).toFixed(1)} dBFS</span>
        <span>RMS {db(mix.rms).toFixed(1)} dBFS</span>
        <span>{mix.seconds.toFixed(2)} s</span>
        <span>{mix.loop ? "Seamless loop" : "Plays once"}</span>
      </div>
      {safety ? (
        <p className="rounded-md border border-destructive px-3 py-2 text-sm" role="status">
          Clipping risk. The mix peaked at {db(mix.prePeak).toFixed(1)} dBFS before a safety cut of{" "}
          {db(mix.safetyGain).toFixed(1)} dB. The file stays at about {db(0.89).toFixed(1)} dBFS.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Headroom is inside the safety ceiling. Sample peak only, not a certified true-peak meter.</p>
      )}
    </div>
  );
}

export function LayerMixer({
  names,
  layers,
  onChange,
}: {
  names: string[];
  layers: Record<string, LayerState>;
  onChange: (name: string, next: LayerState) => void;
}) {
  if (!names.length) return null;
  return (
    <div className="grid gap-2">
      <h3 className="font-serif text-lg">Layers</h3>
      <p className="text-xs text-muted-foreground">
        Mute, solo and gain remix the stems you just rendered. Space is a printed return, so muting the counter does not remove reflections already in Space.
      </p>
      <ul className="grid gap-2">
        {names.map((name) => {
          const layer = layers[name] ?? { mute: false, solo: false, gain: 1 };
          return (
            <li key={name} className="grid gap-2 rounded-md border border-border px-3 py-2 sm:grid-cols-[8rem_1fr_auto_auto] sm:items-center">
              <span className="text-sm">{LAYER_LABEL[name] ?? name}</span>
              <Slider
                min={0}
                max={2}
                step={0.01}
                value={[layer.gain]}
                onValueChange={(next) => onChange(name, { ...layer, gain: next[0] ?? layer.gain })}
                aria-label={`${LAYER_LABEL[name] ?? name} gain`}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Switch checked={layer.mute} onCheckedChange={(mute) => onChange(name, { ...layer, mute })} aria-label={`Mute ${name}`} />
                Mute
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Switch checked={layer.solo} onCheckedChange={(solo) => onChange(name, { ...layer, solo })} aria-label={`Solo ${name}`} />
                Solo
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Transport({
  onRender,
  onPlay,
  onStop,
  onVariation,
  extra,
}: {
  onRender: () => void;
  onPlay: () => void;
  onStop: () => void;
  onVariation?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-11" onClick={onPlay}>
        Play
      </Button>
      <Button className="min-h-11" variant="secondary" onClick={onRender}>
        Render only
      </Button>
      <Button className="min-h-11" variant="outline" onClick={onStop}>
        Stop
      </Button>
      {onVariation ? (
        <Button className="min-h-11" variant="outline" onClick={onVariation}>
          New variation
        </Button>
      ) : null}
      {extra}
    </div>
  );
}
