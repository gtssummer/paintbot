# Motion craft

What separates high-end motion design from "AI motion". Numbers are starting points; the critique loop decides.

## Contents
1. Springs and easing · 2. Timing and spacing · 3. Choreography · 4. Camera · 5. Transitions
6. Typography in motion · 7. Composition and colour · 8. Finishing · 9. Anti-slop list · 10. Gotchas

## 1. Springs and easing
Springs give moves weight and a natural settle; tweens with fixed durations read as slideware.
`spring(lt, preset)` returns 0→1 (with overshoot when damping < 1); presets are `{damping, settle}`
(damping ratio, seconds to settle within 2%).

| Role | Preset | damping / settle | Notes |
|---|---|---|---|
| Micro UI (toggle, chip, click) | `SPRING.snap` | 0.80 / 0.25 s | crisp, tiny overshoot |
| UI morphs, cards, buttons | `SPRING.ui` | 0.72 / 0.35 s | ≈4% overshoot — the "Apple" feel |
| Playful entrances, stickers, icons | `SPRING.pop` | 0.55 / 0.50 s | visible bounce; not for serious UI |
| Type reveals | `SPRING.text` | 0.86 / 0.45 s | confident, almost no overshoot |
| Panels, masks, wipes | `SPRING.smooth` | 0.95 / 0.55 s | |
| Big hero objects, large type | `SPRING.heavy` | 0.82 / 0.80 s | mass reads as importance |
| Camera | `SPRING.camera` | 1.00 / 0.60 s | never overshoots — overshooting cameras feel cheap |
| Ambient drift, parallax | `SPRING.drift` | 1.00 / 1.40 s | |

- Make your own with `spr(settle, damping)`. Faster settle = lighter object. Lower damping = more character.
- **Retargeting**: a value that changes target several times is `track(t, [[t0, v0], [t1, v1], …])` — the sum of one
  spring per change. It stays a pure function of `t` and inherits motion naturally (no restart pops).
- **Stretch**: drive the leading and trailing edges of a bar/indicator with different springs (lead `SPRING.snap`,
  trail `SPRING.ui`): the element stretches in flight and recovers on arrival. Same for a toggle knob.
- **Squash & stretch from velocity**: `springVel(lt, preset)` → scale along the motion `1 + k·v`, across `1 − 0.6·k·v`.
- Easing curves are still right for: wipes and masks (`ease.morph` = cubic-bezier(0.7,0,0.3,1)), morph progress,
  mechanical/robotic moves (linear or `steps`), and exits (`ease.inCubic` — exits accelerate away).
- Never `ease.inOut` on an entrance from off-screen: it starts slow off-screen (wasted frames) and arrives late.

## 2. Timing and spacing (at 60 fps)
- Micro feedback 6–12 frames (0.1–0.2 s); UI transitions 15–30 frames; big scene transitions 24–45 frames;
  holds: text needs reading time ≥ 0.3 s/word + 0.5 s; hero end frame 0.8–1.2 s.
- Spacing beats duration: a move that covers most distance in its first third reads as fast and confident.
  Check with `strip` — frames should cluster at the end of the move (settle), not be evenly spaced (linear).
- Anticipation for big moves: 3–6 frames back in the opposite direction (or `ease.anticipate`) before the move.
- Follow-through and overlap: secondary parts (labels, shadows, children) lag the primary by 2–5 frames and settle
  later. Nothing important stops all at once.
- Hold frames on purpose: a tiny pause before the hero reveal makes it land.
- Hits are 1–2 frames *before* the sound transient feels late; visual impacts land exactly on the beat, UI clicks land
  on the beat with the press starting ~3 frames earlier.

## 3. Choreography
- **One leader per moment.** The eye can follow one primary move; everything else supports it.
- **Stagger** related items 20–60 ms (`each(units, lt, {stagger: 0.03})`); order by reading direction or from the
  touch point outward (`order: 'center' | 'edges' | 'end' | 'random'`).
- **Arcs**: real objects travel on curves. Add a perpendicular offset `sin(πk)·d` or animate x and y with different
  springs.
- **Cause and effect**: a cursor click causes the morph; a hit causes the shake of the thing that was hit (not the
  camera); a line drawing causes the label to appear.
- **Contrast**: busy → calm → busy. A still beat makes the next move feel bigger.
- **Loops**: everything periodic must have a period that divides the loop length (`osc(t, period)`), and every
  element must return to its start state with the same velocity (start the move before 0 and continue it after the end
  so the seam is mid-motion, or end on the exact start pose with zero velocity).

## 4. Camera
- The camera is a world container transformed with `camera(t, keys)` → `cameraCSS(cam, W, H)`. Zoom is interpolated in
  log space so 1→4 feels as even as 4→16.
- Moves: slow push-in to build tension (5–15% over a shot), a fast push to land on the hero, whip pan between scenes
  (lots of motion blur, 8–12 frames), rack to a detail, pull-out reveal at the end.
- Parallax: layers at different depths move at `1/z` of the camera move; even two layers sell depth.
- Keep one camera language per film. Don't mix handheld wobble with locked-off graphic shots.
- Camera shake only on a real impact, 2–4 px, decaying in 6–8 frames — usually leave it out.

## 5. Transitions (carry the eye with an element)
| Transition | How | When |
|---|---|---|
| Shape morph | one shape becomes the next state (`morph()`, or size/radius/colour springs on one element) | UI stories, product states, icon chains |
| Match cut | element in shot A sits exactly where its counterpart is in shot B; cut on motion | concept links, before/after |
| Shared element | the card/logo/photo grows into the next scene's layout | product → feature, list → detail |
| Colour flood | circle from the touch point grows to `coverRadius()`; next scene underneath | punchy section changes, drops |
| Mask/wipe | `clip-path` rectangle/circle/polygon driven by `ease.morph` | type reveals, editorial cuts |
| Push | outgoing scene pushed off by incoming, same spring | sequences, carousels |
| Zoom-through | camera dives into an element (a dot, a letter's counter) which becomes the next frame | big chapter changes |
| Hard cut on the downbeat | no transition at all | energy, rhythm — underrated |
Avoid: crossfades between unrelated scenes, generic slide-ins from the left for everything, spinning 3D cubes,
page curls, star wipes.

## 6. Typography in motion
- Big, tight, few: display type 6–12% of frame height, tracking −2% to −4% on bold display, line-height 0.95–1.1.
  Body text rarely belongs in motion design.
- Two typefaces max (a display + a UI/mono), usually one family in 2–3 weights. Bundle them (`fonts.mjs`).
  For Cyrillic or other scripts add `--subsets cyrillic` etc. and check glyph coverage in stills.
- Reveal patterns: masked rise per word or per line (`splitText(node, {mask: true})` + `each`), word-by-word on beats,
  blur-to-sharp for soft brands, scramble/decode for tech, typewriter only when typing is the story, tracking collapse
  for titles, weight animation with a variable font (`font-variation-settings: "wght" …`).
- Never fade a whole paragraph in. Never have more than one line moving in different directions.
- Exits are faster than entrances (about 60% of the time) and accelerate (`ease.inCubic`).
- Kinetic type on beats: one word per beat at 100–130 BPM; emphasise the key word with size/colour/weight, not all.
- Keep text inside the 5% action-safe area (10% for broadcast titles); press G in the preview to see guides.
- Text that swaps inside a morphing container needs its own exit and entry timing, or the two overlap mid-morph.

## 7. Composition and colour
- Design every key frame as a poster: clear focal point, deliberate negative space, grid alignment, nothing
  accidentally touching an edge.
- Palette: one background family, one ink, one accent (two at most); define hex values in the brief and use them
  everywhere. Colour change is a storytelling event — spend it at section changes.
- Contrast for readability: body/UI text ≥ 4.5:1 against its background, display ≥ 3:1.
- Scale contrast makes hierarchy: hero element 3–5× the size of supporting elements.
- Vertical (9:16): stack, don't shrink; keep text in the middle 70% (platform UI covers the bottom and right edge).

## 8. Finishing
- Motion blur on fast moves (renderer `--sub 4`, shutter 0.5); never across hard cuts (declare them).
- Grain 4–8% (`grain()`, per-frame deterministic) kills gradient banding and makes flat colour feel filmic; skip it
  for crisp UI/brand films if the brief wants pristine.
- Subtle vignette or light falloff for depth on dark scenes; no heavy glows.
- Shadows: soft, large-radius, low-opacity, consistent light direction — or none (flat).
- Check edges at full resolution: aliasing on thin lines (use ≥ 2 px strokes), shimmering patterns, half-pixel blur
  (snap static elements to whole pixels), banding in dark gradients.

## 9. The anti-slop list (unless the brief asks for it)
Particle explosions, lens flares, neon glow on every element, RGB split/chromatic aberration, camera shake, bouncy
easing on UI, gradients on UI chrome, glassmorphism everywhere, stock "cyber" grids and floors, rotating 3D globes,
generic isometric servers, emoji, word-art shadows, centred-everything layouts, everything entering from the left,
text fading in line by line, more than one accent colour, "AI-blue" purple-to-cyan gradients, filler shapes floating
for no reason, dead time, a logo that just fades in at the end.

## 10. Gotchas
- `will-change` or 3D transforms on scaled elements → blurry text (the layer is rasterised once). Use 2D transforms.
- `opacity`/`filter` on a `transform-style: preserve-3d` element flattens it (both faces show) — fade a wrapper.
- A spring that starts exactly at a scene's `lt = 0` draws nothing on that frame; for the opening hook start
  it slightly before 0 (`spring(lt + 0.15, …)`) so frame 0 isn't empty.
- Images must be decoded in setup (`loadImages`), video as JPEG frame sequences swapped per frame
  (`ffmpeg -i clip.mp4 -vf fps=30 assets/clip/%04d.jpg`), and `render` awaits decode if it swaps sources.
- CSS `filter: blur()` on large elements is expensive; blur small elements or pre-blurred copies.
- `clip-path` with many points per frame is cheap; huge SVG filters are not.
- Measure element positions at runtime (`getBoundingClientRect` in setup) for match cuts instead of guessing.
- Loops: compare frame 0 and frame(duration) in `check`; also compare the last two frames' motion with the first two.
