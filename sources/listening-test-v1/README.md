# Hollow Orchard — listening test v1

Initial musical hypothesis, not an approved final style. Original custom-synthesized playful-dark electronic / organic hybrid. No paid services, samples, installs, models, or user-PC access.

## Listen
- `base_game_loop.wav` / `.mp3`: 8 bars, 17.142857 seconds.
- `bonus_loop.wav` / `.mp3`: matching 8 bars, 17.142857 seconds; denser percussion and upper mallet countermelody.
- `win_sting.wav` / `.mp3`: 4 seconds; shared motif, D-major/add9 lift at resolution.

Stereo 44.1 kHz PCM16 masters; MP3 192 kbps for convenient review. Use WAV, not MP3, for sample-accurate looping. 112 BPM, 4/4, D minor with Dorian B-natural. Two-bar syncopated calls and replies develop across Dm(add9), Bbmaj7, G6/D, Am7 and Dm6/9. Woody resonator mallets, rubbery harmonic plucks, warm centered bass, soft chord bed, dusty stereo air, restrained kick/rim/hats. Bonus adds syncopated kicks, eighth-note hats, end-of-phrase rim details and high responses.

## Reuse
`stems/base_game_loop/` and `stems/bonus_loop/` each contain six aligned WAVs: mallets, pluck, bass, harmony, drums, texture. `stems/win_sting/` contains five (no texture). All share the master gain and start/time alignment. Sum with unity gains and no normalization. PCM16 per-file rounding causes a very small residual, measured in the report. Bass and kick are center-panned; stereo effects are additive, not polarity widening.

`render.py` is the standalone reproducible synthesis/composition pipeline; `recipe.json` records tempo, harmonic plan, patches and seed. Dependencies: Python, NumPy, SciPy, and ffmpeg for MP3. Run `python3 render.py` in this folder to regenerate.

## Validation / limitations
`quality-report.json` contains exact per-asset sample peak, estimated true peak (4x polyphase oversampling, not a certified meter), RMS, DC, frame count, clipping/nonfinite counts and stem summation error. Common gain retains headroom across both loops, with the highest estimated true peak targeted at -2 dBTP. No limiter or loudness maximizer.

Loop tails are wrapped at event insertion, and room/delays use circular taps. Texture is periodic by construction; loop DC is removed. There is no master endpoint fade on either loop. Boundary jumps and 20 ms seam derivative RMS are compared with within-loop adjacent differences. The energy rises just after the wrap because the next downbeat starts there; this is intentional rhythmic onset, not a fade or a requirement for equal short-window RMS. Sting is a one-shot with a final 150 ms tail taper, not a loop. Compressed copies are not loop masters.

Audio was NOT audibly auditioned. Technical checks do not establish musical taste, perceived timbral quality, mono compatibility by ear, or final mix approval. These are listening-test sketches for Kris's verdict before any app/engine work. No app or repository work performed.
