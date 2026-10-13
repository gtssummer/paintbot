# Review log — Door Vault randomizer

Evidence for each round: `render.mjs check`, contact sheets (`sheet --at …`), filmstrips around the latch and the door
swing, full-resolution stills of the console and the hero shot, plus a live-mode end-to-end run with Playwright.

## Round 1 — first full timeline
Scores: hook 8 · motion 6 · design 7 · rhythm 6 · retention 5 · finish 6 · brief 8
1. **P0** 4.6–6.0 s: at full speed the rows vanish into a dark void. The motion-blur buffer kept its default 300×150
   size, so blurred rows were drawn into a tiny canvas. This is exactly the "row flies away" failure the brief warns
   about. Fix: size the blur buffer with the main canvas, independently of it.
2. **P1** 2.4 s: the red button turns grey at the moment it's pressed, because the disabled look was tied to the idle
   phase. Fix: armed during press and fly; disabled only when every team is full.
3. **P1** Spin tail: the last door passes 3.87 s into the spin, but the latch fires at 5.40 s. That leaves 1.5 s of near
   stillness, and the tension dies. Measured with `tickTimes()`. Fix: retune to `n = 1.3`, `td = 2.5`, a latch that
   pulls half a slot, and a 0.48 s creep before the latch. The ticks now speed up into the stop
   (0.10 → 0.30 s apart) with no dead time.
4. **P2** Console view: the doors through the window were cropped, and the side pipes read as extra mullions. The beacon
   was an unreadable blob and the HUD covered the window. A label was clipped at the desk edge.
5. Determinism: at t = 8 s the HUD highlight leaked from the previous frame. Fix: write `--flash` every frame.

## Round 2 — after fixes + juice pass
Scores: hook 8 · motion 8 · design 8 · rhythm 8 · retention 8 · finish 7.5 · brief 9
- Juice added: a team-colour light wave across every door lamp, a shockwave ring, a reveal zoom punch, embers rising out
  of the doorway while the result is on screen, and the back face of the swung door (no more flat slab).
- Console: the camera frames all three rows (z 0.52; rows widened to 22 doors so the `coverageOK` guard still passes).
  Side pipes only appear inside the vault. The beacon now reads as a beacon. The HUD is compact, with settings in a
  drawer.
- Motion blur now uses at most 3.5 px between accumulated copies, so the streaks are smooth instead of strobing.
- Live end-to-end: a press reveals the result and lights the next button 8.4 s later. The roster is saved, focus
  returns to the red button, Space starts the next roll, and a full class blocks the button.
- 10,000 simulated classes (20–24 students) all end with 5–6 per team. No team ever goes over its limit.

Still below 8 / known limits:
- Capture mode: the console's 3D-perspective layer re-rasterises with slightly different pixels depending on render
  history (≤ 15 px at 0.5×, more during the dolly). It's invisible in sequential renders and has no effect on the live
  app.
- Doors beside the hero door are upscaled sprites at 2.35× zoom. They read as depth of field, but they're soft.
- Audio was checked for timing and loudness, not by ear.
