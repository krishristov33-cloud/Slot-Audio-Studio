"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { defaultEffect, EFFECT_TYPES, type Effect, type EffectType } from "@/lib/audio/fx";
import { ALGORITHMS, type Algorithm } from "@/lib/audio/algorithms";
import { PROGRESSIONS } from "@/lib/audio/chords";
import { controlGroup, peaksOf, renderSound, type Layer, type Sound } from "@/lib/audio/generate";
import { addPoint, deletePoint, movePoint, valueAt, type AutoPoint, type AutomationLane, type CurveType } from "@/lib/audio/automation";
import {
  arrangeParts,
  deletePart,
  fullPart,
  movePart,
  setFades,
  splitParts,
  timelineEnd,
  type ClipPart,
} from "@/lib/audio/timeline";
import {
  applyTheme,
  loadStoredProject,
  makeLayer,
  moveSound,
  parseProject,
  randomizeSound,
  saveStoredProject,
  soundFromCatalogue,
  themeById,
  type Project,
} from "@/lib/audio/model";
import { THEMES } from "@/lib/audio/themes";
import { SCALE_LABEL, SCALE_NAMES, type ScaleName } from "@/lib/audio/scales";
import { midiToName, SR, type Stereo } from "@/lib/audio/dsp";
import { encodeWavPcm16 } from "@/lib/audio/wav";
import { zipFiles } from "@/lib/audio/zip";
import { AuditionEngine } from "@/lib/audio/playback";

function moodWord(mood: number): string {
  if (mood < 0.34) return "Dark";
  if (mood < 0.66) return "Mixed";
  return "Happy";
}

function download(filename: string, bytes: Uint8Array, mime: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MiniWave({ peaks }: { peaks: number[] }) {
  if (!peaks.length) return <div className="h-8 rounded-sm border border-border bg-[#1a1612]" title="Empty. Generate to fill this row." />;
  return (
    <div className="flex h-8 items-center gap-px" aria-hidden="true">
      {peaks.slice(0, 48).map((peak, index) => (
        <span key={index} className="w-px bg-[#e6a45a]" style={{ height: `${Math.max(8, Math.min(100, peak * 140))}%` }} />
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  min,
  max,
  step,
  display,
  locked,
  automate,
  onChange,
  onLock,
  onAutomate,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  locked?: boolean;
  automate?: boolean;
  onChange: (value: number) => void;
  onLock?: () => void;
  onAutomate?: () => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
        onPointerDown={onAutomate}
        aria-label={label}
        title={automate ? "Automation is on. This opens the lane for the parameter." : label}
      />
      <div className="flex gap-2">
        {onLock ? (
          <button type="button" className="text-[11px] text-muted-foreground underline" onClick={onLock} title="Keep this value when randomising">
            {locked ? "Locked" : "Lock"}
          </button>
        ) : null}
        {onAutomate ? (
          <button type="button" className="text-[11px] text-muted-foreground underline" onClick={onAutomate} title="Open the automation lane">
            Lane
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Editor() {
  const [project, setProject] = useState<Project | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("music.base");
  const [checked, setChecked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [partId, setPartId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [automation, setAutomation] = useState(false);
  const [laneId, setLaneId] = useState<string | null>(null);
  const [status, setStatus] = useState("Audio stays off until you generate or press play.");
  const [busy, setBusy] = useState(false);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const takes = useRef(new Map<string, Stereo>());
  const engine = useRef<AuditionEngine | null>(null);
  const actions = useRef({
    play: () => {},
    stop: () => {},
    split: () => {},
    undo: () => {},
    redo: () => {},
    removePart: () => {},
  });

  useEffect(() => {
    const loaded = loadStoredProject(window.localStorage);
    setProject(loaded.project);
    setSelectedId(loaded.project.sounds[0]?.id ?? "ui.confirm");
    setWarning(loaded.warning ?? null);
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      const message = saveStoredProject(window.localStorage, project);
      if (message) setWarning(message);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (event.key.toLowerCase() === "q" && !typing) {
        event.preventDefault();
        setAutomation((value) => !value);
      } else if (event.code === "Space" && !typing) {
        event.preventDefault();
        actions.current.play();
      } else if (event.key === "Escape") actions.current.stop();
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        actions.current.split();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) actions.current.redo();
        else actions.current.undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        actions.current.redo();
      } else if (event.key === "Delete" && !typing) actions.current.removePart();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function commit(edit: (draft: Project) => void) {
    setProject((current) => {
      if (!current) return current;
      past.current.push(structuredClone(current));
      if (past.current.length > 40) past.current.shift();
      future.current = [];
      const next = structuredClone(current);
      edit(next);
      return next;
    });
  }

  function patchSound(id: string, edit: (sound: Sound) => void) {
    commit((draft) => {
      const sound = draft.sounds.find((item) => item.id === id);
      if (sound) edit(sound);
    });
  }

  function undo() {
    setProject((current) => {
      const previous = past.current.pop();
      if (!current || !previous) return current;
      future.current.push(structuredClone(current));
      return previous;
    });
  }
  function redo() {
    setProject((current) => {
      const next = future.current.pop();
      if (!current || !next) return current;
      past.current.push(structuredClone(current));
      return next;
    });
  }

  function audible(): AuditionEngine {
    if (!engine.current) engine.current = new AuditionEngine();
    engine.current.setMaster(project?.masterGain ?? 0.8);
    return engine.current;
  }

  function generateIds(ids: string[]) {
    if (!project) return;
    const theme = themeById(project.themeId);
    setBusy(true);
    setStatus(`Generating ${ids.length} sound${ids.length === 1 ? "" : "s"} in ${theme.name}…`);
    window.setTimeout(() => {
      commit((draft) => {
        for (const id of ids) {
          const sound = draft.sounds.find((item) => item.id === id);
          if (!sound) continue;
          const take = renderSound(sound, theme);
          const duration = take.source.l.length / SR;
          sound.parts = [fullPart(duration, sound.kind === "loop")];
          const arranged = arrangeParts(take.source, sound.parts);
          takes.current.set(id, take.source);
          sound.peaks = peaksOf(arranged);
          sound.generated = true;
        }
      });
      setBusy(false);
      setStatus(`Generated ${ids.length} with ${theme.name}.`);
    }, 20);
  }

  const selected = project?.sounds.find((sound) => sound.id === selectedId) ?? project?.sounds[0] ?? null;

  function play() {
    if (!project || !selected) return;
    const player = audible();
    player.unlock();
    let source = takes.current.get(selected.id);
    if (!source) {
      const take = renderSound(selected, themeById(project.themeId));
      source = take.source;
      takes.current.set(selected.id, source);
      patchSound(selected!.id, (sound) => {
        sound.peaks = take.peaks;
        sound.generated = true;
      });
    }
    const arranged = arrangeParts(source, selected.parts);
    player.stopAll();
    player.playNow(selected.id, arranged, selected.kind === "loop", selected.family === "music" ? "music" : "sfx");
    setStatus(selected.kind === "loop" ? `Looping ${selected.name}.` : `Playing ${selected.name}.`);
  }
  function stop() {
    engine.current?.stopAll();
    setStatus("Stopped.");
  }
  function split() {
    if (!selected || !partId) {
      setStatus("Select a clip part, then Ctrl+E splits it at the playhead.");
      return;
    }
    patchSound(selected!.id, (sound) => {
      sound.parts = splitParts(sound.parts, partId, playhead);
      const source = takes.current.get(sound.id);
      if (source) sound.peaks = peaksOf(arrangeParts(source, sound.parts, timelineEnd(sound.parts)));
    });
  }
  function removeSelectedPart() {
    if (!selected || !partId) return;
    patchSound(selected!.id, (sound) => {
      sound.parts = deletePart(sound.parts, partId);
      const source = takes.current.get(sound.id);
      if (source) sound.peaks = peaksOf(arrangeParts(source, sound.parts, timelineEnd(sound.parts)));
    });
  }

  useEffect(() => {
    actions.current = { play, stop, split, undo, redo, removePart: removeSelectedPart };
  });

  if (!project || !selected) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#14110e] text-[#f6efe4]">
        <p>Opening the studio…</p>
      </main>
    );
  }

  const theme = themeById(project.themeId);
  const group = controlGroup(selected);
  const lane = selected.layers[0]?.automation.find((item) => item.param === laneId) ?? null;
  const visible = project.sounds.filter((sound) => `${sound.name} ${sound.pack} ${sound.family}`.toLowerCase().includes(query.trim().toLowerCase()));

  function setParam(key: keyof Sound["params"], value: Sound["params"][keyof Sound["params"]]) {
    patchSound(selected!.id, (sound) => {
      (sound.params[key] as Sound["params"][keyof Sound["params"]]) = value;
      if (key === "algorithm" && sound.layers[0]) sound.layers[0].algorithm = value as Algorithm;
      if (key === "duration") {
        if (sound.parts.length === 1) sound.parts[0].duration = Number(value);
      }
    });
  }
  function toggleLock(key: string) {
    patchSound(selected!.id, (sound) => {
      sound.locks = sound.locks.includes(key) ? sound.locks.filter((item) => item !== key) : [...sound.locks, key];
    });
  }
  function openLane(param: string) {
    if (!automation) return;
    setLaneId(param);
    patchSound(selected!.id, (sound) => {
      const layer = sound.layers[0];
      if (!layer) return;
      if (!layer.automation.some((item) => item.param === param)) {
        layer.automation.push({ id: param, param, points: [] });
      }
    });
  }

  return (
    <div className="editor-shell">
      <aside className="editor-pane border-r p-3">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Grim Hamster</p>
            <h1 className="font-serif text-2xl leading-none">Slot Audio</h1>
          </div>
          <Button className="min-h-11" variant="outline" title="Stop everything" onClick={stop}>
            Stop
          </Button>
        </div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a sound" aria-label="Find a sound" className="mb-2" />
        <div className="mb-2 flex gap-2">
          <Button
            className="min-h-11"
            title="Add a sound based on the current one"
            onClick={() => {
              const created = soundFromCatalogue(selected.family === "music" ? "music.base" : "ui.confirm")!;
              created.id = `custom.${Date.now().toString(36)}`;
              created.name = "New sound";
              created.pack = "Custom";
              created.family = selected.family;
              created.kind = selected.kind;
              commit((draft) => {
                const index = draft.sounds.findIndex((item) => item.id === selected.id);
                draft.sounds.splice(index + 1, 0, created);
              });
              setSelectedId(created.id);
            }}
          >
            Add
          </Button>
          <Button className="min-h-11" variant="outline" title="Remove this sound" onClick={() => commit((draft) => { draft.sounds = draft.sounds.filter((item) => item.id !== selected.id); })}>
            Remove
          </Button>
        </div>
        <ul className="grid gap-1">
          {visible.map((sound) => {
            const index = project.sounds.findIndex((item) => item.id === sound.id);
            const active = sound.id === selected.id;
            return (
              <li key={sound.id} className={`rounded-md border px-2 py-1 ${active ? "border-[#e6a45a] bg-[#2a241c]" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked.includes(sound.id)}
                    onChange={(event) => setChecked((current) => (event.target.checked ? [...current, sound.id] : current.filter((id) => id !== sound.id)))}
                    aria-label={`Select ${sound.name} for bulk generate`}
                  />
                  <button type="button" className="min-h-11 flex-1 text-left" onClick={() => setSelectedId(sound.id)}>
                    <span className="block text-sm">{sound.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {SCALE_LABEL[sound.params.scale]} · {midiToName(sound.params.root)} · {sound.params.duration.toFixed(1)}s · {moodWord(sound.params.mood)} · {Math.round(sound.params.bpm)} bpm
                    </span>
                  </button>
                  <button type="button" className="text-xs text-muted-foreground" title="Move up" onClick={() => commit((draft) => { draft.sounds = moveSound(draft.sounds, index, index - 1); })}>↑</button>
                  <button type="button" className="text-xs text-muted-foreground" title="Move down" onClick={() => commit((draft) => { draft.sounds = moveSound(draft.sounds, index, index + 1); })}>↓</button>
                </div>
                <MiniWave peaks={sound.generated ? sound.peaks : []} />
              </li>
            );
          })}
        </ul>
      </aside>
      <main className="editor-pane grid grid-rows-[auto_1fr_auto] gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Project name" value={project.name} onChange={(event) => commit((draft) => void (draft.name = event.target.value))} className="max-w-56" />
          <label className="grid gap-1 text-xs">
            Theme
            <select className="h-11 rounded-md border border-border bg-card px-2 text-sm" value={project.themeId} onChange={(event) => commit((draft) => void (draft.themeId = event.target.value))} title={theme.note}>
              {THEMES.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <Button className="min-h-11" disabled={busy} title="Generate the selected sound" onClick={() => generateIds([selected.id])}>Generate</Button>
          <Button className="min-h-11" variant="secondary" disabled={busy} title="Generate every checked row, or the whole list" onClick={() => generateIds(checked.length ? checked : project.sounds.map((sound) => sound.id))}>
            {checked.length ? `Generate ${checked.length}` : "Generate all"}
          </Button>
          <Button className="min-h-11" variant="outline" title="Space" onClick={play}>Play</Button>
          <Button className="min-h-11" variant="outline" title="Q" onClick={() => setAutomation((value) => !value)} aria-pressed={automation}>
            {automation ? "Automation on" : "Automation"}
          </Button>
          <span className="text-sm text-muted-foreground" role="status">{status}</span>
        </div>
        <section className="grid gap-2">
          <div className="relative h-48 rounded-md border border-border bg-[#1a1612]">
            <Waveform peaks={selected.generated ? selected.peaks : []} />
            <div
              className="absolute inset-0"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                setPlayhead(Math.max(0, ratio * timelineEnd(selected.parts, selected.params.duration)));
              }}
            >
              {selected.parts.map((part) => (
                <PartView
                  key={part.id}
                  part={part}
                  total={timelineEnd(selected.parts, selected.params.duration)}
                  active={part.id === partId}
                  onSelect={() => setPartId(part.id)}
                  onMove={(start) => patchSound(selected.id, (sound) => {
                    sound.parts = movePart(sound.parts, part.id, start);
                    const source = takes.current.get(sound.id);
                    if (source) sound.peaks = peaksOf(arrangeParts(source, sound.parts, timelineEnd(sound.parts)));
                  })}
                  onFade={(fadeIn, fadeOut) => patchSound(selected.id, (sound) => {
                    sound.parts = setFades(sound.parts, part.id, fadeIn, fadeOut);
                    const source = takes.current.get(sound.id);
                    if (source) sound.peaks = peaksOf(arrangeParts(source, sound.parts, timelineEnd(sound.parts)));
                  })}
                />
              ))}
              <div className="absolute top-0 bottom-0 w-px bg-[#f6efe4]" style={{ left: `${(playhead / Math.max(0.1, timelineEnd(selected.parts, selected.params.duration))) * 100}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.blurb} Click the timeline to place the playhead. Ctrl+E splits the selected part. Drag a part to move it. The edge handles set fade in and fade out.
          </p>
          {automation && lane ? (
            <LaneView
              lane={lane}
              onChange={(points) => patchSound(selected.id, (sound) => {
                const target = sound.layers[0]?.automation.find((item) => item.param === lane.param);
                if (target) target.points = points;
              })}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{automation ? "Click a slider to open its lane." : "Press Q for automation, then click a control."}</p>
          )}
        </section>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => {
            const source = takes.current.get(selected.id);
            if (!source) { setStatus("Generate this sound before exporting."); return; }
            download(`${selected.id}.wav`, encodeWavPcm16(arrangeParts(source, selected.parts)), "audio/wav");
          }}>WAV</Button>
          <Button variant="outline" className="min-h-11" onClick={() => {
            const files: Record<string, Uint8Array> = {};
            const themeNow = themeById(project.themeId);
            for (const sound of project.sounds) {
              const source = takes.current.get(sound.id) ?? renderSound(sound, themeNow).source;
              const arranged = arrangeParts(source, sound.parts);
              files[`${sound.id}.wav`] = encodeWavPcm16(arranged);
              sound.layers.forEach((layer, index) => {
                if (layer.mute) return;
                const stem = renderSound({ ...sound, layers: [{ ...layer, solo: true }], master: [] }, themeNow).stereo;
                files[`stems/${sound.id}/${index + 1}-${layer.name}.wav`] = encodeWavPcm16(stem);
              });
            }
            files["project.json"] = new TextEncoder().encode(JSON.stringify(project, null, 2));
            download(`${project.name.replace(/\s+/g, "-").toLowerCase()}.zip`, zipFiles(files), "application/zip");
          }}>ZIP</Button>
          <Button variant="outline" className="min-h-11" onClick={() => download("project.json", new TextEncoder().encode(JSON.stringify(project, null, 2)), "application/json")}>JSON</Button>
          <label className="flex min-h-11 cursor-pointer items-center rounded-md border border-border px-3 text-sm">
            Load JSON
            <input type="file" accept="application/json" className="sr-only" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const parsed = parseProject(await file.text());
              past.current = [];
              future.current = [];
              takes.current.clear();
              setProject(parsed.project);
              setWarning(parsed.warning ?? `Loaded ${parsed.project.name}.`);
            }} />
          </label>
          {warning ? <span className="text-sm">{warning}</span> : null}
        </div>
      </main>
      <aside className="editor-pane border-l p-3">
        <h2 className="font-serif text-xl">{selected.name}</h2>
        <Input className="mt-2" aria-label="Sound name" value={selected.name} onChange={(event) => patchSound(selected.id, (sound) => void (sound.name = event.target.value))} />
        <p className="mt-2 text-xs text-muted-foreground">{theme.note} {selected.implemented ? "" : "This slot is not synthesized."}</p>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-xs">Scale
            <select className="h-11 rounded-md border border-border bg-card px-2" value={selected.params.scale} onChange={(event) => setParam("scale", event.target.value as ScaleName)}>
              {SCALE_NAMES.map((scale) => <option key={scale} value={scale}>{SCALE_LABEL[scale]}</option>)}
            </select>
          </label>
          <Field label="Key / root" value={selected.params.root} min={36} max={84} step={1} display={midiToName(selected.params.root)} locked={selected.locks.includes("root")} onLock={() => toggleLock("root")} automate={automation} onAutomate={() => openLane("root")} onChange={(value) => setParam("root", Math.round(value))} />
          <Field label="BPM" value={selected.params.bpm} min={70} max={180} step={1} display={`${Math.round(selected.params.bpm)}`} locked={selected.locks.includes("bpm")} onLock={() => toggleLock("bpm")} onChange={(value) => setParam("bpm", value)} />
          <Field label="Duration" value={selected.params.duration} min={0.2} max={12} step={0.05} display={`${selected.params.duration.toFixed(2)} s`} onChange={(value) => setParam("duration", value)} />
          <Field label="Mood" value={selected.params.mood} min={0} max={1} step={0.01} display={moodWord(selected.params.mood)} locked={selected.locks.includes("mood")} onLock={() => toggleLock("mood")} automate={automation} onAutomate={() => openLane("mood")} onChange={(value) => setParam("mood", value)} />
          <Field label="Energy" value={selected.params.energy} min={0} max={1} step={0.01} display={selected.params.energy.toFixed(2)} onLock={() => toggleLock("energy")} locked={selected.locks.includes("energy")} automate={automation} onAutomate={() => openLane("energy")} onChange={(value) => setParam("energy", value)} />
          <Field label="Brightness" value={selected.params.brightness} min={0.15} max={1.5} step={0.01} display={selected.params.brightness.toFixed(2)} onChange={(value) => setParam("brightness", value)} />
          <Field label="Weirdness" value={selected.params.weirdness} min={0} max={1} step={0.01} display={selected.params.weirdness.toFixed(2)} onChange={(value) => setParam("weirdness", value)} />
          <label className="grid gap-1 text-xs">Algorithm
            <select className="h-11 rounded-md border border-border bg-card px-2" value={selected.params.algorithm} onChange={(event) => setParam("algorithm", event.target.value as Algorithm)}>
              {ALGORITHMS.map((algorithm) => <option key={algorithm} value={algorithm}>{algorithm}</option>)}
            </select>
          </label>
          {group === "countup" ? (
            <>
              <Field label="Tick rate" value={selected.params.tickRate} min={4} max={32} step={0.5} display={`${selected.params.tickRate.toFixed(1)} Hz`} onChange={(value) => setParam("tickRate", value)} />
              <Field label="Pitch rise" value={selected.params.pitchCurve} min={0} max={24} step={0.5} display={`${selected.params.pitchCurve.toFixed(1)} st`} onChange={(value) => setParam("pitchCurve", value)} />
              <Field label="Tiers" value={selected.params.tiers} min={1} max={4} step={1} display={`${Math.round(selected.params.tiers)}`} onChange={(value) => setParam("tiers", value)} />
              <Field label="Coin density" value={selected.params.density} min={0} max={1} step={0.01} display={selected.params.density.toFixed(2)} onChange={(value) => setParam("density", value)} />
              <Field label="Finish" value={selected.params.finish} min={0} max={3} step={1} display={["Dry", "Bell", "Impact", "Chord"][Math.round(selected.params.finish)]} onChange={(value) => setParam("finish", value)} />
            </>
          ) : null}
          {group === "impact" ? (
            <>
              <Field label="Transient" value={selected.params.transient} min={0} max={1.5} step={0.01} display={selected.params.transient.toFixed(2)} onChange={(value) => setParam("transient", value)} />
              <Field label="Body" value={selected.params.body} min={0} max={1.5} step={0.01} display={selected.params.body.toFixed(2)} onChange={(value) => setParam("body", value)} />
              <Field label="Tail" value={selected.params.tail} min={0} max={1.5} step={0.01} display={selected.params.tail.toFixed(2)} onChange={(value) => setParam("tail", value)} />
              <Field label="Sub drop" value={selected.params.sub} min={0} max={1.5} step={0.01} display={selected.params.sub.toFixed(2)} onChange={(value) => setParam("sub", value)} />
            </>
          ) : null}
          {group === "music" ? (
            <label className="grid gap-1 text-xs">Progression
              <select className="h-11 rounded-md border border-border bg-card px-2" value={selected.params.progression} onChange={(event) => setParam("progression", event.target.value)}>
                {PROGRESSIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" title="Randomise unlocked parameters" onClick={() => {
              const next = randomizeSound(selected, theme, selected.params.variation + 3);
              patchSound(selected!.id, (sound) => {
                sound.params = next.params;
                sound.layers = next.layers;
              });
            }}>Randomise</Button>
            <Button variant="outline" className="min-h-11" title="Copy the theme palette onto this sound" onClick={() => {
              const next = applyTheme(selected, theme);
              patchSound(selected!.id, (sound) => {
                sound.params = next.params;
                sound.layers = next.layers;
              });
            }}>Apply theme</Button>
          </div>
          <LayerEditor
            layers={selected.layers}
            automation={automation}
            onChange={(layers) => patchSound(selected.id, (sound) => void (sound.layers = layers))}
            onAutomate={openLane}
          />
        </div>
      </aside>
    </div>
  );
}

function Waveform({ peaks }: { peaks: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 192;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#4a4034";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    if (!peaks.length) {
      ctx.fillStyle = "#d7cbb8";
      ctx.font = "13px sans-serif";
      ctx.fillText("Empty take. Choose a theme and generate.", 12, 28);
      return;
    }
    ctx.fillStyle = "#e6a45a";
    peaks.forEach((peak, index) => {
      const x = (index / peaks.length) * width;
      const h = Math.max(1, peak * (height * 0.46));
      ctx.fillRect(x, height / 2 - h, Math.max(1, width / peaks.length - 1), h * 2);
    });
  }, [peaks]);
  return <canvas ref={ref} className="h-full w-full" role="img" aria-label="Waveform" />;
}

function PartView({
  part,
  total,
  active,
  onSelect,
  onMove,
  onFade,
}: {
  part: ClipPart;
  total: number;
  active: boolean;
  onSelect: () => void;
  onMove: (start: number) => void;
  onFade: (fadeIn: number, fadeOut: number) => void;
}) {
  return (
    <div
      className={`absolute top-2 bottom-2 rounded-sm border ${active ? "border-[#f6efe4]" : "border-[#e6a45a]"}`}
      style={{ left: `${(part.start / total) * 100}%`, width: `${(part.duration / total) * 100}%` }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
        const startX = event.clientX;
        const origin = part.start;
        const width = event.currentTarget.parentElement?.clientWidth || 1;
        const move = (ev: PointerEvent) => onMove(origin + ((ev.clientX - startX) / width) * total);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      title="Drag to move this part"
    >
      <button type="button" className="absolute top-0 bottom-0 left-0 w-2 bg-[#e6a45a]" title="Fade in" onPointerDown={(event) => {
        event.stopPropagation();
        const startX = event.clientX;
        const origin = part.fadeIn;
        const move = (ev: PointerEvent) => onFade(Math.max(0, origin + (ev.clientX - startX) / 80), part.fadeOut);
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }} />
      <button type="button" className="absolute top-0 right-0 bottom-0 w-2 bg-[#e6a45a]" title="Fade out" onPointerDown={(event) => {
        event.stopPropagation();
        const startX = event.clientX;
        const origin = part.fadeOut;
        const move = (ev: PointerEvent) => onFade(part.fadeIn, Math.max(0, origin + (startX - ev.clientX) / 80));
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }} />
    </div>
  );
}

function LaneView({ lane, onChange }: { lane: AutomationLane; onChange: (points: AutoPoint[]) => void }) {
  const [curve, setCurve] = useState<CurveType>("linear");
  return (
    <div className="rounded-md border border-border p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm">Lane · {lane.param}</p>
        <select className="h-9 rounded-md border border-border bg-card px-2 text-xs" value={curve} onChange={(event) => setCurve(event.target.value as CurveType)} aria-label="Curve type">
          <option value="linear">Linear</option>
          <option value="smooth">Smooth</option>
          <option value="bezier">Bezier</option>
          <option value="step">Step</option>
        </select>
      </div>
      <svg
        viewBox="0 0 100 40"
        className="h-24 w-full border border-border bg-[#1a1612]"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const t = ((event.clientX - rect.left) / rect.width) * 4;
          const v = 1 - (event.clientY - rect.top) / rect.height;
          onChange(addPoint(lane.points, { id: `pt-${lane.points.length}-${Math.round(t * 100)}`, t, v, curve, hx: 0.25, hy: curve === "bezier" ? 0.2 : 0 }));
        }}
      >
        <polyline fill="none" stroke="#e6a45a" strokeWidth="0.8" points={Array.from({ length: 40 }, (_, index) => {
          const t = (index / 39) * 4;
          const v = lane.points.length ? valueAt(lane.points, t, 0.5) : 0.5;
          return `${(t / 4) * 100},${(1 - v) * 40}`;
        }).join(" ")} />
        {lane.points.map((point) => (
          <circle
            key={point.id}
            cx={(point.t / 4) * 100}
            cy={(1 - point.v) * 40}
            r="1.6"
            fill="#f6efe4"
            onPointerDown={(event) => {
              event.stopPropagation();
              const svg = event.currentTarget.ownerSVGElement;
              if (!svg) return;
              const move = (ev: PointerEvent) => {
                const rect = svg.getBoundingClientRect();
                const t = Math.max(0, ((ev.clientX - rect.left) / rect.width) * 4);
                const v = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
                onChange(movePoint(lane.points, point.id, t, v));
              };
              const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onChange(deletePoint(lane.points, point.id));
            }}
          />
        ))}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">Click to add a point. Drag a point to move it. Double-click to delete. Curve applies to the next point you add.</p>
    </div>
  );
}

function LayerEditor({
  layers,
  automation,
  onChange,
  onAutomate,
}: {
  layers: Layer[];
  automation: boolean;
  onChange: (layers: Layer[]) => void;
  onAutomate: (param: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg">Layers</h3>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={layers.length >= 4}
          onClick={() => onChange([...layers, makeLayer(layers.length, layers[0]?.algorithm ?? "modal")])}
        >
          Add layer
        </Button>
      </div>
      {layers.map((layer, index) => (
        <div key={layer.id} className="grid gap-2 rounded-md border border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{layer.name}</span>
            <button type="button" className="text-xs text-muted-foreground" disabled={layers.length < 2} onClick={() => onChange(layers.filter((item) => item.id !== layer.id))}>Remove</button>
          </div>
          <select className="h-10 rounded-md border border-border bg-card px-2 text-sm" value={layer.algorithm} aria-label={`${layer.name} algorithm`} onChange={(event) => onChange(layers.map((item) => item.id === layer.id ? { ...item, algorithm: event.target.value as Algorithm } : item))}>
            {ALGORITHMS.map((algorithm) => <option key={algorithm} value={algorithm}>{algorithm}</option>)}
          </select>
          <select className="h-10 rounded-md border border-border bg-card px-2 text-sm" value={layer.mode} aria-label={`${layer.name} mode`} onChange={(event) => onChange(layers.map((item) => item.id === layer.id ? { ...item, mode: event.target.value as Layer["mode"] } : item))}>
            <option value="stack">Stack</option>
            <option value="resample">Resample previous</option>
          </select>
          <Field label="Layer gain" value={layer.gain} min={0} max={1.5} step={0.01} display={layer.gain.toFixed(2)} automate={automation} onAutomate={() => onAutomate("gain")} onChange={(gain) => onChange(layers.map((item) => item.id === layer.id ? { ...item, gain } : item))} />
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => onChange(layers.map((item) => item.id === layer.id ? { ...item, mute: !item.mute } : item))}>{layer.mute ? "Muted" : "Mute"}</Button>
            <Button variant="outline" className="min-h-11" onClick={() => onChange(layers.map((item) => item.id === layer.id ? { ...item, solo: !item.solo } : item))}>{layer.solo ? "Solo on" : "Solo"}</Button>
          </div>
          {layer.effects.map((effect) => (
            <EffectFields key={effect.id} effect={effect} onChange={(next) => onChange(layers.map((item) => item.id === layer.id ? { ...item, effects: item.effects.map((fx) => fx.id === effect.id ? next : fx) } : item))} onAutomate={(param) => onAutomate(`fx:${index}:${param}`)} automation={automation} />
          ))}
          <select className="h-10 rounded-md border border-border bg-card px-2 text-sm" aria-label={`Add effect to ${layer.name}`} defaultValue="" onChange={(event) => {
            const type = event.target.value as EffectType;
            if (!type) return;
            onChange(layers.map((item) => item.id === layer.id ? { ...item, effects: [...item.effects, defaultEffect(type, `${item.id}-${type}-${item.effects.length}`)] } : item));
            event.target.value = "";
          }}>
            <option value="">Add effect…</option>
            {EFFECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function EffectFields({ effect, onChange, onAutomate, automation }: { effect: Effect; onChange: (effect: Effect) => void; onAutomate: (param: string) => void; automation: boolean }) {
  const entries = Object.entries(effect.params);
  return (
    <div className="grid gap-2 border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase">{effect.type}</span>
        <button type="button" className="text-xs text-muted-foreground" onClick={() => onChange({ ...effect, enabled: !effect.enabled })}>{effect.enabled ? "On" : "Off"}</button>
      </div>
      {entries.map(([key, value]) => (
        <Field key={key} label={key} value={value} min={key.startsWith("b") ? -12 : key === "semitones" ? -12 : 0} max={key.startsWith("b") ? 12 : key === "semitones" ? 12 : key === "freq" ? 4000 : key === "ratio" ? 12 : 1.5} step={key.startsWith("b") || key === "semitones" ? 0.5 : 0.01} display={String(Math.round(value * 100) / 100)} automate={automation} onAutomate={() => onAutomate(key)} onChange={(next) => onChange({ ...effect, params: { ...effect.params, [key]: next } })} />
      ))}
    </div>
  );
}

