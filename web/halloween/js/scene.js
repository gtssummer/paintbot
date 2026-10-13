// scene.js — the door vault, drawn on one canvas from a frame-state object (no internal clock).
// Layers back to front: haze & far wall → far conveyors (parallax) → lamps & cones → rails + doors
// (true per-row motion blur) → lock station → hero door (3D swing + doorway light) → steam, dust →
// foreground pipes → particles → flash, vignette.
import { clamp, clamp01, lerp, hash, noise, rng, TAU, spring } from './lib/mg.js';
import { GEO, slotX, FAR, mod } from './spin.js';
import { makeStyles, drawLeaf, drawFrame, drawHungDoor, HUNG, shade } from './doors.js';

const BG = { top: '#04100f', mid: '#0a2224', low: '#061516', haze: 'rgba(28,74,72,', amber: '#ffb75e' };

export class Vault {
  constructor(canvas, styles) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.styles = styles;                       // [row][i]
    this.farStyles = makeStyles(24, 77);
    this.blur = document.createElement('canvas');
    this.bg2 = this.blur.getContext('2d');
    this.S = 0;
    this.sprites = null;
    this.hero = null;                            // { key, leaf: canvas, back: canvas }
    this.particles = makeParticles(320, 4242);
    this.sparks = makeParticles(60, 99, true);
    this.latchSparks = this.sparks.slice(0, 24);
    this.motes = Array.from({ length: 46 }, (_, i) => ({ x: hash(i, 1) * 1920, y: 120 + hash(i, 2) * 900, s: 0.8 + hash(i, 3) * 1.8, p: hash(i, 4) * 10 }));
    this.grain = makeGrainTile(256, 7);
  }

  resize(stageScale, dpr, cap = 1.5) {
    const S = Math.min(stageScale * dpr, cap);
    const w = Math.round(1920 * S), h = Math.round(1080 * S);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    if (this.blur.width !== w || this.blur.height !== h) { this.blur.width = w; this.blur.height = h; } // the motion-blur buffer must match
    const spriteScale = clamp(Math.ceil(S * 4) / 4, 0.75, 1.5);
    if (spriteScale !== this.spriteScale) { this.spriteScale = spriteScale; this.buildSprites(); }
    this.S = S;
    this.vig = null;
  }

  buildSprites() {
    const k = this.spriteScale, W = GEO.frameW + HUNG.padX * 2, H = HUNG.height;
    const make = (st, kk) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * kk); c.height = Math.ceil(H * kk);
      const g = c.getContext('2d');
      g.scale(kk, kk); g.translate(HUNG.padX, -HUNG.top);
      drawHungDoor(g, st);
      return c;
    };
    this.sprites = this.styles.map((row) => row.map((st) => make(st, k)));
    this.farSprites = this.farStyles.map((st) => make(st, 0.5));
  }

  heroTextures(style) {
    const key = style.seed;
    if (this.hero && this.hero.key === key) return this.hero;
    const k = 4, w = GEO.leafW, h = GEO.leafH;
    const leaf = document.createElement('canvas'); leaf.width = w * k; leaf.height = h * k;
    const g = leaf.getContext('2d'); g.scale(k, k); drawLeaf(g, style, w, h);
    const back = document.createElement('canvas'); back.width = w * k; back.height = h * k;
    const b = back.getContext('2d'); b.scale(k, k);
    b.save(); b.translate(w, 0); b.scale(-1, 1); drawLeaf(b, { ...style, decal: null, pattern: null }, w, h); b.restore(); // the back of the same door
    b.fillStyle = 'rgba(0,0,0,0.32)'; b.fillRect(0, 0, w, h);
    this.hero = { key, leaf, back };
    return this.hero;
  }

  // world → screen for a parallax layer with depth factor k (1 = main plane)
  camFor(cam, k) { return { x: 960 + (cam.x - 960) * k, y: 540 + (cam.y - 540) * k, z: 1 + (cam.z - 1) * k }; }
  setCam(g, cam, k, shake) {
    const c = this.camFor(cam, k), S = this.S;
    g.setTransform(S * c.z, 0, 0, S * c.z, S * (960 - c.x * c.z + shake.x * k), S * (540 - c.y * c.z + shake.y * k));
    return c;
  }
  screen(g) { g.setTransform(this.S, 0, 0, this.S, 0, 0); }

  draw(f) {
    const g = this.g, t = f.t;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    this.screen(g);
    const bg = g.createLinearGradient(0, 0, 0, 1080);
    bg.addColorStop(0, BG.top); bg.addColorStop(0.45, BG.mid); bg.addColorStop(1, BG.low);
    g.fillStyle = bg; g.fillRect(0, 0, 1920, 1080);

    this.drawFarWall(g, f);
    this.drawBats(g, f);
    this.drawFarRows(g, f);
    this.drawLamps(g, f);
    this.drawRows(g, f);
    this.drawStation(g, f);
    if (f.dim > 0.001) { this.screen(g); g.fillStyle = `rgba(2,6,7,${0.62 * f.dim})`; g.fillRect(0, 0, 1920, 1080); }
    if (f.sel.on) this.drawHero(g, f);
    this.drawSteam(g, f);
    this.drawPipes(g, f);
    this.drawBeacons(g, f);
    this.drawSpeedLines(g, f);
    this.drawParticles(g, f);
    this.drawFinish(g, f);
  }

  drawFarWall(g, f) {
    this.setCam(g, f.cam, 0.22, f.shake);
    // girders
    for (let x = -1680; x < 3600; x += 240) {
      const gr = g.createLinearGradient(x, 0, x + 34, 0);
      gr.addColorStop(0, '#0c2224'); gr.addColorStop(0.5, '#123033'); gr.addColorStop(1, '#081a1b');
      g.fillStyle = gr; g.fillRect(x, -400, 34, 1900);
    }
    // catwalks with tiny warm lights
    for (const y of [150, 600, 930]) {
      g.fillStyle = '#0d2628'; g.fillRect(-1700, y, 5400, 10);
      g.strokeStyle = 'rgba(120,170,165,0.12)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-1700, y - 18); g.lineTo(3700, y - 18); g.stroke();
      for (let x = -1640; x < 3600; x += 160) {
        const on = 0.55 + 0.45 * Math.sin(f.t * 0.7 + x * 0.013);
        g.fillStyle = `rgba(255,190,110,${0.5 * on})`; g.beginPath(); g.arc(x, y - 4, 2.2, 0, TAU); g.fill();
        const gl = g.createRadialGradient(x, y - 4, 0, x, y - 4, 26);
        gl.addColorStop(0, `rgba(255,170,90,${0.18 * on})`); gl.addColorStop(1, 'rgba(255,170,90,0)');
        g.fillStyle = gl; g.fillRect(x - 26, y - 30, 52, 52);
      }
    }
  }

  drawBats(g, f) {
    const a = f.batsK; if (a <= 0.01) return;
    this.setCam(g, f.cam, 0.35, f.shake);
    g.fillStyle = `rgba(2,8,9,${0.85 * a})`;
    for (let i = 0; i < 3; i++) {
      const period = [11, 14, 17][i], ph = (f.t / period + i * 0.37) % 1;
      if (ph > 0.55) continue;
      const k = ph / 0.55, x = lerp(-300, 2200, k), y = [210, 330, 160][i] + Math.sin(f.t * 1.7 + i) * 26 + k * 40;
      const flap = Math.sin(f.t * (13 + i * 2)), s = [1, 0.75, 0.6][i];
      g.save(); g.translate(x, y); g.scale(s, s);
      g.beginPath(); g.ellipse(0, 0, 5, 7, 0, 0, TAU); g.fill();
      for (const d of [-1, 1]) {
        g.beginPath(); g.moveTo(0, -2);
        g.quadraticCurveTo(d * 12, -14 * flap - 6, d * 26, -10 * flap);
        g.quadraticCurveTo(d * 20, -4 * flap + 2, d * 15, 2 - 6 * flap);
        g.quadraticCurveTo(d * 10, -2, d * 4, 4); g.closePath(); g.fill();
      }
      g.restore();
    }
  }

  drawFarRows(g, f) {
    for (const row of FAR) {
      const c = this.setCam(g, f.cam, row.k, f.shake);
      const L = row.pitch * row.n, off = row.dir * row.speed * f.t + row.seed * 37;
      g.fillStyle = '#0b1c1e'; g.fillRect(-1800, row.y - 8, 5600, 7);
      const vis0 = c.x - 960 / c.z - 80, vis1 = c.x + 960 / c.z + 20;
      g.globalAlpha = 0.34;
      const sw = (GEO.frameW + HUNG.padX * 2) * row.scale, sh = HUNG.height * row.scale;
      for (let i = 0; i < row.n; i++) {
        const x = c.x - L / 2 + mod(i * row.pitch + off - (c.x - L / 2), L);
        if (x < vis0 || x > vis1) continue;
        g.drawImage(this.farSprites[(i + row.seed) % this.farSprites.length], x, row.y + HUNG.top * row.scale, sw, sh);
      }
      g.globalAlpha = 1;
    }
    // haze over the far plane
    this.screen(g);
    const hz = g.createLinearGradient(0, 0, 0, 1080);
    hz.addColorStop(0, 'rgba(10,36,38,0.55)'); hz.addColorStop(0.5, 'rgba(12,44,46,0.35)'); hz.addColorStop(1, 'rgba(6,20,21,0.6)');
    g.fillStyle = hz; g.fillRect(0, 0, 1920, 1080);
  }

  lampColor(f, i) {
    // warm sodium light, tinted toward the team colour at the climax
    return f.team && f.lightTint > 0 ? mixRgb([255, 183, 94], f.team.rgbA, f.lightTint) : [255, 183, 94];
  }

  drawLamps(g, f) {
    this.setCam(g, f.cam, 0.95, f.shake);
    const prev = g.globalCompositeOperation;
    for (let i = 0; i < 5; i++) {
      const x = 192 + i * 384, y = 18;
      const flick = 0.82 + 0.18 * (noise(f.t * 9 + i * 5, 3) > 0.62 ? 0.2 : 1);
      const rgb = this.lampColor(f, i);
      // cone (sways; converges on the hero at the climax)
      const sway = 0.05 * noise(f.t * 0.35 + i * 3.1, 9);
      const toHero = f.converge * Math.atan2(960 - x, 560 - y) * 0.85;
      const ang = sway + toHero, len = 1250, wd = 230;
      g.save(); g.translate(x, y); g.rotate(ang);
      const cg = g.createLinearGradient(0, 0, 0, len);
      cg.addColorStop(0, `rgba(${rgb},${0.16 * flick * f.lampK})`); cg.addColorStop(1, `rgba(${rgb},0)`);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = cg; g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.lineTo(wd, len); g.lineTo(-wd, len); g.closePath(); g.fill();
      g.restore();
      g.globalCompositeOperation = prev;
      // fixture
      g.fillStyle = '#121a1b'; g.beginPath(); g.moveTo(x - 30, y - 30); g.lineTo(x + 30, y - 30); g.lineTo(x + 20, y + 6); g.lineTo(x - 20, y + 6); g.closePath(); g.fill();
      const bulb = g.createRadialGradient(x, y + 6, 0, x, y + 6, 46);
      bulb.addColorStop(0, `rgba(${rgb},${0.9 * flick * f.lampK})`); bulb.addColorStop(1, `rgba(${rgb},0)`);
      g.globalCompositeOperation = 'lighter'; g.fillStyle = bulb; g.fillRect(x - 46, y - 40, 92, 92); g.globalCompositeOperation = prev;
    }
  }

  drawRail(g, r, x0, x1) {
    const y = GEO.rows[r].rail;
    const sh = g.createLinearGradient(0, y + 12, 0, y + 44); sh.addColorStop(0, 'rgba(0,0,0,0.38)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(x0, y + 12, x1 - x0, 32);
    g.fillStyle = '#3b4649'; g.fillRect(x0, y - 15, x1 - x0, 6);
    g.fillStyle = '#7d8b8f'; g.fillRect(x0, y - 15, x1 - x0, 1.5);
    g.fillStyle = '#262f31'; g.fillRect(x0, y - 9, x1 - x0, 18);
    g.fillStyle = '#4a5659'; g.fillRect(x0, y + 9, x1 - x0, 6);
    // hazard stripes on the web, bolts
    g.save(); g.beginPath(); g.rect(x0, y - 6, x1 - x0, 12); g.clip();
    g.fillStyle = 'rgba(210,170,40,0.55)';
    const s0 = Math.floor(x0 / 28) * 28;
    for (let x = s0; x < x1; x += 28) { g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 12, y - 6); g.lineTo(x + 20, y - 6); g.lineTo(x + 8, y + 6); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = '#1b2224';
    for (let x = Math.floor(x0 / 98) * 98; x < x1; x += 98) { g.beginPath(); g.arc(x, y - 12, 1.8, 0, TAU); g.arc(x + 49, y + 12, 1.8, 0, TAU); g.fill(); }
  }

  drawRows(g, f) {
    const c = this.setCam(g, f.cam, 1, f.shake);
    const vx0 = c.x - 960 / c.z - GEO.pitch, vx1 = c.x + 960 / c.z + GEO.pitch;
    for (let r = 0; r < 3; r++) this.drawRail(g, r, vx0 - 200, vx1 + 200);
    const sw = GEO.frameW + HUNG.padX * 2, sh = HUNG.height;
    const shutter = 0.75 / 60;
    let usedBlur = false;
    for (let r = 0; r < 3; r++) {
      const off = f.rows[r], v = f.rowVel[r], blurLen = Math.abs(v) * shutter;
      const K = clamp(Math.ceil(blurLen / 3.5), 1, 14); // ≤ 3.5 px between copies: a smooth streak, no strobing edges
      const target = K > 1 ? this.bg2 : g;
      if (K > 1 && !usedBlur) {
        usedBlur = true;
        this.bg2.setTransform(1, 0, 0, 1, 0, 0); this.bg2.clearRect(0, 0, this.blur.width, this.blur.height);
      }
      if (K > 1) { const m = g.getTransform(); this.bg2.setTransform(m); this.bg2.globalCompositeOperation = 'lighter'; this.bg2.globalAlpha = 1 / K; }
      const y = GEO.rows[r].rail + HUNG.top;
      for (let i = 0; i < GEO.perRow; i++) {
        if (f.sel.on && r === GEO.SEL_ROW && i === f.sel.index) continue; // the hero door draws itself
        const x = slotX(i, off) + (GEO.pitch - GEO.frameW) / 2 - HUNG.padX;
        if (x + sw < vx0 || x > vx1) continue;
        const img = this.sprites[r][i];
        if (K === 1) target.drawImage(img, x, y, sw, sh);
        else for (let k = 0; k < K; k++) target.drawImage(img, x + (k / (K - 1) - 0.5) * blurLen * Math.sign(v || 1), y, sw, sh);
      }
      if (K > 1) { this.bg2.globalCompositeOperation = 'source-over'; this.bg2.globalAlpha = 1; }
    }
    if (usedBlur) { const m = g.getTransform(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.blur, 0, 0); g.setTransform(m); }
    // door lamps (idle red blink chasing along the rows, all off at speed)
    const prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 3; r++) {
      if (Math.abs(f.rowVel[r]) > 400) continue;
      const top = GEO.frameTop(r);
      for (let i = 0; i < GEO.perRow; i++) {
        if (f.sel.on && r === GEO.SEL_ROW && i === f.sel.index) continue;
        const x = slotX(i, f.rows[r]) + GEO.pitch / 2;
        if (x < vx0 || x > vx1) continue;
        const ly = top + GEO.crown - 12;
        if (f.waveT != null && f.team) {
          // the reveal sends a wave of team light across every lamp in the vault
          const d = Math.hypot(x - GEO.cx, ly - (GEO.frameTop(GEO.SEL_ROW) + GEO.crown - 12)), R = f.waveT * 2400;
          if (d < R) { const front = Math.exp(-(R - d) / 140); lampGlow(g, x, ly, f.team.rgbA, 0.55 + 0.45 * front, 16 + 30 * front); continue; }
        }
        const on = 0.5 + 0.5 * Math.sin(f.t * 2.2 - i * 0.9 + r * 1.3);
        lampGlow(g, x, ly, [255, 50, 40], 0.25 + 0.55 * on, 16);
      }
    }
    g.globalCompositeOperation = prev;
  }

  drawStation(g, f) {
    // the lock station around the centre slot of the selection row
    this.setCam(g, f.cam, 1, f.shake);
    const r = GEO.SEL_ROW, top = GEO.frameTop(r), cx = GEO.cx, half = GEO.frameW / 2;
    const k = f.sel.clamp;
    const lampRgb = f.sel.green ? [60, 255, 120] : [255, 60, 40];
    const blink = f.sel.green ? 1 : f.spinning ? (Math.sin(f.t * 18) > 0 ? 1 : 0.25) : 0.55 + 0.45 * Math.sin(f.t * 3);
    for (const d of [-1, 1]) {
      const x = cx + d * (half + 17);
      // post
      const pg = g.createLinearGradient(x - 7, 0, x + 7, 0); pg.addColorStop(0, '#2b3336'); pg.addColorStop(0.5, '#556165'); pg.addColorStop(1, '#22292b');
      g.fillStyle = pg; g.fillRect(x - 7, GEO.rows[r].rail + 15, 14, top + GEO.frameH - GEO.rows[r].rail - 5);
      g.save(); g.beginPath(); g.rect(x - 7, top + GEO.frameH - 50, 14, 46); g.clip();
      g.fillStyle = '#e0b62a'; g.fillRect(x - 7, top + GEO.frameH - 50, 14, 46);
      g.fillStyle = '#151515'; for (let y = top + GEO.frameH - 62; y < top + GEO.frameH; y += 12) { g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y + 8); g.lineTo(x + 7, y + 14); g.lineTo(x - 7, y + 6); g.closePath(); g.fill(); }
      g.restore();
      // clamp jaw slides in when locked
      const jx = x - d * (6 + 9 * k);
      g.fillStyle = '#7f8b8f'; g.fillRect(Math.min(jx, x) - 3, top + 118, Math.abs(jx - x) + 6, 22);
      g.fillStyle = '#3c4548'; g.fillRect(jx - 4, top + 112, 8, 34);
      // indicator
      g.fillStyle = '#111'; g.beginPath(); g.arc(x, GEO.rows[r].rail + 30, 7, 0, TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
      lampGlow(g, x, GEO.rows[r].rail + 30, lampRgb, 0.9 * blink, 30);
      g.globalCompositeOperation = 'source-over';
    }
    // chevron marker on the rail
    const yC = GEO.rows[r].rail - 34, a = f.sel.green ? 1 : 0.45 + 0.55 * blink;
    g.fillStyle = f.sel.green ? `rgba(80,255,140,${a})` : `rgba(255,190,70,${a})`;
    g.beginPath(); g.moveTo(cx - 16, yC - 10); g.lineTo(cx + 16, yC - 10); g.lineTo(cx, yC + 8); g.closePath(); g.fill();
  }

  drawHero(g, f) {
    const s = f.sel, team = f.team, tex = this.heroTextures(s.style);
    this.setCam(g, f.cam, 1, f.shake);
    const top = GEO.frameTop(GEO.SEL_ROW), left = s.x;
    const lx = left + GEO.leafX, ly = top + GEO.leafY, lw = GEO.leafW, lh = GEO.leafH;
    const glow = s.glow;
    // hanger + frame (vector, crisp at any zoom)
    g.save(); g.translate(left, GEO.rows[GEO.SEL_ROW].rail);
    g.strokeStyle = '#2a3034'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(GEO.frameW / 2 - 14, 18); g.lineTo(GEO.frameW / 2 - 30, 15 + GEO.hanger + 9); g.moveTo(GEO.frameW / 2 + 14, 18); g.lineTo(GEO.frameW / 2 + 30, 15 + GEO.hanger + 9); g.stroke();
    g.fillStyle = '#23292c'; g.fillRect(GEO.frameW / 2 - 22, 6, 44, 13);
    g.restore();
    g.save(); g.translate(left, top); drawFrame(g, s.style, { opening: true }); g.restore();
    // doorway: light behind the leaf
    if (glow > 0.001 && team) {
      g.save(); g.beginPath(); g.rect(lx, ly, lw, lh); g.clip();
      const cxl = lx + lw / 2, cyl = ly + lh * 0.46;
      g.fillStyle = team.deep; g.fillRect(lx, ly, lw, lh);
      const rg = g.createRadialGradient(cxl, cyl, 2, cxl, cyl, lh * 0.75);
      rg.addColorStop(0, `rgba(255,255,255,${0.95 * glow})`); rg.addColorStop(0.18, `rgba(${team.glowRgb},${glow})`);
      rg.addColorStop(0.5, `rgba(${team.rgb},${0.9 * glow})`); rg.addColorStop(1, `rgba(${team.deepRgb},${glow})`);
      g.fillStyle = rg; g.fillRect(lx, ly, lw, lh);
      // rotating rays
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + f.t * 0.45, w = 0.09;
        g.fillStyle = `rgba(255,255,255,${0.1 * glow * (0.6 + 0.4 * Math.sin(f.t * 2 + i))})`;
        g.beginPath(); g.moveTo(cxl, cyl); g.lineTo(cxl + Math.cos(a - w) * 400, cyl + Math.sin(a - w) * 400); g.lineTo(cxl + Math.cos(a + w) * 400, cyl + Math.sin(a + w) * 400); g.closePath(); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      // the result: team number in its colour — nothing else
      const rk = s.reveal;
      if (rk > 0.001) {
        const sc = 0.55 + 0.45 * rk, al = clamp01(rk * 1.6);
        g.save(); g.translate(cxl, cyl + 18); g.scale(sc, sc);
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.font = '400 25px "Russo One", sans-serif';
        g.globalAlpha = al;
        g.shadowColor = `rgba(${team.rgb},1)`; g.shadowBlur = 16;
        g.fillStyle = '#ffffff';
        drawSpaced(g, 'TEAM', 0, -88, 6);
        g.font = '400 150px "Russo One", sans-serif';
        g.shadowBlur = 34; g.lineWidth = 8; g.strokeStyle = `rgba(${team.deepRgb},0.9)`;
        g.strokeText(String(team.id), 0, 52);
        g.fillStyle = '#ffffff'; g.fillText(String(team.id), 0, 52);
        g.shadowBlur = 0; g.globalCompositeOperation = 'lighter'; g.globalAlpha = al * 0.35;
        g.fillStyle = team.color; g.fillText(String(team.id), 0, 52);
        g.restore();
      }
      g.restore();
    }
    // leaf: perspective swing from vertical strips (hinge opposite the knob, opening toward the viewer)
    const theta = s.angle; // radians, 0 closed
    if (Math.abs(theta) < 0.002) g.drawImage(tex.leaf, lx, ly, lw, lh);
    else {
      const hingeLeft = s.style.knobSide === 'right';
      const hx = hingeLeft ? lx : lx + lw, dir = hingeLeft ? 1 : -1;
      const fz = 620, pcx = lx + lw / 2, pcy = ly + lh / 2, N = 56;
      const cos = Math.cos(theta), sin = Math.sin(theta);
      const src = cos >= 0 ? tex.leaf : tex.back, tw = src.width;
      const shadeK = 0.25 + 0.75 * Math.abs(cos);
      const proj = (d) => { const X = hx + dir * d * cos, Z = d * sin, p = fz / (fz - Z); return { x: pcx + (X - pcx) * p, p }; };
      for (let j = 0; j < N; j++) {
        const d0 = (j / N) * lw, d1 = ((j + 1) / N) * lw;
        const a = proj(d0), b = proj(d1), pm = (a.p + b.p) / 2;
        const x0 = Math.min(a.x, b.x), wpx = Math.abs(b.x - a.x) + 0.6;
        const hh = lh * pm, yy = pcy - (lh / 2) * pm;
        const u = hingeLeft ? j / N : 1 - (j + 1) / N;
        const sx = cos >= 0 ? u * tw : (1 - u - 1 / N) * tw;
        g.drawImage(src, sx, 0, tw / N, src.height, x0, yy, wpx, hh);
      }
      // shading + team light on the inner face
      g.save();
      const a = proj(0), b = proj(lw);
      g.beginPath();
      g.moveTo(a.x, pcy - (lh / 2) * a.p); g.lineTo(b.x, pcy - (lh / 2) * b.p); g.lineTo(b.x, pcy + (lh / 2) * b.p); g.lineTo(a.x, pcy + (lh / 2) * a.p); g.closePath();
      g.fillStyle = `rgba(0,0,0,${0.55 * (1 - shadeK)})`; g.fill();
      if (team && glow > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(${team.rgb},${0.12 * glow * Math.abs(sin)})`; g.fill(); }
      g.restore();
    }
    // the lamp on the crown: green once locked
    g.globalCompositeOperation = 'lighter';
    lampGlow(g, left + GEO.frameW / 2, top + GEO.crown - 12, s.green ? [70, 255, 130] : [255, 50, 40], s.green ? 1 : 0.6, s.green ? 44 : 22);
    g.globalCompositeOperation = 'source-over';
    // light spilling into the vault + god rays
    if (glow > 0.001 && team) {
      this.screen(g);
      const m = this.worldToScreen(f, left + GEO.frameW / 2, ly + lh * 0.46);
      g.globalCompositeOperation = 'lighter';
      const sp = g.createRadialGradient(m.x, m.y, 10, m.x, m.y, 900);
      sp.addColorStop(0, `rgba(${team.rgb},${0.42 * glow})`); sp.addColorStop(0.35, `rgba(${team.rgb},${0.12 * glow})`); sp.addColorStop(1, `rgba(${team.rgb},0)`);
      g.fillStyle = sp; g.fillRect(0, 0, 1920, 1080);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + f.t * 0.12, w = 0.05 + 0.03 * Math.sin(f.t + i);
        const L = 1500;
        const rg = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, L);
        rg.addColorStop(0, `rgba(${team.glowRgb},${0.16 * glow})`); rg.addColorStop(1, `rgba(${team.glowRgb},0)`);
        g.fillStyle = rg;
        g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x + Math.cos(a - w) * L, m.y + Math.sin(a - w) * L); g.lineTo(m.x + Math.cos(a + w) * L, m.y + Math.sin(a + w) * L); g.closePath(); g.fill();
      }
      // shockwave ring
      if (f.ringT != null) {
        const tau = f.ringT, r = 40 + 1500 * (1 - Math.exp(-tau / 0.32)), a = 0.55 * Math.exp(-tau / 0.24);
        g.strokeStyle = `rgba(${team.glowRgb},${a})`; g.lineWidth = 14 * Math.exp(-tau / 0.4) + 2;
        g.beginPath(); g.arc(m.x, m.y, r, 0, TAU); g.stroke();
      }
      // embers rising out of the doorway while the result is on screen
      const z = f.cam.z, bottom = m.y + (GEO.leafH * 0.54) * z;
      for (let i = 0; i < 46; i++) {
        const P = 1.6 + hash(i, 31), tau = ((f.t + hash(i, 32) * P) % P) / P;
        const x = m.x + (hash(i, 33) - 0.5) * GEO.leafW * z * 0.9 + Math.sin(f.t * 2 + i) * 8 * z;
        const y = bottom - tau * (GEO.leafH * 1.6) * z;
        const a = glow * Math.sin(Math.PI * tau) * 0.8;
        g.fillStyle = `rgba(${i % 3 ? team.glowRgb : '255,255,255'},${a})`;
        const sz = (1.2 + 2.2 * hash(i, 34)) * z;
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  worldToScreen(f, x, y) { const c = f.cam; return { x: (x - c.x) * c.z + 960 + f.shake.x, y: (y - c.y) * c.z + 540 + f.shake.y }; }

  drawSteam(g, f) {
    this.setCam(g, f.cam, 1.1, f.shake);
    const vents = [[180, 1035, 0.6], [1740, 1035, -0.4], [60, 470, 1], [1860, 470, -1]];
    const period = 0.38, life = 2.6;
    vents.forEach(([vx, vy, dirx], vi) => {
      const j1 = Math.floor(f.t / period);
      for (let j = j1 - Math.ceil(life / period); j <= j1; j++) {
        const born = j * period + hash(j, vi) * 0.25, tau = f.t - born;
        if (tau < 0 || tau > life) continue;
        const k = tau / life;
        const x = vx + dirx * 70 * tau + 30 * noise(j * 0.3 + tau * 0.6, vi), y = vy - 150 * Math.pow(tau, 0.8);
        puff(g, x, y, 16 + 95 * k, 0.11 * Math.sin(Math.PI * k) * f.steamK);
      }
    });
    // bursts: latch hiss from the station, power-up puff from the rails
    for (const b of f.bursts) {
      const tau = f.t - b.t; if (tau < 0 || tau > 2.2) continue;
      for (let i = 0; i < b.n; i++) {
        const a = b.a0 + (hash(i, b.seed) - 0.5) * b.spread, sp = b.v * (0.5 + hash(i, b.seed + 1));
        const k = tau / 2.2, drag = (1 - Math.exp(-2.4 * tau)) / 2.4;
        const x = b.x + Math.cos(a) * sp * drag, y = b.y + Math.sin(a) * sp * drag - 40 * tau;
        puff(g, x, y, 10 + 70 * k * (0.6 + hash(i, b.seed + 2)), 0.2 * (1 - k) * (1 - k));
      }
    }
    // dust motes in the light
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const x = m.x + 40 * noise(f.t * 0.08 + m.p, 5), y = m.y + 50 * noise(f.t * 0.06 + m.p, 6);
      const a = 0.22 * (0.5 + 0.5 * Math.sin(f.t * 1.3 + m.p)) * f.lampK;
      g.fillStyle = `rgba(255,220,170,${a})`; g.fillRect(x, y, m.s, m.s);
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawPipes(g, f) {
    this.setCam(g, f.cam, 1.3, f.shake);
    // big floor pipe
    const y = 1066;
    const pg = g.createLinearGradient(0, y - 30, 0, y + 30);
    pg.addColorStop(0, '#2a3a3c'); pg.addColorStop(0.35, '#5f7477'); pg.addColorStop(0.55, '#33464a'); pg.addColorStop(1, '#0f191a');
    g.fillStyle = pg; g.fillRect(-1600, y - 30, 5200, 60);
    for (let x = -1500; x < 3600; x += 330) {
      g.fillStyle = '#1c2829'; g.fillRect(x, y - 36, 18, 72);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 3, y - 36, 3, 72);
    }
    // vertical side pipes (only once we're inside the vault: through the booth window they'd read as bars)
    g.globalAlpha = f.pipesK;
    for (const x of [-30, 1950]) {
      const vg = g.createLinearGradient(x - 26, 0, x + 26, 0);
      vg.addColorStop(0, '#0f191a'); vg.addColorStop(0.45, '#56696c'); vg.addColorStop(1, '#152022');
      g.fillStyle = vg; g.fillRect(x - 26, -600, 52, 2400);
    }
    g.globalAlpha = 1;
  }

  drawBeacons(g, f) {
    if (f.beacon <= 0.01) return;
    this.setCam(g, f.cam, 1, f.shake);
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, ph] of [[60, 40, 0], [1860, 40, Math.PI]]) {
      const a = f.t * 5.5 + ph;
      lampGlow(g, x, y, [255, 150, 30], 0.9 * f.beacon * (0.6 + 0.4 * Math.max(0, Math.cos(a))), 60);
      const L = 1400, w = 0.16;
      const bg = g.createRadialGradient(x, y, 0, x, y, L);
      bg.addColorStop(0, `rgba(255,150,40,${0.2 * f.beacon})`); bg.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = bg;
      const dir = Math.PI / 2 + Math.sin(a) * 1.1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(dir - w) * L, y + Math.sin(dir - w) * L); g.lineTo(x + Math.cos(dir + w) * L, y + Math.sin(dir + w) * L); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawSpeedLines(g, f) {
    if (f.speedLines <= 0.01) return;
    this.screen(g);
    g.globalCompositeOperation = 'lighter';
    const cx = 960, cy = 380;
    for (let i = 0; i < 70; i++) {
      const a = hash(i, 1) * TAU, sp = 0.6 + hash(i, 2), ph = fract1(f.t * 1.6 * sp + hash(i, 3));
      const r0 = 120 + ph * 1100, r1 = r0 + 60 + 260 * ph;
      g.strokeStyle = `rgba(200,240,235,${0.16 * f.speedLines * ph})`; g.lineWidth = 1 + 2 * ph;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawParticles(g, f) {
    this.screen(g);
    const fz = 900;
    const draw = (list, t0, origin, colors, additive) => {
      if (t0 == null) return;
      const tau0 = f.t - t0;
      if (tau0 < 0 || tau0 > 3.4) return;
      if (additive) g.globalCompositeOperation = 'lighter';
      for (const p of list) {
        const tau = tau0 - p.delay;
        if (tau < 0 || tau > p.life) continue;
        const k = 1.6, e = (1 - Math.exp(-k * tau)) / k;
        const X = p.vx * e, Y = p.vy * e + 900 * (tau - e) / k * 1.1, Z = p.vz * e;
        if (Z > fz * 0.85) continue;
        const sc = fz / (fz - Z);
        const x = origin.x + X * sc, y = origin.y + Y * sc;
        const fade = clamp01((p.life - tau) / (p.life * 0.35));
        const col = colors[p.ci % colors.length];
        if (p.spark) {
          const vx = p.vx * Math.exp(-k * tau), vy = p.vy * Math.exp(-k * tau) + 900 * e;
          const len = clamp(Math.hypot(vx, vy) * 0.03, 4, 60) * sc;
          const ang = Math.atan2(vy, vx);
          g.strokeStyle = `rgba(${col},${fade})`; g.lineWidth = 2.2 * sc;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); g.stroke();
        } else {
          const w = p.w * sc, h = p.h * sc * Math.abs(Math.cos(p.flip0 + p.flipW * tau));
          g.save(); g.translate(x, y); g.rotate(p.rot0 + p.rotW * tau);
          g.fillStyle = `rgba(${col},${fade})`; g.fillRect(-w / 2, -h / 2, w, Math.max(0.8, h));
          g.restore();
        }
      }
      g.globalCompositeOperation = 'source-over';
    };
    if (f.team) {
      const o = this.worldToScreen(f, GEO.cx, GEO.frameTop(GEO.SEL_ROW) + GEO.leafY + GEO.leafH * 0.46);
      draw(this.particles, f.burstT, o, [f.team.rgb, '255,255,255', f.team.glowRgb, '255,214,90'], false);
      draw(this.sparks, f.burstT, o, ['255,255,255', f.team.glowRgb], true);
    }
    if (f.latchT != null) {
      const o = this.worldToScreen(f, GEO.cx, GEO.frameTop(GEO.SEL_ROW) + 128);
      draw(this.latchSparks, f.latchT, o, ['255,200,120', '255,255,255'], true);
    }
  }

  drawFinish(g, f) {
    this.screen(g);
    if (f.flash > 0.002) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,255,255,${f.flash})`; g.fillRect(0, 0, 1920, 1080);
      if (f.team && f.flashTint > 0.002) { g.fillStyle = `rgba(${f.team.rgb},${f.flashTint})`; g.fillRect(0, 0, 1920, 1080); }
      g.globalCompositeOperation = 'source-over';
    }
    if (!this.vig) {
      const v = g.createRadialGradient(960, 520, 380, 960, 540, 1180);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.62)');
      this.vig = v;
    }
    g.fillStyle = this.vig; g.fillRect(0, 0, 1920, 1080);
    // grain
    g.globalAlpha = 0.06; g.globalCompositeOperation = 'overlay';
    const ox = Math.floor(hash(f.frame, 1) * 256), oy = Math.floor(hash(f.frame, 2) * 256);
    g.translate(-ox, -oy); g.fillStyle = this.grain.pattern(g); g.fillRect(ox, oy, 1920, 1080); g.translate(ox, oy);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

/* helpers */
const fract1 = (x) => x - Math.floor(x);
function mixRgb(a, b, k) { return a.map((v, i) => Math.round(v + (b[i] - v) * k)); }
function lampGlow(g, x, y, rgb, a, r) {
  const gl = g.createRadialGradient(x, y, 0, x, y, r);
  gl.addColorStop(0, `rgba(255,255,255,${a})`); gl.addColorStop(0.12, `rgba(${rgb},${a})`); gl.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gl; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function puff(g, x, y, r, a) {
  if (a <= 0.003) return;
  const pg = g.createRadialGradient(x, y, 0, x, y, r);
  pg.addColorStop(0, `rgba(215,235,232,${a})`); pg.addColorStop(1, 'rgba(215,235,232,0)');
  g.fillStyle = pg; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function drawSpaced(g, text, x, y, sp) {
  const ws = [...text].map((c) => g.measureText(c).width), total = ws.reduce((a, b) => a + b, 0) + sp * (text.length - 1);
  let cx = x - total / 2;
  g.textAlign = 'left';
  [...text].forEach((c, i) => { g.fillText(c, cx, y); cx += ws[i] + sp; });
  g.textAlign = 'center';
}
function makeParticles(n, seed, sparks = false) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = r() * TAU, el = (r() * 0.9 + 0.1) * (Math.PI / 2.2), sp = sparks ? 900 + r() * 1400 : 380 + r() * 1100;
    return {
      vx: Math.cos(a) * Math.sin(el) * sp * 1.25, vy: Math.sin(a) * Math.sin(el) * sp - (sparks ? 200 : 380) * r(), vz: Math.cos(el) * sp * 0.75,
      w: 7 + r() * 9, h: 10 + r() * 14, rot0: r() * TAU, rotW: (r() - 0.5) * 14, flip0: r() * TAU, flipW: 6 + r() * 12,
      life: sparks ? 0.45 + r() * 0.5 : 1.6 + r() * 1.3, delay: r() * (sparks ? 0.05 : 0.12), ci: Math.floor(r() * 7), spark: sparks, i,
    };
  });
}
function makeGrainTile(size, seed) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), r = rng(seed);
  for (let i = 0; i < size * size; i++) { const v = 128 + (r() + r() - 1) * 110; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  let pat = null;
  return { pattern: (ctx) => pat || (pat = ctx.createPattern(c, 'repeat')) };
}
export { spring };
