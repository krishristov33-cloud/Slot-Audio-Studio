# Slot Audio Studio

Browser studio for Grim Hamster Studio. It synthesizes original slot-game music and sound effects in the page. Playback uses Web Audio. Rendering does not call a network, a model, or a paid API.

This is a first playable version of the instrument designs in `sources/`. The reference WAVs there are examples from the earlier listening passes. They are not bit-matched by this engine, and they are not a claim that the sound has been approved by ear.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43117](http://127.0.0.1:43117). The dev server listens on port **43117**.

```bash
npm test
npm run lint
```

No API keys. No database. The project is saved in the browser under `grim-hamster.slot-audio-studio.v1`.

## What you can do

- Set a project identity: theme, tempo, root, scale, intensity, and a reproducible seed.
- Browse the event catalogue. Enable, disable, rename, add, and remove cues. Packs can be switched as a group.
- Render a cue, audition it, change the layers, and render another variation.
- Shape the three count-up sequences (classic roll, electronic tiers, harmonic award): duration, rate curve, body, brightness, space, decay, pitch, final award, and skip-to-total.
- Render seamless base, bonus, high-intensity, big-win, and summary beds with separate stems.
- Run a short scenario: spin, stop, win, count; below-stake notice; turbo; bonus transition; big win; skip.
- Export 44.1 kHz stereo PCM WAV, stems where the cue has them, project JSON, and a ZIP of enabled cues with `manifest.json` and `recipes.json`.

Audio does not start on load. The first play is a tap or keypress. Space plays the selected cue when focus is not in a field. Escape stops everything. Leaving the page or hiding it stops playback.

## How the sound is made

The engine lives in `src/lib/audio` and runs in both the browser and the test runner.

- Count-up voices and the centered body layer follow `sources/approval-demos-v4/render.py`: coin, bell, FM, rattle, warm pad, impact, 76/86/98 Hz saturated body, and the high-passed multi-tap room. Low energy stays in the center. The wet return is filtered.
- Music follows `sources/listening-test-v1/render.py`: wood resonators, rubber replies, centered bass with a little 2nd/3rd harmonic, pad, kick, rim, hat, and band-limited air. Note tails and delays wrap, so a loop is periodic. There is no fade glued across the seam.
- Other catalogue events reuse those voices. A family such as “tick” or “fanfare” is one recipe with its own register and pacing. The catalogue is an inventory, not a stack of bespoke recordings.
- The random generator is a seeded xorshift, not NumPy’s PCG64. The same seed is stable here. It will not recreate the Python WAVs sample for sample.
- Air in the music beds is shaped with biquads rather than the original FFT Gaussian mask.

Count-ups are sequences. Music, reel motion, wheel ticks, loading, lobby, summary, jackpot tease, and big-win sustain are loops. Fanfares are sequences and will not stack: a second fanfare is blocked until the lock releases. A win at or below stake uses the payment notice instead of a count or a fanfare.

The mix is pulled down if the sample peak would pass 0.89. That is a safety ceiling, not a mastering limiter, and the meter is not a certified true-peak meter.

## Tests

`npm test` checks deterministic seeds, finite samples under the ceiling, WAV headers and durations, loop seams, centered count-up body, tiny and longer counts, skip-sting energy at the start of the buffer, material control changes, base versus bonus music, jackpot tease versus award, project JSON recovery, and fanfare / below-stake policy.

The suite also writes:

- `artifacts/countup-a-short.wav`
- `artifacts/countup-a-skip.wav`
- `artifacts/music-base-2bar.wav`
- `artifacts/music-bonus-2bar.wav`
- `artifacts/ui-confirm.wav`
- `artifacts/qc-summary.json`

`qc-summary.json` is numeric. `audiblyAuditioned` is false.

## Limits

- Kris has not signed these renders off by ear in this app.
- Semantic character voice is listed and marked not implemented. Importing a file only plays it for the current session.
- No MP3 export. No streaming. No account.
- Optional outside generators are not wired up and are not a feature of this build.
- Batch export of every enabled cue, especially full music loops, is local and can take a while.
