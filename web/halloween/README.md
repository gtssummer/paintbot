# Halloween Team Randomizer — Door Vault 13

A fullscreen 16:9 showcase that assigns students to 4 teams. You press a big red button on a factory console. The camera
flies through the booth window into a door vault. Three conveyor rows of hanging doors spin and slow down, and one door
latches into the centre slot. It swings open to reveal the team number in that team's colour.

Open it at `/static/halloween/index.html` (served by the FastAPI app), or with any static server from this folder:
`npx http-server web/halloween`, then open `http://localhost:8080`.

## Controls
| Action | Mouse / touch | Keyboard |
|---|---|---|
| Roll for the next student | big red button | Space / Enter |
| Next student (after the reveal) | СЛЕДУЮЩИЙ СТУДЕНТ | Space / Enter |
| Fullscreen | ⚙ → FULLSCREEN | F |
| Sound on/off | ⚙ → SOUND | M |
| Collapse the HUD | – | H |
| Class size (20–24), undo last, reset | ⚙ | |

## Rules
- 4 teams: TEAM 1 neon orange, TEAM 2 slime green, TEAM 3 electric purple, TEAM 4 toxic yellow. The reveal shows only
  the team number and its colour.
- Each team gets 5–6 students. With S students in the class, every team ends with floor(S/4) or floor(S/4)+1.
  A team stops growing at that limit and leaves the draw for good. It ends up FULL in the HUD and on the console's
  team lamps.
- The draw picks uniformly at random (crypto RNG) among teams that still have room.
- Assignments are saved in this browser (localStorage), so a reload keeps the roster. RESET asks for a second click.

## Architecture
- `js/main.js` — the director. Every frame is computed from event timestamps and the current time. A roll is planned
  in full at the moment of the press: the fly-through, the spin distances that land a door in the slot, the latch, the
  swing, the reveal and the button ignition. The live app feeds real time. `?capture` feeds a scripted demo
  through `window.seek(t)` for frame-exact video rendering.
- `js/spin.js` — vault geometry and conveyor motion as closed-form functions of time. Rows wrap modulo a loop that is
  wider than the widest camera view (`coverageOK`), so a row can never leave a gap. The speed profile is ease-in,
  cruise, a `(1−u)^1.3` slowdown, then a sprung latch that pulls the last half-slot into place.
- `js/scene.js` — the vault on one canvas. It has parallax far rows, lamps and cones, rails, true per-row motion blur
  (additive accumulation in an offscreen buffer), the lock station, and the hero door. The hero door swing is drawn
  in perspective from 56 texture strips, with the doorway light, the reveal, light spill, god rays, a shockwave ring,
  a team-colour wave across every door lamp, embers, steam, confetti and sparks.
- `js/doors.js` — procedural doors: 20 colours, 8 panel layouts, patterns, Halloween decals, knobs, wear.
- `js/booth.js` — the DOM console: window with a masked wall, gauges, toggles, CRT, keypad, lever, team lamps and the
  red button.
- `js/hud.js` — occupancy panel with a settings drawer.
- `js/audio.js` — Web Audio synthesis. It covers the press clunk, whoosh, a conveyor hum that follows the rail speed,
  ratchet ticks as doors pass the station, the latch, clamps, the door creak, a per-team fanfare and the neon buzz.
- `js/lib/mg.js` — springs, easing, noise and DOM helpers from the motion-design skill.

## Rendering the demo video
With the motion-design skill (`.claude/skills/motion-design`):
```bash
node .claude/skills/motion-design/scripts/render.mjs check --dir web/halloween --outdir /tmp/vault
node .claude/skills/motion-design/scripts/render.mjs final --dir web/halloween --outdir /tmp/vault --audio <audio.wav> --sub 2 --capture jpeg
```
