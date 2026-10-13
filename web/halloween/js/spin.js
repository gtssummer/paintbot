// spin.js — vault geometry and conveyor motion as closed-form functions of time.
// No state and no DOM: the live app, the frame-exact capture mode and the soundtrack
// generator (Node) all share these functions, so every frame can be recomputed from t.
import { spring } from './lib/mg.js';

export const GEO = {
  W: 1920, H: 1080, cx: 960, cy: 540,
  pitch: 196,          // slot width: door frame + gap
  perRow: 22,          // doors per row: the 4312 px loop is wider than the widest camera view (z 0.52) + two slots
  frameW: 150, frameH: 262, crown: 18,
  leafX: 9, leafY: 24, leafW: 132, leafH: 232,
  hanger: 26,
  rows: [
    { rail: 96, dir: +1 },   // top row → right
    { rail: 392, dir: -1 },  // middle row → left (the selection row)
    { rail: 688, dir: +1 },  // bottom row → right
  ],
};
GEO.loop = GEO.pitch * GEO.perRow;
GEO.frameTop = (r) => GEO.rows[r].rail + 15 + GEO.hanger;
GEO.SEL_ROW = 1;

export const mod = (a, n) => ((a % n) + n) % n;

/** Left edge of door i's slot in a row with offset `off`, wrapped into a window centred on the screen.
 *  The window is wider than any camera view, so a row can never show a gap, at any speed or direction. */
export const slotX = (i, off) => GEO.cx - GEO.loop / 2 + mod(i * GEO.pitch + off - (GEO.cx - GEO.loop / 2), GEO.loop);

/** Index of the door whose centre sits at the screen centre for offset `off` (when aligned). */
export const centreIndex = (off) => mod(Math.round((GEO.cx - GEO.pitch / 2 - off) / GEO.pitch), GEO.perRow);

// Idle creep: rows drift slowly; after a stop they ease back in (velocity v·(1 − e^(−τ/ramp))).
export const IDLE = { v: 24, ramp: 0.9 };
export function idleTravel(tau) {
  if (tau <= 0) return 0;
  return IDLE.v * (tau - IDLE.ramp * (1 - Math.exp(-tau / IDLE.ramp)));
}

// Spin: ease-in launch, full-speed cruise, ease-out, then a mechanical latch that grabs the slot and
// pulls the last half pitch with an overshooting spring. Velocity during the decel is vmax·(1−u)^n.
// Tuned with tickTimes(): doors pass the station at 0.10 → 0.30 s intervals, the next door creeps toward
// the slot for ~0.5 s (still moving, never frozen), then the latch yanks the last half-slot into place.
export const SPIN = { ta: 0.6, tc: 1.5, td: 2.5, n: 1.3, vmax: 3900, latchFrac: 0.5, latch: { damping: 0.5, settle: 0.45 } };
export const SPIN_CURVE_END = SPIN.ta + SPIN.tc + SPIN.td;   // the latch fires here
export const SPIN_LOCKED = SPIN_CURVE_END + 0.36;              // door is settled enough to unlock the next beat

const denom = (p) => p.ta / 3 + p.tc + p.td / (p.n + 1);
export const nominalDistance = (p = SPIN) => p.vmax * denom(p) + p.latchFrac * GEO.pitch;

/** Distance travelled tau seconds into a spin whose total distance is D. */
export function spinPos(tau, D, p = SPIN) {
  if (tau <= 0) return 0;
  const latchPx = p.latchFrac * GEO.pitch, Dc = D - latchPx, v = Dc / denom(p);
  if (tau < p.ta) return (v * tau ** 3) / (3 * p.ta ** 2);
  if (tau < p.ta + p.tc) return (v * p.ta) / 3 + v * (tau - p.ta);
  const end = p.ta + p.tc + p.td;
  if (tau < end) {
    const u = (tau - p.ta - p.tc) / p.td;
    return (v * p.ta) / 3 + v * p.tc + (v * p.td * (1 - (1 - u) ** (p.n + 1))) / (p.n + 1);
  }
  return Dc + latchPx * spring(tau - end, p.latch);
}
export const spinVel = (tau, D) => (spinPos(tau + 1 / 480, D) - spinPos(tau - 1 / 480, D)) * 240;

/** Per-row distances so that every row stops with a door exactly centred, close to the nominal distance. */
export function planSpin(base, extraSlots = 0) {
  const nom = nominalDistance() + extraSlots * GEO.pitch;
  return GEO.rows.map((row, r) => nom + mod(row.dir * (GEO.cx - GEO.pitch / 2 - base[r]) - nom, GEO.pitch));
}

/** Door-centre crossings of the selection point (for ratchet ticks): integer that grows as doors pass. */
export const passCount = (off, dir) => Math.floor((dir * (off - (GEO.cx - GEO.pitch / 2))) / GEO.pitch);

/** Times (relative to spin start) at which a door centre crosses the selection point — for the soundtrack. */
export function tickTimes(base1, D1, dir = -1, step = 1 / 600) {
  const out = [];
  let prev = passCount(base1, dir);
  for (let t = step; t < SPIN_CURVE_END; t += step) {
    const c = passCount(base1 + dir * spinPos(t, D1), dir);
    if (c !== prev) { out.push(+t.toFixed(4)); prev = c; }
  }
  return out;
}

// Far background rows: ambient, linear, never stop.
export const FAR = [
  { y: 250, speed: 14, dir: -1, scale: 0.4, k: 0.42, pitch: 84, n: 40, seed: 11 },
  { y: 470, speed: 22, dir: +1, scale: 0.44, k: 0.46, pitch: 90, n: 38, seed: 12 },
  { y: 700, speed: 17, dir: -1, scale: 0.48, k: 0.5, pitch: 96, n: 36, seed: 13 },
];

/** Seamlessness guard: a row is gap-free if its loop is wider than the widest camera view plus two slots. */
export const coverageOK = (minZoom) => GEO.loop >= GEO.W / minZoom + 2 * GEO.pitch;
