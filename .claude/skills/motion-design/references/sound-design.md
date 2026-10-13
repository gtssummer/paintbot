# Sound design

Sound is half the film and it comes first: the beat grid decides where cuts and hits go. Picture and sound read the
same `film.json`, so if a cue moves, both move.

## film.json audio fields
```json
{
  "bpm": 120, "offset": 0, "beatsPerBar": 4,
  "music": { "source": "synth", "style": "pulse", "key": "A", "scale": "minor", "seed": 1,
             "drop": "bar:4", "energy": [["bar:0", 0.5], ["bar:2", 0.8], ["bar:4", 1.0], ["bar:7", 0.6]], "mix": -3 },
  "voice": { "path": "audio/vo.wav", "start": 0.5, "gain": 0, "duck": 8 },
  "cues": [
    { "id": "hook",  "t": "beat:0",   "sfx": "impact", "gain": -3 },
    { "id": "title", "t": "beat:1",   "sfx": "whoosh", "gain": -8 },
    { "id": "typing","t": "bar:1",    "sfx": "type",   "gain": -12, "repeat": 9, "every": 0.09 },
    { "id": "drop",  "t": "bar:4",    "sfx": "boom",   "gain": -4 },
    { "id": "logo",  "t": "bar:6",    "sfx": "chime",  "gain": -10 }
  ]
}
```
- A cue without `sfx` is a pure timing marker for the picture (`ctx.cue('id')`).
- Every SFX is placed so its **measured peak** (not the file start) lands on the cue time. A `riser` ends on its cue;
  a `whoosh` peaks on it (so put it on the transition's midpoint).
- `energy` is a step curve (0–1) that drives arrangement density; `drop` adds a riser into it and a boom on it, and
  silences the beat before it (the breath before the drop).
- Music styles: `pulse` (modern electronic, launches/tech/UI), `soft` (warm, explainers/lifestyle), `cinematic`
  (drones, toms, swells — trailers/reveals), `none`. Keys: any (`"C#"`, `"F"`); scales: `minor`, `major`, `dorian`.
- `python3 tools/audio.py list` prints every SFX with when to use it; `audio.py sfx whoosh --pitch 3` writes one to
  `out/` to audition (listen if you can; otherwise trust the table and the spectrogram:
  `ffmpeg -i out/audio.wav -lavfi showspectrumpic=s=1200x400 out/spec.png`).

## SFX palette — what goes with what
| Visual event | SFX |
|---|---|
| Hook / title slam / logo land | `impact` (big), `hit` (punchy), `sub` under it for weight |
| Scene transition, camera whip | `whoosh` (peak on the midpoint), `swish` for small moves, `swipe` for UI wipes |
| Build into a reveal | `riser` ending on the reveal (1–4 s) |
| Drop / colour flood / big reveal | `boom` |
| Cursor click, toggle, button | `click` (land it on the beat; the press starts ~3 frames earlier) |
| Counters rolling, small snaps | `tick` (repeat with `every`) |
| Icons/stickers appearing | `pop` (vary `pitch` per item: 0, 2, 4, 7 for a rising run) |
| Notifications, success | `ding`, `chime` |
| Typing | `type` with `repeat`/`every` (0.07–0.12 s) |
| Glitch cuts, errors | `glitch` |
| Sparkle, premium moment | `shimmer` |
| Object lands on a surface | `thud` |
| Screenshot, capture | `shutter` |
Keep SFX under the music: −6 to −12 dB for most, −3 dB for the hook/drop hits. Fewer, better sounds: not every
move needs one; every *important* move does.

## Supplied tracks
1. Use only music the user owns or that is licensed for the use (e.g. free-for-commercial libraries); note the
   license in `docs/brief.md`. Never use copyrighted songs without permission.
2. `python3 tools/audio.py beats audio/track.mp3 --write` → measures BPM, beat grid (calibrated to the kick attacks),
   downbeats, drop, strong hits → `audio/beats.json`, and writes `bpm`, `offset`, `music.source = "file"` into
   `film.json`. Add `--drop-at 8.0` to start the track so its drop lands at film time 8.0 s, `--bpm 128` if you
   know the tempo (or the estimate is half/double), `--start 12.5` to start later in the song.
3. Use `audio/beats.json` `hits` for accents that aren't on the grid (vocal stabs, snare fills).
4. The track is used unchanged (fades only). The film's duration should end on a bar line or the song's natural end.

## Voice-over
Record or generate (TTS) a WAV, put it at `audio/vo.wav`, add the `voice` block. Music ducks under the voice by `duck`
dB. Time the picture to the voice: cue ids at the words that matter. Captions: big, few words, synced per phrase.

## Mix and master
`audio.py build` sums music (−3 dB bus by default), SFX and voice, folds the tail into the start for loops (so the
reverb crosses the seam) or fades the end, then two-pass loudness-normalises with ffmpeg to **−14 LUFS integrated,
true peak ≤ −1 dBTP** (web/social standard) and writes `out/audio.wav` at exactly the film duration. `render.mjs
final/draft` mux it automatically. Check numbers in `out/audio.json` and again in `inspect` (after AAC encoding).
