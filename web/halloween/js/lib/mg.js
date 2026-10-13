// mg.js — a small engine for deterministic motion-design films.
//
// The contract: the film is a program that paints ANY frame from a time t alone.
//   window.seek(t) → paints the frame at t seconds (sync or async)
// so frames can be rendered out of order, in parallel, re-rendered one at a time, and
// always come out identical. Inside film code that means:
//   - no Math.random (use rng()/hash()), no Date.now / performance.now, no timers,
//     no requestAnimationFrame, no CSS transitions/animations, no state carried between frames;
//   - every property you animate is written on every frame, in every branch.
// The preview player at the bottom of this file is harness code and is switched off in render mode.

/* ───────────────────────────── math ───────────────────────────── */

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const fract = (x) => x - Math.floor(x);
export const smoothstep = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
/** Map x from [a0,a1] to [b0,b1], clamped, optionally eased. */
export const remap = (x, a0, a1, b0, b1, e) => { let k = clamp01(invLerp(a0, a1, x)); if (e) k = e(k); return lerp(b0, b1, k); };
/** lerp that also works element-wise on arrays. */
export const mix = (a, b, k) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], k)) : lerp(a, b, k));
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
/** Triangle wave 0→1→0 over one period. */
export const pingpong = (x) => 1 - Math.abs(1 - 2 * fract(x));

/* ───────────────────────────── easing ───────────────────────────── */

/** CSS-style cubic-bezier(x1,y1,x2,y2) as a function k→k'. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u;
  const sy = (u) => ((ay * u + by) * u + cy) * u;
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (k) => {
    if (k <= 0) return 0;
    if (k >= 1) return 1;
    let u = k;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - k;
      if (Math.abs(e) < 1e-7) return sy(u);
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1; u = k;
    for (let i = 0; i < 40; i++) { const x = sx(u); if (Math.abs(x - k) < 1e-7) break; if (x < k) lo = u; else hi = u; u = (lo + hi) / 2; }
    return sy(u);
  };
}

const pIn = (p) => (k) => Math.pow(k, p);
const pOut = (p) => (k) => 1 - Math.pow(1 - k, p);
const pInOut = (p) => (k) => (k < 0.5 ? Math.pow(2 * k, p) / 2 : 1 - Math.pow(2 - 2 * k, p) / 2);
const BACK = 1.70158;

export const ease = {
  linear: (k) => k,
  inQuad: pIn(2), outQuad: pOut(2), inOutQuad: pInOut(2),
  inCubic: pIn(3), outCubic: pOut(3), inOutCubic: pInOut(3),
  inQuart: pIn(4), outQuart: pOut(4), inOutQuart: pInOut(4),
  inQuint: pIn(5), outQuint: pOut(5), inOutQuint: pInOut(5),
  inSine: (k) => 1 - Math.cos((k * Math.PI) / 2),
  outSine: (k) => Math.sin((k * Math.PI) / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  inExpo: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inOutExpo: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
  inCirc: (k) => 1 - Math.sqrt(1 - k * k),
  outCirc: (k) => Math.sqrt(1 - (k - 1) * (k - 1)),
  inOutCirc: (k) => (k < 0.5 ? (1 - Math.sqrt(1 - 4 * k * k)) / 2 : (Math.sqrt(1 - Math.pow(-2 * k + 2, 2)) + 1) / 2),
  inBack: (k) => (BACK + 1) * k * k * k - BACK * k * k,
  outBack: (k) => 1 + (BACK + 1) * Math.pow(k - 1, 3) + BACK * Math.pow(k - 1, 2),
  // Motion-design curves
  morph: bezier(0.7, 0, 0.3, 1),     // fastest in the middle, cushioned ends: shape morphs, wipes
  swift: bezier(0.55, 0, 0.1, 1),    // decisive move that lands softly
  snappy: bezier(0.2, 0.9, 0.1, 1),  // UI snaps
  anticipate: bezier(0.38, -0.4, 0.88, 0.65), // dips back before going
};

/* ───────────────────────────── springs ─────────────────────────────
   Closed-form damped-spring step response from 0 to 1. Pure function of time,
   so it is safe for seek(t). Parameterised by feel instead of physics:
     damping: damping ratio ζ (1 = no overshoot, 0.7 ≈ 4% overshoot, 0.5 ≈ 16%)
     settle:  seconds until the motion stays within 2% of the target
     velocity: initial velocity in "targets per second" (optional)                */

const springCache = new Map();
function springParams(damping, settle) {
  const key = damping + ':' + settle;
  let p = springCache.get(key);
  if (p) return p;
  const z = Math.max(0.05, damping), ts = Math.max(1e-3, settle);
  let w;
  if (Math.abs(z - 1) < 1e-3) w = 5.834 / ts;
  else if (z < 1) w = (Math.log(50) - 0.5 * Math.log(1 - z * z)) / (z * ts);
  else { const s = Math.sqrt(z * z - 1); w = (Math.log(50) + Math.log((z + s) / (2 * s))) / ((z - s) * ts); }
  p = { z, w };
  springCache.set(key, p);
  return p;
}

/** Spring progress 0→1 at local time t (t<0 → 0). preset = {damping, settle, velocity?}. */
export function spring(t, preset = SPRING.ui) {
  if (t <= 0) return 0;
  const { z, w } = springParams(preset.damping ?? 0.72, preset.settle ?? 0.35);
  const v0 = preset.velocity ?? 0;
  let e;
  if (Math.abs(z - 1) < 1e-3) {
    e = (-1 + (v0 - w) * t) * Math.exp(-w * t);
  } else if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    e = Math.exp(-z * w * t) * (-Math.cos(wd * t) + ((v0 - z * w) / wd) * Math.sin(wd * t));
  } else {
    const s = Math.sqrt(z * z - 1), r1 = -w * (z - s), r2 = -w * (z + s);
    const c1 = (v0 + r2) / (r1 - r2), c2 = -1 - c1;
    e = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }
  return 1 + e;
}

/** Spring velocity (progress per second) — handy for stretch / motion trails. */
export const springVel = (t, preset = SPRING.ui, h = 1 / 240) => (spring(t + h, preset) - spring(t - h, preset)) / (2 * h);

/** Make a preset from feel: settle seconds + damping ratio. */
export const spr = (settle, damping = 0.75, velocity = 0) => ({ settle, damping, velocity });

/** Presets by role. Different elements get different springs: that is what reads as "designed". */
export const SPRING = {
  snap:   { damping: 0.8,  settle: 0.25 }, // micro UI: toggles, clicks, small chips
  ui:     { damping: 0.72, settle: 0.35 }, // UI morphs, cards, buttons (≈4% overshoot)
  pop:    { damping: 0.55, settle: 0.5 },  // playful entrances, stickers, icons (≈13% overshoot)
  bouncy: { damping: 0.4,  settle: 0.8 },  // cartoon bounce — use sparingly
  text:   { damping: 0.86, settle: 0.45 }, // type reveals: confident, barely any overshoot
  smooth: { damping: 0.95, settle: 0.55 }, // panels, masks, wipes
  heavy:  { damping: 0.82, settle: 0.8 },  // big hero objects, large type, slabs
  camera: { damping: 1.0,  settle: 0.6 },  // camera moves: never overshoot
  drift:  { damping: 1.0,  settle: 1.4 },  // slow ambient settles, background parallax
};

/* ───────────────────────────── timing ───────────────────────────── */

/** Progress 0..1 of t through [a, b], optionally eased. */
export const seg = (t, a, b, e) => { const k = clamp01((t - a) / (b - a)); return e ? e(k) : k; };

/** Spring-driven value that changes target many times: the sum of one spring per change.
 *  keys: [[t0, v0], [t1, v1, preset?], ...] (numbers or arrays). Still a pure function of t,
 *  and a retarget mid-flight inherits the motion naturally. */
export function track(t, keys, preset = SPRING.ui) {
  const arr = Array.isArray(keys[0][1]);
  let v = arr ? keys[0][1].slice() : keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [ti, vi, p] = keys[i];
    const k = spring(t - ti, p || preset);
    if (k === 0) continue;
    const prev = keys[i - 1][1];
    if (arr) for (let j = 0; j < v.length; j++) v[j] += (vi[j] - prev[j]) * k;
    else v += (vi - prev) * k;
  }
  return v;
}

/** Keyframes with easing per segment: [[t0, v0], [t1, v1, easeFn?], ...]. Values may be arrays. */
export function kf(t, keys, e = ease.inOutCubic) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e1] = keys[i];
    if (t < t1) {
      const [t0, v0] = keys[i - 1];
      return mix(v0, v1, (e1 || e)(clamp01((t - t0) / (t1 - t0))));
    }
  }
  return keys[keys.length - 1][1];
}

/** Hold a value on a stepped clock (e.g. 12 fps "on twos" for hand-made feel). */
export const stepTime = (t, fps = 12) => Math.floor(t * fps + 1e-6) / fps;

/** Stagger offset for item i of n. order: 'start' | 'end' | 'center' | 'edges' | 'random'. */
export function staggerDelay(i, n, each, order = 'start', seed = 1) {
  switch (order) {
    case 'end': return (n - 1 - i) * each;
    case 'center': return Math.abs(i - (n - 1) / 2) * each;
    case 'edges': return ((n - 1) / 2 - Math.abs(i - (n - 1) / 2)) * each;
    case 'random': return hash(seed, i) * (n - 1) * each;
    default: return i * each;
  }
}

/** Run fn(node, k, i) for each unit with a staggered spring. opts: {stagger, preset, order, seed, delay} */
export function each(units, lt, opts, fn) {
  const { stagger = 0.03, preset = SPRING.text, order = 'start', seed = 1, delay = 0 } = opts || {};
  const n = units.length;
  for (let i = 0; i < n; i++) fn(units[i], spring(lt - delay - staggerDelay(i, n, stagger, order, seed), preset), i);
}

/* ───────────────────────────── beat grid & cues ───────────────────────────── */

/** Beat grid. bar/beat numbers are 0-based: bar 0 beat 0 = offset. */
export function makeGrid({ bpm = 120, offset = 0, beatsPerBar = 4 } = {}) {
  const spb = 60 / bpm;
  const g = {
    bpm, offset, beatsPerBar, spb, barLen: spb * beatsPerBar,
    beat: (n) => offset + n * spb,
    bar: (n, beat = 0) => offset + (n * beatsPerBar + beat) * spb,
    pos: (t) => (t - offset) / spb,                       // beat position (float)
    index: (t) => Math.floor((t - offset) / spb + 1e-6),  // integer beat
    barIndex: (t) => Math.floor((t - offset) / (spb * beatsPerBar) + 1e-6),
    phase: (t, every = 1) => fract((t - offset) / (spb * every)),
    /** 1 on each beat (or every N beats), decaying exponentially; 0 before the grid starts. */
    pulse: (t, decay = 10, every = 1) => { const p = (t - offset) / (spb * every); return p < 0 ? 0 : Math.exp(-decay * fract(p) * spb * every); },
    /** Snap a time to the nearest grid subdivision (1 = beat, 0.5 = eighth). */
    snap: (t, div = 1) => offset + Math.round((t - offset) / (spb * div)) * spb * div,
  };
  return g;
}

/** Parse a time expression: 3.25 | "3.25" | "beat:8" | "bar:4" | "bar:4:2" (bar 4, beat 2) | any of these + "+0.1" / "-0.25". */
export function parseTime(x, grid) {
  if (typeof x === 'number') return x;
  const m = String(x).trim().match(/^(?:(bar|beat|b):(-?[\d.]+)(?::(-?[\d.]+))?)?\s*([+-]\s*[\d.]+)?s?$/);
  if (!m) { const n = Number(x); if (Number.isFinite(n)) return n; throw new Error('bad time expression: ' + x); }
  let t = 0;
  if (m[1] === 'bar') t = grid.bar(Number(m[2]), Number(m[3] || 0));
  else if (m[1]) t = grid.beat(Number(m[2]));
  if (m[4]) t += Number(m[4].replace(/\s+/g, ''));
  return t;
}

/* ───────────────────────────── randomness & noise (seeded) ───────────────────────────── */

/** mulberry32: seeded PRNG. Create streams at setup time, never per frame. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of numbers → [0,1). Same inputs, same output, any frame order. */
export function hash(...xs) {
  let h = 0x811c9dc5 | 0;
  for (const x of xs) {
    let v = Math.floor(x * 1024) | 0;
    v = Math.imul(v ^ (v >>> 16), 0x7feb352d);
    v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
    h = Math.imul(h ^ v ^ (v >>> 16), 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const sm = (k) => k * k * (3 - 2 * k);
/** 1D value noise in [-1, 1]. */
export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  return lerp(hash(i, seed), hash(i + 1, seed), sm(f)) * 2 - 1;
}
/** 2D value noise in [-1, 1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}
/** Smooth organic wobble: amplitude amp, roughly freq cycles per second. */
export const wiggle = (t, freq = 1, amp = 1, seed = 0) => (noise(t * freq, seed) * 0.7 + noise(t * freq * 2.13, seed + 7) * 0.3) * amp;
/** Periodic oscillation that loops cleanly when `period` divides the loop length. */
export const osc = (t, period = 1, phase = 0) => Math.sin(TAU * (t / period + phase));

/* ───────────────────────────── color ───────────────────────────── */

export function hexToRgb(h) {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** Mix two hex colours in linear light (no muddy midpoints). Returns rgb() string. */
export function mixColor(a, b, k) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(clamp(toSrgb(lerp(toLin(v), toLin(B[i]), clamp01(k))), 0, 255)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
export const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };

/* ───────────────────────────── DOM ───────────────────────────── */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Create an element: el('div', {class: 'card', style: {left: '10px'}, text: 'hi'}, parent). */
export function el(tag, props = {}, parent) {
  const svgTags = /^(svg|path|g|circle|rect|line|polyline|polygon|ellipse|text|tspan|defs|linearGradient|radialGradient|stop|mask|clipPath|filter|fe[A-Z]\w*|use|pattern|symbol)$/;
  const n = svgTags.test(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) n.style.setProperty(sk, sv); else n.style[sk] = sv; }
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}

const fmt = (v, d = 3) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(d));

/** Write animated properties of a node. Call it every frame with every property you animate.
 *  x, y (px), s (scale), sx, sy, r (deg), skx, sky (deg), o (opacity), blur (px), origin,
 *  w, h (px), radius (px), bg, color, clip (clip-path string), z (z-index), vis (bool), and
 *  css: {any: 'raw style'}. Transforms are 2D on purpose: 3D/will-change layers rasterise once
 *  and turn blurry when scaled. Skips writes whose value did not change. */
export function set(n, p) {
  const st = n.style, c = n.__mg || (n.__mg = {});
  const w = (prop, val) => { if (c[prop] !== val) { c[prop] = val; st.setProperty(prop, val); } };
  if ('x' in p || 'y' in p || 's' in p || 'sx' in p || 'sy' in p || 'r' in p || 'skx' in p || 'sky' in p) {
    const s = p.s ?? 1, sx = (p.sx ?? 1) * s, sy = (p.sy ?? 1) * s;
    let tf = `translate(${fmt(p.x ?? 0)}px, ${fmt(p.y ?? 0)}px)`;
    if (p.r) tf += ` rotate(${fmt(p.r)}deg)`;
    if (p.skx || p.sky) tf += ` skew(${fmt(p.skx ?? 0)}deg, ${fmt(p.sky ?? 0)}deg)`;
    if (sx !== 1 || sy !== 1) tf += ` scale(${fmt(sx, 5)}, ${fmt(sy, 5)})`;
    w('transform', tf);
  }
  if ('origin' in p) w('transform-origin', p.origin);
  if ('o' in p) { const o = clamp01(p.o); w('opacity', String(fmt(o, 4))); if (!('vis' in p)) w('visibility', o <= 0.0005 ? 'hidden' : 'visible'); }
  if ('vis' in p) w('visibility', p.vis ? 'visible' : 'hidden');
  if ('blur' in p) w('filter', p.blur > 0.05 ? `blur(${fmt(p.blur, 2)}px)` : 'none');
  if ('w' in p) w('width', fmt(p.w, 2) + 'px');
  if ('h' in p) w('height', fmt(p.h, 2) + 'px');
  if ('radius' in p) w('border-radius', typeof p.radius === 'number' ? fmt(p.radius, 2) + 'px' : p.radius);
  if ('bg' in p) w('background', p.bg);
  if ('color' in p) w('color', p.color);
  if ('clip' in p) w('clip-path', p.clip || 'none');
  if ('z' in p) w('z-index', String(p.z));
  if (p.css) for (const [k, v] of Object.entries(p.css)) w(k, String(v));
  if (p.text != null && n.textContent !== String(p.text)) n.textContent = p.text;
}

/** Split an element's text into word and char spans (call once in setup).
 *  mask: wrap each word in an overflow-hidden box so letters can rise from behind a line. */
export function splitText(node, { mask = false } = {}) {
  const text = node.textContent;
  node.textContent = '';
  node.setAttribute('aria-label', text);
  const words = [], chars = [];
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { node.appendChild(document.createTextNode(' ')); continue; }
    const word = el('span', { class: 'mg-word', style: { display: 'inline-block', whiteSpace: 'nowrap' } }, node);
    let holder = word;
    if (mask) {
      Object.assign(word.style, { overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.14em', marginBottom: '-0.14em', paddingTop: '0.06em', marginTop: '-0.06em' });
      holder = el('span', { class: 'mg-word-in', style: { display: 'inline-block' } }, word);
    }
    for (const ch of [...part]) chars.push(el('span', { class: 'mg-char', style: { display: 'inline-block' }, text: ch }, holder));
    words.push(mask ? holder : word);
  }
  return { words, chars, text, node };
}

/** Deterministic text scramble: the first k·n characters are final, the rest flicker at `fps`. */
export function scramble(text, k, t, { fps = 24, seed = 3, glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>' } = {}) {
  const n = text.length, done = Math.floor(clamp01(k) * n), tick = Math.floor(t * fps);
  let out = '';
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (i < done || ch === ' ') out += ch;
    else out += glyphs[Math.floor(hash(seed, i, tick) * glyphs.length)];
  }
  return out;
}

/** Typewriter substring for progress k (0..1). */
export const typed = (text, k) => [...text].slice(0, Math.round(clamp01(k) * [...text].length)).join('');
/** Caret blink (1 = visible), stays solid while typing. */
export const caret = (t, rate = 1.06) => (fract(t * rate) < 0.5 ? 1 : 0);

/** Number roll: format a value between from→to at progress k. */
export function count(k, from, to, { decimals = 0, sep = ',', prefix = '', suffix = '' } = {}) {
  const v = lerp(from, to, k);
  const s = v.toFixed(decimals);
  const [i, f] = s.split('.');
  return prefix + i.replace(/\B(?=(\d{3})+(?!\d))/g, sep) + (f ? '.' + f : '') + suffix;
}

/* ───────────────────────────── camera ───────────────────────────── */

/** Camera from keys [[t, {x, y, z, r}], ...]: each change rides its own spring (pure function of t).
 *  Zoom is interpolated in log space so a 1→4 push feels as even as 4→16. Omitted fields carry over. */
export function camera(t, keys, preset = SPRING.camera) {
  let last = { x: 0, y: 0, z: 1, r: 0 };
  const xs = [], ys = [], zs = [], rs = [];
  for (const [tk, v, p] of keys) {
    last = { ...last, ...v };
    xs.push([tk, last.x, p]); ys.push([tk, last.y, p]); zs.push([tk, Math.log(last.z), p]); rs.push([tk, last.r, p]);
  }
  return { x: track(t, xs, preset), y: track(t, ys, preset), z: Math.exp(track(t, zs, preset)), r: track(t, rs, preset) };
}
/** CSS transform that puts world point (cam.x, cam.y) at the centre of a W×H frame. */
export const cameraCSS = (cam, W, H) =>
  `translate(${fmt(W / 2)}px, ${fmt(H / 2)}px) rotate(${fmt(cam.r)}deg) scale(${fmt(cam.z, 5)}) translate(${fmt(-cam.x)}px, ${fmt(-cam.y)}px)`;

/* ───────────────────────────── shapes & morphs ───────────────────────────── */

let sampler;
function samplePath(d, n) {
  if (!sampler) {
    const svg = el('svg', { width: 0, height: 0, style: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' } }, document.body);
    sampler = el('path', {}, svg);
  }
  sampler.setAttribute('d', d);
  const L = sampler.getTotalLength(), pts = [];
  for (let i = 0; i < n; i++) { const p = sampler.getPointAtLength((L * i) / n); pts.push([p.x, p.y]); }
  return pts;
}
const signedArea = (pts) => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** Point-matched morph between two single closed paths (call once in setup; returns k → d).
 *  Aligns winding and the starting vertex so the morph never knots. For very different shapes,
 *  chain through a simple intermediate (A → circle → B) and add squash/rotation during the move. */
export function morph(dA, dB, { samples = 128 } = {}) {
  const A = samplePath(dA, samples);
  let B = samplePath(dB, samples);
  if (Math.sign(signedArea(A)) !== Math.sign(signedArea(B))) B = B.reverse();
  let best = 0, bestD = Infinity;
  for (let s = 0; s < samples; s++) {
    let d = 0;
    for (let i = 0; i < samples; i += 2) { const p = A[i], q = B[(i + s) % samples]; d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; }
    if (d < bestD) { bestD = d; best = s; }
  }
  B = B.map((_, i) => B[(i + best) % samples]);
  return (k) => polyPath(A.map((p, i) => [lerp(p[0], B[i][0], k), lerp(p[1], B[i][1], k)]));
}
export const polyPath = (pts, closed = true) => 'M' + pts.map((p) => fmt(p[0], 2) + ' ' + fmt(p[1], 2)).join('L') + (closed ? 'Z' : '');
export function circlePath(cx, cy, r) { return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`; }
export function rectPath(x, y, w, h, r = 0) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
/** Organic blob: a circle whose radius breathes with seeded noise. Loops if `loop` divides evenly. */
export function blobPath(cx, cy, r, t, { seed = 1, amount = 0.12, speed = 0.5, points = 96 } = {}) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const n = noise2(Math.cos(a) * 1.3 + 10, Math.sin(a) * 1.3 + t * speed, seed);
    const rr = r * (1 + amount * n);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return polyPath(pts);
}
/** Draw-on for SVG strokes: k = 0 hidden, 1 fully drawn. Call once with the path to measure. */
export function drawOn(path, k) {
  const L = path.__len || (path.__len = path.getTotalLength());
  path.style.strokeDasharray = `${L} ${L}`;
  path.style.strokeDashoffset = String(fmt(L * (1 - clamp01(k)), 2));
}
/** Radius a circle at (cx, cy) needs to cover a W×H frame (for colour floods / iris wipes). */
export const coverRadius = (cx, cy, W, H) => Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));

/* ───────────────────────────── finishing ───────────────────────────── */

/** Film grain overlay that changes per frame deterministically. Returns {node, update(frame)}. */
export function grain(parent, { opacity = 0.07, size = 256, seed = 9, blend = 'overlay' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), r = rng(seed);
  for (let i = 0; i < size * size; i++) { const v = Math.floor(128 + (r() + r() + r() - 1.5) * 120); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = clamp(v, 0, 255); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const node = el('div', { class: 'mg-grain', style: { position: 'absolute', inset: '-50%', pointerEvents: 'none', backgroundImage: `url(${cv.toDataURL()})`, opacity: String(opacity), mixBlendMode: blend, zIndex: 999 } }, parent);
  return { node, update(frame) { const x = Math.floor(hash(frame, 1) * size), y = Math.floor(hash(frame, 2) * size); node.style.backgroundPosition = `${x}px ${y}px`; } };
}

/** Preload images (await in setup). Returns HTMLImageElement[] fully decoded. */
export async function loadImages(srcs) {
  return Promise.all(srcs.map(async (src) => { const im = new Image(); im.src = src; await im.decode(); return im; }));
}

/* ───────────────────────────── scenes ───────────────────────────── */

/** A scene is a time range with a draw(c) function; c = {t, lt, dur, p, name}. Scenes may overlap
 *  for transitions. `node` (optional) is shown only while the scene is active. */
export const scene = (name, start, end, draw, node) => ({ name, start, end, draw, node });

export function playScenes(scenes, t) {
  let active = null;
  for (const s of scenes) {
    const on = t >= s.start && t < s.end;
    if (s.node) s.node.style.display = on ? '' : 'none';
    if (on) { s.draw({ t, lt: t - s.start, dur: s.end - s.start, p: (t - s.start) / (s.end - s.start), name: s.name }); active = s.name; }
  }
  return active;
}
export const sceneAt = (scenes, t) => scenes.filter((s) => t >= s.start && t < s.end).map((s) => s.name).join(' + ');

/* ───────────────────────────── fonts ───────────────────────────── */

/** True if the family really renders (not a silent fallback). Works for webfonts and system fonts. */
export function fontRenders(family, weight = 400, style = 'normal') {
  const cv = fontRenders.cv || (fontRenders.cv = document.createElement('canvas'));
  const g = cv.getContext('2d');
  const probe = 'mmmmwwwwlliI1|0Oo@#ЖжЩщ — The quick brown fox 123';
  for (const fb of ['monospace', 'serif', 'sans-serif']) {
    g.font = `${style} ${weight} 72px ${fb}`;
    const base = g.measureText(probe).width;
    g.font = `${style} ${weight} 72px "${family}", ${fb}`;
    if (Math.abs(g.measureText(probe).width - base) > 0.5) return true;
  }
  return false;
}
function parseFontSpec(spec) {
  // e.g. '800 120px "Space Grotesk"', 'italic 400 32px Inter'
  const m = spec.match(/^\s*(italic|oblique|normal)?\s*(\d{3}|bold|normal)?\s*[\d.]+(?:px|pt|em|rem)\s*(?:\/\s*[\d.]+\S*)?\s*(.+)$/i);
  if (!m) return null;
  const w = m[2] === 'bold' ? 700 : m[2] && m[2] !== 'normal' ? Number(m[2]) : 400;
  return { style: m[1] || 'normal', weight: w, family: m[3].split(',')[0].trim().replace(/^["']|["']$/g, '') };
}

/* ───────────────────────────── mount ─────────────────────────────
   mount({ config: 'film.json', setup(ctx), render(t, ctx), fonts? })
   Reads film.json (format, beat grid, cues), loads fonts, runs setup once, then exposes:
     window.seek(t)   paints frame t          window.FILM   format + timing for the renderer
     window.__ready   true when seekable      window.__mgErrors  font/render problems
   In setup you may set ctx.sceneList = [scene(...), ...] (for labels in sheets and the player)
   and push hard-cut times to ctx.cuts (motion blur never blends across a cut).            */

export async function mount(opts) {
  const errors = (window.__mgErrors = window.__mgErrors || []);
  let cfg = {};
  if (opts.config !== false) {
    try { cfg = await (await fetch(opts.config || 'film.json', { cache: 'no-store' })).json(); }
    catch (e) { errors.push('could not load film.json: ' + e.message); }
  }
  cfg = { width: 1920, height: 1080, fps: 30, duration: 10, background: '#000', loop: false, cuts: [], ...cfg, ...(opts.overrides || {}) };
  const grid = makeGrid(cfg);
  const cueMap = new Map();
  for (const c of cfg.cues || []) if (c.id) cueMap.set(c.id, parseTime(c.t, grid));
  const cue = (id, offset = 0) => {
    if (!cueMap.has(id)) { const m = `unknown cue "${id}"`; if (!errors.includes(m)) errors.push(m); return 0; }
    return cueMap.get(id) + offset;
  };
  const params = new URLSearchParams(location.search);
  // Formats: film.json "formats": {"9x16": [1080, 1920], ...}; pick with ?format=9x16 (render.mjs --format 9x16).
  // Re-lay out per format from ctx.W/ctx.H — never just crop the 16:9 film.
  const format = params.get('format') || cfg.format || null;
  if (format) {
    if (cfg.formats && cfg.formats[format]) [cfg.width, cfg.height] = cfg.formats[format];
    else errors.push(`unknown format "${format}" (add it to film.json "formats")`);
  }
  const W = cfg.width, H = cfg.height;
  const renderMode = params.has('render') || navigator.webdriver === true;

  document.documentElement.classList.add(renderMode ? 'mg-render' : 'mg-preview');
  const stage = document.getElementById('stage') || el('div', { id: 'stage' }, document.body);
  Object.assign(stage.style, { position: 'relative', width: W + 'px', height: H + 'px', overflow: 'hidden', background: cfg.background });

  // Fonts: load every face the film declares, and fail loudly instead of silently falling back.
  const fonts = [...(cfg.fonts || []), ...(opts.fonts || [])];
  // Load every declared face up front, every unicode-range subset included (Cyrillic, Greek…), so no glyph
  // arrives late and renders one frame in a fallback font.
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
  await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
  for (const f of fonts) {
    const p = parseFontSpec(f);
    if (!p) { errors.push(`bad font spec "${f}" (use CSS shorthand like '700 64px "Inter"')`); continue; }
    if (!document.fonts.check(f) || !fontRenders(p.family, p.weight, p.style)) errors.push(`font not available: ${f} — it would silently fall back`);
  }

  const ctx = { W, H, format, cfg, grid, cue, stage, t: 0, frame: 0, fps: cfg.fps, duration: cfg.duration, renderMode, cuts: [], sceneList: null, parseTime: (x) => parseTime(x, grid) };
  if (opts.setup) await opts.setup(ctx);

  const cuts = [...(cfg.cuts || []), ...ctx.cuts].map((c) => parseTime(c, grid));
  window.FILM = {
    title: cfg.title || document.title, width: W, height: H, fps: cfg.fps, duration: cfg.duration, loop: !!cfg.loop,
    cuts: [...new Set(cuts.filter((c) => c > 0 && c < cfg.duration))].sort((a, b) => a - b),
    holds: (cfg.holds || []).map(([a, b]) => [parseTime(a, grid), parseTime(b, grid)]),
    bpm: cfg.bpm, offset: cfg.offset || 0, beatsPerBar: cfg.beatsPerBar || 4,
    cues: [...cueMap.entries()].map(([id, t]) => ({ id, t })),
  };
  window.FILM.sceneAt = (t) => (ctx.sceneList ? sceneAt(ctx.sceneList, t) : '');

  // info = {frame, sub, subs} when the renderer draws motion-blur subframes: ctx.frame stays the
  // output frame for every subframe (so grain and stepped looks don't smear).
  window.seek = async (t, info) => {
    ctx.t = t;
    ctx.frame = info && Number.isFinite(info.frame) ? info.frame : Math.round(t * cfg.fps);
    try { await opts.render(t, ctx); }
    catch (e) { const m = `render error at t=${t.toFixed(3)}: ${e && e.stack ? e.stack : e}`; errors.push(m); console.error(m); throw e; }
  };
  await window.seek(Number(params.get('t') || 0));
  if (!renderMode) startPlayer(ctx);
  window.__ready = true;
  return ctx;
}

/* ───────────────────────────── preview player (harness only) ───────────────────────────── */

function startPlayer(ctx) {
  const { W, H, cfg, grid } = ctx;
  const stage = ctx.stage;
  const css = el('style', { text: `
    html.mg-preview, html.mg-preview body { margin:0; height:100%; background:#0b0b0d; overflow:hidden; font:12px/1.2 ui-monospace, Menlo, Consolas, monospace; color:#ddd; }
    .mg-frame { position:absolute; left:50%; top:calc(50% - 26px); transform-origin:0 0; box-shadow:0 0 0 1px #2a2a2e, 0 20px 80px #000; }
    .mg-bar { position:fixed; left:0; right:0; bottom:0; height:52px; display:flex; align-items:center; gap:12px; padding:0 14px; background:#141417; border-top:1px solid #26262b; }
    .mg-bar button { all:unset; cursor:pointer; padding:6px 10px; border-radius:6px; background:#25252b; }
    .mg-bar input[type=range] { flex:1; accent-color:#e8e8ea; }
    .mg-guides { position:absolute; inset:0; pointer-events:none; display:none; z-index:10000; }
    .mg-guides.on { display:block; }
    .mg-guides div { position:absolute; border:1px dashed rgba(255,60,120,.7); }` }, document.head);
  void css;
  const frame = el('div', { class: 'mg-frame' }, document.body);
  frame.appendChild(stage);
  const guides = el('div', { class: 'mg-guides' }, stage);
  el('div', { style: { left: '5%', top: '5%', right: '5%', bottom: '5%' } }, guides);   // action safe
  el('div', { style: { left: '10%', top: '10%', right: '10%', bottom: '10%' } }, guides); // title safe
  const bar = el('div', { class: 'mg-bar' }, document.body);
  const play = el('button', { text: '▶' }, bar);
  const range = el('input', { type: 'range', min: 0, max: cfg.duration, step: 1 / cfg.fps, value: 0 }, bar);
  const info = el('span', { style: { minWidth: '330px', textAlign: 'right', whiteSpace: 'nowrap' } }, bar);
  const fit = () => {
    const s = Math.min((innerWidth - 40) / W, (innerHeight - 92) / H);
    frame.style.transform = `scale(${s}) translate(-50%, -50%)`;
  };
  addEventListener('resize', fit); fit();

  let audio = null;
  const audioSrc = cfg.previewAudio || 'out/audio.wav';
  fetch(audioSrc, { method: 'HEAD' }).then((r) => { if (r.ok) { audio = new Audio(audioSrc); audio.preload = 'auto'; } }).catch(() => {});

  let t = 0, playing = false, t0 = 0, wall0 = 0;
  const show = async (tt) => {
    t = clamp(tt, 0, cfg.duration - 1 / cfg.fps);
    await window.seek(t);
    range.value = t;
    const b = grid.pos(t), bars = Math.floor(b / grid.beatsPerBar);
    info.textContent = `${t.toFixed(2)}s  f${Math.round(t * cfg.fps)}  bar ${bars}:${Math.floor(b - bars * grid.beatsPerBar)}  ${window.FILM.sceneAt(t)}`;
  };
  const loop = (now) => {
    if (!playing) return;
    let tt = audio && !audio.paused ? audio.currentTime : t0 + (now - wall0) / 1000;
    if (tt >= cfg.duration) { tt = 0; t0 = 0; wall0 = now; if (audio) audio.currentTime = 0; } // preview always loops
    show(tt).then(() => requestAnimationFrame(loop));
  };
  const toggle = () => {
    playing = !playing;
    play.textContent = playing ? '❚❚' : '▶';
    if (playing) { t0 = t; wall0 = performance.now(); if (audio) { audio.currentTime = t; audio.play().catch(() => {}); } requestAnimationFrame(loop); }
    else if (audio) audio.pause();
  };
  play.onclick = toggle;
  range.oninput = () => { if (playing) toggle(); show(Number(range.value)); };
  addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : 1 / cfg.fps;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowRight') show(t + step);
    else if (e.code === 'ArrowLeft') show(t - step);
    else if (e.code === 'BracketRight') show(grid.beat(Math.floor(grid.pos(t)) + 1));
    else if (e.code === 'BracketLeft') show(grid.beat(Math.ceil(grid.pos(t)) - 1));
    else if (e.code === 'KeyG') guides.classList.toggle('on');
    else if (e.code === 'Home') show(0);
  });
  show(Number(new URLSearchParams(location.search).get('t') || 0));
}
