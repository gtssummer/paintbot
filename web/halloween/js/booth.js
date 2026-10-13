// booth.js — the control booth: a wall with a window onto the vault and a slanted console desk with
// gauges, toggles, a CRT, a lever, team lamps and the big red button. DOM for crisp, clickable UI;
// every animated property is written from the frame state in update().
import { el, set, clamp01, noise, hash } from './lib/mg.js';
import { TEAMS } from './teams.js';

const WIN = { x: 178, y: 62, w: 1564, h: 488, r: 30 };

function roundedRectPath(x, y, w, h, r) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

function gaugeSVG(label, unit, ticks, redFrom) {
  const parts = [];
  for (let i = 0; i <= ticks * 5; i++) {
    const a = (-225 + (270 * i) / (ticks * 5)) * (Math.PI / 180), major = i % 5 === 0;
    const r0 = major ? 58 : 63, r1 = 70;
    parts.push(`<line x1="${(80 + Math.cos(a) * r0).toFixed(1)}" y1="${(80 + Math.sin(a) * r0).toFixed(1)}" x2="${(80 + Math.cos(a) * r1).toFixed(1)}" y2="${(80 + Math.sin(a) * r1).toFixed(1)}" stroke="#2a2620" stroke-width="${major ? 2.6 : 1.2}"/>`);
    if (major) parts.push(`<text x="${(80 + Math.cos(a) * 47).toFixed(1)}" y="${(84 + Math.sin(a) * 47).toFixed(1)}" text-anchor="middle" class="g-num">${i / 5}</text>`);
  }
  const a0 = (-225 + (270 * redFrom) / ticks) * (Math.PI / 180), a1 = 45 * (Math.PI / 180);
  const arc = `M${(80 + Math.cos(a0) * 66).toFixed(1)} ${(80 + Math.sin(a0) * 66).toFixed(1)} A66 66 0 0 1 ${(80 + Math.cos(a1) * 66).toFixed(1)} ${(80 + Math.sin(a1) * 66).toFixed(1)}`;
  return `<svg viewBox="0 0 160 160" aria-hidden="true">
    <defs><radialGradient id="gf${label}" cx="45%" cy="40%"><stop offset="0" stop-color="#f6f1df"/><stop offset="1" stop-color="#cfc6a8"/></radialGradient>
    <linearGradient id="gb${label}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8dcd8"/><stop offset=".5" stop-color="#6c7470"/><stop offset="1" stop-color="#2a302e"/></linearGradient></defs>
    <circle cx="80" cy="80" r="78" fill="url(#gb${label})"/><circle cx="80" cy="80" r="71" fill="url(#gf${label})"/>
    <path d="${arc}" stroke="#c72a22" stroke-width="7" fill="none"/>
    ${parts.join('')}
    <text x="80" y="112" text-anchor="middle" class="g-label">${label}</text><text x="80" y="126" text-anchor="middle" class="g-unit">${unit}</text>
    <g class="needle"><path d="M80 86 L77 80 L80 18 L83 80 Z" fill="#c4231b"/><circle cx="80" cy="80" r="7" fill="#2a2a2a"/></g>
    <path d="M28 52 A58 58 0 0 1 120 30" stroke="rgba(255,255,255,.45)" stroke-width="5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

const PUMPKIN = `<svg viewBox="0 0 160 140" aria-hidden="true">
  <defs><radialGradient id="pk" cx="45%" cy="40%"><stop offset="0" stop-color="#ffab45"/><stop offset=".7" stop-color="#e86a10"/><stop offset="1" stop-color="#8a3304"/></radialGradient></defs>
  <ellipse cx="80" cy="128" rx="62" ry="9" fill="rgba(0,0,0,.45)"/>
  <ellipse cx="46" cy="80" rx="36" ry="46" fill="url(#pk)"/><ellipse cx="114" cy="80" rx="36" ry="46" fill="url(#pk)"/><ellipse cx="80" cy="78" rx="38" ry="50" fill="url(#pk)"/>
  <path d="M76 30 C74 16 82 8 92 6 L95 12 C88 14 84 20 85 31Z" fill="#4c6b1d"/>
  <g class="pk-face"><path d="M50 66 L66 66 L58 50Z"/><path d="M94 66 L110 66 L102 50Z"/><path d="M76 82 L84 82 L80 74Z"/>
  <path d="M44 92 Q80 120 116 92 L108 96 L100 104 L92 98 L80 110 L68 98 L60 104 L52 96Z"/></g>
</svg>`;

const COBWEB = `<svg viewBox="0 0 220 220" aria-hidden="true"><g stroke="rgba(220,235,230,.28)" fill="none" stroke-width="1.2">
  <path d="M0 0 L210 30 M0 0 L180 120 M0 0 L120 190 M0 0 L30 210 M0 0 L200 75 M0 0 L75 205"/>
  <path d="M40 6 Q34 22 36 30 Q24 30 10 38 Q22 46 16 60"/><path d="M90 13 Q76 40 80 62 Q56 66 30 90 Q50 100 40 128"/>
  <path d="M150 21 Q124 60 130 98 Q92 106 56 146 Q80 160 64 196"/></g></svg>`;

export class Booth {
  constructor(stage, { onPress, onHover }) {
    this.root = el('div', { id: 'booth', class: 'booth' }, stage);
    const hole = `M0 0H1920V1080H0Z ${roundedRectPath(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r)}`;
    const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><path fill-rule='evenodd' d='${hole}'/></svg>`)}")`;
    this.wall = el('div', { class: 'wall' }, this.root);
    this.wall.style.webkitMaskImage = mask; this.wall.style.maskImage = mask;
    el('div', { class: 'glass' }, this.root);
    for (const x of [702, 1200]) el('div', { class: 'mullion', style: { left: x + 'px' } }, this.root);
    const frame = el('div', { class: 'win-frame' }, this.root);
    for (let i = 0; i < 22; i++) {
      const top = i < 11, k = (i % 11) / 10;
      el('i', { class: 'rivet', style: { left: 196 + k * 1528 + 'px', top: (top ? 55 : 557) + 'px' } }, this.root);
    }
    void frame;
    el('div', { class: 'cobweb', html: COBWEB }, this.root);
    const sign = el('div', { class: 'sign' }, this.root);
    el('span', { class: 'sign-stripes' }, sign); el('b', { text: 'DOOR VAULT 13' }, sign); el('span', { class: 'sign-stripes' }, sign);
    this.beacon = el('div', { class: 'beacon' }, this.root);
    this.beam = el('div', { class: 'beacon-beam' }, this.beacon);
    el('div', { class: 'beacon-dome' }, this.beacon);
    el('div', { class: 'beacon-cage' }, this.beacon);
    el('div', { class: 'beacon-base' }, this.beacon);

    // desk
    const desk = el('div', { class: 'desk' }, this.root);
    el('div', { class: 'desk-back' }, desk);
    const con = (this.console = el('div', { class: 'console' }, desk));
    el('div', { class: 'console-hazard' }, con);
    for (let i = 0; i < 16; i++) el('i', { class: 'rivet', style: { left: 14 + (i % 8) * 210 + 'px', top: i < 8 ? '22px' : '446px' } }, con);
    // left cluster
    const L = el('div', { class: 'plate plate-l' }, con);
    this.gauges = [gaugeSVG('RAIL', 'PSI ×100', 8, 6.5), gaugeSVG('CORE', 'VOLTS ×10', 10, 8)].map((svg, i) => {
      const gnode = el('div', { class: 'gauge', html: svg, style: { left: 26 + i * 220 + 'px' } }, L);
      return gnode.querySelector('.needle');
    });
    el('div', { class: 'engrave', text: 'RAIL CONTROL', style: { left: '26px', top: '232px' } }, L);
    this.toggles = [];
    for (let i = 0; i < 5; i++) {
      const tg = el('div', { class: 'toggle', style: { left: 22 + i * 88 + 'px', '--lc': ['#5cff7e', '#5cff7e', '#ff5a3c', '#ffb43c', '#5cff7e'][i] } }, L);
      const led = el('i', { class: 'led' }, tg);
      const sw = el('span', { class: 'switch' }, tg);
      const bat = el('b', {}, sw);
      el('em', { text: ['FEED', 'HOIST', 'BRAKE', 'LIGHT', 'STEAM'][i] }, tg);
      this.toggles.push({ led, bat });
    }
    // trigger
    const tr = (this.trigger = el('div', { class: 'trigger' }, con));
    el('div', { class: 'tr-ring' }, tr);
    el('div', { class: 'tr-bezel' }, tr);
    this.leds = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      return el('i', { class: 'tr-led', style: { left: 170 + Math.cos(a) * 128 - 6 + 'px', top: 170 + Math.sin(a) * 128 - 6 + 'px' } }, tr);
    });
    el('div', { class: 'tr-well' }, tr);
    this.glow = el('div', { class: 'tr-glow' }, tr);
    this.cap = el('button', { class: 'tr-cap', type: 'button', 'aria-label': 'Press the red button to pick a door' }, tr);
    el('span', { class: 'tr-shine' }, this.cap);
    el('span', { class: 'tr-label', text: 'PUSH' }, this.cap);
    this.capLabel = el('div', { class: 'stencil', text: 'PUSH TO SELECT A DOOR' }, con);
    this.cap.addEventListener('click', () => onPress());
    this.cap.addEventListener('pointerenter', () => onHover(true));
    this.cap.addEventListener('pointerleave', () => onHover(false));
    // right cluster
    const R = el('div', { class: 'plate plate-r' }, con);
    const crt = el('div', { class: 'crt' }, R);
    this.crtText = el('pre', { class: 'crt-text' }, el('div', { class: 'crt-screen' }, crt));
    const keys = el('div', { class: 'keypad' }, R);
    for (const k of ['+ RAIL', 'LOCK', '◐ LAMP', 'EJECT', '▲ ▼', '↻ LOOP']) el('span', { class: 'key', text: k }, keys);
    this.lever = el('div', { class: 'lever', html: '<span class="lever-slot"></span><span class="lever-stick"><span class="lever-ball"></span></span>' }, R).querySelector('.lever-stick');
    const lamps = el('div', { class: 'tlamps' }, R);
    this.tlamps = TEAMS.map((t) => {
      const w = el('div', { class: 'tlamp' }, lamps);
      const bulb = el('i', { style: { '--c': t.color } }, w);
      const lab = el('span', { text: 'T' + t.id }, w);
      return { w, bulb, lab };
    });
    el('div', { class: 'engrave', text: 'TEAM SLOTS', style: { right: '22px', top: '384px' } }, R);
    el('div', { class: 'desk-front' }, desk);
    this.pumpkin = el('div', { class: 'pumpkin', html: PUMPKIN }, desk);
    this.pumpkinGlow = el('div', { class: 'pumpkin-glow' }, desk);
    el('div', { class: 'mug', html: '<span>NIGHT<br>SHIFT</span>' }, desk);
    this.lastCrt = '';
  }

  /** Position of the red button's centre in stage coordinates (for the capture cursor). */
  capCentre(stageEl, scale) {
    const a = this.cap.getBoundingClientRect(), s = stageEl.getBoundingClientRect();
    return { x: (a.left + a.width / 2 - s.left) / scale, y: (a.top + a.height / 2 - s.top) / scale };
  }

  update(f) {
    const k = f.flyK;
    if (k >= 0.999) { set(this.root, { css: { display: 'none' } }); return; }
    // dolly through the window: the booth is near, so it grows much faster than the vault behind it
    const s = 1 + 2.6 * k * k + 0.25 * k, dy = 150 * k - 10 * f.anticip;
    set(this.root, { y: dy + f.shake.y * 0.6, x: f.shake.x * 0.6, s, o: 1 - clamp01((k - 0.82) / 0.18), origin: '960px 306px', css: { display: 'block' } });
    // a composited layer during the dolly keeps it at 60 fps live; capture mode re-rasterises every frame instead
    this.root.style.willChange = f.live && k > 0.001 && k < 0.999 ? 'transform' : 'auto';

    const t = f.t, armed = f.armed;
    // the button
    const p = f.press;
    set(this.cap, { y: 9 * p, s: 1 - 0.045 * p + (f.hover && armed ? 0.015 : 0), css: { '--press': p.toFixed(3), filter: armed ? 'none' : 'grayscale(0.85) brightness(0.6)' } });
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.7);
    set(this.glow, { o: armed ? 0.35 + 0.4 * pulse + (f.hover ? 0.25 : 0) + p * 0.6 : 0, s: 0.92 + 0.12 * pulse });
    this.leds.forEach((led, i) => {
      const chase = armed ? Math.max(0, Math.cos((i / 16) * Math.PI * 2 - t * 4.2)) ** 6 : 0;
      const on = Math.min(1, (p > 0.05 ? 1 : 0) + chase + (armed ? 0.12 : 0));
      set(led, { css: { '--on': on.toFixed(3) } });
    });
    set(this.capLabel, { text: f.complete ? 'ALL TEAMS ARE FULL' : 'PUSH TO SELECT A DOOR', color: f.complete ? '#7a2a22' : '#2b2720' });
    // gauges twitch; spike while the press fires
    this.gauges.forEach((n, i) => {
      const base = i ? 20 : -40, tw = noise(t * (i ? 3.1 : 2.3), 11 + i) * 9 + noise(t * 17, 31 + i) * 2.2;
      n.style.transform = `rotate(${(base + tw + 140 * p).toFixed(2)}deg)`;
    });
    this.toggles.forEach((tg, i) => {
      const up = i !== 2;
      set(tg.bat, { r: up ? -28 : 28, origin: '50% 100%' });
      const blink = hash(Math.floor(t * (1.5 + i * 0.7)), i) > 0.35 ? 1 : 0.15;
      set(tg.led, { css: { '--on': (i === 4 ? blink : i === 2 ? 0.2 : 0.85 + 0.15 * blink).toFixed(2) } });
    });
    set(this.lever, { r: -6 + 2.5 * noise(t * 0.7, 4) + 34 * p, origin: '50% 100%' });
    // CRT
    if (f.crt !== this.lastCrt) { this.crtText.textContent = f.crt; this.lastCrt = f.crt; }
    set(this.crtText, { o: 0.9 + 0.1 * noise(t * 30, 2) });
    // beacon spins while the system powers up
    set(this.beacon, { css: { '--b': f.beacon.toFixed(3) } });
    set(this.beam, { r: (t * 340) % 360 });
    // pumpkin candle
    const fl = 0.65 + 0.35 * clamp01(noise(t * 7, 21) * 0.8 + 0.5 + noise(t * 23, 22) * 0.3);
    set(this.pumpkinGlow, { o: fl });
    set(this.pumpkin, { css: { '--flame': fl.toFixed(3) } });
    // team lamps mirror the roster
    this.tlamps.forEach((l, i) => {
      const full = f.full[i];
      set(l.bulb, { css: { '--on': full ? '0.08' : (0.75 + 0.25 * Math.sin(t * 3 + i)).toFixed(3) } });
      set(l.lab, { text: full ? 'FULL' : 'T' + (i + 1) });
    });
  }
}
