# Routes, formats and performance

## Routes
| Route | Best for | Notes |
|---|---|---|
| **A · code-drawn (default)** | showreels, UI motion, loops, product films, kinetic type, explainers | this skill's `seek(t)` film + `render.mjs`; zero dependencies, fully editable |
| **B · framework** | teams already on HyperFrames or Remotion, series with reusable components | keep the brief, grid, springs and critique loop; only the authoring changes |
| **C · mixed pipeline** | characters, faces, physics, photoreal pieces, music videos | image/video models make base material; code draws the visible layer and the edit |
| **D · footage edit** | talking heads, recuts of real clips | keep the person's footage/voice; code adds graphics, captions, B-roll |

### B · HyperFrames (HTML-native, Apache 2.0)
`npx hyperframes init my-video` · `npx hyperframes preview` · `npx hyperframes render` (Node 22+, ffmpeg). Compositions
are HTML with `data-start`/`data-duration`/`data-track-index` clips and seekable animation adapters (GSAP timelines
registered on `window.__timelines`). Its agent skills install with `npx skills add heygen-com/hyperframes`.
Our rules still apply: paused, seekable timelines only; no wall-clock; springs → use GSAP eases tuned like the presets
or compute values in an `onUpdate` from the timeline time.

### B · Remotion (React)
`npx create-video@latest`, `useCurrentFrame()`, `interpolate()`, `spring({frame, fps, config: {damping, stiffness,
mass}})`, `<Sequence from durationInFrames>`, `npx remotion render`. Remotion's license requires a paid company
license for for-profit organisations above a small size — mention it before choosing it for a company.
Official agent skills: `npx skills add remotion-dev/skills`.

### C · Mixed pipeline (generate, then trace)
Use when the brief needs believable characters, faces or physics: generate character sheets with an image model,
base shots with a video model, then redraw/trace the visible layer in code (outlines, flat fills, type, graphics) so
the style stays consistent and editable. Budget the API spend up front, keep keys in `.env` (never in film files; add
`"deny": ["Read(./.env)"]` in `.claude/settings.json`), cache every generated asset in `assets/gen/` with its prompt,
and treat generated assets as fixed inputs: the code layer stays deterministic.

### 3D
Three.js inside `render(t)`: create scene/camera/meshes in setup; in render set every transform from `t`, call
`renderer.render(scene, camera)` synchronously; use `new THREE.WebGLRenderer({preserveDrawingBuffer: true,
antialias: true})`; no `Clock`, no `requestAnimationFrame`, seeded randomness. Software WebGL works headless
(SwiftShader) but is slow — keep geometry modest. Blender: render a PNG sequence with a script, then composite type
and graphics in the HTML film over the frames (see "Real footage" recipe).

### D · Footage
Extract frames (`ffmpeg -i in.mp4 -vf fps=30 assets/in/%05d.jpg`) and swap them per frame, or render the graphics
layer with a transparent background and composite in ffmpeg (`overlay`). Keep the original audio as `voice` or as the
music track.

## Formats
`film.json` "formats" defines named sizes (16x9 1920×1080, 9x16 1080×1920, 1x1 1080×1080, 4x5 1080×1350).
The film reads `ctx.W`, `ctx.H`, `ctx.format` and re-lays out (type sizes from the short side, stacked layouts for
portrait, safe zones for platform UI). Render each with `node tools/render.mjs final --format 9x16` → `out/final-9x16.mp4`.
Never deliver a centre crop of the landscape film as the vertical version.

## Performance
- `check` prints seek and capture time and an estimate for the final. Capture (PNG) is the floor (~100–200 ms/frame
  at 1080p on a laptop); `--capture jpeg` roughly halves it with negligible quality loss after H.264.
- Keep `render(t)` cheap: no DOM creation, no layout reads (`getBoundingClientRect`) per frame, no huge `filter: blur`
  on full-frame layers (pre-blur in setup or blur small elements), canvases at the needed size only.
- `--workers N` runs N browsers in parallel (default: half the cores, max 4).
- Iterate on `stills`, `sheet` and `draft`; render the final once the critique gate passes. Partial renders:
  `final --from 4 --to 8`.
- Run long renders in the background and poll the log instead of blocking.

## Platform notes
- Windows: installed Chrome with fresh profiles can trip account-lockout policies on some machines; prefer
  `npx playwright install chromium-headless-shell` and set `CHROME_PATH` to it. Use `python` instead of `python3` if
  needed.
- macOS: Chrome is found in /Applications automatically.
- Linux containers: Playwright's Chromium (`PLAYWRIGHT_BROWSERS_PATH`) is found automatically; running as root adds
  `--no-sandbox`.
