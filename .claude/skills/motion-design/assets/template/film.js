// film.js — THE FILM. A test card that proves the toolchain works; replace it with your film.
// Rules (see CLAUDE.md): everything visible is computed from t in render(); setup() only builds DOM.
import {
  mount, el, set, splitText, each, scene, playScenes, spring, springVel, track, seg, ease, SPRING,
  lerp, coverRadius, grain,
} from './lib/mg.js';

const C = { bg: '#0d0d10', ink: '#f4f1ea', accent: '#ff5a36', dim: '#3a3a42' };
const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif'; // bundle real fonts: node tools/fonts.mjs add "Inter" 400,800

let R; // references to nodes built in setup

mount({
  async setup(ctx) {
    const { stage, W, H } = ctx;
    const flood = el('div', { style: { position: 'absolute', inset: 0, background: C.accent } }, stage);
    const title = el('div', {
      text: 'Your film starts here',
      style: { position: 'absolute', left: 0, right: 0, top: H * 0.36 + 'px', textAlign: 'center', font: `800 ${Math.round(W * 0.06)}px/1.05 ${FONT}`, letterSpacing: '-0.035em', color: C.ink },
    }, stage);
    const words = splitText(title, { mask: true }).words;
    const square = el('div', { style: { position: 'absolute', left: 0, top: 0, width: '90px', height: '90px', marginLeft: '-45px', marginTop: '-45px', background: C.ink, borderRadius: '18px' } }, stage);
    const dots = Array.from({ length: 16 }, (_, i) => el('div', { style: { position: 'absolute', width: '14px', height: '14px', borderRadius: '50%', left: `${W / 2 - 7.5 * 34 + i * 34 - 7}px`, top: `${H * 0.82}px` } }, stage));
    const hud = el('div', { style: { position: 'absolute', left: '48px', top: '40px', font: `500 22px/1 ui-monospace, Menlo, monospace`, color: C.ink, opacity: 0.55 } }, stage);
    const g = grain(stage, { opacity: 0.06 });
    R = { flood, title, words, square, dots, hud, g };

    // Scenes: name, start, end, draw(c) with c.lt = local time. Overlap scenes for transitions.
    ctx.sceneList = [
      scene('title', ctx.cue('title'), ctx.duration, (c) => {
        each(R.words, c.lt, { stagger: 0.06, preset: SPRING.text }, (w, k) => set(w, { y: (1 - k) * 140 }));
        const out = seg(c.t, ctx.cue('out'), ctx.cue('out') + 0.5, ease.inCubic);
        set(R.title, { o: 1 - out, y: -60 * out });
      }, title), // the scene's node is hidden outside its time range
    ];
  },

  render(t, ctx) {
    const { W, H, grid, cue } = ctx;
    // Global layers first, then scenes. Every animated property is written on every frame.
    const drop = cue('drop');
    const r = coverRadius(W / 2, H / 2, W, H) * spring(t - drop, SPRING.smooth);
    set(R.flood, { clip: `circle(${r.toFixed(1)}px at 50% 50%)` });
    set(R.title, { color: t >= drop + 0.08 ? C.bg : C.ink });

    // A value that retargets every bar: one spring per change (sum of springs) — still a pure f(t).
    const pts = [[W * 0.2, H * 0.6], [W * 0.8, H * 0.25], [W * 0.75, H * 0.65], [W * 0.25, H * 0.2]];
    const keys = pts.map((p, i) => [grid.bar(i), p]);
    const [x, y] = track(t, keys, SPRING.ui);
    const bar = Math.max(0, grid.barIndex(t));
    const v = Math.abs(springVel(t - grid.bar(bar), SPRING.ui));       // speed → squash & stretch
    const st = Math.min(0.35, v * 0.12);
    set(R.square, { x, y, sx: 1 + st, sy: 1 - st * 0.6, r: lerp(0, 90, spring(t - grid.bar(bar), SPRING.ui)) + bar * 90, bg: t >= drop ? C.bg : C.ink });

    // Beat dots: the current beat pops on the grid.
    R.dots.forEach((d, i) => {
      const k = spring(t - grid.beat(i), SPRING.pop), on = t >= grid.beat(i);
      set(d, { s: on ? 0.6 + 0.4 * k + 0.5 * grid.pulse(t) * (grid.index(t) === i ? 1 : 0) : 0.6, bg: on ? (t >= drop ? C.bg : C.accent) : C.dim });
    });

    set(R.hud, { text: `${t.toFixed(2)}s  f${ctx.frame}  bar ${grid.barIndex(t)}:${grid.index(t) % 4}`, color: t >= drop ? C.bg : C.ink });
    playScenes(ctx.sceneList, t);
    R.g.update(ctx.frame);
  },
});
