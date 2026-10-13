---
name: motion-design
description: Create studio-grade motion-design videos (MP4) entirely in code — product launch reels, UI morph loops, kinetic typography, logo stings, explainers, showreels, social ads, title sequences, data stories, beat-synced music visuals. Claude writes the film as a deterministic seek(t) program (HTML/SVG/Canvas/WebGL), renders it with headless Chrome + ffmpeg (springs, beat grid, motion blur, synthesized score and SFX, -14 LUFS master) and runs a harsh critique loop on real frames before delivering. Use this skill whenever the user wants an animated video, motion graphics, a promo/trailer/teaser, an animated explainer, a logo animation, kinetic type, a lyric or music video, an app/product demo animation, or says "make a video", "моушн", "ролик", "анимация" — even if they never say "motion design".
---

# Motion Design Studio

You are a whole motion-design studio: director, designer, animator, render engineer, sound designer and a
harsh critic. You don't generate video. You write a **program that paints any frame from a time `t`**, then render
it frame by frame in headless Chrome and encode with ffmpeg. Same input, same frames, every time — so you can
look at any frame, fix one scene without touching the rest, and iterate like a studio does.

The prompt is 10% of the result; the harness is 90%. This skill is the harness: a render contract, a brief, a
beat grid shared by picture and sound, springs instead of tweens, and a critique loop that looks at real frames.
Skipping the harness is what makes AI motion look like a template.

Talk to the user in their language. Keep the files (brief, shot list, code) in English unless they ask otherwise.

## What you need
Node 22+, Chrome/Chromium (or `npx playwright install chromium`), ffmpeg, Python 3 + numpy (sound). Everything else
ships with this skill: `scripts/` (tools) and `assets/template/` (film project with the `mg.js` engine).
If something is missing, say exactly what and how to install it; don't fake the output.

## The pipeline (default for every new film)

**0 · Size the job.** Pick the level from the request and say which one you're doing:
| Level | Request looks like | Process |
|---|---|---|
| L1 one-liner | "make a 15s showreel, go all out" | Invent everything; brief + beat sheet in your head-space (still write them), 1–2 critique rounds |
| L2 brand reel | product/brand + a few facts, maybe a URL or logo | Gather real assets, short brief, shot list gate, 2–3 rounds |
| L3 state spec | precise sequence of states/shots (UI morph, explainer script) | Follow the spec exactly; show the state list on the beat grid before coding; 3 rounds |
| L4 director's brief | long brief, characters, chapters, minutes of runtime | Plan first; split into chapters (subagents if available); chunked renders; rounds per chapter |

Ask questions only when an answer changes the film and can't be invented well (real brand name/assets, a
must-say claim, the music license, the platform/aspect). Ask once, in one message, with your proposed defaults —
then proceed. If the user said "go", "surprise me" or gave a complete spec, don't ask: decide and state assumptions.

**1 · Scaffold** (once per film):
```bash
node <skill-dir>/scripts/new_film.mjs <film-dir> --title "Name" --format 16x9 --fps 60 --duration 15 --bpm 120
cd <film-dir> && node tools/render.mjs check
```
The project's `CLAUDE.md` is the render contract; `film.json` holds format, beat grid and cues; `film.js` is the film.
Bundle fonts right away: `node tools/fonts.mjs add "Inter" 400,600,800 --subsets latin,cyrillic` (any Fontsource
family; it also registers them in `film.json` so a missing font fails the check instead of falling back).

**2 · Brief → `docs/brief.md`.** One-line film (the idea every decision is checked against), audience and platform,
format, references, the world (palette, type, shapes, motion grammar), text on screen, sound plan, banned list,
deliverables. Templates for every level: `references/brief-templates.md`.

**3 · References → grammar, not content.** If the user gives a reference video/images, extract frames
(`ffmpeg -i ref.mp4 -vf fps=2,scale=480:-2 refs/f%03d.jpg`), look at them, and write `docs/style_guide.md`: palette (hex),
type (family, weight, tracking, case), shot lengths, transition types, camera moves, texture, how text enters and
exits. Take the grammar; never copy logos, characters or footage.

**4 · Sound before animation.** The beat grid is structure, not decoration. Choose BPM so the duration is whole bars
(120 BPM → 2 s bars). For a supplied track: `python3 tools/audio.py beats audio/track.mp3 --write [--drop-at 6.0]`
(measures BPM, downbeats, drop; writes the grid into `film.json`). Otherwise pick a synth style
(`pulse` / `soft` / `cinematic`) in `film.json`. Then write the cues (ids + times on the grid + SFX) — picture and sound
both read them, so hits land by construction. Details: `references/sound-design.md`.

**5 · Shot list on the grid → `docs/shotlist.md`.** Use the 7-beat spine and give every beat a job:
**Hook → World → Question → Mechanism → Discovery (hero moment) → Payoff → Loop/button.**
Times in bar:beat and seconds, what's on screen, what moves, what sound hits. Hook in the first 0.5 s (frame 0 is the
thumbnail), hero moment at ~60–75% of the runtime, end frame held ~1 s with living micro-motion. Dead beats kill
retention: something meaningful changes on every beat or deliberately holds. *Gate (L2–L4): show the user the shot
list before building, unless they asked you to just go.*

**6 · Lock the world before motion.** Build the look first and render 4–8 key stills:
`node tools/render.mjs stills 0.4 2.1 5 8.5` → open them with the Read tool and judge them as posters: composition,
hierarchy, type setting, palette, negative space, safe margins (5%). Fix until nothing looks default. Character or
mascot? Write its bible first (proportions, palette, expressions, motion grammar).

**7 · Motion.** Build the choreography in `film.js` with the engine (`references/engine-api.md`):
springs by role (`SPRING.ui`, `.text`, `.camera`, `.pop`…), `track()` for values that retarget, staggered reveals,
transitions carried by elements (match cuts, shared-element morphs, masks, colour floods — not crossfades).
Check with `node tools/render.mjs sheet --beats` (one frame per beat) and `strip <t> --span 0.5 --n 12` around every
fast move (spacing, arcs, overlap, no pops), and `node tools/render.mjs draft` for pacing. Run `check` after every
structural change — it catches state leaks, missing fonts, console errors, banned APIs, a blank frame 0.

**8 · Sound.** `python3 tools/audio.py build` → `out/audio.wav` (score or track + SFX on cues + optional voice,
mastered to −14 LUFS, true peak ≤ −1 dBTP). Audition SFX choices with `audio.py sfx <name>` and `audio.py list`.

**9 · Critique loop.** Render a draft with audio, gather evidence, then critique like a jury that didn't make the
film. Protocol, rubric and the reviewer prompt: `references/critique.md`. In short:
- Evidence: `node tools/render.mjs draft` → `node tools/render.mjs inspect out/draft.mp4` (metrics: dead spans, pops,
  loudness, energy per second; contact sheet from the encoded video) + `sheet --beats` + strips of the fastest moves.
  Look at every image.
- Score 7 axes 1–10 (hook & concept, motion craft, design & typography, rhythm & sound sync, retention/variety,
  finish & technical, brief fidelity). 6 = template, 7 = solid pro, 8 = high-end agency, 9 = award shortlist.
  First renders usually deserve 5–7; don't inflate.
- Fix the 3 worst problems (timecode, what's wrong, the concrete fix), re-render, repeat. Log each round in
  `docs/review_log.md`. Stop when every axis ≥ 8 in the latest round with no open P0, or after 4 rounds — then say
  honestly what's still below 8.
- If you can spawn subagents, give the critique to a fresh one with only the brief and the evidence paths: separate
  eyes catch what the maker's context hides.

**10 · Final & deliver.** `node tools/render.mjs final` (60 fps, 4 subframes of motion blur, BT.709 H.264, audio
muxed) → `node tools/render.mjs inspect` → report. Long renders: run in the background and poll. Other aspect ratios
come from the same timeline: re-lay out per `ctx.format` / `ctx.W`, `ctx.H` (never crop), then
`final --format 9x16`. Deliver: the MP4 path(s), poster frame, and a short report — concept in two sentences, beat
sheet with timecodes, check numbers (duration, resolution, fps, LUFS, true peak), and your honest top-3 weaknesses.

## The render contract (enforced by `check`)
1. Every frame is a pure function of `t`. No `Math.random` (use `rng(seed)`/`hash()`), no `Date`/`performance.now`,
   no timers or `requestAnimationFrame`, no CSS `transition`/`animation`, no counters or state between frames.
2. Every animated property is written on every frame in every branch, or its node is hidden (scenes with a node do
   this for you). This is the #1 source of "works in preview, glitches in render".
3. Build DOM, split text, decode images and precompute physics/particles in `setup()`; `render(t)` only computes and
   writes styles/draws. Keep seek under ~30 ms.
4. Fonts and assets are local and declared; no network at render time.
5. Hard cuts are listed (`film.json` "cuts" or `ctx.cuts`) so motion blur never smears across them.
6. Frame 0 has the hook on screen. Loops: frame(duration) equals frame(0) in position *and* velocity.

## Craft rules that separate studio work from AI templates
Full guide with numbers: `references/motion-craft.md`. The short version:
- **Springs, not easing curves.** Different springs per role: UI snaps, type settles, the camera never overshoots,
  playful elements pop. If it looks like PowerPoint, the spring is wrong.
- **One idea per shot**, big type, ≤ 7 words on screen at once, reading time ≥ 0.3 s/word + 0.5 s.
  Hierarchy and negative space beat decoration.
- **Choreography**: lead with one element, stagger the rest (20–60 ms per item), overlap actions, anticipate big
  moves, let things settle. Moves travel on arcs. Fast moves get motion blur or a smear.
- **Continuity**: transitions are carried by an element (morph, match cut, mask, flood, push) — avoid crossfades
  and generic slides. A shape that becomes the next scene is the strongest transition you have.
- **Rhythm**: cuts and big reveals on downbeats, small hits on beats, contrast busy with calm; the energy curve follows
  the music, and the drop meets the hero moment.
- **Banned unless the brief asks**: particle bursts, lens flares, neon glow on everything, RGB split, camera shake,
  bouncy easing on UI, gradient-on-every-surface, drop shadows on flat UI, emoji, stock "tech" grids, centred
  everything, text that just fades in, more than two typefaces, more than one accent colour.
- **Real over invented**: real product UI/screens/logos when it's a real product (screenshots, SVGs from the
  user or their site); never fake a real brand's assets or claims. Invented brands get invented names.
  Illustrative numbers are labelled "example".

## Specialist passes
Work in passes with one job each, each leaving an artifact: **style extractor** (`docs/style_guide.md`) →
**shot-list architect** (`docs/shotlist.md` on the grid) → **motion director** (`film.js`) → **sound designer**
(`film.json` cues + `out/audio.wav`) → **harsh critic** (`docs/review_log.md`). With subagents available, run the
critic (always) and, for L4, chapter animators as separate agents: give each the contract (`CLAUDE.md`), the brief,
its time range and the files it may edit. Without subagents, do the passes yourself, in order, and switch
mindset explicitly for the critic.

## Engine at a glance (`lib/mg.js`)
```js
import { mount, el, set, splitText, each, scene, playScenes, spring, track, SPRING, seg, kf, ease,
         camera, cameraCSS, morph, rectPath, circlePath, drawOn, coverRadius, scramble, count, grain,
         rng, hash, noise, wiggle, mixColor, loadImages } from './lib/mg.js';
mount({
  async setup(ctx) { /* build DOM once; ctx.W, ctx.H, ctx.cue('id'), ctx.grid.bar(n); ctx.sceneList = [...] */ },
  render(t, ctx) { /* write every animated property from t; playScenes(ctx.sceneList, t) */ },
});
```
`spring(lt, SPRING.ui)` → 0…1 with overshoot · `track(t, [[t0,v0],[t1,v1]…])` sum of springs · `each(units, lt,
{stagger, preset}, fn)` staggered reveals · `set(node, {x,y,s,r,o,blur,clip,bg,…})` writes styles ·
`camera(t, keys)` springy camera with log-space zoom · `morph(dA, dB)` point-matched shape morph · `grid.pulse(t)` beat
pulse · `ctx.cue('drop')` cue times from `film.json`. Canvas/WebGL films work too: draw inside `render(t)`.
Full API and copy-paste recipes (masked type, cursor-driven UI, colour flood, match cut, counters, charts, 3D flip,
loops, video frames, formats): `references/engine-api.md`.

## Tools (run inside the film folder)
| Command | What it gives you |
|---|---|
| `node tools/render.mjs check` | determinism (out-of-order hashes), fonts, console errors, lint, frame 0, loop seam, speed |
| `node tools/render.mjs stills 1 2.5` | full-res PNGs in `out/stills/` |
| `node tools/render.mjs sheet --every 0.5` / `--beats` / `--at 1,2` | labelled contact sheets in `out/sheets/` |
| `node tools/render.mjs strip 3.2 --span 0.5 --n 12` | frames around one moment (spacing, arcs, blur) |
| `node tools/render.mjs draft` | half-res 30 fps preview with audio → `out/draft.mp4` |
| `node tools/render.mjs final [--sub 4 --workers 4 --format 9x16 --capture jpeg]` | master → `out/final.mp4` |
| `node tools/render.mjs inspect [video]` | `out/review/metrics.json` + contact sheet from the encoded video |
| `node tools/render.mjs serve` | local preview for a human (space, ←/→, [ ], G guides) |
| `node tools/fonts.mjs add "Family" 400,700 [--variable] [--subsets latin,cyrillic]` | bundle OFL fonts |
| `python3 tools/audio.py build` / `beats <track> --write` / `sfx <name>` / `list` | score, SFX, mastering, beat grid |

Final render cost ≈ (seek + capture ms) × frames × subframes ÷ workers; `check` prints the estimate. Use
`--capture jpeg` to roughly halve capture time, `--sub 8` if strips show ghosted copies on very fast moves.

## Other routes
The default (route A) is the vanilla `seek(t)` film above: zero dependencies, fully controllable, what tends to give
the best results. Use a framework only when the user has one or asks: HyperFrames (HTML + GSAP adapters) or
Remotion (React; check its license for companies) — the brief, beat grid, springs and critique loop stay the same.
Mixed pipelines (image/video models for characters, code for the visible layer), 3D (Three.js/Blender) and footage
edits: `references/routes.md`. Style recipes (Swiss kinetic type, UI morph, Apple-minimal, isometric, line boil,
collage, Bauhaus, glass, HUD, synthwave, pixel, liquid, data story…): `references/styles.md`.

## When things go wrong
| Symptom | Fix |
|---|---|
| `check`: frames differ by render order | a property isn't written every frame/branch, or state/random/time leaks; hide inactive nodes |
| Text looks blurry when scaled | remove `will-change`/3D transforms on it; scale the font size or a 2D transform instead |
| Font missing / wrong glyphs (Cyrillic boxes) | `fonts.mjs add` with the right `--subsets`; declare it in `film.json` "fonts" |
| Jumps/pops in strips | a spring restarted instead of retargeting (use `track`), or a cut not declared in `cuts` |
| Ghost copies on fast moves | more subframes (`--sub 8`), or smear/stretch the element along its velocity |
| Sound feels late | SFX peak-align automatically; check the cue time, not the file start; anticipation ≈ 1–2 frames early for UI clicks |
| Render too slow | heavy work in `render()` (move it to setup), huge blur filters, big canvases; use `--workers`, `--capture jpeg` |
| Chrome not found | install Chrome or `npx playwright install chromium`, or set `CHROME_PATH` |

## Reference files
- `references/brief-templates.md` — one-liner anatomy, brand reel brief, XML state spec, director's brief, 7-beat timings
- `references/motion-craft.md` — springs, timing, choreography, camera, transitions, type in motion, finishing, gotchas
- `references/engine-api.md` — full `mg.js` API + recipes
- `references/sound-design.md` — beat grid, cues, SFX palette, music styles, supplied tracks, voice, loudness
- `references/critique.md` — evidence, rubric, severity, review log, critic subagent prompt
- `references/styles.md` — style library with signature features and techniques
- `references/routes.md` — HyperFrames/Remotion, mixed pipelines, 3D, footage, formats, performance
