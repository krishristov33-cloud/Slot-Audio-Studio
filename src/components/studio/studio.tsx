"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PACKS } from "@/lib/audio/catalogue";
import { VoiceBus } from "@/lib/audio/director";
import { NOTE_NAMES, db, midiToName, nameToMidi } from "@/lib/audio/dsp";
import { AuditionEngine } from "@/lib/audio/playback";
import {
  THEMES,
  cueFromDefinition,
  loadStoredProject,
  parseProject,
  saveStoredProject,
  type Cue,
  type CueParams,
  type Identity,
  type LayerState,
  type Project,
  type ThemeId,
} from "@/lib/audio/project";
import { CATALOGUE } from "@/lib/audio/catalogue";
import { mixdown, synthKey, synthesize, type Mixdown, type SynthBuffer } from "@/lib/audio/render";
import { SCALE_LABEL, type ScaleName } from "@/lib/audio/scales";
import { buildScenario, type ScenarioId } from "@/lib/audio/scenario";
import type { Family } from "@/lib/audio/sfx";
import { encodeWavPcm16 } from "@/lib/audio/wav";
import { zipFiles } from "@/lib/audio/zip";
import { Field, KindBadge, LayerMixer, Meters, Transport, Waveform, kindLabel } from "./widgets";

type Section = "identity" | "catalogue" | "cue" | "countup" | "music" | "scenario" | "export";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "catalogue", label: "Catalogue" },
  { id: "cue", label: "Cue" },
  { id: "countup", label: "Count-up" },
  { id: "music", label: "Music" },
  { id: "scenario", label: "Scenario" },
  { id: "export", label: "Export" },
];

const ADDABLE: Family[] = ["tick", "confirm", "neutral", "impact", "land", "highlight", "motion", "riser", "whoosh", "fanfare", "descend", "collect", "award"];

const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "spin-win", label: "Spin, stop, win, count" },
  { id: "below-stake", label: "Below-stake notice" },
  { id: "turbo", label: "Turbo" },
  { id: "bonus", label: "Bonus transition" },
  { id: "big-win", label: "Big win" },
  { id: "skip-count", label: "Skip the count" },
];

interface Audition {
  cueId: string;
  buffer: SynthBuffer;
  mix: Mixdown | null;
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "cue";
}

export function Studio() {
  const [project, setProject] = useState<Project | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("countup");
  const [selectedId, setSelectedId] = useState("countup.classic");
  const [shown, setShown] = useState<Record<string, { key: string; buffer: SynthBuffer }>>({});
  const [status, setStatus] = useState("Audio stays off until you play or render.");
  const [query, setQuery] = useState("");
  const [pack, setPack] = useState("All");
  const [scenarioId, setScenarioId] = useState<ScenarioId>("spin-win");
  const [stake, setStake] = useState(1);
  const [win, setWin] = useState(8);
  const [log, setLog] = useState<string[]>([]);
  const [batch, setBatch] = useState<string | null>(null);
  const [importName, setImportName] = useState<string | null>(null);
  const engineRef = useRef<AuditionEngine | null>(null);
  const cache = useRef(new Map<string, SynthBuffer>());
  const cancelBatch = useRef(false);
  const importBuffer = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    const loaded = loadStoredProject(window.localStorage);
    // Client-only storage. The server render has no project yet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProject(loaded.project);
    setWarning(loaded.warning ?? null);
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      const message = saveStoredProject(window.localStorage, project);
      if (message) setWarning(message);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  const engine = () => {
    if (!engineRef.current) engineRef.current = new AuditionEngine();
    engineRef.current.setMaster(project?.masterGain ?? 0.8);
    return engineRef.current;
  };

  function patchProject(edit: (draft: Project) => void) {
    setProject((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      edit(next);
      return next;
    });
  }

  function patchCue(id: string, edit: (cue: Cue) => void) {
    patchProject((draft) => {
      const cue = draft.cues.find((item) => item.id === id);
      if (cue) edit(cue);
    });
  }

  const selected = project?.cues.find((cue) => cue.id === selectedId) ?? project?.cues[0] ?? null;

  function produce(cue: Cue, mode: "play" | "render") {
    const eng = engine();
    eng.unlock();
    setStatus("Rendering in this browser…");
    window.setTimeout(() => {
      try {
        if (!project) return;
        const key = synthKey(project.identity, cue);
        let buffer = cache.current.get(key);
        if (!buffer) {
          buffer = synthesize(project.identity, cue);
          cache.current.set(key, buffer);
        }
        const mix = Object.keys(buffer.stems).length ? mixdown(buffer, cue.params.layers, cue.params.gain) : null;
        setShown((current) => ({ ...current, [cue.id]: { key, buffer: buffer! } }));
        if (buffer.unavailable) {
          setStatus(buffer.message ?? "This cue is not implemented.");
          return;
        }
        if (!mix) {
          setStatus(buffer.message ?? "Nothing was synthesized.");
          return;
        }
        if (mode === "play") {
          if (buffer.loop || cue.flavor.family === "music" || cue.flavor.family === "countup") eng.stopAll();
          if (cue.flavor.family === "countup" && mix.sting) eng.playCount(cue.id, mix.mix, mix.sting);
          else eng.playNow(cue.id, mix.mix, mix.loop, cue.flavor.family === "music" ? "music" : "sfx");
        }
        const ceiling = mix.safetyGain < 0.999 ? ` Safety cut ${db(mix.safetyGain).toFixed(1)} dB.` : "";
        setStatus(
          `${mode === "play" ? (mix.loop ? "Playing loop" : "Playing") : "Rendered"} · ${kindLabel(cue.kind)} · ${mix.seconds.toFixed(2)} s · peak ${db(mix.peak).toFixed(1)} dBFS.${ceiling}`,
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Render failed.");
      }
    }, 30);
  }

  function view(cue: Cue): Audition | null {
    if (!project) return null;
    const entry = shown[cue.id];
    const key = synthKey(project.identity, cue);
    if (!entry || entry.key !== key) return null;
    const mix = Object.keys(entry.buffer.stems).length ? mixdown(entry.buffer, cue.params.layers, cue.params.gain) : null;
    return { cueId: cue.id, buffer: entry.buffer, mix };
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        engineRef.current?.stopAll();
        setStatus("Stopped.");
      } else if (event.code === "Space" && !typing && selected) {
        event.preventDefault();
        produce(selected, "play");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!project || !selected) {
    return (
      <main className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-3 px-4 py-16">
        <p className="font-serif text-3xl">Slot Audio Studio</p>
        <p>Opening the saved project…</p>
      </main>
    );
  }

  const audible = view(selected);
  const countId = selected.id.startsWith("countup.") ? selected.id : "countup.classic";
  const countCue = project.cues.find((cue) => cue.id === countId) ?? selected;
  const countAudition = view(countCue);
  const musicId = selected.id.startsWith("music.") ? selected.id : "music.base";
  const musicCue = project.cues.find((cue) => cue.id === musicId) ?? selected;
  const musicAudition = view(musicCue);
  const multiplier = stake > 0 ? win / stake : 0;

  return (
    <div className="min-h-full">
      <a href="#studio-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to studio
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 32 32" className="mt-1 size-10 shrink-0" aria-hidden="true">
              <rect width="32" height="32" rx="6" fill="#2a241c" />
              <circle cx="16" cy="18" r="7" fill="#e6a45a" />
              <circle cx="10" cy="11" r="3.2" fill="#e6a45a" />
              <circle cx="22" cy="11" r="3.2" fill="#e6a45a" />
              <circle cx="13.5" cy="17.5" r="1" fill="#1b140c" />
              <circle cx="18.5" cy="17.5" r="1" fill="#1b140c" />
            </svg>
            <div>
              <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Grim Hamster Studio</p>
              <h1 className="font-serif text-3xl leading-none">Slot Audio Studio</h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Original slot music and effects, synthesized in this browser from the Hollow Orchard and count-up recipes. Nothing is uploaded when you render.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,12rem)_auto] sm:items-end">
            <div className="grid gap-1">
              <Label htmlFor="project-name">Project</Label>
              <Input id="project-name" value={project.name} maxLength={80} onChange={(event) => patchProject((draft) => void (draft.name = event.target.value))} />
            </div>
            <Field
              label="Monitor"
              min={0}
              max={1}
              step={0.01}
              value={project.masterGain}
              display={project.masterGain.toFixed(2)}
              onChange={(masterGain) => {
                patchProject((draft) => void (draft.masterGain = masterGain));
                engineRef.current?.setMaster(masterGain);
              }}
            />
            <Button className="min-h-11" variant="destructive" onClick={() => { engine().unlock(); engine().stopAll(); setStatus("Stopped. Loops are cleared."); }}>
              Stop all
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4">
        {warning ? (
          <p className="rounded-md border border-border bg-card px-3 py-2 text-sm" role="status">
            {warning}
          </p>
        ) : null}
        <nav className="flex gap-2 overflow-x-auto" aria-label="Studio sections">
          {SECTIONS.map((item) => (
            <Button key={item.id} variant={section === item.id ? "default" : "outline"} className="min-h-11" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined}>
              {item.label}
            </Button>
          ))}
        </nav>
        <p className="text-sm" role="status" aria-live="polite">
          {status}
        </p>
        <main id="studio-main" className="grid gap-4">
          {section === "identity" ? (
            <IdentityPanel
              project={project}
              onIdentity={(identity) => patchProject((draft) => void (draft.identity = identity))}
              onTheme={(theme) =>
                patchProject((draft) => {
                  const next = THEMES[theme];
                  draft.identity.theme = theme;
                  draft.identity.bpm = next.bpm;
                  draft.identity.rootMidi = next.rootMidi;
                  draft.identity.scale = next.scale;
                  draft.identity.intensity = next.intensity;
                })
              }
            />
          ) : null}
          {section === "catalogue" ? (
            <CataloguePanel
              project={project}
              query={query}
              pack={pack}
              selectedId={selected.id}
              onQuery={setQuery}
              onPack={setPack}
              onSelect={(id) => {
                setSelectedId(id);
                setSection("cue");
              }}
              onToggle={(id, enabled) => patchCue(id, (cue) => void (cue.enabled = enabled))}
              onRename={(id, name) => patchCue(id, (cue) => void (cue.name = name))}
              onRemove={(id) =>
                patchProject((draft) => {
                  draft.cues = draft.cues.filter((cue) => cue.id !== id);
                })
              }
              onPackEnabled={(name, enabled) =>
                patchProject((draft) => {
                  for (const cue of draft.cues) if (cue.pack === name) cue.enabled = enabled;
                })
              }
              onAdd={(name, packName, family) => {
                const template = CATALOGUE.find((item) => item.flavor.family === family) ?? CATALOGUE[0];
                const cue = cueFromDefinition(template, true);
                cue.id = `custom.${Date.now().toString(36)}`;
                cue.name = name;
                cue.pack = packName;
                cue.blurb = `Custom ${family} cue. Same synthesis family as the catalogue, with its own name.`;
                patchProject((draft) => draft.cues.push(cue));
                setSelectedId(cue.id);
              }}
            />
          ) : null}
          {section === "cue" ? (
            <CuePanel
              cue={selected}
              audition={audible}
              importName={importName}
              onParams={(params) => patchCue(selected.id, (cue) => void (cue.params = params))}
              onLayer={(name, layer) =>
                patchCue(selected.id, (cue) => {
                  cue.params.layers = { ...cue.params.layers, [name]: layer };
                })
              }
              onPlay={() => produce(selected, "play")}
              onRender={() => produce(selected, "render")}
              onStop={() => {
                engine().stopAll();
                setStatus("Stopped.");
              }}
              onVariation={() => {
                patchCue(selected.id, (cue) => void (cue.params.variation += 1));
                setStatus(`Variation ${selected.params.variation + 1} will apply on the next render.`);
              }}
              onImport={async (file) => {
                engine().unlock();
                const decoded = await engine().unlock().decodeAudioData((await file.arrayBuffer()).slice(0));
                importBuffer.current = decoded;
                setImportName(file.name);
                setStatus(`Imported ${file.name} for this session only. It is not part of the synth and it is not saved in the project.`);
              }}
              onPlayImport={() => {
                if (!importBuffer.current) return;
                engine().playAudioBuffer("theme.import", importBuffer.current);
                setStatus("Playing the imported file.");
              }}
            />
          ) : null}
          {section === "countup" ? (
            <CountPanel
              project={project}
              selectedId={selected.id}
              audition={countAudition}
              onSelect={setSelectedId}
              onParams={(id, params) => patchCue(id, (cue) => void (cue.params = params))}
              onLayer={(id, name, layer) =>
                patchCue(id, (cue) => {
                  cue.params.layers = { ...cue.params.layers, [name]: layer };
                })
              }
              onPlay={(cue) => {
                setSelectedId(cue.id);
                produce(cue, "play");
              }}
              onRender={(cue) => {
                setSelectedId(cue.id);
                produce(cue, "render");
              }}
              onStop={() => {
                engine().stopAll();
                setStatus("Stopped.");
              }}
              onVariation={(cue) => patchCue(cue.id, (item) => void (item.params.variation += 1))}
              onSkip={(cue) => {
                const eng = engine();
                eng.unlock();
                const ready = view(cue);
                if (ready?.mix?.sting) {
                  const cut = eng.skipCount();
                  if (!cut) eng.playNow(`${cue.id}-skip`, ready.mix.sting, false, "sfx");
                  setStatus(cut ? "Count cut. Award sting started." : "Playing the award sting.");
                  return;
                }
                setStatus("Play the count, then Skip cuts it. Render first if you have not.");
              }}
            />
          ) : null}
          {section === "music" ? (
            <MusicPanel
              project={project}
              selectedId={selected.id}
              audition={musicAudition}
              onSelect={setSelectedId}
              onParams={(id, params) => patchCue(id, (cue) => void (cue.params = params))}
              onLayer={(id, name, layer) =>
                patchCue(id, (cue) => {
                  cue.params.layers = { ...cue.params.layers, [name]: layer };
                })
              }
              onPlay={(cue) => {
                setSelectedId(cue.id);
                produce(cue, "play");
              }}
              onRender={(cue) => {
                setSelectedId(cue.id);
                produce(cue, "render");
              }}
              onStop={() => {
                engine().stopAll();
                setStatus("Stopped.");
              }}
              onVariation={(cue) => patchCue(cue.id, (item) => void (item.params.variation += 1))}
            />
          ) : null}
          {section === "scenario" ? (
            <ScenarioPanel
              project={project}
              scenarioId={scenarioId}
              stake={stake}
              win={win}
              multiplier={multiplier}
              log={log}
              onScenario={setScenarioId}
              onStake={setStake}
              onWin={setWin}
              onCount={(id) => setSelectedId(id)}
              countId={selected.id.startsWith("countup.") ? selected.id : "countup.classic"}
              onPlay={() => {
                const countId = selected.id.startsWith("countup.") ? selected.id : "countup.classic";
                const countCue = project.cues.find((cue) => cue.id === countId);
                const script = buildScenario(scenarioId, {
                  multiplier,
                  countSeconds: (countCue?.params.duration || 4) + 3.2,
                  countCueId: countId,
                });
                const eng = engine();
                eng.unlock();
                eng.stopAll();
                setStatus("Rendering the scenario…");
                setLog([script.note]);
                window.setTimeout(() => {
                  const bus = new VoiceBus();
                  const ctx = eng.unlock();
                  const t0 = ctx.currentTime + 0.12;
                  eng.duckAt(1, t0);
                  const lines = [script.note];
                  for (const step of script.steps) {
                    if ((step.action === "play" || step.action === "loop") && step.cueId) {
                      const cue = project.cues.find((item) => item.id === step.cueId);
                      if (!cue || !cue.enabled) {
                        lines.push(`${step.at.toFixed(2)}s  skipped ${step.cueId} (disabled or missing)`);
                        continue;
                      }
                      if (!cue.implemented || cue.flavor.family === "import") {
                        lines.push(`${step.at.toFixed(2)}s  not synthesized: ${cue.name}`);
                        continue;
                      }
                      const key = synthKey(project.identity, cue);
                      let buffer = cache.current.get(key);
                      if (!buffer) {
                        buffer = synthesize(project.identity, cue);
                        cache.current.set(key, buffer);
                      }
                      const mix = mixdown(buffer, cue.params.layers, cue.params.gain);
                      const decision = bus.start({
                        id: cue.id,
                        at: step.at,
                        kind: cue.id.startsWith("music.") ? "music" : cue.flavor.family === "countup" ? "count" : cue.kind === "loop" ? "loop" : "oneshot",
                        priority: cue.priority,
                        duration: Math.max(cue.flavor.seconds || 1, 1),
                      });
                      if (!decision.ok || !mix) {
                        lines.push(`${step.at.toFixed(2)}s  blocked ${cue.name}${decision.reason ? `: ${decision.reason}` : ""}`);
                        continue;
                      }
                      for (const stopped of decision.stopped) eng.stopAt(stopped, t0 + step.at);
                      if (cue.flavor.family === "countup" && mix.sting) eng.armCount(cue.id, mix.mix, mix.sting, t0 + step.at);
                      else eng.startAt(cue.id, mix.mix, t0 + step.at, { loop: step.action === "loop" || cue.kind === "loop", bus: cue.flavor.family === "music" ? "music" : "sfx" });
                      lines.push(`${step.at.toFixed(2)}s  ${step.action === "loop" ? "loop" : "play"} ${cue.name} · ${kindLabel(cue.kind)}`);
                    } else if (step.action === "stop" && step.cueId) {
                      bus.stop(step.cueId);
                      eng.stopAt(step.cueId, t0 + step.at);
                      lines.push(`${step.at.toFixed(2)}s  stop ${step.cueId}`);
                    } else if (step.action === "duck") {
                      eng.duckAt(step.duck ?? 0.35, t0 + step.at);
                      lines.push(`${step.at.toFixed(2)}s  duck music`);
                    } else if (step.action === "unduck") {
                      eng.unduckAt(t0 + step.at);
                      lines.push(`${step.at.toFixed(2)}s  restore music`);
                    } else if (step.action === "skip") {
                      eng.skipAt(t0 + step.at);
                      lines.push(`${step.at.toFixed(2)}s  skip count to award`);
                    }
                  }
                  setLog(lines);
                  setStatus(script.title);
                }, 40);
              }}
            />
          ) : null}
          {section === "export" ? (
            <ExportPanel
              project={project}
              audition={audible}
              batch={batch}
              onDownloadMix={() => {
                if (!audible?.mix) {
                  setStatus("Render a cue before downloading it.");
                  return;
                }
                downloadBytes(`${safeName(selected.id)}.wav`, encodeWavPcm16(audible.mix.mix), "audio/wav");
              }}
              onDownloadStems={() => {
                if (!audible?.mix) return;
                const files: Record<string, Uint8Array> = {};
                for (const [name, stem] of Object.entries(audible.mix.printed)) files[`${safeName(name)}.wav`] = encodeWavPcm16(stem);
                if (!Object.keys(files).length) {
                  setStatus("This cue has no printed stems.");
                  return;
                }
                downloadBytes(`${safeName(selected.id)}-stems.zip`, zipFiles(files), "application/zip");
              }}
              onDownloadProject={() => downloadBytes(`${safeName(project.name)}.json`, new TextEncoder().encode(JSON.stringify(project, null, 2)), "application/json")}
              onUpload={(text) => {
                const parsed = parseProject(text);
                cache.current.clear();
                setShown({});
                setProject(parsed.project);
                setWarning(parsed.warning ?? `Loaded “${parsed.project.name}”.`);
              }}
              onBatch={() => {
                cancelBatch.current = false;
                const cues = project.cues.filter((cue) => cue.enabled && cue.implemented && cue.flavor.family !== "import");
                setBatch(`0 / ${cues.length}`);
                void (async () => {
                  const files: Record<string, Uint8Array> = {};
                  const manifest: unknown[] = [];
                  const recipes: Record<string, unknown> = {};
                  for (let index = 0; index < cues.length; index++) {
                    if (cancelBatch.current) {
                      setBatch(null);
                      setStatus("Batch cancelled.");
                      return;
                    }
                    const cue = cues[index];
                    setBatch(`${index + 1} / ${cues.length} · ${cue.name}`);
                    await new Promise((resolve) => window.setTimeout(resolve, 0));
                    const buffer = synthesize(project.identity, cue);
                    const mix = mixdown(buffer, cue.params.layers, cue.params.gain);
                    if (!mix) {
                      manifest.push({ id: cue.id, status: "empty" });
                      continue;
                    }
                    const filename = `cues/${safeName(cue.id)}.wav`;
                    files[filename] = encodeWavPcm16(mix.mix);
                    if (cue.flavor.family === "countup" || cue.flavor.family === "music" || cue.flavor.family === "countup-finish") {
                      for (const [name, stem] of Object.entries(mix.printed)) files[`stems/${safeName(cue.id)}/${safeName(name)}.wav`] = encodeWavPcm16(stem);
                    }
                    manifest.push({
                      id: cue.id,
                      name: cue.name,
                      pack: cue.pack,
                      kind: cue.kind,
                      file: filename,
                      seconds: mix.seconds,
                      loop: mix.loop,
                      peakDbfs: db(mix.peak),
                      rmsDbfs: db(mix.rms),
                      safetyGain: mix.safetyGain,
                    });
                    recipes[cue.id] = buffer.recipe;
                  }
                  files["manifest.json"] = new TextEncoder().encode(JSON.stringify({ project: project.name, sampleRate: 44100, cues: manifest }, null, 2));
                  files["recipes.json"] = new TextEncoder().encode(JSON.stringify(recipes, null, 2));
                  files["project.json"] = new TextEncoder().encode(JSON.stringify(project, null, 2));
                  downloadBytes(`${safeName(project.name)}-cues.zip`, zipFiles(files), "application/zip");
                  setBatch(null);
                  setStatus(`Exported ${manifest.length} cues. Disabled, imported, and unimplemented cues were left out.`);
                })();
              }}
              onCancelBatch={() => {
                cancelBatch.current = true;
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function IdentityPanel({
  project,
  onIdentity,
  onTheme,
}: {
  project: Project;
  onIdentity: (identity: Identity) => void;
  onTheme: (theme: ThemeId) => void;
}) {
  const identity = project.identity;
  const note = NOTE_NAMES[((identity.rootMidi % 12) + 12) % 12];
  const octave = Math.floor(identity.rootMidi / 12) - 1;
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="font-serif text-2xl">Sound identity</h2>
        <p className="text-sm text-muted-foreground">
          Tempo, key and seed are shared. Bonus, high-intensity and summary beds derive from this instead of starting over. Seed {identity.seed} reproduces the same render.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(THEMES) as ThemeId[]).map((theme) => (
          <button
            key={theme}
            type="button"
            onClick={() => onTheme(theme)}
            aria-pressed={identity.theme === theme}
            className={`rounded-md border px-3 py-3 text-left ${identity.theme === theme ? "border-primary bg-secondary" : "border-border"}`}
          >
            <span className="block font-serif text-lg">{THEMES[theme].label}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{THEMES[theme].note}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tempo" hint="Base tempo. Bonus and the other beds scale it." min={70} max={180} step={1} value={identity.bpm} display={`${Math.round(identity.bpm)} bpm`} onChange={(bpm) => onIdentity({ ...identity, bpm })} />
        <Field label="Intensity" min={0} max={1} step={0.01} value={identity.intensity} display={identity.intensity.toFixed(2)} onChange={(intensity) => onIdentity({ ...identity, intensity })} />
        <div className="grid gap-2">
          <Label>Root</Label>
          <div className="flex gap-2">
            <Select value={note} onValueChange={(next) => onIdentity({ ...identity, rootMidi: nameToMidi(next, octave) })}>
              <SelectTrigger className="min-h-11 w-full" aria-label="Root note">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(octave)} onValueChange={(next) => onIdentity({ ...identity, rootMidi: nameToMidi(note, Number(next)) })}>
              <SelectTrigger className="min-h-11 w-28" aria-label="Octave">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    Octave {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Melody sits an octave above {midiToName(identity.rootMidi)}. Bass sits two octaves below.</p>
        </div>
        <div className="grid gap-2">
          <Label>Scale</Label>
          <Select value={identity.scale} onValueChange={(scale) => onIdentity({ ...identity, scale: scale as ScaleName })}>
            <SelectTrigger className="min-h-11 w-full" aria-label="Scale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SCALE_LABEL) as ScaleName[]).map((scale) => (
                <SelectItem key={scale} value={scale}>
                  {SCALE_LABEL[scale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Melody and chord tones snap to the scale. Bass root motion stays on the written plan, including the bVI from Hollow Orchard.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="seed">Seed</Label>
          <div className="flex gap-2">
            <Input
              id="seed"
              inputMode="numeric"
              value={identity.seed}
              onChange={(event) => onIdentity({ ...identity, seed: Math.max(1, Math.round(Number(event.target.value) || 1)) })}
            />
            <Button className="min-h-11" variant="outline" onClick={() => onIdentity({ ...identity, seed: Math.floor(Math.random() * 1_000_000) + 1 })}>
              New seed
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CataloguePanel(props: {
  project: Project;
  query: string;
  pack: string;
  selectedId: string;
  onQuery: (value: string) => void;
  onPack: (value: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onPackEnabled: (pack: string, enabled: boolean) => void;
  onAdd: (name: string, pack: string, family: Family) => void;
}) {
  const [addName, setAddName] = useState("Custom tick");
  const [addPack, setAddPack] = useState("Custom");
  const [addFamily, setAddFamily] = useState<Family>("tick");
  const packs = ["All", ...PACKS, ...props.project.cues.filter((cue) => cue.custom).map((cue) => cue.pack)];
  const uniquePacks = [...new Set(packs)];
  const visible = props.project.cues.filter((cue) => {
    const hay = `${cue.name} ${cue.id} ${cue.pack} ${cue.blurb}`.toLowerCase();
    if (props.pack !== "All" && cue.pack !== props.pack) return false;
    return hay.includes(props.query.trim().toLowerCase());
  });
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Event catalogue</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A modular inventory. Cues in a family share a synthesis recipe and differ by register, pace and layer balance. This is not a claim that every mechanic has its own recorded asset. Turn off anything a game does not need.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="min-h-11">Add cue</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a cue</DialogTitle>
              <DialogDescription>Pick a recipe family. The new cue can be renamed or removed. Built-in cues stay in the catalogue.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" value={addName} onChange={(event) => setAddName(event.target.value)} />
              <Label htmlFor="add-pack">Pack</Label>
              <Input id="add-pack" value={addPack} onChange={(event) => setAddPack(event.target.value)} />
              <Label>Family</Label>
              <Select value={addFamily} onValueChange={(value) => setAddFamily(value as Family)}>
                <SelectTrigger className="min-h-11 w-full" aria-label="Recipe family">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE.map((family) => (
                    <SelectItem key={family} value={family}>
                      {family}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="min-h-11"
                onClick={() => props.onAdd(addName.trim() || "Custom cue", addPack.trim() || "Custom", addFamily)}
              >
                Add to catalogue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Search cues" aria-label="Search cues" />
        <Select value={props.pack} onValueChange={props.onPack}>
          <SelectTrigger className="min-h-11 sm:w-56" aria-label="Pack">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {uniquePacks.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {props.pack !== "All" ? (
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => props.onPackEnabled(props.pack, true)}>
            Enable pack
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => props.onPackEnabled(props.pack, false)}>
            Disable pack
          </Button>
        </div>
      ) : null}
      <ul className="grid max-h-[36rem] gap-2 overflow-y-auto">
        {visible.length === 0 ? <li className="text-sm text-muted-foreground">No cues match that search.</li> : null}
        {visible.map((cue) => (
          <li key={cue.id} className={`grid gap-2 rounded-md border px-3 py-2 ${cue.id === props.selectedId ? "border-primary" : "border-border"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="min-h-11 text-left font-medium" onClick={() => props.onSelect(cue.id)}>
                {cue.name}
              </button>
              <KindBadge kind={cue.kind} />
              <Badge variant="outline">{cue.pack}</Badge>
              {!cue.implemented ? <Badge variant="destructive">Not implemented</Badge> : null}
              {cue.custom ? <Badge variant="secondary">Custom</Badge> : null}
              <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
                <Switch checked={cue.enabled} onCheckedChange={(enabled) => props.onToggle(cue.id, enabled)} aria-label={`Enable ${cue.name}`} />
                On
              </label>
            </div>
            <p className="text-sm text-muted-foreground">{cue.blurb}</p>
            <div className="flex flex-wrap gap-2">
              <Input aria-label={`Rename ${cue.name}`} value={cue.name} onChange={(event) => props.onRename(cue.id, event.target.value)} className="max-w-xs" />
              {cue.custom ? (
                <Button variant="outline" className="min-h-11" onClick={() => props.onRemove(cue.id)}>
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CuePanel({
  cue,
  audition,
  importName,
  onParams,
  onLayer,
  onPlay,
  onRender,
  onStop,
  onVariation,
  onImport,
  onPlayImport,
}: {
  cue: Cue;
  audition: Audition | null;
  importName: string | null;
  onParams: (params: CueParams) => void;
  onLayer: (name: string, layer: LayerState) => void;
  onPlay: () => void;
  onRender: () => void;
  onStop: () => void;
  onVariation: () => void;
  onImport: (file: File) => void;
  onPlayImport: () => void;
}) {
  const stems = audition?.buffer.stems ? Object.keys(audition.buffer.stems) : [];
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-2xl">{cue.name}</h2>
        <KindBadge kind={cue.kind} />
        <Badge variant="outline">{cue.priority}</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{cue.blurb}</p>
      {!cue.implemented ? (
        <p className="rounded-md border border-destructive px-3 py-2 text-sm" role="status">
          Not implemented. Generate and Play will not invent a voice performance or report success.
        </p>
      ) : null}
      {cue.flavor.family === "import" ? (
        <div className="grid gap-2">
          <Label htmlFor="import-audio">Session import</Label>
          <Input
            id="import-audio"
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
            }}
          />
          <Button className="min-h-11 w-fit" disabled={!importName} onClick={onPlayImport}>
            Play import{importName ? `: ${importName}` : ""}
          </Button>
        </div>
      ) : (
        <>
          <Transport onPlay={onPlay} onRender={onRender} onStop={onStop} onVariation={cue.implemented ? onVariation : undefined} />
          <p className="text-xs text-muted-foreground">Pitch, brightness, decay, body and space apply on the next Play or Render. Layer mute, solo and gain remix the render already in memory.</p>
          <CueFields cue={cue} onParams={onParams} />
          <Waveform stereo={audition?.mix?.mix ?? null} />
          <Meters mix={audition?.mix ?? null} />
          <LayerMixer names={stems} layers={cue.params.layers} onChange={onLayer} />
        </>
      )}
    </section>
  );
}

function CueFields({ cue, onParams }: { cue: Cue; onParams: (params: CueParams) => void }) {
  const params = cue.params;
  const set = (partial: Partial<CueParams>) => onParams({ ...params, ...partial });
  const family = cue.flavor.family;
  if (family === "countup") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Active duration" min={0.25} max={16} step={0.05} value={params.duration || 4.5} display={`${(params.duration || 4.5).toFixed(2)} s`} onChange={(duration) => set({ duration })} />
        <Field label="Rate start" min={4} max={36} step={0.5} value={params.rateStart} display={`${params.rateStart.toFixed(1)} Hz`} onChange={(rateStart) => set({ rateStart })} />
        <Field label="Rate end" min={4} max={36} step={0.5} value={params.rateEnd} display={`${params.rateEnd.toFixed(1)} Hz`} onChange={(rateEnd) => set({ rateEnd })} />
        <Field label="Body" hint="Centered 76–98 Hz thumps and their 2nd/3rd harmonics." min={0} max={2} step={0.01} value={params.body} display={params.body.toFixed(2)} onChange={(body) => set({ body })} />
        <Field label="Brightness" min={0.25} max={1.6} step={0.01} value={params.brightness} display={params.brightness.toFixed(2)} onChange={(brightness) => set({ brightness })} />
        <Field label="Space" hint="Filtered wet return. Low end stays out of it." min={0} max={2} step={0.01} value={params.space} display={params.space.toFixed(2)} onChange={(space) => set({ space })} />
        <Field label="Decay" min={0.35} max={2.4} step={0.01} value={params.decay} display={params.decay.toFixed(2)} onChange={(decay) => set({ decay })} />
        <Field label="Pitch" min={-12} max={12} step={1} value={params.transpose} display={`${params.transpose} st`} onChange={(transpose) => set({ transpose })} />
        <Field label="Cue gain" min={0} max={1.6} step={0.01} value={params.gain} display={params.gain.toFixed(2)} onChange={(gain) => set({ gain })} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={params.award} onCheckedChange={(award) => set({ award })} />
          Final award
        </label>
      </div>
    );
  }
  if (family === "music") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bars" min={2} max={8} step={1} value={params.bars} display={`${params.bars} bars`} onChange={(bars) => set({ bars })} />
        <Field label="Tempo scale" min={0.75} max={1.35} step={0.01} value={params.tempoScale} display={params.tempoScale.toFixed(2)} onChange={(tempoScale) => set({ tempoScale })} />
        <Field label="Body" min={0} max={2} step={0.01} value={params.body} display={params.body.toFixed(2)} onChange={(body) => set({ body })} />
        <Field label="Brightness" min={0.25} max={1.6} step={0.01} value={params.brightness} display={params.brightness.toFixed(2)} onChange={(brightness) => set({ brightness })} />
        <Field label="Space" min={0} max={2} step={0.01} value={params.space} display={params.space.toFixed(2)} onChange={(space) => set({ space })} />
        <Field label="Decay" min={0.4} max={2.2} step={0.01} value={params.decay} display={params.decay.toFixed(2)} onChange={(decay) => set({ decay })} />
        <Field label="Cue gain" min={0} max={1.6} step={0.01} value={params.gain} display={params.gain.toFixed(2)} onChange={(gain) => set({ gain })} />
      </div>
    );
  }
  const showRate = family === "motion" || family === "riser";
  const showDuration = family === "motion" || family === "riser" || family === "whoosh" || family === "tension";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showDuration ? <Field label="Duration" min={0.2} max={6} step={0.05} value={params.duration || cue.flavor.seconds} display={`${(params.duration || cue.flavor.seconds).toFixed(2)} s`} onChange={(duration) => set({ duration })} /> : null}
      {showRate ? <Field label="Rate" min={0.5} max={2} step={0.01} value={params.rate} display={params.rate.toFixed(2)} onChange={(rate) => set({ rate })} /> : null}
      <Field label="Brightness" min={0.25} max={1.6} step={0.01} value={params.brightness} display={params.brightness.toFixed(2)} onChange={(brightness) => set({ brightness })} />
      <Field label="Decay" min={0.35} max={2.2} step={0.01} value={params.decay} display={params.decay.toFixed(2)} onChange={(decay) => set({ decay })} />
      <Field label="Body" min={0} max={2} step={0.01} value={params.body} display={params.body.toFixed(2)} onChange={(body) => set({ body })} />
      <Field label="Space" min={0} max={2} step={0.01} value={params.space} display={params.space.toFixed(2)} onChange={(space) => set({ space })} />
      <Field label="Pitch" min={-12} max={12} step={1} value={params.transpose} display={`${params.transpose} st`} onChange={(transpose) => set({ transpose })} />
      <Field label="Cue gain" min={0} max={1.6} step={0.01} value={params.gain} display={params.gain.toFixed(2)} onChange={(gain) => set({ gain })} />
    </div>
  );
}

function CountPanel({
  project,
  selectedId,
  audition,
  onSelect,
  onParams,
  onLayer,
  onPlay,
  onRender,
  onStop,
  onVariation,
  onSkip,
}: {
  project: Project;
  selectedId: string;
  audition: Audition | null;
  onSelect: (id: string) => void;
  onParams: (id: string, params: CueParams) => void;
  onLayer: (id: string, name: string, layer: LayerState) => void;
  onPlay: (cue: Cue) => void;
  onRender: (cue: Cue) => void;
  onStop: () => void;
  onVariation: (cue: Cue) => void;
  onSkip: (cue: Cue) => void;
}) {
  const ids = ["countup.classic", "countup.tiers", "countup.harmonic"];
  const cue = project.cues.find((item) => item.id === (ids.includes(selectedId) ? selectedId : "countup.classic"))!;
  const current = audition?.cueId === cue.id ? audition : null;
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="font-serif text-2xl">Count-up</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Sequence, not a loop. A, B and C follow the approval-demo arrangements: accelerating coins, held FM tiers, or harmonic swells. Body stays centered. Skip cuts the roll and starts the award at once.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {ids.map((id) => {
          const item = project.cues.find((cueItem) => cueItem.id === id)!;
          return (
            <button key={id} type="button" aria-pressed={cue.id === id} onClick={() => onSelect(id)} className={`rounded-md border px-3 py-3 text-left ${cue.id === id ? "border-primary bg-secondary" : "border-border"}`}>
              <span className="font-serif text-lg">{item.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.blurb}</span>
            </button>
          );
        })}
      </div>
      <Transport
        onPlay={() => onPlay(cue)}
        onRender={() => onRender(cue)}
        onStop={onStop}
        onVariation={() => onVariation(cue)}
        extra={
          <Button className="min-h-11" variant="secondary" onClick={() => onSkip(cue)}>
            Skip to total
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground">Duration, rate and timbre apply on the next Play or Render. Skip cuts a running count, or plays the award sting if the count is not running.</p>
      <CueFields cue={cue} onParams={(params) => onParams(cue.id, params)} />
      <Waveform stereo={current?.mix?.mix ?? null} />
      <Meters mix={current?.mix ?? null} />
      <LayerMixer
        names={current ? Object.keys(current.buffer.stems) : ["dry-counter", "body", "support", "space", "award"]}
        layers={cue.params.layers}
        onChange={(name, layer) => onLayer(cue.id, name, layer)}
      />
    </section>
  );
}

function MusicPanel(props: {
  project: Project;
  selectedId: string;
  audition: Audition | null;
  onSelect: (id: string) => void;
  onParams: (id: string, params: CueParams) => void;
  onLayer: (id: string, name: string, layer: LayerState) => void;
  onPlay: (cue: Cue) => void;
  onRender: (cue: Cue) => void;
  onStop: () => void;
  onVariation: (cue: Cue) => void;
}) {
  const ids = ["music.base", "music.bonus", "music.high", "music.bigwin", "music.summary"];
  const cue = props.project.cues.find((item) => item.id === (ids.includes(props.selectedId) ? props.selectedId : "music.base"))!;
  const current = props.audition?.cueId === cue.id ? props.audition : null;
  const tempo = Math.round(props.project.identity.bpm * ({ base: 1, bonus: 1.08, high: 1.14, bigwin: 0.94, summary: 0.88 }[cue.music ?? "base"]) * cue.params.tempoScale);
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="font-serif text-2xl">Music beds</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Loops. Tails wrap, so the end is the same signal as the start. These are not one-shots and they are not a generative model. Effective tempo for this bed is about {tempo} bpm in {midiToName(props.project.identity.rootMidi)} {SCALE_LABEL[props.project.identity.scale]}.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {ids.map((id) => {
          const item = props.project.cues.find((cueItem) => cueItem.id === id)!;
          return (
            <button key={id} type="button" aria-pressed={cue.id === id} onClick={() => props.onSelect(id)} className={`rounded-md border px-3 py-3 text-left ${cue.id === id ? "border-primary bg-secondary" : "border-border"}`}>
              <span className="flex items-center gap-2 font-serif text-lg">
                {item.name} <KindBadge kind="loop" />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.blurb}</span>
            </button>
          );
        })}
      </div>
      <Transport onPlay={() => props.onPlay(cue)} onRender={() => props.onRender(cue)} onStop={props.onStop} onVariation={() => props.onVariation(cue)} />
      <CueFields cue={cue} onParams={(params) => props.onParams(cue.id, params)} />
      <Waveform stereo={current?.mix?.mix ?? null} />
      <Meters mix={current?.mix ?? null} />
      <LayerMixer names={current ? Object.keys(current.buffer.stems) : ["melody", "reply", "bass", "harmony", "percussion", "texture"]} layers={cue.params.layers} onChange={(name, layer) => props.onLayer(cue.id, name, layer)} />
    </section>
  );
}

function ScenarioPanel(props: {
  project: Project;
  scenarioId: ScenarioId;
  stake: number;
  win: number;
  multiplier: number;
  countId: string;
  log: string[];
  onScenario: (id: ScenarioId) => void;
  onStake: (value: number) => void;
  onWin: (value: number) => void;
  onCount: (id: string) => void;
  onPlay: () => void;
}) {
  const script = buildScenario(props.scenarioId, {
    multiplier: props.multiplier,
    countSeconds: 4,
    countCueId: props.countId,
  });
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="font-serif text-2xl">Scenario player</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Plays a short game beat so you can hear priority: motion loops stop before the brake, music ducks under a count, and a second fanfare waits. Wins at or below stake stay on the payment notice.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Scenario</Label>
          <Select value={props.scenarioId} onValueChange={(value) => props.onScenario(value as ScenarioId)}>
            <SelectTrigger className="min-h-11 w-full" aria-label="Scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENARIOS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Count-up used</Label>
          <Select value={props.countId} onValueChange={props.onCount}>
            <SelectTrigger className="min-h-11 w-full" aria-label="Count-up preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["countup.classic", "countup.tiers", "countup.harmonic"].map((id) => (
                <SelectItem key={id} value={id}>
                  {props.project.cues.find((cue) => cue.id === id)?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field label="Stake" min={0.2} max={100} step={0.2} value={props.stake} display={props.stake.toFixed(2)} onChange={props.onStake} />
        <Field label="Win" min={0} max={500} step={0.5} value={props.win} display={`${props.win.toFixed(2)} · ${props.multiplier.toFixed(2)}×`} onChange={props.onWin} />
      </div>
      <p className="text-sm">{script.note}</p>
      <Button className="min-h-11 w-fit" onClick={props.onPlay}>
        Play scenario
      </Button>
      <ol className="grid gap-1 font-mono text-xs">
        {script.steps.map((step, index) => (
          <li key={`${step.at}-${step.action}-${index}`}>
            {step.at.toFixed(2)}s {step.action} {step.cueId ?? ""}
          </li>
        ))}
      </ol>
      {props.log.length ? (
        <div>
          <h3 className="font-serif text-lg">Last run</h3>
          <ul className="mt-2 grid gap-1 text-sm">
            {props.log.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ExportPanel(props: {
  project: Project;
  audition: Audition | null;
  batch: string | null;
  onDownloadMix: () => void;
  onDownloadStems: () => void;
  onDownloadProject: () => void;
  onUpload: (text: string) => void;
  onBatch: () => void;
  onCancelBatch: () => void;
}) {
  const enabled = props.project.cues.filter((cue) => cue.enabled).length;
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="font-serif text-2xl">Save and export</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The project is stored in this browser. WAV files are stereo 44.1 kHz PCM. Stems are included for count-ups and music, summed with the printed fader and the same safety gain as the mix. Loops export as the periodic buffer, not a faded one-shot.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={props.onDownloadMix} disabled={!props.audition?.mix}>
          Download WAV
        </Button>
        <Button className="min-h-11" variant="secondary" onClick={props.onDownloadStems} disabled={!props.audition?.mix}>
          Download stems
        </Button>
        <Button className="min-h-11" variant="outline" onClick={props.onDownloadProject}>
          Download project JSON
        </Button>
        <Label className="flex min-h-11 cursor-pointer items-center rounded-md border border-border px-4 text-sm">
          Load project JSON
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              props.onUpload(await file.text());
            }}
          />
        </Label>
      </div>
      <div className="grid gap-2">
        <Button className="min-h-11 w-fit" onClick={props.onBatch} disabled={Boolean(props.batch)}>
          {props.batch ? props.batch : `Export ${enabled} enabled cues as ZIP`}
        </Button>
        {props.batch ? (
          <Button className="min-h-11 w-fit" variant="outline" onClick={props.onCancelBatch}>
            Cancel batch
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Batch skips disabled cues, the character-voice placeholder, and the import slot. Music beds use the bar length currently set on each bed, so an eight-bar export takes a moment and makes a large zip.
        </p>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">
        <h3 className="font-serif text-lg text-foreground">Limits of this version</h3>
        <ul className="grid list-disc gap-1 pl-5">
          <li>Renders have not been signed off by ear. Meters are sample-peak and RMS, not a listening report.</li>
          <li>Seeds match inside this engine. They do not recreate the NumPy reference WAVs bit for bit.</li>
          <li>Character voice and performed lines are not implemented. There is no network generator and no billing.</li>
          <li>Count-ups are sequences. Only music, reel motion, wheel ticks and a few beds are actual loops.</li>
          <li>Audio stops if the page is hidden, including on a phone. The first play has to be a tap.</li>
        </ul>
      </div>
    </section>
  );
}
