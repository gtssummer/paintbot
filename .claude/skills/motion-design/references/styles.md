# Style library

Each style: what it is for, its signature features (what makes an expert name it in one second) and the key
techniques in this engine. Pick one per film (or a deliberate combination), write its signature features into the
brief, and judge the result against them.

| Style | Use for | Signature features | Key techniques |
|---|---|---|---|
| **Swiss kinetic type** | manifestos, launches, conference openers | huge grotesk type, strict grid, black/white + 1 accent, type *is* the image | masked word rises on beats, tracking/weight animation (variable font), hard cuts on downbeats, rule lines that draw on |
| **UI morph loop** | product/UI demos, social loops | one element that never cuts; states morph size/radius/colour; cursor-driven; light neutral canvas; springs with tiny overshoot | `track()` per property, lead/trail edge springs, content swap with blur, cursor press 3 frames early, last frame = first |
| **Apple-keynote minimal** | premium product reveals | lots of black/white space, one idea per shot, big product, precise type, slow confident camera | `SPRING.heavy`/`camera`, match cuts, light sweeps (gradient mask moving across), masked headline reveals |
| **Flat vector / pop** | explainers, apps, playful brands | bold flat shapes, 4–6 saturated colours, thick shapes, no gradients, bouncy but controlled | `SPRING.pop` entrances, shape morphs, squash & stretch from `springVel`, colour floods between scenes |
| **Isometric 2.5D** | systems, cities, "how it works" | 30° iso grid, blocks building up, consistent light (3 face tones), tiny details | build-ups with `each` staggered by distance, objects drop with `thud`, camera slow orbit = pan along iso axis |
| **Line art / hand-drawn boil** | storytelling, education, warm brands | single-weight lines, paper texture, line "boil" at 8–12 fps, drawn-on reveals | `drawOn`, jitter points with `hash(i, stepTime(t, 12))`, on-twos timing via `stepTime`, paper grain |
| **Collage / cut-out** | editorial, culture, music | paper cut shapes, photo cut-outs, tape, halftone, stop-motion 12 fps | `stepTime(t, 12)` + slight random rotation per step, hard shadows, paper texture, hard cuts |
| **Geometric Bauhaus** | design/art/music, abstract openers | primaries + cream, circles/squares/triangles, grid, rhythmic construction | every shape lands on a beat (`grid.beat(n)`), rotations by 90°, `ease.morph` wipes, composition builds then breaks |
| **Aurora & glass** | AI/fintech/consumer premium | soft colour fields, frosted cards, light refraction, calm motion | blurred colour blobs (`blobPath`/radial gradients) drifting with `wiggle`, `backdrop-filter` cards (fade wrappers), slow springs — use sparingly (on the anti-slop list when overused) |
| **HUD / FUI** | sci-fi, security, data, games | thin lines, mono type, brackets, data readouts, scanning | `scramble`, `count`, line draw-ons, tick SFX, grid snapping, deliberate flicker with `hash(frame)` |
| **80s synthwave / VHS** | retro, music, nostalgia | neon sun, grid floor, chrome type, scanlines, tracking noise | canvas grid with perspective, scanline overlay, chroma offset only on cuts, `cinematic` or `pulse` score |
| **Pixel art** | games, playful tech | low-res canvas scaled up crisp, limited palette, stepped motion | draw at 1/8 res, `image-rendering: pixelated`, integer positions, `stepTime(t, 12)` |
| **Liquid / blob** | wellness, beverage, organic brands | gooey merges, drops, waves, smooth colour | SVG goo filter (blur + colour matrix) on circles, `blobPath`, springs with low damping, slow camera |
| **3D render look** | hardware, premium objects | soft lighting, materials, depth of field | Three.js in `render(t)` (deterministic: no clock, seeded), or CSS 3D cards; route notes in `routes.md` |
| **Data story** | reports, finance, explainers | big numbers, charts that draw, annotations, honest scales | `count`, bar/line draw-on, highlight one data point, label "example data" when illustrative |
| **Variety captions (9:16)** | social, shorts | huge bold captions, coloured outlines, emoji-free stickers, punch zooms | per-word caption pops on speech, `pop`/`hit` SFX, 9:16 layout first |

## Writing signature features that can be checked
Bad: "smooth bouncy animation". Good: "UI elements land with SPRING.ui (≈4% overshoot); stagger 30 ms left→right;
cards exit with ease.inCubic in 0.25 s; background colour changes only on downbeats."

## Avoiding the look-alike reel
Opus-made reels converge on: black background, white Inter, orange accent, particle burst, glow, centred text.
Before building, decide: a background that isn't black, a typeface with character, a palette from a named reference,
and one signature move nobody else uses.
