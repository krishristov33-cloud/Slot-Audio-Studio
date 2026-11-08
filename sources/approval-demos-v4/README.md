# Approval demos v4 — weight, depth and layered sound design

**Three 14.0-second files:** approximately 10.3–10.5 seconds of active count/total presentation, followed by final release and spacious decay to silence. Original designs continuing the three v3 directions; no earlier files modified.

- **A-classic-payout.mp3 / .wav** — rounded layered coin/bell accumulation, new lower coin resonator/body, warm centered group punches, tactile details, early-reflection depth and punctuated bright award cadence. Continuous accelerating classic direction.
- **B-electronic-tiers.mp3 / .wav** — contemporary tactile FM/keyclick roll, new short low-mid modulation body, three deliberate held tiers, tier-lift punches and a larger layered total hit. Drier foreground than A/C, controlled short room behind it.
- **C-harmonic-award.mp3 / .wav** — richer foreground coin/bell count above ascending warm voicings; widening depth grows underneath, new rounded 98 Hz/harmonic body, bright weighty final settle. No drum kit or bassline melody.

Stereo 44.1 kHz PCM16 masters and 192 kbps MP3s. Five aligned stems per preview: `dry-counter`, `body`, `support`, `space`, `award`, in `stems/<demo-name>/`. Sum at unity, no individual normalization. Dry-counter means no dedicated room bus; patches still have their own resonator decay. All new synthesis and source processing is in render.py; recipes.json records seed, structure and spatial parameters.

## What's materially new
Coin lower resonator and restrained subharmonic bell component; short FM/low-mid body; separate saturated mono 76/86/98 Hz group accents with audible 2nd/3rd harmonics; larger composed impact/settle; soft source saturation. No continuous sub pad or separate bass tune. Space uses 27/49/81 ms early reflections, damped diffuse taps after predelay and quiet 167/281 ms echoes. Wet high-pass 390 Hz, low sides high-pass 300 Hz. Final wet decay is longer than count room; foreground remains narrowly centered. Exact room envelope and synthesis recipes included.

## Decoded-output comparison and QC
Actual PCM16 v4 masters and matching existing v3 masters were decoded and measured (not idealized source arrays). Full-file RMS matches v3 at **-19.5762 dBFS** across all three. Because v4 files have longer tails, their first 10.6 seconds measure about **-18.37 dBFS**, ~1.21 dB above v3 full-file RMS; this is disclosed rather than claiming identical active/perceived loudness.

| Measurement | A | B | C |
|---|---:|---:|---:|
| 65–130 Hz mean power vs v3 | +7.76 dB | +7.02 dB | +8.37 dB |
| 150–350 Hz mean power vs v3 | +10.27 dB | +0.67 dB | +3.26 dB |
| Estimated true peak, dBTP | -2.605 | -3.057 | -4.452 |
| Stereo correlation | 0.925 | 0.992 | 0.954 |
| Mono-fold RMS change | -0.169 dB | -0.019 dB | -0.101 dB |
| 65–130 Hz side/mid power | -49.46 dB | -55.46 dB | -47.53 dB |

Bands measured with third-order Butterworth bandpass, reporting mean squared filtered output across channels. These are full-file energy changes, not loudness-unit or listening measurements. Different arrangement/tail duration is part of the comparison. B already had substantial 150–350 Hz energy in v3; v4 adds deeper weight without forcing a giant additional low-mid hump.

All: zero clipped/nonfinite samples; absolute DC below 1.4e-8; first/last samples zero; final 100 ms silent. Max stem reconstruction difference 0.00006104 from independent PCM16 rounding. True peak is a **4x polyphase estimate**, not certified. quality-report.json contains exact peaks, band powers and comparisons.

## Runtime / limitations
These are **one-shot approval previews, not seamless runtime loops**. Accelerating events, tier transitions, evolving swells and awards cannot be reset without audible state changes. A runtime version needs stationary tier cycles, separately triggered lift/total events, persistent or circular wet tails, and phase/gain-safe transitions. No loop-ready claim is made.

**NOT audibly auditioned.** Measurements support increased low-band energy, spatial signal structure and mono safety, not perceived bass quality, authentic counter feel, refinement or final approval. Kris's listening verdict is required. No paid tools, installs, app/build/repository work, user-PC access or outside messages. Stop after these artifacts.
