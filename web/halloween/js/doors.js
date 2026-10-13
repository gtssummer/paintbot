// doors.js — procedural doors in the spirit of a door vault: steel frames with a lamp on the crown,
// colourful leaves with raised panels, patterns, Halloween decals and wear. Every door is drawn with
// vector canvas calls, so the same function makes conveyor sprites and the high-res hero door.
import { rng, clamp } from './lib/mg.js';
import { GEO } from './spin.js';

const BODIES = ['#c8373b', '#3f8a52', '#2f6fa8', '#e8783a', '#efd86a', '#7a4bb5', '#d27fcb', '#77c46f', '#8c2626',
  '#5bc0c6', '#2a8c8a', '#c2357e', '#e6d8b8', '#2b4482', '#a9c93a', '#94603a', '#f29bb0', '#4d5bd6', '#e4572e', '#3a3f58'];
const LAYOUTS = ['quad', 'single', 'tri', 'twin', 'six', 'port', 'arch', 'diamond', 'quad', 'twin', 'tri', 'single'];
const PATTERNS = [null, null, null, null, null, 'dots', 'stripes', 'stars', 'flowers', 'zig', 'checker', 'hearts'];
const DECALS = [null, null, null, null, null, null, null, 'pumpkin', 'bat', 'moon', 'ghost', 'web'];
const TRIMS = ['#8e949a', '#7c8389', '#a3a8ac', '#6d7277', '#9c8a62', '#8a9196'];
const KNOBS = ['#262626', '#262626', '#2a2a2a', '#c9a43a', '#c7ccd0'];

export function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
/** Darken (k < 0) or lighten (k > 0) a hex colour. */
export function shade(hex, k) {
  const c = hexRgb(hex).map((v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const lum = (hex) => { const [r, g, b] = hexRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

export function makeStyles(n, seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const out = [];
  for (let i = 0; i < n; i++) {
    const body = BODIES[(i * 7 + Math.floor(r() * 5)) % BODIES.length];
    const light = lum(body) > 0.62;
    const two = r() < 0.18; // two-tone door: contrasting panels like the maroon/yellow one
    out.push({
      body,
      panel: two ? pick(['#e2d24a', '#f3efe2', '#2b2b33', '#f08a3c']) : shade(body, light ? -0.12 : -0.22),
      layout: pick(LAYOUTS),
      knobSide: r() < 0.82 ? 'right' : 'left',
      knob: pick(KNOBS),
      trim: pick(TRIMS),
      pattern: pick(PATTERNS),
      patternInk: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)',
      decal: pick(DECALS),
      kick: r() < 0.35,
      wear: 0.3 + r() * 0.7,
      seed: Math.floor(r() * 1e6),
    });
  }
  return out;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** Raised panel with bevel: dark top-left edge, light bottom-right edge. */
function panel(g, st, x, y, w, h, r = 4) {
  rr(g, x, y, w, h, r);
  g.fillStyle = st.panel; g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.beginPath(); g.moveTo(x + 1, y + h - 1); g.lineTo(x + 1, y + 1); g.lineTo(x + w - 1, y + 1); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.moveTo(x + w - 1, y + 2); g.lineTo(x + w - 1, y + h - 1); g.lineTo(x + 2, y + h - 1); g.stroke();
}

function star(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  g.closePath(); g.fill();
}

function drawPattern(g, st, w, h) {
  if (!st.pattern) return;
  const r = rng(st.seed + 3);
  g.save();
  g.fillStyle = st.patternInk; g.strokeStyle = st.patternInk;
  switch (st.pattern) {
    case 'dots': for (let y = 10; y < h; y += 18) for (let x = (y / 18) % 2 ? 9 : 18; x < w; x += 18) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); } break;
    case 'stripes': g.lineWidth = 7; for (let x = -h; x < w; x += 22) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); } break;
    case 'stars': for (let i = 0; i < 16; i++) star(g, r() * w, r() * h, 3 + r() * 4); break;
    case 'flowers':
      for (let i = 0; i < 11; i++) {
        const cx = r() * w, cy = r() * h, s = 3 + r() * 3;
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * s, cy + Math.sin(a) * s, s * 0.75, 0, Math.PI * 2); g.fill(); }
      }
      break;
    case 'zig': g.lineWidth = 4; for (let y = 14; y < h; y += 26) { g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, y + ((x / 12) % 2 ? 7 : 0)); g.stroke(); } break;
    case 'checker': for (let y = 0; y < h; y += 16) for (let x = ((y / 16) % 2) * 16; x < w; x += 32) g.fillRect(x, y, 16, 16); break;
    case 'hearts':
      for (let i = 0; i < 10; i++) {
        const x = r() * w, y = r() * h, s = 4 + r() * 3;
        g.beginPath(); g.moveTo(x, y + s); g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.4, y - s * 1.3, x, y - s * 0.3);
        g.bezierCurveTo(x + s * 0.4, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s); g.fill();
      }
      break;
  }
  g.restore();
}

function drawDecal(g, st, w, h) {
  if (!st.decal) return;
  const cx = w / 2 + (st.knobSide === 'right' ? -8 : 8), cy = h * 0.27;
  g.save();
  g.translate(cx, cy);
  switch (st.decal) {
    case 'pumpkin': {
      g.fillStyle = '#ef7a1d';
      for (const dx of [-9, 9, 0]) { g.beginPath(); g.ellipse(dx, 0, dx ? 9 : 10, 12, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#c95d0f'; g.fillRect(-1, -11, 2, 22);
      g.fillStyle = '#3c6b1c'; g.fillRect(-2, -16, 4, 6);
      g.fillStyle = '#2a1404';
      g.beginPath(); g.moveTo(-9, -3); g.lineTo(-4, -3); g.lineTo(-6.5, -8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(9, -3); g.lineTo(4, -3); g.lineTo(6.5, -8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-10, 3); g.lineTo(10, 3); g.lineTo(6, 8); g.lineTo(3, 5); g.lineTo(0, 8); g.lineTo(-3, 5); g.lineTo(-6, 8); g.closePath(); g.fill();
      break;
    }
    case 'bat': {
      g.fillStyle = '#16121c';
      g.beginPath(); g.moveTo(0, -4);
      g.quadraticCurveTo(-8, -10, -22, -6); g.quadraticCurveTo(-17, -2, -18, 3); g.quadraticCurveTo(-12, 0, -9, 5); g.quadraticCurveTo(-5, 2, 0, 6);
      g.quadraticCurveTo(5, 2, 9, 5); g.quadraticCurveTo(12, 0, 18, 3); g.quadraticCurveTo(17, -2, 22, -6); g.quadraticCurveTo(8, -10, 0, -4); g.fill();
      g.beginPath(); g.moveTo(-3, -5); g.lineTo(-2, -9); g.lineTo(0, -6); g.lineTo(2, -9); g.lineTo(3, -5); g.fill();
      break;
    }
    case 'moon': {
      g.fillStyle = '#f4e9a8'; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(6, -4, 11, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'ghost': {
      g.fillStyle = '#f2f2ee';
      g.beginPath(); g.arc(0, -3, 10, Math.PI, 0); g.lineTo(10, 11);
      for (let i = 0; i < 4; i++) g.quadraticCurveTo(7.5 - i * 5, 7, 5 - i * 5, 11);
      g.closePath(); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(-3.5, -3, 1.8, 0, Math.PI * 2); g.arc(3.5, -3, 1.8, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'web': {
      g.strokeStyle = 'rgba(240,240,240,0.55)'; g.lineWidth = 1;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); g.stroke(); }
      for (const rad of [5, 10, 15]) { g.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.stroke(); }
      break;
    }
  }
  g.restore();
}

function layoutPanels(g, st, w, h) {
  const m = 13, kx = st.knobSide === 'right' ? 0 : 4; // keep panels clear of the knob
  const x0 = m + kx, x1 = w - m - (st.knobSide === 'right' ? 4 : 0), W = x1 - x0;
  switch (st.layout) {
    case 'quad': { const pw = (W - 10) / 2, ph = (h - 2 * m - 12) / 2; for (const yy of [m, m + ph + 12]) { panel(g, st, x0, yy, pw, ph); panel(g, st, x0 + pw + 10, yy, pw, ph); } break; }
    case 'single': panel(g, st, x0 + 6, m + 6, W - 12, h - 2 * m - 12); break;
    case 'tri': { const ph = (h - 2 * m - 20) / 3; for (let i = 0; i < 3; i++) panel(g, st, x0, m + i * (ph + 10), W, ph); break; }
    case 'twin': { const pw = (W - 10) / 2; panel(g, st, x0, m, pw, h - 2 * m); panel(g, st, x0 + pw + 10, m, pw, h - 2 * m); break; }
    case 'six': { const pw = (W - 10) / 2, ph = (h - 2 * m - 20) / 3; for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) panel(g, st, x0 + i * (pw + 10), m + j * (ph + 10), pw, ph); break; }
    case 'port': {
      const cx = w / 2, cy = m + 38, R = 27;
      g.beginPath(); g.arc(cx, cy, R + 5, 0, Math.PI * 2); g.fillStyle = shade(st.body, -0.35); g.fill();
      const gr = g.createRadialGradient(cx - 8, cy - 9, 2, cx, cy, R);
      gr.addColorStop(0, '#5b8f95'); gr.addColorStop(1, '#0f2a2f');
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R - 6, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
      panel(g, st, x0 + 4, m + 80, W - 8, h - m * 2 - 80);
      break;
    }
    case 'arch': {
      const px = x0 + 6, py = m + 6, pw = W - 12, ph = h - 2 * m - 12;
      g.beginPath(); g.moveTo(px, py + pw / 2); g.arc(px + pw / 2, py + pw / 2, pw / 2, Math.PI, 0); g.lineTo(px + pw, py + ph); g.lineTo(px, py + ph); g.closePath();
      g.fillStyle = st.panel; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.stroke();
      break;
    }
    case 'diamond': {
      panel(g, st, x0, m, W, h - 2 * m);
      const cx = w / 2, cy = h / 2, a = W * 0.36, b = h * 0.28;
      g.beginPath(); g.moveTo(cx, cy - b); g.lineTo(cx + a, cy); g.lineTo(cx, cy + b); g.lineTo(cx - a, cy); g.closePath();
      g.fillStyle = shade(st.body, 0.12); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; g.stroke();
      break;
    }
  }
}

/** The door leaf in its own coordinates (0,0)-(w,h). */
export function drawLeaf(g, st, w = GEO.leafW, h = GEO.leafH) {
  g.save();
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, shade(st.body, 0.08)); base.addColorStop(0.55, st.body); base.addColorStop(1, shade(st.body, -0.16));
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
  drawPattern(g, st, w, h);
  // faint grain
  const r = rng(st.seed);
  g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 6, h); g.stroke(); }
  layoutPanels(g, st, w, h);
  if (st.kick) { const kg = g.createLinearGradient(0, h - 26, 0, h); kg.addColorStop(0, '#c9ced1'); kg.addColorStop(1, '#7d8489'); g.fillStyle = kg; g.fillRect(4, h - 24, w - 8, 18); g.fillStyle = 'rgba(0,0,0,0.25)'; for (const x of [10, w - 10]) { g.beginPath(); g.arc(x, h - 15, 1.6, 0, 7); g.fill(); } }
  drawDecal(g, st, w, h);
  // knob + plate
  const kx = st.knobSide === 'right' ? w - 16 : 16, ky = h * 0.53;
  rr(g, kx - 5, ky - 15, 10, 30, 3); g.fillStyle = 'rgba(20,20,22,0.55)'; g.fill();
  const kg = g.createRadialGradient(kx - 2.5, ky - 2.5, 0.5, kx, ky, 7.5);
  kg.addColorStop(0, '#ffffff'); kg.addColorStop(0.25, st.knob); kg.addColorStop(1, shade(st.knob, -0.5));
  g.beginPath(); g.arc(kx, ky, 7, 0, Math.PI * 2); g.fillStyle = kg; g.fill();
  // wear: scuff near the knob, darker bottom, edge shadow
  g.fillStyle = `rgba(30,20,10,${0.1 * st.wear})`; g.beginPath(); g.ellipse(kx, ky + 6, 14, 22, 0, 0, Math.PI * 2); g.fill();
  const wg = g.createLinearGradient(0, h * 0.7, 0, h); wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(1, `rgba(0,0,0,${0.22 * st.wear})`);
  g.fillStyle = wg; g.fillRect(0, h * 0.7, w, h * 0.3);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  g.restore();
}

/** Steel frame with crown and lamp socket; (0,0) is the frame's top-left including the crown. */
export function drawFrame(g, st, { opening = true } = {}) {
  const W = GEO.frameW, H = GEO.frameH, C = GEO.crown, trim = st.trim;
  g.save();
  // crown cornice with the lamp boss
  g.beginPath();
  g.moveTo(-5, C); g.lineTo(W + 5, C); g.lineTo(W + 1, C - 7); g.lineTo(W / 2 + 15, C - 7);
  g.arc(W / 2, C - 7, 15, 0, Math.PI, true);
  g.lineTo(-1, C - 7); g.closePath();
  const cg = g.createLinearGradient(0, 0, 0, C); cg.addColorStop(0, shade(trim, 0.25)); cg.addColorStop(1, shade(trim, -0.2));
  g.fillStyle = cg; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.stroke();
  // lamp socket
  g.beginPath(); g.arc(W / 2, C - 12, 7, 0, Math.PI * 2); g.fillStyle = '#2a2d30'; g.fill();
  // frame body
  const fg = g.createLinearGradient(0, 0, W, 0);
  fg.addColorStop(0, shade(trim, 0.18)); fg.addColorStop(0.5, trim); fg.addColorStop(1, shade(trim, -0.25));
  g.fillStyle = fg; g.fillRect(0, C, W, H - C);
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; g.strokeRect(0.75, C + 0.75, W - 1.5, H - C - 1.5);
  // opening (the leaf covers it; the hero door shows it when open)
  if (opening) { g.fillStyle = '#0b0d0e'; g.fillRect(GEO.leafX, GEO.leafY, GEO.leafW, GEO.leafH); }
  // rivets
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [x, y] of [[4.5, C + 5], [W - 4.5, C + 5], [4.5, H - 5], [W - 4.5, H - 5], [4.5, (C + H) / 2], [W - 4.5, (C + H) / 2]]) { g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

/** Door as hung on the rail: hanger + trolley + frame + closed leaf. y=0 is the rail's centre line. */
export function drawHungDoor(g, st) {
  const W = GEO.frameW, top = 15 + GEO.hanger;
  g.save();
  // trolley riding the rail's lower flange
  g.fillStyle = '#23292c'; g.fillRect(W / 2 - 22, 6, 44, 13);
  g.fillStyle = '#3a4246'; g.fillRect(W / 2 - 22, 6, 44, 3);
  for (const dx of [-13, 13]) { g.beginPath(); g.arc(W / 2 + dx, 4, 6, 0, Math.PI * 2); g.fillStyle = '#15191b'; g.fill(); g.beginPath(); g.arc(W / 2 + dx, 4, 2.2, 0, Math.PI * 2); g.fillStyle = '#5b6468'; g.fill(); }
  // hanger rods
  g.strokeStyle = '#2a3034'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(W / 2 - 14, 18); g.lineTo(W / 2 - 30, top + 9); g.moveTo(W / 2 + 14, 18); g.lineTo(W / 2 + 30, top + 9); g.stroke();
  g.translate(0, top);
  drawFrame(g, st, { opening: false });
  g.translate(GEO.leafX, GEO.leafY);
  drawLeaf(g, st);
  g.restore();
}
export const HUNG = { padX: 8, top: -8, height: 15 + GEO.hanger + GEO.frameH + 12 }; // sprite bounds relative to rail centre
