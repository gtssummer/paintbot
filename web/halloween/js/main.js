// main.js — the director. Every visual is computed from (event timestamps, now): the live app feeds
// real time and user events; capture mode (?render / ?capture) feeds a scripted timeline through
// window.seek(t), so the motion-design renderer can capture any frame exactly.
import { clamp, clamp01, lerp, seg, ease, spring, bezier, noise, hash, set, el } from './lib/mg.js';
import { GEO, SPIN, SPIN_CURVE_END, SPIN_LOCKED, IDLE, idleTravel, spinPos, spinVel, planSpin, centreIndex, passCount, slotX, coverageOK } from './spin.js';
import { TEAMS, Roster } from './teams.js';
import { makeStyles, hexRgb } from './doors.js';
import { Vault } from './scene.js';
import { Booth } from './booth.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('render') || params.has('capture');
const REDUCED = !CAPTURE && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Beat timings (seconds). Fly-through, spin, lock, swing, reveal, hero push, button ignition, return.
const TL = { press: 0.3, fly: 1.35, hold: 0.3, reveal: 0.34, ignite: 1.15, close: 0.55, back: 1.3 };
const CAM = {
  console: { x: 960, y: 986, z: 0.52 },  // all three rows framed by the booth window
  vault: { x: 960, y: 548, z: 1.0 },
  hero: { x: 960, y: GEO.frameTop(1) + GEO.frameH / 2 + 46, z: 2.35 },
};
const flyEase = bezier(0.55, 0, 0.25, 1);

const teamView = TEAMS.map((t) => {
  const rgbA = hexRgb(t.color);
  return { ...t, rgbA, rgb: rgbA.join(','), glowRgb: hexRgb(t.glow).join(','), deepRgb: hexRgb(t.deep).join(',') };
});

// ── state ──
const styles = [0, 1, 2].map((r) => makeStyles(GEO.perRow, 1000 + r * 17));
const S = {
  idle: [{ t: -60, base: [41, 0, 117] }], // idle segments: rows creep from `base` starting at `t`
  roll: null,                              // { team, base, D, index, ev: {...} }
};

function idleOffsets(t) {
  let seg0 = S.idle[0];
  for (const s of S.idle) if (s.t <= t) seg0 = s;
  return GEO.rows.map((row, r) => seg0.base[r] + row.dir * idleTravel(t - seg0.t));
}
function idleVel(t) {
  let seg0 = S.idle[0];
  for (const s of S.idle) if (s.t <= t) seg0 = s;
  const tau = Math.max(0, t - seg0.t);
  return GEO.rows.map((row) => row.dir * IDLE.v * (1 - Math.exp(-tau / IDLE.ramp)));
}

/** Plan a whole roll at the moment of the press: every later beat is a fixed offset from it. */
function planRoll(tPress, team) {
  const ev = { press: tPress };
  ev.fly = ev.press + TL.press;
  ev.spin = ev.fly + TL.fly;
  ev.latch = ev.spin + SPIN_CURVE_END;
  ev.lock = ev.spin + SPIN_LOCKED;
  ev.open = ev.lock + TL.hold;
  ev.reveal = ev.open + TL.reveal;
  ev.ignite = ev.reveal + TL.ignite;
  const base = idleOffsets(ev.spin);
  const D = planSpin(base);
  const finalOff = GEO.rows.map((row, r) => base[r] + row.dir * D[r]);
  return { team, base, D, finalOff, index: centreIndex(finalOff[GEO.SEL_ROW]), ev };
}
function planReturn(roll, tNext) {
  roll.ev.next = tNext;
  roll.ev.back = tNext + TL.close;
  roll.ev.idle = roll.ev.back + TL.back;
  S.idle = [S.idle[S.idle.length - 1], { t: roll.ev.back, base: roll.finalOff.slice() }];
}

function phaseAt(t, roll) {
  if (!roll || t < roll.ev.press) return 'idle';
  const e = roll.ev;
  if (e.idle != null && t >= e.idle) return 'idle';
  if (e.back != null && t >= e.back) return 'flyback';
  if (e.next != null && t >= e.next) return 'closing';
  if (t >= e.ignite) return 'hero';
  if (t >= e.open) return 'open';
  if (t >= e.lock) return 'locked';
  if (t >= e.spin) return 'spin';
  if (t >= e.fly) return 'fly';
  return 'press';
}

// ── frame state: a pure function of (t, S, roster view) ──
function frameAt(t, view) {
  const roll = S.roll, ph = phaseAt(t, roll), e = roll ? roll.ev : {};
  const f = { t, frame: Math.round(t * 60), phase: ph, live: !CAPTURE, quality: CAPTURE ? 0 : perf.quality, shake: { x: 0, y: 0 }, bursts: [], sel: { on: false } };
  // conveyor
  if (roll && (ph === 'spin' || ph === 'locked' || ph === 'open' || ph === 'hero' || ph === 'closing')) {
    const tau = t - e.spin;
    f.rows = GEO.rows.map((row, r) => roll.base[r] + row.dir * spinPos(tau, roll.D[r]));
    f.rowVel = GEO.rows.map((row, r) => row.dir * (ph === 'spin' ? spinVel(tau, roll.D[r]) : 0));
  } else { f.rows = idleOffsets(t); f.rowVel = idleVel(t); }
  const speed = Math.abs(f.rowVel[GEO.SEL_ROW]) / SPIN.vmax;
  f.speed = speed;
  f.spinning = ph === 'spin';

  // booth fly-through
  const flyK = ph === 'fly' ? flyEase(seg(t, e.fly, e.fly + TL.fly)) : ph === 'flyback' ? 1 - flyEase(seg(t, e.back, e.back + TL.back)) : ph === 'idle' || ph === 'press' ? 0 : 1;
  f.flyK = flyK;
  f.anticip = ph === 'press' ? Math.sin(Math.PI * seg(t, e.press, e.fly)) : ph === 'fly' ? Math.max(0, 1 - seg(t, e.fly, e.fly + 0.25)) * 0.6 : 0;
  f.press = ph === 'press' ? spring(t - e.press, { damping: 0.5, settle: 0.25 }) : ph === 'fly' ? 1 - seg(t, e.fly, e.fly + 0.4) : 0;

  // camera
  const lerpCam = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) });
  let cam = CAM.console;
  if (ph === 'idle' || ph === 'press') {
    cam = { x: CAM.console.x + 8 * noise(t * 0.11, 1), y: CAM.console.y + 5 * noise(t * 0.09, 2), z: CAM.console.z * (1 + 0.006 * noise(t * 0.13, 3)) };
  } else if (ph === 'fly') cam = lerpCam(CAM.console, CAM.vault, flyEase(seg(t, e.fly, e.fly + TL.fly)));
  else if (ph === 'spin' || ph === 'locked' || ph === 'open') {
    // the camera leans in while the conveyor crawls, then settles on the lock
    const crawl = spring(t - (e.spin + SPIN.ta + SPIN.tc + SPIN.td * 0.45), { damping: 1, settle: 2.2 });
    const z = 1 + 0.07 * crawl;
    cam = { x: 960, y: lerp(CAM.vault.y, GEO.frameTop(1) + GEO.frameH / 2, 0.35 * crawl), z };
  }
  if (ph === 'hero' || ph === 'open' || ph === 'closing') {
    const from = { x: 960, y: lerp(CAM.vault.y, GEO.frameTop(1) + GEO.frameH / 2, 0.35), z: 1.07 };
    const k = spring(t - (e.reveal + 0.05), { damping: 0.92, settle: 1.15 });
    cam = lerpCam(from, CAM.hero, ph === 'open' && t < e.reveal ? 0 : k);
    cam.y += 4 * noise(t * 0.4, 7); cam.x += 5 * noise(t * 0.33, 8);
    if (ph === 'closing') cam = lerpCam(cam, CAM.vault, ease.inOutCubic(seg(t, e.next, e.back)));
  }
  if (ph === 'flyback') cam = lerpCam(CAM.vault, CAM.console, flyEase(seg(t, e.back, e.back + TL.back)));
  // reveal punch: a quick zoom kick that springs back
  if (roll && t >= e.reveal && (ph === 'open' || ph === 'hero' || ph === 'closing')) cam.z *= 1 + 0.05 * Math.exp(-(t - e.reveal) / 0.16) * Math.sin(Math.min(Math.PI, (t - e.reveal) * 14));
  f.cam = cam;
  f.pipesK = flyK;

  // selection: the centre door of the middle row once the spin has stopped
  const team = roll ? teamView[roll.team] : null;
  if (roll && (ph === 'locked' || ph === 'open' || ph === 'hero' || ph === 'closing')) {
    const openT = t - e.open;
    let angle = 0;
    if (ph === 'open' || ph === 'hero') angle = 1.83 * spring(openT - 0.06, { damping: 0.62, settle: 1.1 }) - 0.06 * Math.sin(Math.PI * clamp01(openT / 0.08));
    if (ph === 'closing') { const a0 = 1.83 * spring(e.next - e.open - 0.06, { damping: 0.62, settle: 1.1 }); angle = a0 * (1 - ease.inCubic(seg(t, e.next, e.next + 0.42))); }
    f.sel = {
      on: true, index: roll.index, style: styles[GEO.SEL_ROW][roll.index], angle,
      x: slotX(roll.index, f.rows[GEO.SEL_ROW]) + (GEO.pitch - GEO.frameW) / 2, // follows the latch spring exactly
      green: t >= e.latch + 0.12,
      clamp: spring(t - (e.latch + 0.08), { damping: 0.55, settle: 0.3 }),
      glow: clamp01(Math.abs(angle) / 0.5) * (ph === 'closing' ? 1 - seg(t, e.next, e.next + 0.4) : 1),
      reveal: t >= e.reveal ? spring(t - e.reveal, { damping: 0.55, settle: 0.7 }) : 0,
    };
  } else if (roll && ph === 'spin') {
    f.sel = { on: false, green: false, clamp: t >= e.latch ? spring(t - (e.latch + 0.08), { damping: 0.55, settle: 0.3 }) : 0 };
  } else f.sel = { on: false, green: false, clamp: 0 };
  f.team = team && (ph === 'open' || ph === 'hero' || ph === 'closing' || ph === 'locked') ? team : null;

  // light, juice
  const revealT = roll && t >= e.reveal && ph !== 'flyback' && ph !== 'idle' ? t - e.reveal : null;
  f.burstT = revealT != null ? e.reveal : null;
  f.waveT = revealT != null && ph !== 'closing' ? revealT : null;      // team-coloured light wave across every door lamp
  f.ringT = revealT != null && revealT < 1.2 ? revealT : null;         // shockwave ring from the doorway
  f.latchT = roll && t >= e.latch && t < e.latch + 1 ? e.latch : null;
  f.flash = revealT != null ? 0.75 * Math.exp(-revealT / 0.07) : 0;
  f.flashTint = revealT != null ? 0.32 * Math.exp(-revealT / 0.4) : 0;
  f.lightTint = revealT != null ? clamp01(revealT / 0.5) * (ph === 'closing' ? 1 - seg(t, e.next, e.back) : 1) : 0;
  f.converge = revealT != null ? spring(revealT, { damping: 0.9, settle: 1.2 }) * (ph === 'closing' ? 1 - seg(t, e.next, e.back) : 1) : 0;
  f.dim = (revealT != null ? 0.75 * spring(revealT - 0.1, { damping: 1, settle: 0.8 }) : 0) * (ph === 'closing' ? 1 - seg(t, e.next, e.back) : 1);
  f.lampK = 0.75 + 0.25 * (ph === 'idle' ? 0.8 : 1);
  f.beacon = roll ? clamp01(seg(t, e.press, e.press + 0.2) - seg(t, e.lock, e.lock + 0.4)) * (ph === 'idle' || ph === 'flyback' ? 0 : 1) : 0;
  f.speedLines = ph === 'fly' ? Math.sin(Math.PI * seg(t, e.fly, e.fly + TL.fly)) : 0;
  f.batsK = 1 - flyK * 0.7;
  f.steamK = 1;
  if (roll) {
    f.bursts.push({ t: e.spin, x: GEO.cx - 420, y: GEO.rows[0].rail, n: 7, a0: -1.2, spread: 1.6, v: 180, seed: 5 });
    f.bursts.push({ t: e.spin + 0.05, x: GEO.cx + 430, y: GEO.rows[2].rail, n: 7, a0: -2.0, spread: 1.6, v: 180, seed: 6 });
    for (const d of [-1, 1]) f.bursts.push({ t: e.latch + 0.06, x: GEO.cx + d * 92, y: GEO.frameTop(1) + 128, n: 9, a0: d < 0 ? Math.PI : 0, spread: 1.1, v: 320, seed: 7 + d });
  }

  // shake: press thump, conveyor rumble, latch clunk, reveal blast
  let sx = 0, sy = 0;
  const kick = (t0, amp, decay, s) => { if (t0 == null || t < t0) return; const k = amp * Math.exp(-(t - t0) / decay); sx += k * noise((t - t0) * 38, s); sy += k * noise((t - t0) * 38, s + 9); };
  if (roll) { kick(e.press, 4, 0.12, 1); kick(e.latch, 11, 0.11, 3); if (ph !== 'flyback' && ph !== 'idle') kick(e.reveal, 18, 0.2, 5); }
  if (f.spinning) { sx += 2.6 * speed * noise(t * 31, 11); sy += 1.8 * speed * noise(t * 29, 12); }
  const shakeScale = REDUCED ? 0.1 : 1;
  f.shake = { x: sx * shakeScale, y: sy * shakeScale };

  // booth & UI
  f.armed = !view.complete && (ph === 'idle' || ph === 'press' || ph === 'fly' || ph === 'flyback');
  f.complete = view.complete;
  f.full = view.full;
  f.hover = view.hover;
  f.crt = crtText(ph, view, f);
  f.next = roll && (ph === 'hero') ? clamp01(t - e.ignite) : 0;
  f.nextOut = ph === 'closing' ? seg(t, e.next, e.next + 0.18) : 0;
  f.hudFlash = roll && t >= e.reveal ? { i: roll.team, k: Math.exp(-(t - e.reveal) / 0.9) } : null;
  return f;
}

function crtText(ph, view, f) {
  const n = String(view.assigned + 1).padStart(2, '0');
  const lines = ['DOOR VAULT 13 · NIGHT SHIFT', `RAILS ........ ${ph === 'spin' ? 'RUNNING' : 'ONLINE'}`, `OPEN TEAMS ... ${view.open}/4`, `ASSIGNED ..... ${String(view.assigned).padStart(2, '0')}/${view.classSize}`];
  if (view.complete) lines.push('', '> ALL STUDENTS ASSIGNED', '> RESET IN THE PANEL ↗');
  else if (ph === 'idle') lines.push('', `> STUDENT #${n}`, `> PRESS THE RED BUTTON${Math.floor(f.t * 1.6) % 2 ? '_' : ' '}`);
  else lines.push('', '> SELECTING A DOOR...', '> STAND CLEAR OF RAILS');
  return lines.join('\n');
}

// ── boot ──
if (!coverageOK(CAM.console.z)) console.error('door rows are narrower than the widest camera view: raise GEO.perRow');
const stage = document.getElementById('stage');
const canvas = document.getElementById('vault');
const vault = new Vault(canvas, styles);
const sound = new Sound();
const roster = new Roster({ persist: !CAPTURE, initial: CAPTURE ? { classSize: 24, counts: [4, 6, 3, 5], history: [] } : null });
let hover = false;
const booth = new Booth(stage, { onPress: () => press(), onHover: (h) => { hover = h; } });
const nextBtn = el('button', { class: 'next-btn', type: 'button', id: 'next' }, stage);
el('span', { text: 'СЛЕДУЮЩИЙ СТУДЕНТ' }, nextBtn);
nextBtn.addEventListener('click', () => next());
const hud = new Hud(stage, {
  roster, sound,
  onChange: () => {},
  onSound: () => { sound.setMuted(!sound.muted); try { localStorage.setItem('door-vault-muted', sound.muted ? '1' : '0'); } catch { /* blocked */ } },
  onFullscreen: () => toggleFullscreen(),
});
try { if (localStorage.getItem('door-vault-muted') === '1') { sound.muted = true; hud.render(); } } catch { /* blocked */ }
const announce = el('div', { class: 'sr-only', 'aria-live': 'assertive' }, document.body);
const cursor = CAPTURE ? el('div', { class: 'cursor', html: '<svg viewBox="0 0 24 24"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.7 L11 13.4 L17.5 13.4 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>' }, stage) : null;

let scale = 1;
// Adaptive quality: if the machine can't hold ~45 fps (school projector laptops), step down twice:
// 1 = no grain, coarser blur, render at ≤ 1× · 2 = also no far conveyors, shortest blur.
const perf = { quality: 0, ema: 16.7, last: 0, changed: 0 };
function fit() {
  const w = innerWidth, h = innerHeight;
  scale = Math.min(w / 1920, h / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  vault.resize(scale, CAPTURE ? 1 : devicePixelRatio || 1, CAPTURE ? 1 : perf.quality ? 1 : 1.5);
}
function governor(ts) {
  if (perf.last) perf.ema = perf.ema * 0.96 + Math.min(100, ts - perf.last) * 0.04;
  perf.last = ts;
  if (ts > 3000 && perf.ema > 24 && perf.quality < 2 && ts - perf.changed > 1500) { // ignore start-up hitches
    perf.quality++; perf.changed = ts; perf.ema = 16.7; fit();
  }
}
addEventListener('resize', fit);
fit();

function rosterView() {
  const caps = roster.caps();
  return { counts: roster.counts.slice(), caps, classSize: roster.classSize, assigned: roster.assigned(), complete: roster.complete(), full: roster.counts.map((c, i) => c >= caps[i]), open: roster.pool().length, hover };
}

// ── live events ──
const clock = { t0: performance.now() }; // mg-allow: the live app runs on wall-clock time
const now = () => (performance.now() - clock.t0) / 1000; // mg-allow
const fired = new Set();
let lastPass = null;

function press() {
  if (CAPTURE) return;
  const t = now();
  if (phaseAt(t, S.roll) !== 'idle' || roster.complete()) return;
  const team = roster.pick();
  if (team < 0) return;
  S.roll = planRoll(t, team);
  fired.clear(); lastPass = null;
  sound.press();
}
function next() {
  if (CAPTURE) return;
  const t = now();
  if (phaseAt(t, S.roll) !== 'hero' || t < S.roll.ev.ignite + 0.2) return;
  planReturn(S.roll, t);
  sound.ui(); sound.whoosh(1.2, true);
  nextBtn.blur();
}
function toggleFullscreen() {
  const d = document;
  try {
    if (d.fullscreenElement) d.exitFullscreen();
    else (d.documentElement.requestFullscreen ? d.documentElement.requestFullscreen() : Promise.reject()).catch(() => hud.say('Fullscreen is not available here.'));
  } catch { hud.say('Fullscreen is not available here.'); }
}
addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLButtonElement && (ev.code === 'Space' || ev.code === 'Enter')) return; // the focused button handles it
  if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); const ph = phaseAt(now(), S.roll); if (ph === 'idle') press(); else if (ph === 'hero') next(); }
  else if (ev.code === 'KeyF') toggleFullscreen();
  else if (ev.code === 'KeyM') { sound.setMuted(!sound.muted); hud.render(); }
  else if (ev.code === 'KeyH') hud.setCollapsed(!hud.root.classList.contains('collapsed'));
});

/** One-shot side effects (sound, roster, announcements) when the clock crosses an event. */
function fire(t) {
  const roll = S.roll; if (!roll) return;
  const e = roll.ev;
  const once = (name, time, fn) => { if (time != null && t >= time && !fired.has(name)) { fired.add(name); fn(); } };
  once('fly', e.fly, () => sound.whoosh(TL.fly));
  once('spin', e.spin, () => sound.spinStart());
  once('latch', e.latch, () => { sound.spinStop(0.12); sound.latch(); });
  once('clamp', e.latch + 0.1, () => sound.clamp());
  once('open', e.open, () => sound.creak());
  once('reveal', e.reveal, () => {
    roster.assign(roll.team); hud.render();
    sound.fanfare(roll.team);
    announce.textContent = `${TEAMS[roll.team].name}`;
  });
  once('ignite', e.ignite, () => { sound.neon(); nextBtn.focus({ preventScroll: true }); });
  once('idle', e.idle, () => { if (!roster.complete()) sound.armed(); booth.cap.focus({ preventScroll: true }); });
  if (phaseAt(t, roll) === 'spin') {
    const off = roll.base[1] + GEO.rows[1].dir * spinPos(t - e.spin, roll.D[1]);
    const pc = passCount(off, GEO.rows[1].dir);
    if (lastPass != null && pc !== lastPass) sound.tick(clamp01(Math.abs(spinVel(t - e.spin, roll.D[1])) / SPIN.vmax));
    lastPass = pc;
    sound.spinSpeed(clamp01(Math.abs(spinVel(t - e.spin, roll.D[1])) / SPIN.vmax));
  }
}

// ── drawing ──
function render(t, view) {
  const f = frameAt(t, view);
  vault.draw(f);
  booth.update(f);
  const k = f.next, out = f.nextOut;
  if (k > 0 || out > 0) {
    const fl = flicker(k);
    set(nextBtn, { o: fl * (1 - out), s: (0.9 + 0.1 * spring(k, { damping: 0.5, settle: 0.5 })) * (1 - 0.06 * out), css: { display: 'flex', '--c': f.team ? f.team.color : '#fff', '--glow': (0.75 + 0.25 * Math.sin(t * 3.2)).toFixed(3), 'pointer-events': k > 0.25 && out === 0 ? 'auto' : 'none' } });
  } else set(nextBtn, { o: 0, css: { display: 'none', 'pointer-events': 'none' } });
  hud.flash(f.hudFlash ? f.hudFlash.i : -1, f.hudFlash ? f.hudFlash.k : 0);
  stage.style.setProperty('--shake-x', f.shake.x.toFixed(2) + 'px');
  return f;
}
// neon ignition: three stutters, then on
function flicker(k) {
  if (k <= 0) return 0;
  const keys = [[0, 0], [0.05, 1], [0.09, 0.15], [0.15, 0.95], [0.19, 0.25], [0.27, 1]];
  for (let i = 1; i < keys.length; i++) if (k < keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], (k - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  return 1;
}

// ── capture mode: a scripted 16-second demo for the renderer ──
const DEMO = { press: 2.4, next: 12.9, duration: 16, team: 2 };
function captureView(t) {
  const counts = [4, 6, 3, 5];
  if (S.roll && t >= S.roll.ev.reveal) counts[S.roll.team]++;
  const classSize = 24, caps = [6, 6, 6, 6];
  return { counts, caps, classSize, assigned: counts.reduce((a, b) => a + b, 0), complete: false, full: counts.map((c, i) => c >= caps[i]), open: counts.filter((c, i) => c < caps[i]).length, hover: false };
}
function cursorAt(t, capPos, nextPos) {
  const r = S.roll, e = r.ev;
  const keys = [[0, [1540, 1170]], [0.5, [1540, 1170]], [1.15, [capPos.x + 60, capPos.y + 70]], [1.85, [capPos.x + 6, capPos.y + 4]]];
  let p = trackPts(t, keys);
  let vis = t < e.fly + 0.15 ? 1 : 0, down = Math.exp(-Math.abs(t - e.press) / 0.06) * (t > e.press - 0.12 ? 1 : 0);
  if (t > e.ignite + 0.4 && t < e.back + 0.2) {
    const k2 = [[e.ignite + 0.4, [nextPos.x + 300, nextPos.y + 160]], [e.ignite + 1.1, [nextPos.x + 40, nextPos.y + 30]], [e.next - 0.35, [nextPos.x + 8, nextPos.y + 6]]];
    p = trackPts(t, k2); vis = clamp01((t - e.ignite - 0.4) / 0.2) * (t < e.next + 0.25 ? 1 : 0);
    down = Math.exp(-Math.abs(t - e.next) / 0.06) * (t > e.next - 0.12 ? 1 : 0);
  }
  return { p, vis, down };
}
function trackPts(t, keys) {
  let v = keys[0][1].slice();
  for (let i = 1; i < keys.length; i++) {
    const k = spring(t - keys[i][0] + 0.55, { damping: 0.9, settle: 0.6 }) * (t >= keys[i][0] - 0.55 ? 1 : 0);
    v = [v[0] + (keys[i][1][0] - keys[i - 1][1][0]) * k, v[1] + (keys[i][1][1] - keys[i - 1][1][1]) * k];
  }
  return v;
}

async function start() {
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
  await document.fonts.ready;
  if (CAPTURE) {
    S.roll = planRoll(DEMO.press, DEMO.team);
    planReturn(S.roll, DEMO.next);
    // freeze the idle segment before the roll for frames earlier than the press
    S.idle = [{ t: -60, base: [41, 0, 117] }, { t: S.roll.ev.back, base: S.roll.finalOff.slice() }];
    const capPos = booth.capCentre(stage, scale);
    nextBtn.style.display = 'flex';
    const nb = nextBtn.getBoundingClientRect(), sb = stage.getBoundingClientRect();
    const nextPos = { x: (nb.left + nb.width / 2 - sb.left) / scale, y: (nb.top + nb.height / 2 - sb.top) / scale };
    window.FILM = { title: 'Door Vault Randomizer', width: 1920, height: 1080, fps: 60, duration: DEMO.duration, loop: false, cuts: [], bpm: 120, offset: 0.53, beatsPerBar: 4, events: S.roll.ev, sceneAt: (t) => phaseAt(t, S.roll) };
    window.seek = (t) => {
      const view = captureView(t);
      hud.render(view);
      render(t, view);
      const c = cursorAt(t, capPos, nextPos);
      set(cursor, { x: c.p[0], y: c.p[1], o: c.vis, s: 1 - 0.18 * c.down });
    };
    window.seek(0);
    window.__ready = true;
    return;
  }
  const loop = (ts) => {
    governor(ts || 0);
    const t = now();
    fire(t);
    render(t, rosterView());
    requestAnimationFrame(loop); // mg-allow: live app
  };
  requestAnimationFrame(loop); // mg-allow: live app
}
start();
