# mg.js engine API and recipes

`lib/mg.js` is a dependency-free ES module. Import what you need in `film.js`.

## Contents
1. Structure of a film · 2. API reference · 3. Recipes (copy, then adapt)

## 1. Structure of a film
```js
import { mount, el, set, splitText, each, scene, playScenes, spring, track, SPRING, seg, ease } from './lib/mg.js';

const C = { bg: '#0e0e11', ink: '#f2efe8', accent: '#ff5a36' };       // palette from the brief
const F = { display: '"Space Grotesk", sans-serif', ui: '"Inter", sans-serif' };
let R; // node references

mount({
  async setup(ctx) {                       // runs once: build DOM, split text, decode images, precompute
    const { stage, W, H, cue, grid } = ctx;
    const title = el('div', { text: 'Ship faster', style: { position: 'absolute', left: '8%', top: '38%',
      font: `700 ${H * 0.11}px/1 ${F.display}`, letterSpacing: '-0.03em', color: C.ink } }, stage);
    R = { title, words: splitText(title, { mask: true }).words };
    ctx.sceneList = [
      scene('hook', 0, cue('cut1'), (c) => {
        each(R.words, c.lt + 0.12, { stagger: 0.05, preset: SPRING.text }, (w, k) => set(w, { y: (1 - k) * H * 0.12 }));
      }, title),
      // scene('world', cue('cut1'), cue('cut2'), (c) => {...}, worldNode), ...
    ];
    ctx.cuts.push(cue('cut1'));            // hard cut: motion blur won't blend across it
  },
  render(t, ctx) {                          // every frame: compute everything from t
    playScenes(ctx.sceneList, t);
  },
});
```
- `ctx`: `W, H` (current format), `format`, `fps`, `duration`, `cfg` (film.json), `grid`, `cue(id, offset?)`,
  `stage` (the W×H root), `frame` (output frame index, stable across motion-blur subframes), `renderMode`, `cuts`,
  `sceneList`, `parseTime(expr)`.
- Scenes: `scene(name, start, end, draw, node?)`. `draw(c)` gets `{t, lt, dur, p, name}`; if `node` is given it's
  hidden outside `[start, end)`, which also prevents stale styles from leaking. Overlap scenes for transitions.
- Global layers (background, camera, grain, persistent UI) are written directly in `render`.

## 2. API reference
**Math**: `clamp(x,a,b)`, `clamp01`, `lerp(a,b,k)`, `invLerp`, `remap(x,a0,a1,b0,b1,ease?)`, `mix(a,b,k)` (numbers or
arrays), `fract`, `smoothstep(a,b,x)`, `pingpong(x)`, `deg`, `rad`, `TAU`.

**Easing**: `ease.linear`, `in/out/inOut` × `Quad, Cubic, Quart, Quint, Sine, Expo, Circ`, `inBack`, `outBack`,
`ease.morph` (0.7,0,0.3,1), `ease.swift` (0.55,0,0.1,1), `ease.snappy` (0.2,0.9,0.1,1), `ease.anticipate`,
`bezier(x1,y1,x2,y2)` for any CSS curve.

**Springs**: `spring(lt, preset)` → 0…1 (0 for lt ≤ 0) · `springVel(lt, preset)` → progress/s ·
`spr(settle, damping, velocity?)` makes a preset · `SPRING.{snap, ui, pop, bouncy, text, smooth, heavy, camera, drift}`.

**Timing**: `seg(t, a, b, ease?)` → 0…1 progress · `kf(t, [[t0,v0],[t1,v1,ease?],…], ease?)` keyframes (numbers or
arrays) · `track(t, [[t0,v0],[t1,v1,preset?],…], preset?)` sum-of-springs value · `stepTime(t, 12)` for on-twos looks ·
`staggerDelay(i, n, each, order, seed)` · `each(units, lt, {stagger, preset, order, seed, delay}, (node, k, i) => …)`.

**Beat grid** (`ctx.grid`, from film.json bpm/offset/beatsPerBar; bars and beats are 0-based):
`grid.beat(n)`, `grid.bar(n, beat?)`, `grid.pos(t)` (float beats), `grid.index(t)`, `grid.barIndex(t)`,
`grid.phase(t, every?)`, `grid.pulse(t, decay?, every?)` (1 on the beat → decays), `grid.snap(t, div?)`, `grid.spb`,
`grid.barLen`. Time expressions (film.json and `ctx.parseTime`): `3.25`, `"beat:8"`, `"bar:4"`, `"bar:4:2"`,
`"bar:4-0.1"`.

**Random/noise** (deterministic): `rng(seed)` → stream (create in setup) · `hash(...numbers)` → [0,1) ·
`noise(x, seed)`, `noise2(x, y, seed)` → [−1,1] · `wiggle(t, freq, amp, seed)` · `osc(t, period, phase)`.

**Colour**: `mixColor(hexA, hexB, k)` (linear-light mix → `rgb()`), `rgba(hex, a)`, `hexToRgb`.

**DOM**: `$`, `$$`, `el(tag, {class, style, text, html, ...attrs}, parent)` (SVG tags supported) ·
`set(node, {x, y, s, sx, sy, r, skx, sky, o, blur, origin, w, h, radius, bg, color, clip, z, vis, text, css})` —
2D transforms, skips unchanged writes · `splitText(node, {mask})` → `{words, chars}` · `scramble(text, k, t, opts)` ·
`typed(text, k)` · `caret(t)` · `count(k, from, to, {decimals, sep, prefix, suffix})`.

**Camera**: `camera(t, [[t, {x, y, z, r}, preset?], …], preset?)` → `{x, y, z, r}` · `cameraCSS(cam, W, H)`.

**Shapes**: `morph(dA, dB, {samples})` → `k => d` (call once in setup) · `polyPath(points)` · `circlePath(cx, cy, r)` ·
`rectPath(x, y, w, h, r)` · `blobPath(cx, cy, r, t, {seed, amount, speed})` · `drawOn(pathNode, k)` ·
`coverRadius(cx, cy, W, H)`.

**Finishing/assets**: `grain(parent, {opacity, size, seed, blend})` → `{update(frame)}` · `loadImages([src…])`.

**Fonts**: `fontRenders(family, weight)`; declared fonts in film.json are verified at mount.

## 3. Recipes

### Masked word rise on beats (kinetic type)
```js
const { words } = splitText(R.line, { mask: true });
// in a scene draw(c): one word per beat
words.forEach((w, i) => {
  const k = spring(c.t - ctx.grid.beat(4 + i) + 0.06, SPRING.text); // lands just on the beat
  set(w, { y: (1 - k) * 1.1 * fontPx });
});
```

### Exit, faster than the entrance
```js
const out = seg(c.t, cue('cut2') - 0.35, cue('cut2'), ease.inCubic);
set(R.block, { y: -40 * out, o: 1 - out });
```

### Cursor-driven UI morph (one element, never cut)
```js
// keys on the grid: each state is a size/radius/colour target; the cursor arrives, presses, the shape answers.
const states = [ { w: 220, h: 64, r: 32, bg: '#111' }, { w: 64, h: 64, r: 32, bg: '#111' }, { w: 520, h: 120, r: 28, bg: '#fff' } ];
const at = [grid.beat(0), grid.beat(4), grid.beat(8)];
const w = track(t, states.map((s, i) => [at[i], s.w]), SPRING.ui);
const h = track(t, states.map((s, i) => [at[i], s.h]), SPRING.ui);
const r = track(t, states.map((s, i) => [at[i], s.r]), SPRING.ui);
set(R.shape, { w, h, radius: r, x: -w / 2, y: -h / 2 });
// cursor: travels to the button before the beat, presses 3 frames early
const [cx, cy] = track(t, [[0, [900, 700]], [at[1] - 0.45, [W / 2, H / 2]]], SPRING.ui);
const press = Math.max(0, 1 - Math.abs(t - (at[1] - 0.05)) / 0.08);
set(R.cursor, { x: cx, y: cy, s: 1 - 0.15 * press });
// content swap inside the morph: old content exits fast, new content enters after the shape is mostly there
const swap = (t0) => ({ out: seg(t, t0 - 0.05, t0 + 0.08), in: spring(t - t0 - 0.12, SPRING.snap) });
```

### Leading/trailing edges on different springs (stretchy indicator)
```js
const lead = track(t, tabs.map((x, i) => [at[i], x]), SPRING.snap);
const trail = track(t, tabs.map((x, i) => [at[i], x]), SPRING.ui);
const left = Math.min(lead, trail), right = Math.max(lead, trail) + tabW;
set(R.indicator, { x: left, w: right - left });
```

### Colour flood from a touch point
```js
const r = coverRadius(px, py, W, H) * spring(t - cue('drop'), SPRING.smooth);
set(R.flood, { clip: `circle(${r.toFixed(1)}px at ${px}px ${py}px)` });  // next scene lives inside R.flood
```

### Match cut (measure, don't guess)
```js
// setup: measure where the element sits in both layouts
const a = R.logoSmall.getBoundingClientRect(), b = R.logoBig.getBoundingClientRect();
// render: interpolate centre and scale with one spring across the cut
const k = spring(t - cue('match'), SPRING.heavy);
set(R.logoBig, { x: lerp(a.x - b.x + (a.width - b.width) / 2, 0, k), y: lerp(a.y - b.y + (a.height - b.height) / 2, 0, k), s: lerp(a.width / b.width, 1, k) });
```

### Shape morph chain through an intermediate
```js
// setup
const toCircle = morph(cupPath, circlePath(960, 540, 160)), toSun = morph(circlePath(960, 540, 160), sunPath);
// render: A → circle → B, each leg 8–12 frames of ease.morph, with squash and a little rotation
const k1 = seg(t, t0, t0 + 0.18, ease.morph), k2 = seg(t, t0 + 0.18, t0 + 0.38, ease.morph);
R.path.setAttribute('d', k2 > 0 ? toSun(k2) : toCircle(k1));
const sq = Math.sin(Math.PI * (k2 > 0 ? k2 : k1)) * 0.12;
set(R.svgGroup, { sx: 1 + sq, sy: 1 - sq, r: 12 * Math.sin(Math.PI * k1), origin: '50% 50%' });
```

### Camera push and whip
```js
const cam = camera(t, [
  [0, { x: W / 2, y: H / 2, z: 1 }],
  [cue('push'), { z: 1.6, x: 1180, y: 520 }],
  [cue('whip'), { x: 3200 }, spr(0.35, 1)],   // fast camera spring for the whip; motion blur sells it
]);
R.world.style.transform = cameraCSS(cam, W, H);
```

### Line draw-on and chart that draws itself
```js
drawOn(R.linePath, spring(t - cue('chart'), spr(1.2, 1)));
R.bars.forEach((b, i) => { const k = spring(t - cue('chart') - i * 0.06, SPRING.ui); set(b, { sy: k, origin: '50% 100%' }); });
set(R.value, { text: count(spring(t - cue('chart'), spr(1.0, 1)), 0, 48210, { prefix: '$' }) });
```

### Scramble / decode title
```js
const k = seg(t, cue('decode'), cue('decode') + 0.8);
set(R.code, { text: scramble('LAUNCH DAY', k, t, { fps: 30, seed: 4 }) });
```

### 3D card flip (fade the wrapper, not the 3D node)
```js
// .card { transform-style: preserve-3d } with two faces (backface-visibility: hidden); perspective on the parent
const k = spring(t - cue('flip'), SPRING.ui);
R.card.style.transform = `rotateY(${(180 * k).toFixed(2)}deg)`;   // 3D is fine here: the card is never scaled
set(R.cardWrap, { o: seg(t, cue('flip') - 0.3, cue('flip') - 0.1) });
```

### Seamless loop
```js
// film.json: "loop": true. Periodic motion with a period that divides the duration:
const phase = (t / ctx.duration) * TAU;
set(R.orb, { x: Math.cos(phase) * 200, y: Math.sin(2 * phase) * 60 });
// state sequences: make the last state equal the first and time the final transition to finish exactly at duration
```

### Canvas drawing inside seek
```js
// setup
const cv = el('canvas', { width: W, height: H, style: { position: 'absolute', inset: 0 } }, stage);
const g = cv.getContext('2d');
const stars = Array.from({ length: 400 }, (_, i) => ({ x: hash(i, 1) * W, y: hash(i, 2) * H, z: 0.2 + hash(i, 3) }));
// render: clear and redraw everything from t
g.clearRect(0, 0, W, H);
for (const s of stars) { const x = (s.x - t * 60 * s.z) % W; g.globalAlpha = s.z; g.fillRect((x + W) % W, s.y, 2, 2); }
```

### Real footage / screen recordings
```bash
ffmpeg -i assets/demo.mp4 -vf "fps=30,scale=1280:-2" -q:v 3 assets/demo/%04d.jpg
```
```js
// setup: frames = await loadImages(list of paths)   (or load lazily and await img.decode() in render)
const i = Math.min(frames.length - 1, Math.max(0, Math.floor((t - cue('demo')) * 30)));
if (R.screen.src !== frames[i].src) R.screen.src = frames[i].src;
```

### Formats from one timeline
```js
const portrait = ctx.H > ctx.W;
const titleSize = portrait ? ctx.W * 0.12 : ctx.H * 0.11;     // lay out per format; never crop the 16:9 film
```
Render with `node tools/render.mjs final --format 9x16` (formats live in film.json "formats").

### Persistent grain
```js
// setup: R.grain = grain(stage, { opacity: 0.06 });   render: R.grain.update(ctx.frame);
```
