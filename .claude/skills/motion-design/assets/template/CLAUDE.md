# Render contract — read before touching film code

This folder is a motion-design film written as a program. `film.js` paints any frame from a time `t`;
`tools/render.mjs` captures frames in headless Chrome and encodes them with ffmpeg. Same input → same frames.

## Non-negotiable
1. **Every frame is a pure function of `t`.** `render(t)` computes every visible property from `t` alone.
   No `Math.random` (use `rng(seed)`/`hash(i)`), no `Date`/`performance.now`, no timers, no `requestAnimationFrame`,
   no CSS `transition`/`animation`/`@keyframes`, no counters or state carried between frames.
2. **Write every animated property on every frame, in every branch** (or hide the node). Otherwise the value
   from the last rendered frame leaks into the next one and out-of-order renders differ.
3. **Springs, not tweens.** Movement uses `spring()`/`track()` presets by role (`SPRING.ui`, `.text`, `.camera`…).
   Retargets are a sum of springs (`track`). Eases only for wipes, morph progress and mechanical moves.
4. **The beat grid is structure.** Times come from `film.json` cues (`cue('id')`) and `grid.bar()/beat()`, which the
   sound tools read too — picture and sound stay in sync by construction. Cuts on downbeats, hits on beats.
5. **Fonts are bundled** (`node tools/fonts.mjs add "Family" 400,700`) and declared in `film.json` "fonts";
   a missing font fails the check instead of silently falling back. No remote assets at render time.
6. **2D transforms only, no `will-change`** on anything that scales (it rasterises once and goes soft).
   Don't put `opacity`/`filter` on a `preserve-3d` element — fade a wrapper.
7. **Frame 0 is the thumbnail and the hook**: something meaningful is on screen at t = 0.
8. Loops (`"loop": true`): frame(duration) must equal frame(0), positions *and* velocities.

## Commands (run from this folder)
| Step | Command |
|---|---|
| Contract check (run after every structural change) | `node tools/render.mjs check` |
| Key stills → look at them | `node tools/render.mjs stills 0.5 2 4` |
| Contact sheet (every 0.5 s / on beats) | `node tools/render.mjs sheet --every 0.5` · `--beats` |
| Spacing check around a fast move | `node tools/render.mjs strip 3.2 --span 0.5 --n 12` |
| Fast preview video | `node tools/render.mjs draft` |
| Sound: synth score + SFX from cues, mastered | `python3 tools/audio.py build` |
| Measure a supplied track's beats | `python3 tools/audio.py beats audio/track.mp3 --write` |
| Master (motion blur, audio muxed) | `node tools/render.mjs final` |
| Critic evidence from the encoded video | `node tools/render.mjs inspect out/final.mp4` |
| Other formats from the same timeline | `node tools/render.mjs final --format 9x16` |
| Human preview with scrubbing | `node tools/render.mjs serve` |

Long renders: run in the background and poll the log.

## Files
`film.json` format, timing, beat grid, cues, music & SFX plan · `film.js` the film · `lib/mg.js` engine (springs,
grid, text, camera, morph, grain, player) · `docs/brief.md` the brief · `docs/shotlist.md` beats on the grid ·
`docs/review_log.md` critique rounds · `out/` renders, stills, sheets, review evidence.

## Gates
Brief + shot list on the beat grid → key stills look like posters → motion (draft + strips) → sound →
critique rounds until every axis ≥ 8 (or the round limit) → final → inspect → deliver report.
