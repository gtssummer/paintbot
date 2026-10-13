# Brief — Halloween Team Randomizer (L3 state spec, interactive)

**Film in one line:** pressing a big red button in a factory control booth sends you flying into a Halloween door
vault, where one door locks into place and opens to reveal your team.

**Audience & platform:** a teacher presents it fullscreen (16:9 projector or monitor) and students take turns pressing
the button. Sound on. Each roll takes about 12 s, so a class of 24 takes about 5 minutes.

**References → grammar:**
- The door-vault aesthetic: steel frames with a crown lamp, colourful panelled leaves, hanging rails.
- The control panel reference: worn beige metal, stencilled keys, a red ball lever.
- Gacha reels: fast launch, ratcheting slowdown, a hard mechanical stop.

**World:**
- Palette: vault teal-black #04100f → #0a2224, sodium amber #ffb75e light, hazard yellow #e5b322, console metal
  #c5c0ab → #96917e, red button #d71f24.
- Team colours: TEAM 1 #ff7a1a, TEAM 2 #7dff3a, TEAM 3 #b34dff, TEAM 4 #ffe31a.
- Type: Russo One (display, Cyrillic) · Oswald (stencil labels) · JetBrains Mono (CRT/HUD).
- Motion grammar: the camera never overshoots; the latch and door swing overshoot like machinery; UI pops; exits are
  faster than entrances.

**Beats (one roll, from the press):**

| Beat | t (s) | What happens | Sound |
|---|---|---|---|
| Hook | idle | The console breathes: gauges twitch, the CRT blinks, door lamps chase, steam drifts, the button pulses | Low drone |
| Press | 0.00 | The button travels down, LEDs flash, the desk kicks | Clunk + power-up whine |
| Fly | 0.30–1.65 | Dolly through the booth window; the booth outruns the vault (parallax), with speed lines | Whoosh |
| Spin | 1.65–6.25 | 3 rows (→ ← →) launch, blur, slow down, ratchet past the lock station | Hum follows the speed; a tick per door |
| Latch | 6.25 | The latch yanks the last half-slot; clamps close; lamps go green; sparks, steam, shake | Clank + hiss |
| Open | 6.91 | The door unlatches (a small inward jerk) and swings toward the viewer; light leaks out | Creak |
| Reveal | 7.25 | Flash, shockwave, lamp wave in the team colour, confetti and sparks, zoom punch; the number pops | Fanfare in the team's key |
| Hero | 7.3–8.4 | The camera pushes in so the door fills the frame; embers rise | |
| Button | 8.40 | СЛЕДУЮЩИЙ СТУДЕНТ ignites like a neon tube | Neon buzz |
| Return | on click | The door closes, the camera pulls back, the conveyor resumes, the camera flies back to the console | Reverse whoosh, armed blip |

**Text on screen:** only the team number and colour in the reveal, plus СЛЕДУЮЩИЙ СТУДЕНТ. Panel labels are
industrial stencils.

**Banned:** fantasy team names, rows that leave a gap, anything that freezes for more than half a second during the
spin, browser dialogs.

**Deliverables:** web/halloween (live app), a demo video rendered with the motion-design skill, and an Artifact link.
